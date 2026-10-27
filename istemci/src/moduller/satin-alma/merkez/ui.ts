import type {
  Award, AwardMode, Currency, MalzemeSecenegi, Material, SiparisFaturasi, Priority, PurchaseRequest, Quality, Quote, RequestItem, RequestStatus,
  Settings, Supplier, Weights,
} from "./tipler.ts";
import { CURRENCIES as CURS } from "./tipler.ts";
import { CRIT, DELIVERY, KART_SAYFASI, OPEN, COMMITTED, PRIO, QUALITY, STATUSES, UNITS, stLabel } from "./constants.ts";
import {
  FIRMA_KARTLARI, S, V, backend, canWrite, persist, persistUndoable, saveMaterial, saveRequest, saveRequestUndoable, saveSupplier, settings, undoLast, UNDO,
  type Page, type ViewState,
} from "./store.ts";
import {
  awardOrders, awardTotals, birimReddi, siparisEtiketi, kataloglaEslesenleriBagla, evaluate, matIndex, orderDue, planCost, matOf, matStats, nextNo, payText, perfScore, priceHistory, quoteCalc,
  supName, supplierStats, vsLast, fiyatUyarisi, EMPTY_STATS, fixedRates, pasifEki, birimUyarisi, miktarIn, miktarSayisi, yapistirilanKalemler, kaydedilecekKur, kurIstenir, otomatikKur, KUR_ILETISI,
} from "./calc.ts";
import {
  $, $$, addDays, clamp, clone, dayDiff, deltaHTML, esc, fmtDate, isNum, money, nf0, nf2, nfx, norm, numIn, parseNum,
  nf1, pct, sum, todayStr, toCSV, uid, kokIcinde, type FormEl } from "./util.ts";
import { labelTables, onAfterRender, PRESETS, rankHTML, readSplitAssign, render, summaryText, UI, updateSplitSum, verdictHTML } from "./views.ts";
import { reportCSV, unlinkedItems } from "./memory.ts";
import { partileriUnut } from "./partiler.ts";
import { ODEME_SEKLI, siparisTakibi, takibiUnut, takipGuncelle } from "./takip.ts";
import { approvalFormHTML, poText, printDoc } from "./docs.ts";
import { setRole, type Role } from "./roles.ts";
import type { OdemePlaniSatiri, SiparisBelgesi } from "#paylasilan/sozlesme/satin-alma.ts";
import { DosyaHatasi, dosyaYukle } from "../../cizimler/disari.ts";
import { BELIRSIZ_MIKTAR } from "../../../ortak/veri/miktar.ts";
/* ================= modal altyapısı ================= */
export function openModal(html: string, narrow: boolean | "wide" = false, sticky = false): void {
  // narrow: dar pencere, "wide": geniş tablo penceresi; sticky: dışarı tıklayınca kapanmaz (veri girişi kaybolmasın)
  $("#modal-root").innerHTML = `<div class="ovl" data-act="ovl" ${sticky ? 'data-sticky="1"' : ""}><div class="modal ${narrow === "wide" ? "wide" : narrow ? "narrow" : ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  labelTables($("#modal-root"));
  const f = $("#modal-root input:not([type=hidden]):not([disabled]), #modal-root select, #modal-root textarea"); if (f) f.focus();
}
export function closeModal(): void { $("#modal-root").innerHTML = ""; if (BULK && !BULK.inline) BULK = null; }
let tt: ReturnType<typeof setTimeout> | undefined;
export function toast(m: string): void { const t = $("#toast"); t.textContent = m; t.classList.toggle("lift", !$("#undo").hidden); t.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("on"), 3400); }
async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); toast("Kopyalandı"); return; } catch { /* panoya erişim yok */ }
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta);
    ta.select(); const ok = document.execCommand("copy"); ta.remove();
    toast(ok ? "Kopyalandı" : "Metni seçip Ctrl+C ile kopyalayın");
  } catch { toast("Metni seçip Ctrl+C ile kopyalayın"); }
}
function offerFile(filename: string, data: string, mime = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
let confirmCb: (() => void) | null = null;
function confirmModal(text: string, onYes: () => void, yesLabel = "Sil", extra = ""): void {
  confirmCb = onYes;
  openModal(`<div class="mh"><h2>Emin misiniz?</h2></div><div class="mb"><p>${esc(text)}</p>${extra}</div><div class="mf"><button class="btn bad" data-act="confirm-yes">${esc(yesLabel)}</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, true);
}

/* ================= talep formu ================= */
let draftReq!: PurchaseRequest;
export function requestModal(r: PurchaseRequest | null, prefillItems?: RequestItem[]): void {
  const set = settings();
  draftReq = r ? clone(r) : { id: uid(), no: nextNo(), title: "", department: "", requester: "", needDate: "", notes: "", priority: "normal", status: "draft", items: prefillItems || [{ id: uid(), name: "", spec: "", qty: 1, unit: "adet" }], quotes: [], rfqs: [], log: [], createdAt: Date.now() };
  const depts = (set.departments || []).map(d => d.name);
  openModal(`<div class="mh"><h2>${r ? "Talebi düzenle" : "Yeni satın alma talebi"}</h2><span class="spacer"></span><span class="muted num">${esc(draftReq.no)}</span></div>
  <div class="mb">
    <div class="grid g4">
      <label class="f spanall"><span>Talep başlığı</span><input type="text" id="r-title" value="${esc(draftReq.title)}" placeholder="Örn. Hat 3 bakım sarf malzemeleri"></label>
      <label class="f"><span>Birim</span><input type="text" id="r-dep" list="dl-depts" value="${esc(draftReq.department)}"><datalist id="dl-depts">${depts.map(d => `<option value="${esc(d)}">`).join("")}</datalist></label>
      <label class="f"><span>Talep eden</span><input type="text" id="r-req" value="${esc(draftReq.requester)}"></label>
      <label class="f"><span>İhtiyaç tarihi</span><input type="date" id="r-need" value="${esc(draftReq.needDate)}"></label>
      <label class="f"><span>Öncelik</span><select id="r-prio">${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${(draftReq.priority || "normal") === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    <fieldset class="fs"><legend>Kalemler</legend>
      <p class="small muted" data-sa-y="26">Katalogdaki bir malzemeyi yazdığınızda birimi ve son alış fiyatı gelir. Katalogda olmayan kalemi adıyla yazın; talep böyle de ilerler.</p>
      <p class="small muted" data-sa-y="26">Listede yalnız satın alma kataloğundaki kalemler var. Kart açık ama listede yoksa: Malzemeler bölümünde "Kataloğa ekle" ile karttan eklenir. Kart hiç yoksa ${KART_SAYFASI} sayfasında açılır (yeni sekmede, bu form açık kalır). Kart açma yetkiniz yoksa nota "kart istenir" yazın; satın alma kartı açtırıp kalemi bağlar.</p>
      <div id="items-box">${itemsEditor()}</div>
      <div class="row"><button class="btn sm" data-act="add-item">Kalem ekle</button><button class="btn sm ghost" data-act="toggle" data-t="paste-items">Excel'den yapıştır</button></div>
      <div id="paste-items" hidden><label class="f"><span>Her satıra bir kalem: ad, miktar, birim, açıklama (Excel'den kopyalandığı gibi, sekmeyle ayrılmış)</span><textarea id="paste-items-ta" placeholder="Rulman 6205&#9;40&#9;adet&#9;SKF veya muadili"></textarea></label><div class="row" data-sa-y="5"><button class="btn sm" data-act="apply-paste-items">Kalemlere ekle</button></div></div>
    </fieldset>
    <label class="f"><span>Not</span><textarea id="r-notes" placeholder="Teknik şartlar, marka tercihi, bütçe kodu">${esc(draftReq.notes)}</textarea></label>
  </div>
  <div class="mf"><button class="btn primary" data-act="save-request">${r ? "Değişiklikleri kaydet" : "Talebi oluştur"}</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`);
}
function itemHint(it: RequestItem): string {
  const mid = matOf(it); if (!mid) return it.name ? '<span class="hint">katalogda yok; kart açıksa Malzemeler bölümünde "Kataloğa ekle" ile listeye gelir. Talep yine ilerler, kart sonra bağlanır</span>' : "";
  const st = matStats(mid), m = S.materials[mid]!;
  // bu malzemenin geçmiş alımlarından en son bırakılan not: formu dolduran kişi o an görsün
  const past = Object.values(S.requests)
    .filter(r => r.award?.lessons && r.id !== (draftReq?.id ?? "") && (r.items || []).some(x => matOf(x) === mid))
    .sort((a, b) => (b.award!.deliveredDate || b.award!.decidedAt || "").localeCompare(a.award!.deliveredDate || a.award!.decidedAt || ""))[0];
  return `<span class="hint">${esc(m.code || "")} katalogda${st.last ? `, son alış ${money(st.last.unitTRY)} (${esc(st.last.supplier)})` : ""}</span>${past ? `<span class="hint-note" title="${esc(past.no)} alımından öğrenilen">${esc(past.no)}: ${esc(past.award!.lessons!)}</span>` : ""}`;
}
function itemsEditor(): string {
  return `<div class="tw"><table class="itbl rt rt-wide"><thead><tr><th>Kalem adı</th><th>Açıklama / teknik şart</th><th>Kategori</th><th>Miktar</th><th>Birim</th><th></th></tr></thead><tbody>
  ${draftReq.items.map((it, i) => { const cats = settings().categories || []; const mc = itemCat(it); return `<tr data-i="${i}"><td class="lead" data-sa-y="27"><input type="text" data-it="name" list="dl-mats" value="${esc(it.name)}" aria-label="Kalem adı"><span data-hint="${i}">${itemHint(it)}</span></td><td><input type="text" data-it="spec" value="${esc(it.spec || "")}" aria-label="Açıklama"></td><td><select data-it="category" aria-label="Kategori" data-sa-y="9"><option value="">–</option>${[...new Set([...cats, mc].filter(Boolean))].map(c => `<option ${mc === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></td><td><input class="qty" type="text" inputmode="decimal" data-it="qty" value="${miktarIn(it.qty)}" aria-label="Miktar"></td><td><input class="unit" type="text" list="dl-units" data-it="unit" value="${esc(it.unit)}" aria-label="Birim"${it.materialId && S.materials[it.materialId]?.unit ? " readonly" : ""}></td><td class="acts"><button class="btn sm ghost danger" data-act="rm-item" data-i="${i}" aria-label="Kalemi kaldır">Kaldır</button></td></tr>`; }).join("")}
  </tbody></table></div><datalist id="dl-units">${UNITS.map(u => `<option value="${u}">`).join("")}</datalist><datalist id="dl-mats">${Object.values(S.materials).map(m => `<option value="${esc(m.name)}">`).join("")}</datalist>`;
}
function itemCat(it: RequestItem): string { if (it.category) return it.category; const mid = matOf(it); return mid && S.materials[mid] ? S.materials[mid].category || "" : ""; }
// Denetim #37: belirsiz miktar ("1.250") varsa true döner; o kalemin miktarı boş kalır, çağıran durur ve uyarır.
function syncItems(): boolean {
  let belirsiz = false;
  $$("#items-box tr[data-i]").forEach(tr => {
    const it = draftReq.items[+tr.dataset.i!]; if (!it) return;
    $$("[data-it]", tr).forEach(inp => {
      const k = inp.dataset.it!;
      if (k !== "qty") { (it as unknown as Record<string, unknown>)[k] = inp.value.trim(); return; }
      const q = miktarSayisi(inp.value);
      if (q === "belirsiz") belirsiz = true;
      it.qty = q === "belirsiz" ? null : q;
    });
  });
  return belirsiz;
}
// SA2: talep kataloğa kalem açmaz ve kartın kategorisini değiştirmez; kart malzemelerin sayfasında açılır.
// Eşleşmeyen kalem serbest metin kalır, talep ilerler; sonra "Kataloğa bağla" ile karta bağlanır.
function linkItemsToCatalog(items: RequestItem[]): void {
  items.forEach(it => { if (it.name) it.materialId = matOf(it); });
}

/* ================= teklif formu ================= */
const firmaKartiSecenekleri = (secili: string): string => FIRMA_KARTLARI.length
  ? `<optgroup label="Firma kartlarından">${FIRMA_KARTLARI.map(f => `<option value="${f.id}" ${secili === f.id ? "selected" : ""}>${esc(f.ad)}</option>`).join("")}</optgroup>` : "";
const tedarikciAdi = (id: string): string => S.suppliers[id]?.name ?? FIRMA_KARTLARI.find(f => f.id === id)?.ad ?? "";
let draftQ!: Quote;
export function quoteModal(r: PurchaseRequest, q?: Quote | null, presetSup?: string): void {
  const set = settings();
  draftQ = q ? clone(q) : { id: uid(), supplierId: presetSup || "", supplierName: "", date: todayStr(), validUntil: addDays(todayStr(), set.validityDays), currency: "TRY", fxRate: null, prices: {}, discountPct: 0, shipping: 0, otherCost: 0, deliveryTerm: DELIVERY[0] ?? "", deliveryIncluded: true, leadDays: null, payDays: 0, advancePct: 0, warrantyMonths: null, compliant: true, note: "" };
  const sups = Object.values(S.suppliers).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const used = new Set((r.quotes || []).filter(x => x.id !== draftQ.id).map(x => x.supplierId));
  openModal(`<div class="mh"><h2>${q ? "Teklifi düzenle" : "Tek teklif formu"}</h2><span class="spacer"></span><span class="muted small">${esc(r.no)}, ${esc(r.title)}</span></div>
  <div class="mb" id="qform">
    <div class="grid g4">
      <label class="f span2"><span>Tedarikçi</span><select id="q-sup"><option value="">Seçin</option>${sups.map(s => `<option value="${s.id}" ${draftQ.supplierId === s.id ? "selected" : ""}>${esc(s.name)}${pasifEki(s)}${used.has(s.id) ? " (bu talepte teklifi var)" : ""}${s.status === "suspended" ? " (askıda)" : ""}</option>`).join("")}${firmaKartiSecenekleri(draftQ.supplierId)}<option value="__new">+ Kayıtsız tedarikçi (adla)</option></select></label>
      <label class="f span2" id="q-newsup-wrap" hidden><span>Yeni tedarikçi adı</span><input type="text" id="q-newsup"></label>
      <label class="f"><span>Teklif tarihi</span><input type="date" id="q-date" value="${esc(draftQ.date)}"></label>
      <label class="f"><span>Geçerlilik</span><input type="date" id="q-valid" value="${esc(draftQ.validUntil || "")}"></label>
      <label class="f"><span>Para birimi</span><select id="q-cur">${CURS.map(c => `<option ${draftQ.currency === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label class="f" id="q-fx-wrap"><span>Teklif günü kuru <small>— kayıt için</small></span><input type="text" inputmode="decimal" id="q-fx" placeholder="boşsa teklif gününün kuru finanstan" value="${numIn(isNum(draftQ.fxRate) ? draftQ.fxRate : otomatikKur(draftQ.currency, draftQ.date, set))}"></label>
      <label class="f"><span>İskonto (%)</span><input type="text" inputmode="decimal" id="q-disc" value="${numIn(parseNum(draftQ.discountPct))}"></label>
    </div>
    <fieldset class="fs"><legend>Birim fiyatlar <span class="muted small" data-sa-y="28">KDV hariç; teklif verilmeyen kalemi boş bırakın</span></legend>
      <div class="tw"><table class="itbl rt"><thead><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim fiyat</th><th class="r">Tutar</th><th>Son alışa göre</th></tr></thead><tbody>
      ${(r.items || []).map(it => `<tr><td class="lead"><b>${esc(it.name)}</b>${it.spec ? `<span class="sub">${esc(it.spec)}</span>` : ""}</td><td class="r num">${numIn(parseNum(it.qty))} ${esc(it.unit)}</td><td class="r"><input class="price" type="text" inputmode="decimal" data-price="${it.id}" value="${numIn(draftQ.prices[it.id])}" aria-label="${esc(it.name)} birim fiyatı"></td><td class="r num" data-line="${it.id}"></td><td class="small" data-vs="${it.id}"></td></tr>`).join("")}
      </tbody></table></div>
      <div class="row"><button class="btn sm ghost" data-act="toggle" data-t="paste-prices">Fiyatları yapıştır</button></div>
      <div id="paste-prices" hidden><label class="f"><span>Kalem sırasıyla, her satıra bir fiyat (Excel sütunundan kopyalayın)</span><textarea id="paste-prices-ta"></textarea></label><div class="row" data-sa-y="5"><button class="btn sm" data-act="apply-paste-prices">Fiyatlara uygula</button></div></div>
    </fieldset>
    <div class="grid g2">
      <fieldset class="fs"><legend>Ödeme</legend>
        <div class="grid g2"><label class="f"><span>Vade (gün)</span><input type="number" min="0" id="q-pay" value="${parseNum(draftQ.payDays) ?? ""}"></label><label class="f"><span>Avans (%)</span><input type="text" inputmode="decimal" id="q-adv" value="${numIn(parseNum(draftQ.advancePct))}"></label></div>
        <div class="chips">${[["Peşin", 0], ["30 gün", 30], ["60 gün", 60], ["90 gün", 90], ["120 gün", 120]].map(([l, v]) => `<button class="chip" data-act="pay-chip" data-v="${v}">${l}</button>`).join("")}</div>
      </fieldset>
      <fieldset class="fs"><legend>Teslimat ve garanti</legend>
        <div class="grid g2"><label class="f"><span>Termin (gün)</span><input type="number" min="0" id="q-lead" value="${parseNum(draftQ.leadDays) ?? ""}" placeholder="Siparişten teslime"></label><label class="f"><span>Garanti (ay)</span><input type="number" min="0" id="q-war" value="${parseNum(draftQ.warrantyMonths) ?? ""}"></label></div>
        <label class="f"><span>Teslim şekli</span><input type="text" list="dl-dterms" id="q-dterm" value="${esc(draftQ.deliveryTerm || "")}"><datalist id="dl-dterms">${DELIVERY.map(d => `<option value="${esc(d)}">`).join("")}</datalist></label>
      </fieldset>
    </div>
    <div class="grid g3">
      <label class="chk" data-sa-y="29"><input type="checkbox" id="q-incl" ${draftQ.deliveryIncluded ? "checked" : ""}> Nakliye fiyata dahil</label>
      <label class="f"><span>Nakliye bedeli <small>(teklif para biriminde)</small></span><input type="text" inputmode="decimal" id="q-ship" value="${numIn(parseNum(draftQ.shipping))}"></label>
      <label class="f"><span>Diğer masraflar <small>(gümrük, montaj, ambalaj)</small></span><input type="text" inputmode="decimal" id="q-other" value="${numIn(parseNum(draftQ.otherCost))}"></label>
    </div>
    <div class="grid g3">
      <label class="chk" data-sa-y="29"><input type="checkbox" id="q-comp" ${draftQ.compliant !== false ? "checked" : ""}> Teknik şartlara uygun</label>
      <label class="f span2"><span>Not</span><input type="text" id="q-note" value="${esc(draftQ.note || "")}" placeholder="Muadil marka, stok durumu, opsiyon"></label>
    </div>
  </div>
  <div class="mf"><div class="live" id="q-live"></div><span class="spacer"></span><button class="btn ghost" data-act="close">Vazgeç</button><button class="btn primary" data-act="save-quote">${q ? "Değişiklikleri kaydet" : "Teklifi kaydet"}</button></div>`);
  readQuoteForm(); updateQuoteLive();
}
function readQuoteForm(): void {
  const g = (id: string) => $("#" + id); if (!g("q-sup")) return;
  const prevCur = draftQ.currency, prevDate = draftQ.date, set = settings();
  draftQ.supplierId = g("q-sup").value;
  draftQ.date = g("q-date").value; draftQ.validUntil = g("q-valid").value; draftQ.currency = g("q-cur").value as Currency;
  // Elle girilmemiş kur, para birimi ya da gün değişince yeni güne göre önerilir; başka günün teklifine bugünün kuru yazılmaz (borç 37).
  if ((prevCur !== draftQ.currency || prevDate !== draftQ.date) && parseNum(g("q-fx").value) === otomatikKur(prevCur, prevDate, set)) {
    g("q-fx").value = numIn(otomatikKur(draftQ.currency, draftQ.date, set));
  }
  draftQ.fxRate = draftQ.currency === "TRY" ? 1 : parseNum(g("q-fx").value);
  g("q-fx-wrap").style.visibility = draftQ.currency === "TRY" ? "hidden" : "visible";
  draftQ.discountPct = parseNum(g("q-disc").value) || 0;
  $$("[data-price]").forEach(i => { const k = i.dataset.price!; const v = parseNum(i.value); if (v === null) delete draftQ.prices[k]; else draftQ.prices[k] = v; });
  draftQ.payDays = parseNum(g("q-pay").value) || 0; draftQ.advancePct = parseNum(g("q-adv").value) || 0;
  draftQ.leadDays = parseNum(g("q-lead").value); draftQ.deliveryTerm = g("q-dterm").value.trim();
  draftQ.warrantyMonths = parseNum(g("q-war").value);
  draftQ.deliveryIncluded = g("q-incl").checked; draftQ.shipping = parseNum(g("q-ship").value) || 0; draftQ.otherCost = parseNum(g("q-other").value) || 0;
  draftQ.compliant = g("q-comp").checked; draftQ.note = g("q-note").value.trim();
  g("q-newsup-wrap").hidden = draftQ.supplierId !== "__new";
  g("q-ship").disabled = draftQ.deliveryIncluded;
}
function updateQuoteLive(): void {
  const r = S.requests[V.id ?? ""]; if (!r || !draftQ || !$("#q-live")) return;
  const c = quoteCalc(r, draftQ, settings());
  (r.items || []).forEach(it => {
    const cell = $(`[data-line="${it.id}"]`); if (cell) cell.textContent = c.lines[it.id] ? money(c.lines[it.id]!.line, draftQ.currency) : "–";
    const vs = $(`[data-vs="${it.id}"]`);
    if (vs) { const l = c.lines[it.id]; const d = l ? vsLast(r, it, l.unit * c.unitTRY) : null; vs.innerHTML = d ? `${deltaHTML(d.pct)} <span class="faint">${money(d.last.unitTRY)}, ${esc(d.last.supplier)}</span>${fiyatUyarisi(d.pct, settings().priceAlertPct) ? ' <span class="flag warn">pazarlık payı</span>' : ""}` : '<span class="faint">kayıt yok</span>'; }
  });
  $("#q-live").innerHTML = `<div><span>Toplam</span><b>${money(c.total, draftQ.currency)}</b></div>${draftQ.currency !== "TRY" ? `<div><span>TL, ${OPEN.includes(r.status) ? "güncel" : "sabit"} kur ${nfx.format(c.rate)}</span><b>${money(c.totalTRY)}</b></div>` : ""}<div><span>Net bugünkü maliyet</span><b>${money(c.pvTRY)}</b></div>`;
}

/* ================= teklif isteği ================= */
interface Suggestion { id: string; why: string[]; score: number; p: number }
function rfqSuggestions(r: PurchaseRequest): Suggestion[] {
  const out: Record<string, Suggestion> = {};
  const cats = new Set((r.items || []).map(it => { const mid = matOf(it); const m = mid ? S.materials[mid] : undefined; return m?.category || it.category || ""; }).filter(Boolean));
  (r.items || []).forEach(it => {
    const mid = matOf(it); if (!mid) return;
    matStats(mid).suppliers.forEach(s => { const o = out[s.supplierId] || (out[s.supplierId] = { id: s.supplierId, why: [], score: 0, p: 0 }); o.why.push(`${it.name} için ${s.n} teklif${s.wins ? ", " + s.wins + " kez seçildi" : ""}`); o.score += 2 + s.wins * 2; });
  });
  Object.values(S.suppliers).forEach(s => {
    const sc = s.categories || [];
    const match = sc.filter(c => cats.has(c));
    if (match.length) { const o = out[s.id] || (out[s.id] = { id: s.id, why: [], score: 0, p: 0 }); o.why.push("kategori: " + match.join(", ")); o.score += 1; }
  });
  return Object.values(out).filter(o => S.suppliers[o.id] && S.suppliers[o.id]!.status !== "suspended").map(o => Object.assign(o, { p: perfScore(o.id) })).sort((a, b) => b.score - a.score || b.p - a.p);
}
function rfqModal(r: PurchaseRequest): void {
  const sugg = rfqSuggestions(r); const sids = new Set(sugg.map(s => s.id));
  const asked = new Set((r.rfqs || []).map(x => x.supplierId));
  const others = Object.values(S.suppliers).filter(s => !sids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const sst = supplierStats();
  const line = (s: Supplier, why: string, checked: boolean) => { const st = sst[s.id] || EMPTY_STATS; return `<label><input type="checkbox" data-rfq="${s.id}" ${checked ? "checked" : ""}><span><b>${esc(s.name)}${pasifEki(s)}</b>${s.status === "suspended" ? ' <span class="flag bad">askıda</span>' : ""}${asked.has(s.id) ? ' <span class="flag mute">daha önce istendi</span>' : ""}<span class="why">${esc(why)}</span></span><span class="xs muted num">${st.asked ? "cevap " + pct(st.responseRate) : ""}${st.deliveries ? ", zamanında " + pct(st.onTimeRate) : ""}</span></label>`; };
  openModal(`<div class="mh"><h2>Teklif iste</h2><span class="spacer"></span><span class="muted small">${esc(r.no)}</span></div>
  <div class="mb">
    <p class="small muted">Her tedarikçiye aynı soruları sormak cevapları karşılaştırılabilir kılar. Seçtiklerinizi "istendi" olarak kaydederseniz cevap süreleri ve oranları tedarikçi karnesine işlenir.</p>
    ${sugg.length ? `<div><h4 data-sa-y="30">Hafızanın önerdikleri</h4><div class="sugg">${sugg.map(o => line(S.suppliers[o.id]!, o.why.slice(0, 2).join("; "), !asked.has(o.id))).join("")}</div></div>` : ""}
    ${others.length ? `<details ${sugg.length ? "" : "open"}><summary class="small" data-sa-y="31">Diğer tedarikçiler (${others.length})</summary><div class="sugg">${others.map(s => line(s, (s.categories || []).join(", "), false)).join("")}</div></details>` : ""}
    ${!Object.keys(S.suppliers).length ? '<div class="note small">Henüz tedarikçi kaydı yok. Metni genel olarak kopyalayabilir ya da önce tedarikçi ekleyebilirsiniz.</div>' : ""}
    <div class="grid g3"><label class="f"><span>Son cevap tarihi</span><input type="date" id="rfq-due" value="${addDays(todayStr(), 3)}"></label><label class="f span2"><span>Önizleme</span><select id="rfq-prev"><option value="">Genel metin</option></select></label></div>
    <pre class="out" id="rfq-out"></pre>
  </div>
  <div class="mf"><button class="btn" data-act="copy-rfq">Metni kopyala</button><span class="spacer"></span><button class="btn ghost" data-act="close">Kapat</button><button class="btn primary" data-act="mark-rfq">Seçilenlerden istendi olarak kaydet</button></div>`);
  syncRfqPreview();
}
function syncRfqPreview(): void {
  const r = S.requests[V.id ?? ""]; if (!r || !$("#rfq-prev")) return;
  const sel = $$("[data-rfq]").filter(i => i.checked).map(i => i.dataset.rfq!);
  const p = $("#rfq-prev"); const cur = p.value;
  p.innerHTML = `<option value="">Genel metin</option>${sel.map(id => `<option value="${id}" ${cur === id ? "selected" : ""}>${esc(S.suppliers[id]?.name)}</option>`).join("")}`;
  if (cur && !sel.includes(cur)) p.value = "";
  $("#rfq-out").textContent = rfqText(r, p.value, $("#rfq-due").value || addDays(todayStr(), 3));
}
function rfqText(r: PurchaseRequest, supId: string, due: string, reminder = false): string {
  const set = settings(), s = S.suppliers[supId];
  const L: string[] = [];
  L.push(`Konu: ${reminder ? "Hatırlatma: " : ""}Fiyat teklifi talebi, ${r.no} ${r.title}`);
  L.push("");
  L.push(s && s.contact ? `Sayın ${s.contact},` : (s ? `${s.name} yetkilisine,` : "Merhaba,"));
  L.push("");
  if (reminder) { L.push(`${fmtDate(due)} tarihinde ilettiğimiz teklif talebimize henüz cevap alamadık. Aşağıdaki kalemler için teklifinizi en kısa sürede bekliyoruz.`); }
  else L.push(`${set.company ? set.company + " olarak " : ""}aşağıdaki kalemler için fiyat teklifinizi rica ederiz.`);
  L.push("");
  (r.items || []).forEach((i, n) => L.push(`${n + 1}. ${i.name}, ${numIn(parseNum(i.qty))} ${i.unit}${i.spec ? ` (${i.spec})` : ""}`));
  L.push("");
  L.push("Tekliflerin karşılaştırılabilmesi için lütfen şunları belirtin:");
  L.push("- Her kalem için birim fiyat ve para birimi (KDV hariç)");
  L.push("- Ödeme şekli: vade (gün), varsa avans oranı; peşin ödemede ek iskonto");
  L.push("- Termin: siparişten teslime kaç gün");
  L.push("- Teslim şekli ve yeri; nakliyenin fiyata dahil olup olmadığı");
  L.push("- Garanti süresi ve teklif geçerlilik tarihi");
  L.push("- Teknik şartlardan sapma veya muadil ürün önerisi varsa açıkça");
  if (r.needDate) { L.push(""); L.push(`Malzemelere en geç ${fmtDate(r.needDate)} tarihinde ihtiyacımız var.`); }
  if (!reminder) { L.push(""); L.push(`Tekliflerinizi ${fmtDate(due)} tarihine kadar iletmenizi rica ederiz.`); }
  L.push(""); L.push("Saygılarımızla,"); if (set.company) L.push(set.company);
  return L.join("\n");
}

/* ================= tedarikçi, malzeme, değerlendirme ================= */
let draftS!: Supplier;
let firmaSecildi = false;
let firmaAramaT: ReturnType<typeof setTimeout> | undefined;
// Yeni firma kartı finansın firma listesine açılır (tek liste); kimlik pencere başına üretilir, yeniden gönderim ikinci firma açmaz.
let firmaEkleKimligi = "";
const yeniFirmaDugmesi = '<button class="btn sm" data-act="firma-yeni">Yeni firma aç</button>';
function firmaSonuclari(liste: { id: string; ad: string; tedarikci: boolean }[], bilgi = ""): void {
  const el = document.getElementById("s-firma-sonuc");
  if (!el) return;
  el.innerHTML = bilgi ? `<p class="mk-hint">${esc(bilgi)}</p>` : liste.length
    ? liste.map(f => f.tedarikci
      ? `<button class="btn ghost sm" disabled>${esc(f.ad)} <small>— zaten tedarikçi</small></button>`
      : `<button class="btn ghost sm" role="option" data-act="pick-firma" data-fid="${esc(f.id)}" data-fad="${esc(f.ad)}" aria-selected="${draftS.id === f.id}">${esc(f.ad)}</button>`).join("") + yeniFirmaDugmesi
    : `<p class="mk-hint">Bu adla firma yok.</p>${yeniFirmaDugmesi}`;
}
function yeniFirmaFormu(): void {
  const el = document.getElementById("s-firma-sonuc");
  if (!el) return;
  const ad = $("#s-firma-ara")?.value.trim() ?? "";
  el.innerHTML = `<div class="grid g2">
    <label class="f spanall"><span>Firma adı</span><input type="text" id="s-yf-ad" value="${esc(ad)}" maxlength="200"></label>
    <label class="f"><span>Vergi no</span><input type="text" id="s-yf-vergi" maxlength="30"></label>
    <label class="f"><span>İl</span><input type="text" id="s-yf-il" maxlength="100"></label>
    <label class="f"><span>Telefon</span><input type="tel" id="s-yf-tel" maxlength="40"></label>
    <label class="f"><span>E-posta</span><input type="email" id="s-yf-eposta" maxlength="200"></label>
  </div>
  <p class="mk-hint">Firma ortak firma listesine tedarikçi olarak açılır; diğer bilgileri finansta tamamlanır.</p>
  <button class="btn sm" data-act="firma-ac">Firmayı aç ve seç</button>`;
  $("#s-yf-ad")?.focus();
}
function firmaAra(metin: string): void {
  clearTimeout(firmaAramaT);
  firmaSecildi = false;
  const m = metin.trim();
  if (m.length < 2) { firmaSonuclari([], ""); return; }
  firmaAramaT = setTimeout(() => {
    backend.firmaAra(m).then(l => { if ($("#s-firma-ara")?.value.trim() === m) firmaSonuclari(l); }).catch(() => firmaSonuclari([], "Firmalar okunamadı."));
  }, 250);
}
function supplierModal(s: Supplier | null | undefined): void {
  const set = settings();
  draftS = s ? clone(s) : { id: uid(), name: "", categories: [], contact: "", phone: "", email: "", city: "", taxNo: "", status: "approved", rating: 3, notes: "", evals: [], createdAt: Date.now() };
  if (!draftS.categories) draftS.categories = [];
  const cats = [...new Set([...(set.categories || []), ...draftS.categories])];
  firmaSecildi = !!s;
  firmaEkleKimligi = uid();
  // TMI: firma kartı finansındır ve orada düzenlenir; yeni tedarikçide firma aranıp seçilir ya da ortak listeye yeni firma açılır, firma alanları salt okunur.
  const firmaAlani = s
    ? `<label class="f spanall"><span>Firma adı <small>— finansta düzenlenir</small></span><input type="text" id="s-name" value="${esc(draftS.name)}" disabled></label>
      <label class="f"><span>Yetkili</span><input type="text" id="s-contact" value="${esc(draftS.contact)}" disabled></label>
      <label class="f"><span>Şehir</span><input type="text" id="s-city" value="${esc(draftS.city || "")}" disabled></label>
      <label class="f"><span>Telefon</span><input type="tel" id="s-phone" value="${esc(draftS.phone)}" disabled></label>
      <label class="f"><span>E-posta</span><input type="email" id="s-email" value="${esc(draftS.email)}" disabled></label>
      <label class="f"><span>Vergi no</span><input type="text" id="s-tax" value="${esc(draftS.taxNo || "")}" disabled></label>`
    : `<label class="f spanall"><span>Firma <small>— kayıtlı firmayı adıyla arayın ya da yeni firma açın</small></span><input type="search" id="s-firma-ara" autocomplete="off" placeholder="En az 2 harf"></label>
      <div class="spanall" id="s-firma-sonuc" role="listbox" aria-label="Bulunan firmalar"></div>`;
  openModal(`<div class="mh"><h2>${s ? "Tedarikçiyi düzenle" : "Tedarikçi ekle"}</h2></div>
  <div class="mb">
    <div class="grid g2">
      ${firmaAlani}
      <label class="f"><span>Kalite onayı <small>— Kalite Merkezi'nde değişir</small></span><input type="text" id="s-kalite" value="${esc(draftS.kaliteDurumu ?? "Kalite Merkezi kaydı yok")}" disabled></label>
    </div>
    <div class="f"><span>Kategoriler <small>— teklif isteğinde öneri için</small></span><div class="chips" id="s-cats">${cats.map(c => `<button class="chip" data-act="tog-cat" aria-pressed="${draftS.categories.includes(c)}" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>
    <div class="f"><span>Puanınız <small>— kalite, iletişim, sorun çözme</small></span><div class="rating" role="radiogroup" aria-label="Puan">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="s-rating" value="${n}" ${(parseNum(draftS.rating) || 3) === n ? "checked" : ""}><span>${n}</span></label>`).join("")}</div></div>
    <label class="f"><span>Not</span><textarea id="s-notes">${esc(draftS.notes || "")}</textarea></label>
  </div>
  <div class="mf"><button class="btn primary" data-act="save-supplier">${s ? "Değişiklikleri kaydet" : "Tedarikçiyi kaydet"}</button><button class="btn ghost" data-act="close">Vazgeç</button>${s ? '<span class="spacer"></span><button class="btn ghost danger" data-act="del-supplier">Sil</button>' : ""}</div>`, true);
}
function evalModal(s: Supplier): void {
  openModal(`<div class="mh"><h2>Değerlendirme: ${esc(s.name)}</h2></div><div class="mb">
    <div class="grid g2"><label class="f"><span>Tarih</span><input type="date" id="e-date" value="${todayStr()}"></label><label class="f"><span>Değerlendiren</span><input type="text" id="e-name" placeholder="Ad Soyad"></label></div>
    <div class="f"><span>Puan</span><div class="rating">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="e-rating" value="${n}" ${n === (parseNum(s.rating) || 3) ? "checked" : ""}><span>${n}</span></label>`).join("")}</div></div>
    <label class="f"><span>Not</span><textarea id="e-text" placeholder="Örn. Fabrika ziyareti yapıldı, kalite kontrol süreci yeterli. Fiyat revizyonlarında yavaş."></textarea></label>
    <label class="chk"><input type="checkbox" id="e-apply" checked> Tedarikçinin genel puanını değerlendirmelerin ortalamasıyla güncelle</label>
  </div><div class="mf"><button class="btn primary" data-act="save-eval">Kaydet</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, true);
}
let draftM!: Material;
let kartlar: MalzemeSecenegi[] = [];
let kartAramaT: ReturnType<typeof setTimeout> | undefined;
function kartSonuclari(liste: MalzemeSecenegi[], bilgi = ""): void {
  kartlar = liste;
  const el = document.getElementById("m-kart-sonuc");
  if (!el) return;
  el.innerHTML = bilgi ? `<p class="mk-hint">${esc(bilgi)}</p>` : liste.length
    ? liste.map(k => k.katalogId
      ? `<button class="btn ghost sm" disabled>${esc(k.kod)} ${esc(k.ad)} <small>— zaten katalogda</small></button>`
      : `<button class="btn ghost sm" role="option" data-act="pick-kart" data-no="${k.no}" aria-selected="${draftM.malzemeNo === k.no}">${esc(k.kod)} ${esc(k.ad)}${k.birim ? ` <small>${esc(k.birim)}</small>` : ""}</button>`).join("")
    : `<p class="mk-hint">Bu adla malzeme kartı yok. Yeni kart ${KART_SAYFASI} sayfasında açılır.</p>`;
}
function kartAra(metin: string): void {
  clearTimeout(kartAramaT);
  const m = metin.trim();
  if (m.length < 2) { kartSonuclari([], ""); return; }
  kartAramaT = setTimeout(() => {
    backend.malzemeAra(m).then(l => { if ($("#m-kart-ara")?.value.trim() === m) kartSonuclari(l); }).catch(() => kartSonuclari([], "Malzeme kartları okunamadı."));
  }, 250);
}
// SA2: katalog kalemi bir malzeme kartına bağlanır; kod, ad, kategori ve birim karttan gelir ve burada değişmez.
function materialModal(m: Material | null | undefined): void {
  draftM = m ? clone(m) : { id: uid(), code: "", name: "", category: "", unit: "", spec: "", aliases: [], notes: "", createdAt: Date.now() };
  kartlar = [];
  const kartAlani = m
    ? `<label class="f"><span>Kod</span><input type="text" id="m-code" value="${esc(draftM.code || "")}" disabled></label>
      <label class="f span2"><span>Ad <small>— malzeme kartında düzenlenir</small></span><input type="text" id="m-name" value="${esc(draftM.name)}" disabled></label>
      <label class="f span2"><span>Kategori</span><input type="text" id="m-cat" value="${esc(draftM.category || "")}" disabled></label>
      <label class="f"><span>Birim</span><input type="text" id="m-unit" value="${esc(draftM.unit || "")}" disabled></label>`
    : `<label class="f spanall"><span>Malzeme kartı <small>— kod ya da adla arayın; yeni kart ${KART_SAYFASI} sayfasında açılır</small></span><input type="search" id="m-kart-ara" autocomplete="off" placeholder="En az 2 harf"></label>
      <div class="spanall" id="m-kart-sonuc" role="listbox" aria-label="Bulunan malzeme kartları"></div>`;
  openModal(`<div class="mh"><h2>${m ? "Katalog kalemini düzenle" : "Kataloğa ekle"}</h2></div><div class="mb">
    <div class="grid g3">
      ${kartAlani}
    </div>
    <label class="f"><span>Teknik özellik</span><input type="text" id="m-spec" value="${esc(draftM.spec || "")}"></label>
    <label class="f"><span>Diğer adlar <small>— virgülle; talepte bu adlarla yazılsa da eşleşir</small></span><input type="text" id="m-alias" value="${esc((draftM.aliases || []).join(", "))}" placeholder="Örn. 6205 2RS, rulman 6205"></label>
    <label class="f"><span>Not</span><textarea id="m-notes" placeholder="Onaylı markalar, kalite şartı, stok seviyesi">${esc(draftM.notes || "")}</textarea></label>
  </div><div class="mf"><button class="btn primary" data-act="save-material">Kaydet</button><button class="btn ghost" data-act="close">Vazgeç</button>${m ? '<span class="spacer"></span><button class="btn ghost danger" data-act="del-material">Sil</button>' : ""}</div>`, true);
}
function linkItemsModal(): void {
  const groups: Record<string, { name: string; unit: string; n: number }> = {};
  unlinkedItems().forEach(({ it }) => { const k = norm(it.name); (groups[k] = groups[k] || { name: it.name, unit: it.unit, n: 0 }).n++; });
  const mats = Object.values(S.materials).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  openModal(`<div class="mh"><h2>Talep kalemlerini kataloğa bağla</h2></div><div class="mb">
    <p class="small muted">Aynı malzeme farklı yazılmışsa katalogdaki kayda bağlayın; böylece fiyat geçmişi tek yerde toplanır. Katalogda olmayan kalem için önce kart ${KART_SAYFASI} sayfasında açılır, sonra "Kataloğa ekle" ile buraya gelir.</p>
    <div class="tw"><table class="itbl rt"><thead><tr><th>Talepteki ad</th><th class="r">Geçtiği yer</th><th>Bağla</th></tr></thead><tbody>
    ${Object.entries(groups).map(([k, g]) => `<tr><td><b>${esc(g.name)}</b></td><td class="r num">${g.n}</td><td><select data-link="${esc(k)}"><option value="">Şimdilik bağlama</option>${mats.map(m => `<option value="${m.id}">${esc(m.code)} ${esc(m.name)}</option>`).join("")}</select></td></tr>`).join("")}
    </tbody></table></div></div><div class="mf"><button class="btn primary" data-act="apply-link">Bağla</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`);
}

/* ================= global arama ================= */
function gsearch(qs: string): void {
  const box = $("#gres"); const q = norm(qs);
  if (!q) { box.hidden = true; box.innerHTML = ""; return; }
  const reqs = Object.values(S.requests).filter(r => norm([r.no, r.title, r.department, ...(r.items || []).map(i => i.name)].join(" ")).includes(q)).slice(0, 6);
  const mats = Object.values(S.materials).filter(m => norm([m.code, m.name, ...(m.aliases || [])].join(" ")).includes(q)).slice(0, 6);
  const sups = Object.values(S.suppliers).filter(s => norm([s.name, s.city, (s.categories || []).join(" ")].join(" ")).includes(q)).slice(0, 6);
  const grp = <T,>(t: string, arr: T[], f: (x: T) => string) => arr.length ? `<div class="grp">${t}</div>${arr.map(f).join("")}` : "";
  const html = grp("Talepler", reqs, r => `<button data-act="g-open" data-k="request" data-id="${r.id}"><span class="k">${esc(r.no)}</span><span>${esc(r.title)} <span class="xs faint">${esc(stLabel(r.status))}</span></span></button>`)
    + grp("Malzemeler", mats, m => { const st = matStats(m.id); return `<button data-act="g-open" data-k="material" data-id="${m.id}"><span class="k">${esc(m.code || "")}</span><span>${esc(m.name)} <span class="xs faint">${st.last ? "son " + money(st.last.unitTRY) : ""}</span></span></button>`; })
    + grp("Tedarikçiler", sups, s => `<button data-act="g-open" data-k="supplier" data-id="${s.id}"><span class="k">${esc(s.city || "")}</span><span>${esc(s.name)}</span></button>`);
  box.innerHTML = html || `<div class="grp">"${esc(qs)}" için sonuç yok</div>`;
  box.hidden = false;
}

/* ================= toplu teklif girişi =================
   Kalemler satırda, tedarikçiler sütunda. Her sütun bir teklif. */
interface BulkCol {
  qid: string | null; supplierId: string; newName: string; currency: Currency; fxRate: number | null; date: string; validUntil: string;
  discountPct: number; payDays: number; advancePct: number; leadDays: number | null; warrantyMonths: number | null; deliveryTerm: string;
  deliveryIncluded: boolean; shipping: number; otherCost: number; compliant: boolean; note: string; prices: Record<string, number>;
}
type BulkKind = "cur" | "num" | "int" | "text" | "bool" | "date";
/** inline: talep sayfasındaki teklif tablosu (açılır pencere değil) */
let BULK: { rid: string; cols: BulkCol[]; dirty: boolean; confirmClose?: boolean; inline?: boolean } | null = null;
const BULK_FIELDS: [keyof BulkCol, string, BulkKind][] = [
  ["currency", "Para birimi", "cur"], ["fxRate", "Teklif günü kuru", "num"], ["discountPct", "İskonto %", "num"],
  ["payDays", "Vade (gün)", "int"], ["advancePct", "Avans %", "num"], ["leadDays", "Termin (gün)", "int"],
  ["warrantyMonths", "Garanti (ay)", "int"], ["deliveryTerm", "Teslim şekli", "text"], ["deliveryIncluded", "Nakliye fiyata dahil", "bool"],
  ["shipping", "Nakliye bedeli", "num"], ["otherCost", "Diğer masraflar", "num"], ["date", "Teklif tarihi", "date"],
  ["validUntil", "Geçerlilik", "date"], ["compliant", "Teknik şartlara uygun", "bool"], ["note", "Not", "text"]
];
function bulkBlank(supplierId?: string): BulkCol {
  const set = settings();
  return { qid: null, supplierId: supplierId || "", newName: "", currency: "TRY", fxRate: null, date: todayStr(), validUntil: addDays(todayStr(), set.validityDays), discountPct: 0, payDays: 0, advancePct: 0, leadDays: null, warrantyMonths: null, deliveryTerm: DELIVERY[0] ?? "", deliveryIncluded: true, shipping: 0, otherCost: 0, compliant: true, note: "", prices: {} };
}
function bulkCols(r: PurchaseRequest): BulkCol[] {
  const cols: BulkCol[] = (r.quotes || []).map(q => Object.assign(bulkBlank(q.supplierId), clone(q), { qid: q.id, newName: "", prices: Object.assign({}, q.prices) }));
  (r.rfqs || []).forEach(x => { if (!cols.some(c => c.supplierId === x.supplierId)) cols.push(bulkBlank(x.supplierId)); });
  while (cols.length < 2) cols.push(bulkBlank(""));
  return cols;
}
/** Talep sayfasındaki teklif tablosu: kayıtlı teklifler ve teklif istenen tedarikçiler sütun olarak */
export function inlineBulkHTML(r: PurchaseRequest): string {
  if (!BULK || BULK.rid !== r.id || !BULK.inline || !BULK.dirty) BULK = { rid: r.id, cols: bulkCols(r), dirty: false, inline: true };
  else BULK.cols = BULK.cols.filter(c => !c.qid || (r.quotes || []).some(q => q.id === c.qid)); // bu arada silinen teklif sütunları düşer
  const n = (r.quotes || []).length;
  return `<section class="panel"><div class="panel-h"><h2>Teklif tablosu</h2><span class="sub">${n ? `${n} kayıtlı teklif` : "Fiyatları girin ya da Excel'den yapıştırın"}</span><span class="spacer"></span><button class="btn sm" data-act="bulk-add">Tedarikçi ekle</button></div>
    <div class="panel-b" id="bulk" data-inline="1">${bulkGrid(r)}</div>
    <div class="bulk-bar" id="bulk-bar" ${BULK.dirty ? "" : "hidden"}><span id="bulk-st" class="small"></span><span class="spacer"></span><button class="btn ghost" data-act="bulk-close">Vazgeç</button><button class="btn primary" data-act="bulk-save">Teklifleri kaydet</button></div></section>`;
}
function bulkModal(r: PurchaseRequest): void {
  BULK = { rid: r.id, cols: bulkCols(r), dirty: false };
  openModal(`<div class="mh"><h2>Toplu teklif girişi</h2><span class="spacer"></span><span class="muted small">${esc(r.no)}, ${esc(r.title)}</span></div>
  <div class="mb" id="bulk">${bulkGrid(r)}</div>
  <div class="mf"><button class="btn" data-act="bulk-add">Tedarikçi sütunu ekle</button><span class="small muted" id="bulk-st"></span><span class="spacer"></span><button class="btn ghost" data-act="bulk-close">Vazgeç</button><button class="btn primary" data-act="bulk-save">Teklifleri kaydet</button></div>`, "wide", true);
  bulkLive();
  const first = $("#bulk .bp"); if (first) first.focus();
}
function bulkGrid(r: PurchaseRequest): string {
  const sups = Object.values(S.suppliers).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const cols = BULK!.cols, items = r.items || [];
  let row = 0;
  const cell = (j: number, f: string, kind: BulkKind, v: unknown): string => {
    const nr = row;
    if (kind === "cur") return `<select data-bf="${f}" data-col="${j}" data-nr="${nr}">${CURS.map(c => `<option ${v === c ? "selected" : ""}>${c}</option>`).join("")}</select>`;
    if (kind === "bool") return `<label class="chk bchk"><input type="checkbox" data-bf="${f}" data-col="${j}" data-nr="${nr}" ${v ? "checked" : ""}> evet</label>`;
    if (kind === "date") return `<input type="date" data-bf="${f}" data-col="${j}" data-nr="${nr}" value="${esc(v || "")}">`;
    if (kind === "text") return `<input type="text" data-bf="${f}" data-col="${j}" data-nr="${nr}" value="${esc(v || "")}" ${f === "deliveryTerm" ? 'list="dl-dterms-b"' : ""}>`;
    return `<input type="text" inputmode="decimal" data-bf="${f}" data-col="${j}" data-nr="${nr}" value="${numIn(parseNum(v))}">`;
  };
  const head = `<tr><th class="rl">Kalem</th>${cols.map((c, j) => `<th><div class="bh"><select data-bf="supplierId" data-col="${j}" aria-label="${j + 1}. sütun tedarikçisi"><option value="">Tedarikçi seçin</option>${sups.map(s => `<option value="${s.id}" ${c.supplierId === s.id ? "selected" : ""}>${esc(s.name)}${pasifEki(s)}</option>`).join("")}${firmaKartiSecenekleri(c.supplierId)}<option value="__new" ${c.supplierId === "__new" ? "selected" : ""}>+ Kayıtsız tedarikçi (adla)</option></select>${c.qid ? "" : `<button class="btn sm ghost" data-act="bulk-rm" data-col="${j}" aria-label="Sütunu kaldır" title="Sütunu kaldır">✕</button>`}</div>${c.supplierId === "__new" ? `<input type="text" data-bf="newName" data-col="${j}" placeholder="Yeni tedarikçi adı" value="${esc(c.newName)}" data-sa-y="32">` : ""}${c.qid ? (() => { const q = (S.requests[BULK!.rid]?.quotes || []).find(x => x.id === c.qid); return `<div class="bh-acts"><span class="sub">kayıtlı${q?.revisions ? `, ${q.revisions}. revizyon` : ""}</span><button class="lnk" data-act="edit-quote" data-qid="${c.qid}">Ayrıntı</button><button class="lnk danger" data-act="del-quote" data-qid="${c.qid}">Sil</button></div>`; })() : ""}</th>`).join("")}</tr>`;
  const priceRows = items.map(it => {
    const mid = matOf(it), st = mid ? matStats(mid) : null, prev = st ? st.buys.filter(e => e.reqId !== r.id) : [], last = prev[prev.length - 1];
    const tr = `<tr data-item="${it.id}"><td class="rl"><b>${esc(it.name)}</b><span class="sub">${numIn(parseNum(it.qty))} ${esc(it.unit)}${last ? `, son alış ${money(last.unitTRY)}` : ""}</span></td>${cols.map((c, j) => `<td data-pc="${j}"><input class="bp" type="text" inputmode="decimal" data-bi="${it.id}" data-col="${j}" data-nr="${row}" value="${numIn(c.prices[it.id])}" aria-label="${esc(it.name)}, ${j + 1}. sütun birim fiyat"></td>`).join("")}</tr>`;
    row++; return tr;
  }).join("");
  const termRows = BULK_FIELDS.map(([f, l, kind]) => { const tr = `<tr><td class="rl">${l}</td>${cols.map((c, j) => `<td>${cell(j, f, kind, c[f])}</td>`).join("")}</tr>`; row++; return tr; }).join("");
  const res = [["total", "Toplam (teklif para birimi)"], ["tl", "Toplam TL (güncel kur)"], ["pv", "Net bugünkü maliyet"]].map(([k, l]) => `<tr class="res"><td class="rl">${l}</td>${cols.map((c, j) => `<td data-bres="${k}" data-col="${j}">–</td>`).join("")}</tr>`).join("");
  return `<p class="small muted">Her sütun bir teklif. Excel'den kopyaladığınız fiyat bloğunu bir hücreye yapıştırın. Enter aşağı, Tab sağa geçer. Satırın en uygun fiyatı sarıyla işaretlenir.</p>
  <div class="tw"><table class="bulk"><thead>${head}</thead><tbody>
    <tr class="sec"><td class="rl">Birim fiyatlar (KDV hariç)</td>${cols.map(() => "<td></td>").join("")}</tr>${priceRows}
    <tr class="sec"><td class="rl">Ticari şartlar</td>${cols.map(() => "<td></td>").join("")}</tr>${termRows}
    <tr class="sec"><td class="rl">Sonuç</td>${cols.map(() => "<td></td>").join("")}</tr>${res}
  </tbody></table></div><datalist id="dl-dterms-b">${DELIVERY.map(d => `<option value="${esc(d)}">`).join("")}</datalist>`;
}
function bulkRead(): void {
  if (!BULK) return;
  $$("#bulk [data-bf]").forEach(i => {
    const c = BULK!.cols[+i.dataset.col!]; if (!c) return;
    const f = i.dataset.bf!, kind = BULK_FIELDS.find(x => x[0] === f)?.[2];
    const cc = c as unknown as Record<string, unknown>;
    if (f === "supplierId" || f === "newName") cc[f] = i.value;
    else if (kind === "bool") cc[f] = i.checked;
    else if (kind === "num" || kind === "int") { const v = parseNum(i.value); cc[f] = v === null ? (f === "leadDays" || f === "warrantyMonths" || f === "fxRate" ? null : 0) : (kind === "int" ? Math.round(v) : v); }
    else cc[f] = i.value;
  });
  $$("#bulk [data-bi]").forEach(i => { const c = BULK!.cols[+i.dataset.col!]; if (!c) return; const k = i.dataset.bi!; const v = parseNum(i.value); if (v === null) delete c.prices[k]; else c.prices[k] = v; });
}
const bulkQuote = (c: BulkCol): Quote => ({ ...c, id: c.qid || "bulk", supplierName: "", supplierId: c.supplierId === "__new" ? "" : c.supplierId });
function bulkLive(): void {
  const r = S.requests[BULK?.rid ?? ""]; if (!r || !BULK) return;
  const set = settings();
  const calcs = BULK!.cols.map(c => quoteCalc(r, bulkQuote(c), set));
  BULK!.cols.forEach((c, j) => {
    const k = calcs[j]!, has = Object.keys(c.prices).length > 0;
    const put = (key: string, v: string) => { const el = $(`#bulk [data-bres="${key}"][data-col="${j}"]`); if (el) el.textContent = has ? v : "–"; };
    put("total", money(k.total, c.currency)); put("tl", money(k.totalTRY)); put("pv", money(k.pvTRY));
    const fx = $(`#bulk [data-bf="fxRate"][data-col="${j}"]`); if (fx) { fx.disabled = c.currency === "TRY"; if (c.currency === "TRY") fx.value = ""; const oto = otomatikKur(c.currency, c.date || todayStr(), set); fx.placeholder = c.currency === "TRY" ? "" : oto !== null ? `boşsa güncel kur ${nfx.format(oto)}` : (c.date || todayStr()) === set.ratesDate ? "finansta kur yok, girin" : "boşsa teklif gününün kuru finanstan"; }
    const sh = $(`#bulk [data-bf="shipping"][data-col="${j}"]`); if (sh) sh.disabled = !!c.deliveryIncluded;
  });
  // satırda en uygun birim fiyat (güncel kurla, iskonto sonrası TL)
  (r.items || []).forEach(it => {
    const vals = BULK!.cols.map((c, j) => isNum(c.prices[it.id]) ? c.prices[it.id]! * calcs[j]!.unitTRY : null);
    const ok = vals.filter(isNum); const min = ok.length > 1 ? Math.min(...ok) : null;
    BULK!.cols.forEach((c, j) => { const td = $(`#bulk tr[data-item="${it.id}"] td[data-pc="${j}"]`); if (td) td.classList.toggle("best", min !== null && vals[j] != null && Math.abs(vals[j]! - min) < 1e-9); });
  });
  const pvs = BULK!.cols.map((c, j) => Object.keys(c.prices).length === (r.items || []).length ? calcs[j]!.pvTRY : null);
  const okp = pvs.filter(isNum); const minp = okp.length > 1 ? Math.min(...okp) : null;
  BULK!.cols.forEach((c, j) => { const td = $(`#bulk [data-bres="pv"][data-col="${j}"]`); if (td) td.classList.toggle("best", minp !== null && pvs[j] != null && Math.abs(pvs[j]! - minp) < 1e-9); });
  const bar = $<HTMLElement>("#bulk-bar"); if (bar) bar.hidden = !BULK!.dirty;
  const filled = BULK!.cols.filter(c => Object.keys(c.prices).length).length;
  const st = $("#bulk-st"); if (st) st.textContent = `${filled} sütunda fiyat var`;
}
function bulkRerender(): void { const r = S.requests[BULK!.rid]!; bulkRead(); $("#bulk").innerHTML = bulkGrid(r); bulkLive(); }
/* Excel'den blok yapıştırma: satırlar kalem, sütunlar tedarikçi */
function bulkPaste(e: ClipboardEvent): void {
  const t = e.target as FormEl; if (!t.classList || !t.classList.contains("bp")) return;
  const text = e.clipboardData?.getData("text") ?? "";
  if (!/[\t\n]/.test(text.trim())) return; // tek değer: normal yapıştırma
  e.preventDefault();
  const r = S.requests[BULK!.rid]!; bulkRead();
  const items = r.items || [];
  const startRow = items.findIndex(it => it.id === t.dataset.bi), startCol = +t.dataset.col!;
  const lines = text.replace(/\r/g, "").split("\n").filter((l, i, a) => l.length || i < a.length - 1);
  let n = 0;
  lines.forEach((line, i) => {
    const it = items[startRow + i]; if (!it) return;
    line.split("\t").forEach((cellText, k) => {
      const j = startCol + k;
      while (BULK!.cols.length <= j) BULK!.cols.push(bulkBlank(""));
      const v = parseNum(cellText); if (v === null) return;
      BULK!.cols[j]!.prices[it.id] = v; n++;
    });
  });
  BULK!.dirty = true;
  $("#bulk").innerHTML = bulkGrid(r); bulkLive();
  toast(`${n} fiyat yapıştırıldı`);
}
function bulkNav(e: KeyboardEvent): void {
  const t = e.target as FormEl; if (!t.dataset || t.dataset.nr === undefined || !t.closest("#bulk")) return;
  const down = e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey), up = e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey);
  if (!down && !up) return;
  if (t.tagName === "SELECT" && (e.key === "ArrowDown" || e.key === "ArrowUp")) return; // seçim kutusunda oklar seçenek değiştirir
  const nr = +t.dataset.nr + (down ? 1 : -1);
  const next = $(`#bulk [data-col="${t.dataset.col}"][data-nr="${nr}"]`);
  if (next) { e.preventDefault(); next.focus(); try { next.select(); } catch { /* seçim desteklenmiyor */ } }
}
/* kaydedilmemiş giriş varsa ilk denemede uyar, ikincide kapat (pencere değiştirmeden; girilenler kaybolmasın) */
function bulkClose(): void {
  if (BULK && BULK!.dirty && !BULK!.confirmClose) {
    BULK!.confirmClose = true;
    const st = $("#bulk-st"); if (st) { st.textContent = "Kaydedilmemiş fiyatlar var. Kapatmak için tekrar Vazgeç'e basın."; st.className = "small flag warn"; }
    const b = $('[data-act="bulk-close"]'); if (b) { b.textContent = "Kaydetmeden kapat"; b.classList.add("danger"); }
    return;
  }
  if (BULK?.inline) { BULK = null; render(); toast("Değişiklikler geri alındı"); return; }
  closeModal();
}
function bulkSave(): void {
  const r = S.requests[BULK!.rid]; if (!r || !canWrite()) return;
  bulkRead();
  const set = settings();
  const used = BULK!.cols.map((c, j) => ({ c, j })).filter(x => Object.keys(x.c.prices).length || x.c.qid);
  if (!used.length) { toast("Kaydedilecek fiyat yok."); return; }
  for (const { c, j } of used) {
    if (!c.supplierId) { toast(`${j + 1}. sütunda tedarikçi seçin.`); $(`#bulk [data-bf="supplierId"][data-col="${j}"]`).focus(); return; }
    if (c.supplierId === "__new" && !c.newName.trim()) { toast(`${j + 1}. sütunda yeni tedarikçinin adını yazın.`); $(`#bulk [data-bf="newName"][data-col="${j}"]`).focus(); return; }
    if (!Object.keys(c.prices).length) { toast(`${j + 1}. sütunda en az bir birim fiyat girin.`); return; }
    if (kurIstenir(c.currency, c.fxRate, set, c.date || todayStr())) { toast(KUR_ILETISI); $(`#bulk [data-bf="fxRate"][data-col="${j}"]`).focus(); return; }
  }
  const ids = used.map(x => x.c.supplierId === "__new" ? "new:" + norm(x.c.newName) : x.c.supplierId);
  const dup = ids.find((v, i) => ids.indexOf(v) !== i);
  if (dup) { toast("Aynı tedarikçi iki sütunda seçilmiş; birini değiştirin."); return; }
  const n = clone(r); let added = 0, updated = 0;
  for (const { c } of used) {
    let supId = c.supplierId;
    if (supId === "__new") {
      const nm = c.newName.trim();
      const ex = Object.values(S.suppliers).find(s => norm(s.name) === norm(nm));
      // TMI: tedarikçi burada açılmaz (firma finansta açılır, S1); kayıtsız tedarikçinin teklifi adıyla kaydedilir.
      supId = ex ? ex.id : "";
    }
    const q: Quote = {
      id: c.qid || uid(), supplierId: supId, supplierName: tedarikciAdi(supId) || (c.supplierId === "__new" ? c.newName.trim() : ""), date: c.date || todayStr(), validUntil: c.validUntil || "",
      currency: c.currency, fxRate: kaydedilecekKur(c.currency, c.fxRate, set, c.date || todayStr()),
      prices: Object.assign({}, c.prices), discountPct: c.discountPct || 0, shipping: c.shipping || 0, otherCost: c.otherCost || 0,
      deliveryTerm: c.deliveryTerm || "", deliveryIncluded: !!c.deliveryIncluded, leadDays: c.leadDays, payDays: c.payDays || 0, advancePct: c.advancePct || 0,
      warrantyMonths: c.warrantyMonths, compliant: c.compliant !== false, note: c.note || ""
    };
    const total = quoteCalc(n, q, set).total;
    const i = n.quotes.findIndex(x => x.id === q.id);
    if (i < 0) { q.firstTotal = total; q.createdAt = Date.now(); n.quotes.push(q); added++; }
    else {
      const old = n.quotes[i]!, oldTotal = quoteCalc(n, old, set).total;
      q.firstTotal = isNum(old.firstTotal) ? old.firstTotal : oldTotal; q.createdAt = old.createdAt; q.revisions = old.revisions || 0;
      if (Math.abs(oldTotal - total) > 0.005) { q.revisions = (q.revisions ?? 0) + 1; updated++; }
      else if (JSON.stringify(Object.assign({}, old, { prices: null })) !== JSON.stringify(Object.assign({}, old, q, { prices: null }))) updated++;
      n.quotes[i] = Object.assign({}, old, q);
    }
  }
  if (!added && !updated) { if (BULK?.inline) BULK = null; else closeModal(); render(); toast("Değişiklik yok."); return; }
  if (n.status === "draft") n.status = "rfq";
  if (n.status === "rfq" && n.quotes.length >= set.minQuotes) n.status = "eval";
  saveRequest(n, `Toplu teklif girişi: ${added} yeni${updated ? `, ${updated} güncellendi` : ""}`);
  if (BULK?.inline) BULK = null; else closeModal();
  V.tab = n.quotes.length >= 2 ? "compare" : "quotes"; render();
  toast(`${added} yeni teklif eklendi${updated ? `, ${updated} teklif güncellendi` : ""}.`);
}

/* ================= karar tablosu, kalem bazlı karar, siparişler, teslimatlar ================= */
/** Karar tablosunda bir teklifi seçer; önerilenden ayrılınca gerekçe kutusu açılır (kart #956). */
function teklifSec(qid: string): void {
  const tablo = document.querySelector<HTMLElement>(".sa-karar"); if (!tablo) return;
  const rad = tablo.querySelector<HTMLInputElement>(`input[name=d-sec][value="${qid}"]`);
  if (!rad || rad.disabled) return;
  rad.checked = true;
  $("#d-quote").value = qid;
  tablo.querySelectorAll<HTMLElement>("tr[data-qid]").forEach(tr => tr.classList.toggle("sel", tr.dataset.qid === qid));
  const wrap = document.getElementById("d-reason-wrap"); if (wrap) wrap.hidden = qid === tablo.dataset.top;
}
function orderRow(tr: Element, f: string): string { const i = tr.querySelector<FormEl>(`[data-of="${f}"]`); return i ? i.value.trim() : ""; }
function placeSplitOrders(r: PurchaseRequest): void {
  const n = clone(r); const a = n.award!; a.orders = a.orders || {};
  kataloglaEslesenleriBagla(n.items);
  const names: string[] = [];
  $$("#orders-form [data-order]").forEach(tr => {
    const qid = tr.dataset.order!; const q = (r.quotes || []).find(x => x.id === qid); if (!q) return;
    const od = orderRow(tr, "orderDate") || todayStr(); const ld = parseNum(q.leadDays);
    const o = Object.assign({}, a.orders![qid] || {}, { poNo: orderRow(tr, "poNo"), orderDate: od, expectedDate: orderRow(tr, "expectedDate") || (ld !== null ? addDays(od, ld) : "") });
    a.orders![qid] = o; names.push(`${supName(q)}${o.poNo ? " (" + o.poNo + ")" : ""}`);
  });
  const vals = Object.values(a.orders);
  a.orderDate = vals.map(o => o.orderDate).filter(Boolean).sort()[0] || todayStr();
  a.expectedDate = vals.map(o => o.expectedDate).filter(Boolean).sort().slice(-1)[0] || "";
  const usedCur = [...new Set((r.quotes || []).map(x => x.currency).filter(c => c !== "TRY"))];
  if (!COMMITTED.includes(n.status) && usedCur.length) a.fx = fixedRates(n, settings());
  const approved = (a.approvals || []).slice(-1)[0];
  const was = COMMITTED.includes(n.status);
  if (!was) n.status = "ordered";
  saveRequest(n, was ? "Sipariş bilgileri güncellendi" : `Siparişler verildi: ${names.join(", ")}${approved && approved.decision === "approved" ? "" : "; onaysız sipariş"}${a.fx && Object.keys(a.fx).length ? "; kurlar sabitlendi: " + Object.entries(a.fx).map(([c, v]) => `${c} ${nfx.format(v)}`).join(", ") : ""}`);
  toast(was ? "Güncellendi" : `${names.length} sipariş kaydedildi`);
}
const QRANK: Record<string, number> = { rejected: 3, partial: 2, ok: 1 };
function receiveSplitOrders(r: PurchaseRequest): void {
  const n = clone(r); const a = n.award!; a.orders = a.orders || {};
  const got: string[] = [];
  $$("#deliveries-form [data-order]").forEach(tr => {
    const qid = tr.dataset.order!; const q = (r.quotes || []).find(x => x.id === qid); if (!q) return;
    const dd = orderRow(tr, "deliveredDate"), ql = orderRow(tr, "quality");
    const prev = a.orders![qid] || {};
    const o = Object.assign({}, prev, { deliveredDate: dd, quality: (dd ? (ql || "ok") : ql) as Quality | "" });
    if (dd && !prev.deliveredDate) {
      const due = orderDue({ q, expectedDate: o.expectedDate || "", orderDate: o.orderDate || "" });
      const late = due ? dayDiff(due, dd) : null;
      got.push(`${supName(q)} ${late !== null && late > 0 ? late + " gün gecikmeli" : "zamanında"}${o.quality && o.quality !== "ok" ? ", " + QUALITY[o.quality as Quality].toLowerCase() : ""}`);
    }
    a.orders![qid] = o;
  });
  a.lessons = $("#t-lessons").value.trim();
  const os = awardOrders(n);
  const all = os.length > 0 && os.every(o => o.deliveredDate);
  if (all) {
    n.status = "received";
    a.deliveredDate = os.map(o => o.deliveredDate).sort().slice(-1)[0];
    a.quality = os.map(o => o.quality || "ok").sort((x, y) => (QRANK[y] ?? 0) - (QRANK[x] ?? 0))[0] as Quality;
  }
  saveRequest(n, got.length ? `Teslim alındı: ${got.join(", ")}${all ? "; tüm siparişler tamamlandı" : ""}` : "Teslim bilgileri güncellendi");
  toast(all ? "Tüm siparişler teslim alındı; karneler güncellendi" : got.length ? "Teslimat kaydedildi; bekleyen siparişler var" : "Güncellendi");
}

/** Modüller yüklendikten sonra main.ts çağırır (döngüsel içe aktarmada sıralama sorununu önler) */
export function registerUIHooks(): void { onAfterRender(() => { if (BULK && $("#bulk")) bulkLive(); }); }

/* ================= hesap dökümü ================= */
function calcModal(r: PurchaseRequest, qid: string | undefined): void {
  const ev = evaluate(r, UI_WD(r));
  const x = ev.all.find(y => y.q.id === qid) || ev.ranking[0]; if (!x) return;
  const q = x.q, c = x.c, cur = q.currency;
  const adv = clamp((parseNum(q.advancePct) || 0) / 100, 0, 1), days = parseNum(q.payDays) || 0;
  const tw = sum(CRIT.map(k => +ev.w[k.k] || 0)) || 1;
  const elig = ev.elig.includes(x);
  const minPV = ev.elig.length ? Math.min(...ev.elig.map(y => y.scorePV)) : 0;
  const maxW = Math.max(0, ...ev.elig.map(y => parseNum(y.q.warrantyMonths) || 0));
  const line = (k: string, v: string, how: string, cls = "") => `<tr class="${cls}"><td>${k}${how ? `<div class="how">${how}</div>` : ""}</td><td class="r">${v}</td></tr>`;
  const items = (r.items || []).map(it => { const l = c.lines[it.id]; return line(esc(it.name), l ? money(l.line, cur) : '<span class="faint">teklif yok</span>', l ? `${numIn(parseNum(it.qty))} ${esc(it.unit)} × ${money(l.unit, cur)}` : ""); }).join("");
  const rateHow = cur === "TRY" ? "" : OPEN.includes(r.status) ? "en üstteki güncel kur" : (r.award?.fx?.[cur] ? "sipariş günü sabitlenen kur" : "teklif günü kuru");
  const ld = parseNum(q.leadDays);
  const leadHow = ld === null ? "termin belirtilmemiş, 0 puan" : r.needDate ? (x.late ? `ihtiyaç tarihini ${x.late} gün kaçırıyor: 100 − ${x.late} × ${nf1.format(100 / 15)}` : "ihtiyaç tarihine yetişiyor: 100") : `en kısa termine göre ${ld - Math.min(...ev.elig.map(y => parseNum(y.q.leadDays)).filter((v): v is number => v !== null))} gün fazla: her gün ${nf1.format(100 / 30)} puan düşer`;
  const sup = S.suppliers[q.supplierId], sst = supplierStats()[q.supplierId];
  const supHow = `puanınız ${parseNum(sup && sup.rating) || 3}/5${sst && sst.deliveries ? `, zamanında teslim ${pct(sst.onTimeRate)}` : ""}${sst && sst.qualityN ? `, kalite ${pct(sst.qualityRate)}` : ""}`;
  const sel = `<select id="calc-q" aria-label="Teklif">${ev.all.map(y => `<option value="${y.q.id}" ${y.q.id === q.id ? "selected" : ""}>${esc(supName(y.q))}</option>`).join("")}</select>`;
  openModal(`<div class="mh"><h2>Hesap dökümü</h2><span class="spacer"></span><div data-sa-y="33">${sel}</div></div>
  <div class="mb">
    <div class="tw"><table class="calc"><tbody>
      <tr class="sec"><td colspan="2"><b>1. Tutar (${cur})</b></td></tr>
      ${items}
      ${line("Ara toplam", money(c.sub, cur), "", "tot")}
      ${c.disc ? line("İskonto", "− " + money(c.sub * c.disc, cur), `%${nfx.format(c.disc * 100)}`) : ""}
      ${c.ship ? line("Nakliye", "+ " + money(c.ship, cur), "fiyata dahil değil") : ""}
      ${c.other ? line("Diğer masraflar", "+ " + money(c.other, cur), "") : ""}
      ${line("Toplam", money(c.total, cur), "KDV hariç", "tot")}
      <tr class="sec"><td colspan="2"><b>2. TL karşılığı ve vade</b></td></tr>
      ${cur !== "TRY" ? line("Kur", nfx.format(c.rate), rateHow) : ""}
      ${line("Toplam TL", money(c.totalTRY), cur !== "TRY" ? `${money(c.total, cur)} × ${nfx.format(c.rate)}` : "")}
      ${adv ? line("Avans (peşin ödenen)", money(c.totalTRY * adv), `%${nf0.format(adv * 100)}`) : ""}
      ${days ? line("Vadeli kısmın bugünkü değeri", money(c.totalTRY * (1 - adv) / Math.pow(1 + c.monthly, days / 30)), `${money(c.totalTRY * (1 - adv))} ÷ (1 + %${nfx.format(c.monthly * 100)})^(${days} ÷ 30); ${cur} aylık fırsat maliyeti`) : line("Ödeme", "Peşin", "indirgeme yok")}
      ${line("Net bugünkü maliyet", money(c.pvTRY), c.vadeGain > 0.5 ? `vade avantajı ${money(c.vadeGain)}` : "", "tot")}
      ${elig && x.fill > 0 ? line("Eksik kalemler için ekleme", "+ " + money(x.fill), "eksik kalemler diğer tekliflerin en yüksek fiyatıyla tamamlanır (yalnızca puanlamada)") : ""}
      ${elig ? `<tr class="sec"><td colspan="2"><b>3. Puan</b></td></tr>
      ${line(`Net maliyet (ağırlık %${nf0.format((+ev.w.cost || 0) / tw * 100)})`, nf1.format(x.s.cost), `en düşük ${money(minPV, "TRY", 0)} ÷ bu teklif ${money(x.scorePV, "TRY", 0)} × 100`)}
      ${line(`Termin (ağırlık %${nf0.format((+ev.w.lead || 0) / tw * 100)})`, nf1.format(x.s.lead), leadHow)}
      ${line(`Tedarikçi performansı (ağırlık %${nf0.format((+ev.w.supplier || 0) / tw * 100)})`, nf1.format(x.s.supplier), supHow)}
      ${line(`Garanti (ağırlık %${nf0.format((+ev.w.warranty || 0) / tw * 100)})`, nf1.format(x.s.warranty), maxW ? `en çok 12 ay sayılır: ${Math.min(parseNum(q.warrantyMonths) || 0, 12)} ay ÷ ${Math.min(maxW, 12)} ay × 100` : "hiçbir teklif garanti belirtmemiş: herkese 100")}
      ${line("Toplam puan", nf1.format(x.score), "her ölçüt puanı × ağırlık payı, toplamı", "tot")}` : `<tr><td colspan="2" class="muted">Bu teklif ${q.compliant === false ? "teknik olarak uygun değil" : "fiyat içermiyor"}; puanlamaya girmez.</td></tr>`}
    </tbody></table></div>
  </div>
  <div class="mf"><button class="btn ghost" data-act="close">Kapat</button></div>`, true);
}
const UI_WD = (r: PurchaseRequest) => (UI.wDraft && UI.wDraft.id === r.id ? UI.wDraft.w : null);

/* ================= CSV ================= */
function csvFor(r: PurchaseRequest): string {
  const ev = evaluate(r), cols = ev.all;
  const n2 = (v: unknown) => isNum(v) ? nf2.format(v) : "";
  const rows: (string | number)[][] = [["Kalem / şart", ...cols.map(x => supName(x.q))]];
  (r.items || []).forEach(it => rows.push([`${it.name} (${numIn(parseNum(it.qty))} ${it.unit}) birim fiyat`, ...cols.map(x => x.c.lines[it.id] ? n2(x.c.lines[it.id]!.unit) + " " + x.q.currency : "")]));
  rows.push(["Para birimi", ...cols.map(x => x.q.currency)]);
  rows.push(["Kur", ...cols.map(x => nfx.format(x.c.rate))]);
  rows.push(["İskonto %", ...cols.map(x => n2(x.c.disc * 100))]);
  rows.push(["Nakliye + diğer", ...cols.map(x => n2(x.c.ship + x.c.other))]);
  rows.push(["Toplam (teklif p.b.)", ...cols.map(x => n2(x.c.total))]);
  rows.push(["Toplam TL", ...cols.map(x => n2(x.c.totalTRY))]);
  rows.push(["Ödeme", ...cols.map(x => payText(x.q))]);
  rows.push(["Net bugünkü maliyet TL", ...cols.map(x => n2(x.c.pvTRY))]);
  rows.push(["Termin (gün)", ...cols.map(x => parseNum(x.q.leadDays) ?? "")]);
  rows.push(["Teslim şekli", ...cols.map(x => x.q.deliveryTerm || "")]);
  rows.push(["Garanti (ay)", ...cols.map(x => parseNum(x.q.warrantyMonths) ?? "")]);
  rows.push(["Geçerlilik", ...cols.map(x => fmtDate(x.q.validUntil))]);
  rows.push(["Teknik uygun", ...cols.map(x => x.q.compliant === false ? "Hayır" : "Evet")]);
  rows.push(["Puan", ...cols.map(x => { const e = ev.elig.find(y => y.q.id === x.q.id); return e ? nf0.format(e.score) : ""; })]);
  return toCSV(rows);
}

/* ================= tıklama olayları ================= */
export function go(page: Page, id?: string | null, tab?: string | null): void { partileriUnut(); takibiUnut(); V.page = page; V.id = id || null; V.tab = tab || null; UI.wDraft = null; $("#gres").hidden = true; render(); window.scrollTo(0, 0); }
document.addEventListener("click", (e) => {
  if (!kokIcinde(e)) return;
  const target = e.target as HTMLElement;
  if (!target.closest(".gsearch")) $("#gres").hidden = true;
  if (!target.closest(".menu") || target.closest(".menu-list button")) closeMenus();
  const el = target.closest<HTMLElement>("[data-act]"); if (!el) return;
  const act = el.dataset.act!;
  if (act === "ovl") { if (e.target === el && !el.dataset.sticky) closeModal(); return; }
  const r = V.page === "request" && V.id ? S.requests[V.id] ?? null : null;
  const A = ACTIONS[act];
  if (A) { e.preventDefault(); A(el, r); }
});
type Action = (el: HTMLElement, r: PurchaseRequest | null) => void;
/* ---------------- talep işlemleri menüsü ---------------- */
function closeMenus(except?: Element | null): void {
  $$<HTMLElement>(".menu-list").forEach(m => { if (m !== except) { m.hidden = true; m.previousElementSibling?.setAttribute("aria-expanded", "false"); } });
}
function reqAction(v: string, r: PurchaseRequest): void {
  if (!canWrite()) return;
  if (v === "edit") requestModal(r);
  else if (v === "dup") { const items = (r.items || []).map(it => ({ id: uid(), name: it.name, spec: it.spec || "", qty: it.qty, unit: it.unit, materialId: it.materialId })); requestModal(null, items); $("#r-title").value = r.title; $("#r-dep").value = r.department || ""; $("#r-req").value = r.requester || ""; }
  else if (v === "status") openModal(`<div class="mh"><h2>Durumu değiştir</h2></div><div class="mb"><p class="small muted">Normalde durum karar, onay ve sipariş adımlarıyla kendiliğinden ilerler. Elle değişiklik geçmişe kaydedilir.</p><select id="st-new">${STATUSES.map(s => `<option value="${s.k}" ${r.status === s.k ? "selected" : ""}>${s.l}</option>`).join("")}</select></div><div class="mf"><button class="btn primary" data-act="set-status">Kaydet</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, true);
  else if (v === "cancel") openModal(`<div class="mh"><h2>Talebi iptal et</h2></div><div class="mb"><label class="f"><span>İptal nedeni</span><input type="text" id="cx-reason" placeholder="Örn. ihtiyaç ortadan kalktı, stoktan karşılandı"></label></div><div class="mf"><button class="btn bad" data-act="cancel-req">İptal et</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, true);
  else if (v === "delete") confirmModal(`${r.no} ${r.title} talebi ve tüm teklifleri silinecek; fiyat geçmişinden de çıkar. Kaydı hafızada tutmak için iptal etmeyi tercih edin.`, () => { persistUndoable("requests", r.id, null, `${r.no} silindi`, () => go("request", r.id)); go("requests"); });
}

const ACTIONS: Record<string, Action> = {
  "menu": el => { const list = el.nextElementSibling as HTMLElement | null; if (!list) return; const open = list.hidden; closeMenus(list); list.hidden = !open; el.setAttribute("aria-expanded", String(open)); if (open) (list.querySelector("button") as HTMLElement | null)?.focus(); },
  "req-edit": (_el, r) => { if (r) reqAction("edit", r); },
  "req-dup": (_el, r) => { if (r) reqAction("dup", r); },
  "req-status": (_el, r) => { if (r) reqAction("status", r); },
  "req-cancel": (_el, r) => { if (r) reqAction("cancel", r); },
  "req-delete": (_el, r) => { if (r) reqAction("delete", r); },
  "go": el => go(el.dataset.page as Page),
  "open": el => go("request", el.dataset.id),
  "open-mat": el => go("material", el.dataset.id),
  "open-sup": el => go("supplier", el.dataset.id),
  "g-open": el => { $("#gsearch").value = ""; go(el.dataset.k as Page, el.dataset.id); },
  "tab": el => {
    const k = el.dataset.tab ?? null; V.tab = k; render();
    // bölüm başlığından başka bir yerden gelindiyse açılan bölüme kaydır
    if (!el.classList.contains("fsec-h")) requestAnimationFrame(() => $<HTMLElement>(".fsec.open")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  },
  "status-chip": el => { V.status = el.dataset.v || "open"; render(); },
  "sort": el => { const k = el.dataset.k || ""; if (V.sort === k) { if (V.dir > 0) V.dir = -1; else { V.sort = ""; V.dir = 1; } } else { V.sort = k; V.dir = 1; } render(); },
  "view": el => { V.view = el.dataset.v as ViewState["view"]; render(); },
  "period": el => { V.period = el.dataset.v as ViewState["period"]; render(); },
  "close": () => closeModal(),
  "toggle": el => { const t = $("#" + el.dataset.t!); if (t) t.hidden = !t.hidden; },
  "copy-tm": () => { void copyText($("#tm-ta").value); },
  "confirm-yes": () => { const f = confirmCb; confirmCb = null; closeModal(); if (f) f(); },

  /* talep */
  "new-request": () => { if (canWrite()) requestModal(null); },
  "open-at": el => go("request", el.dataset.id, el.dataset.tab || null),
  "edit-request": (el, r) => { if (canWrite() && r) requestModal(r); },
  "add-item": () => { if (syncItems()) { toast(BELIRSIZ_MIKTAR); return; } draftReq.items.push({ id: uid(), name: "", spec: "", qty: 1, unit: "adet" }); $("#items-box").innerHTML = itemsEditor(); labelTables($("#items-box")); const ins = $$("#items-box [data-it=name]"); ins[ins.length - 1]!.focus(); },
  "rm-item": el => { syncItems(); draftReq.items.splice(+el.dataset.i!, 1); $("#items-box").innerHTML = itemsEditor(); labelTables($("#items-box")); },
  "apply-paste-items": () => {
    syncItems();
    const yeni = yapistirilanKalemler($("#paste-items-ta").value);
    if (yeni === "belirsiz") { toast(BELIRSIZ_MIKTAR); return; }
    yeni.forEach(k => draftReq.items.push({ id: uid(), ...k })); const added = yeni.length;
    draftReq.items = draftReq.items.filter(i => i.name || draftReq.items.length === 1);
    draftReq.items.forEach(it => { const mid = matOf(it); if (mid && !it.unit) it.unit = S.materials[mid]!.unit; });
    $("#items-box").innerHTML = itemsEditor(); labelTables($("#items-box")); $("#paste-items").hidden = true; $("#paste-items-ta").value = ""; toast(added + " kalem eklendi");
  },
  "save-request": () => {
    if (syncItems()) { toast(BELIRSIZ_MIKTAR); return; }
    draftReq.title = $("#r-title").value.trim(); draftReq.department = $("#r-dep").value.trim(); draftReq.requester = $("#r-req").value.trim();
    draftReq.needDate = $("#r-need").value; draftReq.notes = $("#r-notes").value.trim(); draftReq.priority = $("#r-prio").value as Priority;
    // Boş satır kayıt geçene kadar taslakta kalır: ekrandaki satırlar taslağın sırasıyla bağlıdır, erken silinirse sonra yazılan kalem kaybolur.
    const dolu = draftReq.items.filter(i => i.name);
    if (!draftReq.title) { toast("Talep başlığı girin."); $("#r-title").focus(); return; }
    if (!dolu.length) { toast("En az bir kalem girin."); return; }
    if (dolu.some(i => !isNum(i.qty) || i.qty <= 0)) { toast("Her kalem için sıfırdan büyük bir miktar girin."); return; }
    // BR1: sunucu listede olmayan birimi reddeder; ret yeni talebi ekrandan siler, bu yüzden form kapanmadan söylenir.
    const birimRed = birimReddi(draftReq.department, (settings().departments || []).map(d => d.name));
    if (birimRed) { toast(birimRed); $("#r-dep").focus(); return; }
    draftReq.items = dolu;
    const isNew = !S.requests[draftReq.id];
    linkItemsToCatalog(draftReq.items);
    saveRequest(draftReq, isNew ? `Talep oluşturuldu (${draftReq.items.length} kalem)` : "Talep bilgileri güncellendi");
    closeModal();
    if (isNew) go("request", draftReq.id, "items");
    toast(isNew ? "Talep oluşturuldu" : "Talep güncellendi");
  },

  /* teklif isteği */
  "rfq": (_el, r) => { if (r && canWrite()) { if (!(r.items || []).length) { toast("Önce kalem ekleyin."); return; } rfqModal(r); } },
  "copy-rfq": () => { void copyText($("#rfq-out").textContent ?? ""); },
  "mark-rfq": (el, r) => {
    const sel = $$("[data-rfq]").filter(i => i.checked).map(i => i.dataset.rfq!);
    if (!sel.length) { toast("İstendi olarak kaydetmek için en az bir tedarikçi seçin."); return; }
    if (!r) return; const n = clone(r); n.rfqs = n.rfqs || []; const due = $("#rfq-due").value;
    sel.forEach(id => { const ex = n.rfqs.find(x => x.supplierId === id); if (ex) { ex.sentAt = todayStr(); ex.dueDate = due; } else n.rfqs.push({ supplierId: id, sentAt: todayStr(), dueDate: due }); });
    if (n.status === "draft") n.status = "rfq";
    saveRequest(n, `${sel.length} tedarikçiden teklif istendi: ${sel.map(id => S.suppliers[id]?.name ?? "").join(", ")}`);
    closeModal(); V.tab = "quotes"; toast("Teklif istekleri kaydedildi");
  },
  "remind": (el, r) => {
    if (!r) return; const sid = el.dataset.sid!;
    const x = (r.rfqs || []).find(x => x.supplierId === sid);
    openModal(`<div class="mh"><h2>Hatırlatma metni</h2></div><div class="mb"><pre class="out">${esc(rfqText(r, sid, x ? x.sentAt : todayStr(), true))}</pre></div><div class="mf"><button class="btn primary" data-act="copy-pre">Kopyala</button><button class="btn ghost" data-act="close">Kapat</button></div>`);
  },
  "copy-pre": () => { void copyText($("#modal-root pre.out").textContent ?? ""); },

  /* teklif */
  "new-quote": (el, r) => { if (canWrite() && r) { if (!(r.items || []).length) { toast("Önce kalem ekleyin."); return; } quoteModal(r, null, el.dataset.sid); } },
  "edit-quote": (el, r) => { if (canWrite() && r) quoteModal(r, (r.quotes || []).find(q => q.id === el.dataset.qid)); },
  "del-quote": (el, r) => {
    if (!canWrite() || !r) return; const q = (r.quotes || []).find(x => x.id === el.dataset.qid);
    if (!q) return;
    const n = clone(r); n.quotes = n.quotes.filter(x => x.id !== q.id);
    if (n.award && (n.award.quoteId === q.id || Object.values(n.award.splits || {}).includes(q.id))) delete n.award;
    saveRequestUndoable(n, `${supName(q)} teklifi silindi`, `${supName(q)} teklifi silindi`);
  },
  "pay-chip": el => { $("#q-pay").value = el.dataset.v ?? ""; if (el.dataset.v === "0") $("#q-adv").value = ""; readQuoteForm(); updateQuoteLive(); },
  "apply-paste-prices": () => {
    const vals = $("#paste-prices-ta").value.split(/\r?\n/).map(l => (l.split("\t").pop() ?? "").trim());
    let k = 0; $$("[data-price]").forEach((inp, i) => { if (i < vals.length && vals[i] !== "") { const v = parseNum(vals[i]); if (v !== null) { inp.value = numIn(v); k++; } } });
    $("#paste-prices").hidden = true; readQuoteForm(); updateQuoteLive(); toast(k + " fiyat dolduruldu");
  },
  "save-quote": (_el, r) => {
    if (!r) return; readQuoteForm(); const n = clone(r);
    if (draftQ.supplierId === "__new") {
      const nm = $("#q-newsup").value.trim(); if (!nm) { toast("Yeni tedarikçinin adını girin."); $("#q-newsup").focus(); return; }
      const ex = Object.values(S.suppliers).find(s => norm(s.name) === norm(nm));
      // TMI: tedarikçi burada açılmaz (firma finansta açılır, S1); kayıtsız tedarikçinin teklifi adıyla kaydedilir.
      if (ex) draftQ.supplierId = ex.id;
      else { draftQ.supplierId = ""; draftQ.supplierName = nm; }
    }
    if (!draftQ.supplierId && !draftQ.supplierName) { toast("Tedarikçi seçin."); $("#q-sup").focus(); return; }
    if (!Object.keys(draftQ.prices).length) { toast("En az bir kalem için birim fiyat girin."); return; }
    if (kurIstenir(draftQ.currency, draftQ.fxRate, settings(), draftQ.date)) { toast(KUR_ILETISI); $("#q-fx").focus(); return; }
    draftQ.supplierName = tedarikciAdi(draftQ.supplierId) || draftQ.supplierName || "";
    const total = quoteCalc(n, draftQ).total;
    const i = n.quotes.findIndex(x => x.id === draftQ.id);
    let msg;
    if (i < 0) { draftQ.firstTotal = total; draftQ.createdAt = Date.now(); n.quotes.push(draftQ); msg = `${draftQ.supplierName} teklifi eklendi: ${money(total, draftQ.currency)}`; }
    else {
      const old = quoteCalc(n, n.quotes[i]!).total;
      if (!isNum(draftQ.firstTotal)) draftQ.firstTotal = old;
      if (Math.abs(old - total) > 0.005) { draftQ.revisions = (draftQ.revisions || 0) + 1; msg = `${draftQ.supplierName} teklifi revize edildi: ${money(old, draftQ.currency)} → ${money(total, draftQ.currency)}`; }
      else msg = `${draftQ.supplierName} teklif şartları güncellendi`;
      n.quotes[i] = draftQ;
    }
    n.rfqs = n.rfqs || [];
    if (n.status === "draft") n.status = "rfq";
    if (n.status === "rfq" && n.quotes.length >= settings().minQuotes) n.status = "eval";
    saveRequest(n, msg); closeModal(); toast("Teklif kaydedildi");
  },

  /* karşılaştırma ve karar */
  "reset-weights": (el, r) => { if (r && canWrite()) { const n = clone(r); delete n.weights; UI.wDraft = null; saveRequest(n); } },
  "pick": (el, r) => { if (!r) return; V.tab = "compare"; render(); teklifSec(el.dataset.qid!); $<HTMLElement>(".sa-karar")?.scrollIntoView({ block: "center" }); },
  "sec-teklif": el => { if (canWrite()) teklifSec(el.dataset.qid!); },
  "split-review": (el, r) => { if (!r) return; V.tab = "compare"; UI.adv.detay = true; render(); $<HTMLElement>("#d-split-panel")?.scrollIntoView({ block: "start" }); },
  "split-optimal": (el, r) => { if (!r) return; const ev = evaluate(r); if (!ev.split) return; $$("[data-split]").forEach(s => { const v = ev.split!.plan.assign[s.dataset.split!]; if (v) s.value = v; }); updateSplitSum(); },
  "save-decision": (el, r) => {
    if (!canWrite() || !r) return;
    const ev = evaluate(r);
    const mode = (el.dataset.mode || "single") as AwardMode;
    const gerekceAlani = mode === "split" ? "#d-reason-split" : "#d-reason";
    const qid = $("#d-quote").value, reason = $(gerekceAlani).value.trim();
    if (mode === "single" && ev.ranking[0] && qid !== ev.ranking[0].q.id && !reason) { $("#d-reason-wrap").hidden = false; toast("Önerilen teklif seçilmedi; kısa bir gerekçe yazın."); $("#d-reason").focus(); return; }
    let plan = null;
    if (mode === "split") {
      if (!ev.split) { toast("Kalem bazlı bölme için en az iki teklif ve iki kalem gerekiyor."); return; }
      plan = planCost(r, ev.all, readSplitAssign());
      if (!plan.ok) { toast("Her kaleme bir tedarikçi atayın."); return; }
      if (plan.total > ev.split.plan.total + 0.5 && !reason) { toast("En uygun dağılım seçilmedi; kısa bir gerekçe yazın."); $(gerekceAlani).focus(); return; }
    }
    const n = clone(r); const old: Partial<Award> = n.award || {};
    const award: Award = Object.assign({ mode, quoteId: null, reason: "", by: "", decidedAt: todayStr() } as Award, old, { mode, quoteId: mode === "single" ? qid : null, reason, by: $("#d-by").value.trim(), decidedAt: old.decidedAt || todayStr() });
    if (mode === "split" && plan) award.splits = Object.assign({}, plan.assign); else delete award.splits;
    const changed = old.mode !== award.mode || old.quoteId !== award.quoteId || JSON.stringify(old.splits || {}) !== JSON.stringify(award.splits || {});
    if (changed && (old.approvals || []).length) award.approvals = [];
    if (changed) delete award.orders;
    n.award = award;
    if (OPEN.includes(n.status)) n.status = "approval";
    const tt = awardTotals(n);
    V.tab = "decision";
    saveRequest(n, mode === "split" && plan ? `Kalem bazlı karar: ${plan.groups.map(g => supName(g.x.q)).join(", ")}, ${tt ? money(tt.totalTRY, "TRY", 0) : ""}. Onaya gönderildi.` : `Karar: ${supName((r.quotes || []).find(q => q.id === qid)!)}, ${tt ? money(tt.totalTRY, "TRY", 0) : ""}. Onaya gönderildi.`);
    toast("Karar kaydedildi, onay bekliyor");
  },
  "clear-decision": (el, r) => { if (!canWrite() || !r) return; const n = clone(r); delete n.award; if (["approval", "ordered", "received"].includes(n.status)) n.status = "eval"; saveRequestUndoable(n, "Karar kaldırıldı", "Karar ve onaylar kaldırıldı"); },
  "approve": (el, r) => {
    if (!canWrite() || !r || !r.award) return;
    const n = clone(r); const note = $("#ap-note").value.trim();
    const aw = n.award!; aw.approvals = aw.approvals || []; aw.approvals.push({ id: uid(), at: Date.now(), by: S.me?.id ?? "", name: S.me?.name ?? "", decision: "approved", note });
    saveRequest(n, `Onaylandı${note ? ": " + note : ""}`); toast("Onaylandı");
  },
  "reject": (el, r) => {
    if (!canWrite() || !r || !r.award) return;
    const note = $("#ap-note").value.trim(); if (!note) { toast("Ret gerekçesini not alanına yazın."); $("#ap-note").focus(); return; }
    const n = clone(r);
    const aw = n.award!; aw.approvals = aw.approvals || []; aw.approvals.push({ id: uid(), at: Date.now(), by: S.me?.id ?? "", name: S.me?.name ?? "", decision: "rejected", note });
    n.status = "eval"; saveRequest(n, `Reddedildi: ${note}`); toast("Reddedildi, değerlendirmeye döndü");
  },
  "place-order": (el, r) => {
    if (!canWrite() || !r || !r.award) return;
    if (r.award.mode === "split") { placeSplitOrders(r); return; }
    const n = clone(r); const a = n.award!;
    kataloglaEslesenleriBagla(n.items);
    a.poNo = $("#o-po").value.trim(); a.orderDate = $("#o-date").value || todayStr();
    const q = (r.quotes || []).find(x => x.id === a.quoteId);
    a.expectedDate = $("#o-exp").value || (q && isNum(parseNum(q.leadDays)) ? addDays(a.orderDate, parseNum(q.leadDays)!) : "");
    const usedCur = [...new Set((r.quotes || []).map(x => x.currency).filter(c => c !== "TRY"))];
    if (!COMMITTED.includes(n.status) && usedCur.length) a.fx = fixedRates(n, settings());
    const approved = (a.approvals || []).slice(-1)[0];
    const was = COMMITTED.includes(n.status);
    if (!was) n.status = "ordered";
    saveRequest(n, was ? "Sipariş bilgileri güncellendi" : `Sipariş verildi${a.poNo ? " (" + a.poNo + ")" : ""}, beklenen teslim ${fmtDate(a.expectedDate)}${approved && approved.decision === "approved" ? "" : ", onaysız sipariş"}${a.fx && Object.keys(a.fx).length ? "; kurlar sabitlendi: " + Object.entries(a.fx).map(([c, v]) => `${c} ${nfx.format(v)}`).join(", ") : ""}`);
    toast(was ? "Güncellendi" : "Sipariş kaydedildi");
  },
  "receive": (el, r) => {
    if (!canWrite() || !r || !r.award) return;
    if (r.award.mode === "split") { receiveSplitOrders(r); return; }
    const n = clone(r); const a = n.award!;
    a.deliveredDate = $("#t-date").value || todayStr(); a.quality = $("#t-q").value as Quality; a.lessons = $("#t-lessons").value.trim();
    const was = n.status === "received"; n.status = "received";
    const late = a.expectedDate ? dayDiff(a.expectedDate, a.deliveredDate) : null;
    saveRequest(n, was ? "Teslim bilgileri güncellendi" : `Teslim alındı ${fmtDate(a.deliveredDate)}${late !== null && late > 0 ? `, ${late} gün gecikmeli` : late !== null ? ", zamanında" : ""}, kalite: ${QUALITY[a.quality!]}`);
    toast("Teslim kaydedildi; tedarikçi karnesi güncellendi");
  },
  // TMI: satın alma yalnız öğrenilenleri yazar; teslim tarihi ve kaliteyi depo yazar (kullanıcı kararı 6).
  "save-lessons": (_el, r) => {
    if (!canWrite() || !r || !r.award) return;
    const n = clone(r); n.award!.lessons = $("#t-lessons").value.trim();
    saveRequest(n, "Öğrenilenler güncellendi");
    toast("Öğrenilenler kaydedildi");
  },
  "copy-summary": (_el, r) => { if (r) void copyText(summaryText(r)); },
  "csv": (_el, r) => { if (r) offerFile(`${r.no}-teklif-karsilastirma.csv`, csvFor(r)); },

  /* tedarikçi */
  "new-supplier": () => { if (canWrite()) supplierModal(null); },
  "edit-supplier": el => { if (canWrite()) supplierModal(S.suppliers[el.dataset.sid || V.id || ""]); },
  "tog-cat": el => { const c = el.dataset.c!; const i = draftS.categories.indexOf(c); if (i < 0) draftS.categories.push(c); else draftS.categories.splice(i, 1); el.setAttribute("aria-pressed", String(i < 0)); },
  "pick-firma": el => {
    draftS.id = el.dataset.fid!; draftS.name = el.dataset.fad || ""; firmaSecildi = true;
    $$("#s-firma-sonuc [data-act=pick-firma]").forEach(b => b.setAttribute("aria-selected", String(b === el)));
  },
  "firma-yeni": () => yeniFirmaFormu(),
  "firma-ac": el => {
    const g = (id: string) => $("#" + id)?.value.trim() ?? "";
    const ad = g("s-yf-ad");
    if (!ad) { toast("Firma adını yazın."); $("#s-yf-ad")?.focus(); return; }
    (el as HTMLButtonElement).disabled = true;
    backend.firmaEkle(firmaEkleKimligi, { ad, vergiNo: g("s-yf-vergi"), il: g("s-yf-il"), telefon: g("s-yf-tel"), ePosta: g("s-yf-eposta") }).then(f => {
      draftS.id = f.id; draftS.name = f.ad; firmaSecildi = true;
      const ara = $("#s-firma-ara"); if (ara) ara.value = f.ad;
      const sonuc = document.getElementById("s-firma-sonuc");
      if (sonuc) sonuc.innerHTML = `<button class="btn ghost sm" role="option" aria-selected="true" disabled>${esc(f.ad)} <small>— açıldı ve seçildi</small></button>`;
      toast("Firma açıldı");
    }).catch((h: unknown) => { (el as HTMLButtonElement).disabled = false; toast(h instanceof Error ? h.message : "Firma açılamadı."); });
  },
  "save-supplier": () => {
    const g = (id: string) => $("#" + id).value.trim();
    Object.assign(draftS, { notes: g("s-notes"), rating: +((($("input[name=s-rating]:checked") as FormEl | null)?.value) || 3) });
    if (!firmaSecildi) { toast("Firmayı arayıp seçin ya da yeni firma açın."); $("#s-firma-ara")?.focus(); return; }
    saveSupplier(draftS); closeModal(); toast("Tedarikçi kaydedildi");
  },
  "del-supplier": () => {
    const s = draftS; const usedIn = Object.values(S.requests).filter(rq => (rq.quotes || []).some(q => q.supplierId === s.id)).length;
    confirmModal(usedIn ? `${s.name} ${usedIn} talepte teklif vermiş. Silerseniz teklifler kalır ama karne ve iletişim bilgisi kaybolur. Bunun yerine durumunu "Askıda" yapmayı düşünün.` : `${s.name} silinecek.`, () => { const back = V.page === "supplier"; persistUndoable("suppliers", s.id, null, `${s.name} silindi`, back ? () => go("supplier", s.id) : null); if (back) go("suppliers"); });
  },
  "add-eval": () => { const s = S.suppliers[V.id ?? ""]; if (s && canWrite()) evalModal(s); },
  "save-eval": () => {
    const cur = S.suppliers[V.id ?? ""]; if (!cur) return;
    const s = clone(cur); s.evals = s.evals || [];
    const rating = +((($("input[name=e-rating]:checked") as FormEl | null)?.value) || 3);
    s.evals.push({ id: uid(), date: $("#e-date").value || todayStr(), rating, text: $("#e-text").value.trim(), name: $("#e-name").value.trim(), by: S.me?.id ?? "" });
    if (s.evals.length > 100) s.evals = s.evals.slice(-100);
    if ($("#e-apply").checked) s.rating = Math.round(sum(s.evals.map(e => e.rating)) / s.evals.length);
    saveSupplier(s); closeModal(); toast("Değerlendirme eklendi");
  },

  /* malzeme */
  "new-material": () => { if (canWrite()) materialModal(null); },
  "edit-material": () => { if (canWrite()) materialModal(S.materials[V.id ?? ""]); },
  "pick-kart": el => {
    const k = kartlar.find(x => x.no === Number(el.dataset.no)); if (!k) return;
    Object.assign(draftM, { malzemeNo: k.no, code: k.kod, name: k.ad, category: k.kategori ?? "", unit: k.birim ?? "" });
    $$("#m-kart-sonuc [data-act=pick-kart]").forEach(b => b.setAttribute("aria-selected", String(b === el)));
  },
  "save-material": () => {
    Object.assign(draftM, { spec: $("#m-spec").value.trim(), notes: $("#m-notes").value.trim(), aliases: $("#m-alias").value.split(",").map(x => x.trim()).filter(Boolean) });
    if (draftM.malzemeNo === undefined) { toast("Malzeme kartını arayıp seçin."); $("#m-kart-ara")?.focus(); return; }
    const dup = Object.values(S.materials).find(m => m.id !== draftM.id && m.malzemeNo === draftM.malzemeNo);
    if (dup) { toast(`Bu kart ${dup.code} koduyla zaten katalogda.`); return; }
    saveMaterial(draftM); closeModal(); toast("Katalog kalemi kaydedildi");
  },
  "del-material": () => {
    const m = draftM; const n = priceHistory(m.id).length;
    confirmModal(n ? `${m.name} için ${n} teklif kaydı var. Silerseniz talepler kalır ama fiyat geçmişi bu kartta toplanmaz.` : `${m.name} silinecek.`, () => { persistUndoable("materials", m.id, null, `${m.name} silindi`, () => go("material", m.id)); go("materials"); });
  },
  "req-from-mat": () => { const m = S.materials[V.id ?? ""]; if (m && canWrite()) requestModal(null, [{ id: uid(), name: m.name, spec: m.spec || "", qty: 1, unit: m.unit || "adet", materialId: m.id }]); },
  "link-items": () => { if (canWrite()) linkItemsModal(); },
  "apply-link": () => {
    const map: Record<string, string> = {}; $$("[data-link]").forEach(s => { if (s.value) map[s.dataset.link!] = s.value; });
    const touched: Record<string, PurchaseRequest> = {};
    unlinkedItems().forEach(({ r, it }) => { const mid = map[norm(it.name)]; if (!mid) return; const n = touched[r.id] || (touched[r.id] = clone(r)); const x = n.items.find(i => i.id === it.id); if (x) x.materialId = mid; });
    Object.entries(map).forEach(([k, v]) => { if (S.materials[v]) { const m = clone(S.materials[v]!); if (norm(m.name) !== k && !(m.aliases || []).some(a => norm(a) === k)) { const src = unlinkedItems().find(x => norm(x.it.name) === k); m.aliases = [...(m.aliases || []), src ? src.it.name : k]; saveMaterial(m); } } });
    Object.values(touched).forEach(n => saveRequest(n));
    closeModal(); toast("Kalemler kataloğa bağlandı");
  },

  /* ayarlar */
  "add-ap": () => { const s = readSettingsForm(); s.approvalLimits.push({ max: null, role: "" }); SET_DRAFT = s; renderSettingsDraft(); },
  "rm-ap": el => { const s = readSettingsForm(); s.approvalLimits.splice(+el.dataset.i!, 1); SET_DRAFT = s; renderSettingsDraft(); },
  "add-dep": () => { const s = readSettingsForm(); s.departments.push({ name: "", budget: 0 }); SET_DRAFT = s; renderSettingsDraft(); },
  "rm-dep": el => { const s = readSettingsForm(); s.departments.splice(+el.dataset.i!, 1); SET_DRAFT = s; renderSettingsDraft(); },
  "save-settings": () => {
    if (!canWrite()) return;
    const s = readSettingsForm();
    s.departments = s.departments.filter(d => d.name); s.approvalLimits = s.approvalLimits.filter(l => l.role);
    SET_DRAFT = null; persist("settings", "main", s); toast("Ayarlar kaydedildi");
  },
  // TMI: paylaştırma karşılaştırmanın içindedir; eski "dağıtım denemesi" bağlantıları oraya kaydırır.
  "paylastir-git": () => { document.getElementById("sa-paylastir")?.scrollIntoView({ block: "start", behavior: "smooth" }); },
  // TMI: JSON yedek, geri yükleme, örnek veri ve TCMB kaldırıldı (kırmızı çizgi, V-30); işleyicileri de yok.
  "preset": (el, r) => {
    if (!r || !canWrite()) return;
    const p = PRESETS[el.dataset.k ?? ""]; if (!p) return;
    UI.wDraft = null; const n = clone(r); n.weights = Object.assign({}, p.w); saveRequest(n, `Değerlendirme ağırlıkları: ${p.l}`);
  },
  "calc": (el, r) => { if (r) calcModal(r, el.dataset.qid); },
  "undo": () => undoLast(),
  "approval-form": (_el, r) => {
    if (!r || !r.award) { toast("Onay formu için önce karar verin."); return; }
    openModal(`<div class="mh"><h2>Onay formu</h2><span class="spacer"></span><span class="muted small">${esc(r.no)}</span></div>
      <div class="mb"><div class="doc-wrap">${approvalFormHTML(r)}</div></div>
      <div class="mf"><button class="btn primary" data-act="doc-print">Yazdır / PDF olarak kaydet</button><button class="btn" data-act="copy-summary">Metin olarak kopyala</button><span class="spacer"></span><button class="btn ghost" data-act="close">Kapat</button></div>`, "wide");
  },
  "doc-print": () => { const d = $("#modal-root .doc"); if (d) printDoc(d.outerHTML); },
  "po-text": (el, r) => {
    if (!r) return;
    const o = awardOrders(r).find(x => x.qid === el.dataset.qid); if (!o) return;
    // ekrandaki (henüz kaydedilmemiş) sipariş no ve tarihleri metne yansısın
    const row = el.closest("tr");
    if (row) { o.poNo = orderRow(row, "poNo") || o.poNo; o.orderDate = orderRow(row, "orderDate") || o.orderDate; o.expectedDate = orderRow(row, "expectedDate") || o.expectedDate; }
    else { o.poNo = $("#o-po")?.value || o.poNo; o.orderDate = $("#o-date")?.value || o.orderDate; o.expectedDate = $("#o-exp")?.value || o.expectedDate; }
    openModal(`<div class="mh"><h2>Sipariş metni: ${esc(supName(o.q))}</h2></div><div class="mb"><pre class="out" id="po-out">${esc(poText(r, o))}</pre></div><div class="mf"><button class="btn primary" data-act="po-copy">Metni kopyala</button><button class="btn ghost" data-act="close">Kapat</button></div>`);
  },
  "po-copy": () => { void copyText($("#po-out").textContent ?? ""); },
  "bulk": (_el, r) => {
    if (!r || !canWrite()) return; if (!(r.items || []).length) { toast("Önce kalem ekleyin."); return; }
    if (!OPEN.includes(r.status)) { bulkModal(r); return; }
    V.tab = "quotes"; render();
    requestAnimationFrame(() => { const sec = $<HTMLElement>('[data-sec="quotes"]'); sec?.scrollIntoView({ block: "start", behavior: "smooth" }); const first = $<HTMLElement>("#bulk .bp"); first?.focus({ preventScroll: true }); });
  },
  "bulk-add": () => { bulkRead(); BULK!.cols.push(bulkBlank("")); bulkRerender(); const sel = $$("#bulk [data-bf=supplierId]"); sel[sel.length - 1]?.focus(); },
  "bulk-rm": el => { bulkRead(); BULK!.cols.splice(+el.dataset.col!, 1); if (!BULK!.cols.length) BULK!.cols.push(bulkBlank("")); bulkRerender(); },
  "bulk-save": () => bulkSave(),
  "bulk-close": () => bulkClose(),
  "pick-top": (el, r) => { if (!r) return; const top = evaluate(r).ranking[0]; if (!top) return; V.tab = "compare"; render(); teklifSec(top.q.id); $<HTMLElement>(".sa-karar")?.scrollIntoView({ block: "center" }); },
  "export-report": () => offerFile(`satin-alma-harcama-${todayStr()}.csv`, reportCSV())
};
let SET_DRAFT: Settings | null = null;
function readSettingsForm(): Settings {
  const s = clone(SET_DRAFT || settings());
  $$("#settings-form [data-set]").forEach(i => {
    const k = i.dataset.set!;
    if (k === "monthly") { const v = parseNum(i.value); const c = s.currencies[i.dataset.cur as Currency]; if (v !== null && c) c.monthly = v; }
    else if (k === "w") s.weights[i.dataset.k as keyof Weights] = clamp(parseNum(i.value) || 0, 0, 100);
    else if (k === "company") s.company = i.value.trim();
    else if (k === "validityDays" || k === "minQuotes" || k === "priceAlertPct") { const v = parseNum(i.value); if (v !== null && v > 0) s[k] = v; }
  });
  s.approvalLimits = $$("#ap-rows tr").map(tr => ({ max: parseNum($("[data-apk=max]", tr).value), role: $("[data-apk=role]", tr).value.trim() }));
  s.departments = $$("#dep-rows tr").map(tr => ({ name: $("[data-dk=name]", tr).value.trim(), budget: parseNum($("[data-dk=budget]", tr).value) || 0 }));
  const cats = $("#set-cats"); if (cats) s.categories = cats.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return s;
}
function renderSettingsDraft(): void {
  const keep = S.settings; S.settings = SET_DRAFT; S.ver++;
  render(); S.settings = keep; S.ver++;
}

/* ================= giriş olayları ================= */
const SEARCH_KEYS: Record<string, "q" | "mq" | "sq"> = { "req-search": "q", "mat-search": "mq", "sup-search": "sq" };
document.addEventListener("input", (e) => {
  if (!kokIcinde(e)) return;
  const t = e.target as FormEl;
  if (t.id === "gsearch") { gsearch(t.value); return; }
  if (t.id === "s-firma-ara") { firmaAra(t.value); return; }
  if (t.id === "m-kart-ara") { kartAra(t.value); return; }
  const sk = t.dataset.in ? SEARCH_KEYS[t.dataset.in] : undefined;
  if (sk) { V[sk] = t.value; render(); return; }
  if (t.closest("#bulk")) { BULK!.dirty = true; BULK!.confirmClose = false; bulkRead(); bulkLive(); return; }
  if (t.closest("#qform")) { readQuoteForm(); updateQuoteLive(); return; }
  if (t.closest("#items-box") && t.dataset.it === "name") {
    syncItems(); const tr = t.closest<HTMLElement>("tr")!; const i = +tr.dataset.i!; const it = draftReq.items[i]; if (!it) return;
    const mid = matIndex()[norm(it.name)];
    if (mid) { it.materialId = mid; const m = S.materials[mid]!; const u = tr.querySelector<FormEl>("[data-it=unit]"); if (u && m.unit) { const uyari = birimUyarisi(u.value, m.unit); u.value = m.unit; it.unit = m.unit; u.toggleAttribute("readonly", true); if (uyari) toast(uyari); } const c = tr.querySelector<HTMLSelectElement>("[data-it=category]"); if (c && m.category) { if (![...c.options].some(o => o.value === m.category)) c.insertAdjacentHTML("beforeend", `<option>${esc(m.category)}</option>`); c.value = m.category; it.category = m.category; } } else { delete it.materialId; tr.querySelector("[data-it=unit]")?.removeAttribute("readonly"); }
    const h = $(`[data-hint="${i}"]`); if (h) h.innerHTML = itemHint(it);
    return;
  }
  if (t.dataset.w) {
    const r = S.requests[V.id ?? ""]; if (!r) return;
    const base: Weights = (UI.wDraft && UI.wDraft.id === r.id) ? UI.wDraft.w : Object.assign({}, r.weights || settings().weights);
    base[t.dataset.w as keyof Weights] = +t.value; UI.wDraft = { id: r.id, w: base };
    const tw = sum(CRIT.map(c => +base[c.k] || 0)) || 1;
    CRIT.forEach(c => { const lab = $("#wv-" + c.k); if (lab) lab.textContent = "%" + nf0.format((+base[c.k] || 0) / tw * 100); });
    $$(".presets .chip").forEach(b => b.setAttribute("aria-pressed", "false"));
    const ev2 = evaluate(r, base);
    const rp = document.getElementById("rank-panel"); if (rp) rp.innerHTML = rankHTML(r, ev2);
    const vd = $("#verdict"); if (vd) vd.innerHTML = verdictHTML(r, ev2);
  }
});
document.addEventListener("change", (e) => {
  if (!kokIcinde(e)) return;
  const t = e.target as FormEl;
  if (t.dataset.ch === "role") { setRole(t.value as Role); V.page = "dash"; V.id = null; V.tab = null; render(); window.scrollTo(0, 0); return; }
  const filt = t.dataset.ch ? ({ "status-filter": "status", "prio-filter": "prio", "dept-filter": "dept", "mcat": "mcat" } as Record<string, "status" | "prio" | "dept" | "mcat">)[t.dataset.ch] : undefined;
  if (filt) { V[filt] = t.value; render(); return; }
  if (t.closest && t.closest("#bulk")) { BULK!.dirty = true; if (t.dataset.bf === "supplierId") bulkRerender(); else { bulkRead(); bulkLive(); } return; }
  if (t.name === "d-sec") { teklifSec(t.value); return; }
  if (t.dataset.split) { updateSplitSum(); return; }
  if (t.id === "calc-q") { const r = S.requests[V.id ?? ""]; if (r) calcModal(r, t.value); return; }
  if (t.closest("#qform")) { readQuoteForm(); updateQuoteLive(); if (t.id === "q-sup" && t.value === "__new") $("#q-newsup").focus(); return; }
  if (t.dataset.rfq !== undefined || t.id === "rfq-due" || t.id === "rfq-prev") { syncRfqPreview(); return; }
  if (t.dataset.w && UI.wDraft) { const r = S.requests[V.id ?? ""]; if (r && canWrite()) { const n = clone(r); n.weights = Object.assign({}, UI.wDraft.w); saveRequest(n); } }
});
// #205 S2 b: Logo'ya gitmiş siparişin teslim alınmamış kalanı gerekçeyle kapatılır; kapatılan siparişe teslim yazılmaz.
ACTIONS["order-close"] = (_el, r) => {
  if (!r || !canWrite()) return;
  const acik = awardOrders(r).filter(o => o.logo?.kayitNo && !o.logo.iptalDurumu && !o.logo.kapatmaDurumu);
  if (!acik.length) { toast("Kapatılacak, Logo'ya gönderilmiş açık sipariş yok."); return; }
  openModal(`<div class="mh"><h2>Siparişin kalanını kapat</h2></div><div class="mb"><p class="small muted">Teslim alınmamış kalan Logo'da kapatılır; bu siparişe bundan sonra teslim yazılmaz. Gerekçe geçmişe yazılır.</p>
    <div class="grid g2"><label class="f"><span>Sipariş</span><select id="cl-order">${acik.map(o => `<option value="${o.qid}">${esc(siparisEtiketi(o))} · ${esc(supName(o.q))}</option>`).join("")}</select></label>
    <label class="f"><span>Gerekçe</span><input type="text" id="cl-reason" maxlength="500" placeholder="Örn. tedarikçi kalanı gönderemiyor"></label></div></div>
    <div class="mf"><button class="btn primary" data-act="order-close-save">Kalanı kapat</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, true, true);
};
ACTIONS["order-close-save"] = (_el, r) => {
  if (!r || !canWrite()) return;
  const qid = $("#cl-order").value, reason = $("#cl-reason").value.trim();
  if (!reason) { toast("Gerekçe yazın."); $("#cl-reason").focus(); return; }
  closeModal();
  void backend.siparisKapat(r.id, qid, reason).then(ok => { if (ok) toast("Siparişin kalanı kapatıldı, Logo'ya gidiyor"); });
};
// Kart #1310: seçili yönteme yeniden basmak seçimi kaldırır (belirtilmedi).
ACTIONS["teslim-yontemi"] = (el, r) => {
  if (!r || !canWrite()) return;
  const v = el.dataset.v === "biz_alacagiz" ? "biz_alacagiz" : "firma_getirir";
  const yeni = r.teslimYontemi === v ? null : v;
  void backend.teslimYontemi(r.id, yeni).then(ok => { if (ok) toast(yeni === "biz_alacagiz" ? "Sipariş verilince sevkiyatta alım olarak bekler" : "Teslim yöntemi kaydedildi"); });
};
// Borç 36 (kullanıcı kararı): siparişteki kalem kaydetle değişmez; onay yetkilisi gerekçeyle değiştirir, sunucu geçmişe yazar.
ACTIONS["order-item-change"] = (_el, r) => {
  if (!r || !canWrite()) return;
  const items = awardOrders(r).flatMap(o => o.items);
  if (!items.length) { toast("Siparişte kalem yok."); return; }
  openModal(`<div class="mh"><h2>Siparişteki kalemi değiştir</h2></div><div class="mb"><p class="small muted">Değişiklik onay yetkisi ister ve gerekçesiyle geçmişe yazılır. Miktar teslim alınandan aşağı inmez; teslim alınmış kalemin birimi değişmez.</p>
    <div class="grid g2"><label class="f"><span>Kalem</span><select id="oc-item">${items.map(it => `<option value="${it.id}">${esc(it.name)}</option>`).join("")}</select></label>
    <label class="f"><span>Yeni miktar</span><input type="text" inputmode="decimal" id="oc-qty" value="${miktarIn(items[0]!.qty)}"></label>
    <label class="f"><span>Birim</span><input type="text" list="dl-units" id="oc-unit" value="${esc(items[0]!.unit)}"></label>
    <label class="f"><span>Gerekçe</span><input type="text" id="oc-reason" maxlength="500" placeholder="Örn. ihtiyaç arttı, tedarikçi ile anlaşıldı"></label></div></div>
    <div class="mf"><button class="btn primary" data-act="order-item-save">Değiştir</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, true, true);
};
ACTIONS["order-item-save"] = (_el, r) => {
  if (!r || !canWrite()) return;
  const item = $("#oc-item").value, qtyGirdi = miktarSayisi($("#oc-qty").value), unit = $("#oc-unit").value.trim(), reason = $("#oc-reason").value.trim();
  if (qtyGirdi === "belirsiz") { toast(BELIRSIZ_MIKTAR); $("#oc-qty").focus(); return; }
  const qty = qtyGirdi;
  if (!isNum(qty) || qty <= 0) { toast("Miktar sıfırdan büyük olmalı."); $("#oc-qty").focus(); return; }
  if (!unit) { toast("Birim yazın."); $("#oc-unit").focus(); return; }
  if (!reason) { toast("Gerekçe yazın."); $("#oc-reason").focus(); return; }
  closeModal();
  void backend.siparisKalemiDegistir(r.id, item, qty, unit, reason).then(ok => { if (ok) toast("Kalem değişti, geçmişe yazıldı"); });
};
// D6 b: fatura finansta girilir; burada siparişin tedarikçisinin alış faturası siparişe bağlanır. Tutar finansta kalır (FNS-48).
let faturaSiparisi: { talepId: string; teklifId: string } | null = null;
function faturaListesiHTML(liste: SiparisFaturasi[] | null): string {
  if (liste === null) return '<p class="small muted">Faturalar alınamadı.</p>';
  if (!liste.length) return '<p class="small muted">Bu tedarikçinin finansta kayıtlı alış faturası yok. Fatura Finans sayfasında girilir, sonra burada bağlanır.</p>';
  return `<div class="tw"><table class="itbl rt"><thead><tr><th>Belge no</th><th>Tarih</th><th>Açıklama</th><th></th></tr></thead><tbody>${liste.map(f => `<tr>
    <td>${f.belgeNo ? esc(f.belgeNo) : `#${f.id}`}</td><td>${fmtDate(f.belgeTarihi)}</td><td>${f.aciklama ? esc(f.aciklama) : "–"}</td>
    <td class="r">${f.bagli ? `<span class="flag good">bağlı</span> <button class="btn sm ghost" data-act="invoice-link" data-id="${f.id}" data-bagla="0">Kaldır</button>`
      : f.baskaSipariste ? '<span class="flag mute">başka siparişte</span>'
      : `<button class="btn sm" data-act="invoice-link" data-id="${f.id}" data-bagla="1">Bağla</button>`}</td></tr>`).join("")}</tbody></table></div>`;
}
async function faturalariYukle(): Promise<void> {
  const fs = faturaSiparisi; if (!fs) return;
  const el = $("#fi-list"); if (!el) return;
  el.innerHTML = '<p class="small muted">Yükleniyor…</p>';
  const liste = await backend.siparisFaturalari(fs.talepId, fs.teklifId);
  if (faturaSiparisi === fs && $("#fi-list")) $("#fi-list").innerHTML = faturaListesiHTML(liste);
}
ACTIONS["order-invoices"] = (_el, r) => {
  if (!r || !canWrite()) return;
  const os = awardOrders(r);
  if (!os.length) { toast("Siparişte tedarikçi yok."); return; }
  faturaSiparisi = { talepId: r.id, teklifId: os[0]!.qid };
  openModal(`<div class="mh"><h2>Siparişin faturaları</h2></div><div class="mb"><p class="small muted">Fatura Finans sayfasında girilir; burada siparişin tedarikçisinin alış faturası siparişe bağlanır. Başka siparişe bağlı fatura önce oradan kaldırılır.</p>
    ${os.length > 1 ? `<label class="f"><span>Sipariş</span><select id="fi-order">${os.map(o => `<option value="${o.qid}">${esc(supName(o.q))}${siparisEtiketi(o) ? `, ${esc(siparisEtiketi(o))}` : ""}</option>`).join("")}</select></label>` : `<p><b>${esc(supName(os[0]!.q))}</b>${siparisEtiketi(os[0]!) ? `, ${esc(siparisEtiketi(os[0]!))}` : ""}</p>`}
    <div id="fi-list"></div></div>
    <div class="mf"><button class="btn ghost" data-act="close">Kapat</button></div>`, "wide");
  void faturalariYukle();
};
/* ---------------- siparişin ödeme planı (kart #1124) ---------------- */
// Plan finansın beklenen ödemesidir; sipariş verilince tekliften kurulur. Satır yoksa öneri yine tekliften gelir: avans sipariş
// tarihinde, kalan beklenen teslimden vade günü sonra. Tutar KDV hariç sipariş toplamıdır.
let planDuzeni: { talepId: string; teklifId: string; paraBirimi: string; satirlar: OdemePlaniSatiri[] } | null = null;
function onerilenPlan(r: PurchaseRequest, o: ReturnType<typeof awardOrders>[number]): OdemePlaniSatiri[] {
  const disc = clamp((parseNum(o.q.discountPct) || 0) / 100, 0, 1);
  const toplam = (r.award?.mode === "split"
    ? o.items.reduce((t, it) => t + (parseNum(o.q.prices?.[it.id]) || 0) * (parseNum(it.qty) || 0), 0) * (1 - disc)
      + (o.q.deliveryIncluded ? 0 : parseNum(o.q.shipping) || 0) + (parseNum(o.q.otherCost) || 0)
    : quoteCalc(r, o.q).total);
  const avans = Math.round(toplam * clamp((parseNum(o.q.advancePct) || 0) / 100, 0, 1) * 100) / 100;
  const kalan = Math.round((toplam - avans) * 100) / 100;
  const baslangic = o.orderDate || todayStr();
  return [
    ...(avans > 0 ? [{ tur: "avans" as const, vade: baslangic, yontem: "banka" as const, tutar: avans.toFixed(2) }] : []),
    ...(kalan > 0 ? [{ tur: "vade" as const, vade: addDays(o.expectedDate || baslangic, parseNum(o.q.payDays) || 0), yontem: "banka" as const, tutar: kalan.toFixed(2) }] : []),
  ];
}
function planSatirlariHTML(p: NonNullable<typeof planDuzeni>): string {
  const secenek = <T extends string>(deger: T, liste: [T, string][]) => liste.map(([v, l]) => `<option value="${v}"${v === deger ? " selected" : ""}>${esc(l)}</option>`).join("");
  return `<div class="tw"><table class="itbl rt"><thead><tr><th>Ödeme</th><th>Vade</th><th>Ödeme şekli</th><th>Tutar (${esc(p.paraBirimi)})</th><th></th></tr></thead><tbody>${p.satirlar.map((x, i) => `<tr data-op-row="${i}">
    <td><select data-op="tur">${secenek(x.tur, [["avans", "Avans"], ["vade", "Vadeli"]])}</select></td>
    <td><input type="date" data-op="vade" value="${esc(x.vade)}"></td>
    <td><select data-op="yontem">${secenek(x.yontem, Object.entries(ODEME_SEKLI) as [OdemePlaniSatiri["yontem"], string][])}</select></td>
    <td><input type="text" inputmode="decimal" data-op="tutar" value="${esc(numIn(parseNum(x.tutar)))}"></td>
    <td class="acts"><button class="btn sm ghost" data-act="odeme-plani-sil" data-i="${i}">Kaldır</button></td></tr>`).join("")}</tbody></table></div>`;
}
// Ekrandaki satırlar okunur; tutarı geçersiz satır null döner (kaydetmeden önce uyarılır).
function planOku(): (OdemePlaniSatiri | null)[] {
  return $$("#op-rows tr[data-op-row]").map(tr => {
    const al = (ad: string) => (tr.querySelector(`[data-op="${ad}"]`) as FormEl).value;
    const tutar = parseNum(al("tutar"));
    const vade = al("vade");
    return tutar !== null && tutar > 0 && vade ? { tur: al("tur") as OdemePlaniSatiri["tur"], vade, yontem: al("yontem") as OdemePlaniSatiri["yontem"], tutar: tutar.toFixed(2) } : null;
  });
}
function planCiz(): void { if (planDuzeni && $("#op-rows")) $("#op-rows").innerHTML = planSatirlariHTML(planDuzeni); }
ACTIONS["odeme-plani"] = (el, r) => {
  if (!r || !canWrite()) return;
  const o = awardOrders(r).find(x => x.qid === el.dataset.qid);
  const t = o ? siparisTakibi(r.id, o.qid) : null;
  if (!o || !t) { toast("Sipariş takibi henüz yüklenmedi."); return; }
  planDuzeni = { talepId: r.id, teklifId: o.qid, paraBirimi: t.paraBirimi, satirlar: t.odemePlani.length ? t.odemePlani.map(x => ({ ...x })) : onerilenPlan(r, o) };
  openModal(`<div class="mh"><h2>Ödeme planı</h2></div><div class="mb"><p class="small muted">${esc(supName(o.q))}${siparisEtiketi(o) ? `, ${esc(siparisEtiketi(o))}` : ""}. Plan finansa beklenen ödeme olarak düşer; fatura bağlanınca vade faturadan gelir. Tutarlar KDV hariçtir. Teklif: ${esc(payText(o.q))}.</p>
    <div id="op-rows">${planSatirlariHTML(planDuzeni)}</div>
    <div class="row"><button class="btn sm" data-act="odeme-plani-ekle">Satır ekle</button><button class="btn sm ghost" data-act="odeme-plani-oneri">Tekliften yeniden kur</button></div></div>
    <div class="mf"><button class="btn primary" data-act="odeme-plani-kaydet">Kaydet</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, "wide", true);
};
const planTaslagi = (): OdemePlaniSatiri[] => planOku().map((x, i) => x ?? planDuzeni!.satirlar[i]!);
ACTIONS["odeme-plani-ekle"] = () => {
  if (!planDuzeni) return;
  const son = planDuzeni.satirlar.at(-1);
  planDuzeni.satirlar = [...planTaslagi(), { tur: "vade", vade: son ? addDays(son.vade, 30) : todayStr(), yontem: son?.yontem ?? "banka", tutar: "0" }];
  planCiz();
};
ACTIONS["odeme-plani-sil"] = (el) => {
  if (!planDuzeni) return;
  planDuzeni.satirlar = planTaslagi().filter((_x, i) => i !== Number(el.dataset.i));
  planCiz();
};
ACTIONS["odeme-plani-oneri"] = (_el, r) => {
  const o = r && planDuzeni ? awardOrders(r).find(x => x.qid === planDuzeni!.teklifId) : undefined;
  if (!o || !planDuzeni) return;
  planDuzeni.satirlar = onerilenPlan(r!, o);
  planCiz();
};
ACTIONS["odeme-plani-kaydet"] = (el) => {
  const p = planDuzeni; if (!p || !canWrite()) return;
  const satirlar = planOku();
  if (!satirlar.length) { toast("Ödeme planında en az bir satır olur."); return; }
  if (satirlar.some(x => x === null)) { toast("Her satıra vade ve sıfırdan büyük tutar girin."); return; }
  (el as HTMLButtonElement).disabled = true;
  void backend.odemePlaniKaydet(p.talepId, p.teklifId, satirlar as OdemePlaniSatiri[]).then(c => {
    (el as HTMLButtonElement).disabled = false;
    if (c === null) return;
    closeModal();
    planDuzeni = null;
    takipGuncelle(p.talepId, c.siparisler);
    toast("Ödeme planı finansa yazıldı, geçmişe girdi");
  });
};
/* ---------------- sipariş satırının sertifika ve raporları ---------------- */
// Belge Çizimler'de açılır ve satıra bağlanır; dosya satırın ucundan açılır. Kimlik pencere başına sabittir: kopan bağlantıda
// yinelenen yükleme ikinci belge açmaz.
let sertifikaTalebi: { talepId: string; kimlik: string } | null = null;
const belgeAdresi = (satirId: number, b: SiparisBelgesi): string => `/api/satin-alma-siparis-satirlari/${satirId}/belgeler/${b.id}/dosya`;
function satirBelgeleriHTML(satirId: number, liste: SiparisBelgesi[] | null): string {
  if (liste === null) return '<span class="small muted">okunamadı</span>';
  if (!liste.length) return '<span class="small muted">belge yok</span>';
  return liste.map(b => `<span class="sa-belge"><span class="flag ${b.tur === "sertifika" ? "good" : "info"}">${b.tur === "sertifika" ? "sertifika" : "rapor"}</span>
    <a href="${belgeAdresi(satirId, b)}" target="_blank" rel="noopener">${esc(b.ad)}${b.harf ? ` (${esc(b.harf)})` : ""}</a>
    ${canWrite() ? `<button class="btn sm ghost" data-act="cert-remove" data-line="${satirId}" data-id="${b.id}">Kaldır</button>` : ""}</span>`).join("<br>");
}
async function sertifikalariYukle(r: PurchaseRequest): Promise<void> {
  const satirlar = r.award?.lines ?? [];
  await Promise.all(satirlar.map(async l => {
    const liste = await backend.siparisBelgeleri(l.id);
    const el = document.querySelector<HTMLElement>(`[data-cert-line="${l.id}"]`);
    if (el) el.innerHTML = satirBelgeleriHTML(l.id, liste);
  }));
}
ACTIONS["order-certs"] = (_el, r) => {
  if (!r) return;
  const satirlar = r.award?.lines ?? [];
  if (!satirlar.length) { toast("Siparişte satır yok."); return; }
  sertifikaTalebi = { talepId: r.id, kimlik: uid() };
  const kalemAdi = (id: string) => (r.items || []).find(i => i.id === id)?.name ?? "–";
  const tedarikci = (qid: string) => { const q = (r.quotes || []).find(x => x.id === qid); return q ? supName(q) : "–"; };
  openModal(`<div class="mh"><h2>Sertifikalar ve raporlar</h2></div><div class="mb">
    <p class="small muted">Sertifika ve rapor sipariş satırına bağlanır; belge Çizim Merkezi'nde saklanır. Mal kabulde gelen partiye de bağlanabilir.</p>
    <div class="tw"><table class="itbl rt"><thead><tr><th>Kalem</th><th>Tedarikçi</th><th>Belgeler</th></tr></thead><tbody>${satirlar.map(l => `<tr>
      <td>${esc(kalemAdi(l.itemId))}</td><td>${esc(tedarikci(l.quoteId))}</td><td data-cert-line="${l.id}"><span class="small muted">Yükleniyor…</span></td></tr>`).join("")}</tbody></table></div>
    ${canWrite() ? `<div class="grid g2" data-sa-y="7">
      <label class="f"><span>Kalem</span><select id="ce-line">${satirlar.map(l => `<option value="${l.id}">${esc(kalemAdi(l.itemId))}, ${esc(tedarikci(l.quoteId))}</option>`).join("")}</select></label>
      <label class="f"><span>Tür</span><select id="ce-tur"><option value="sertifika">Sertifika</option><option value="rapor">Rapor</option></select></label>
      <label class="f"><span>Belge adı</span><input type="text" id="ce-ad" maxlength="120" placeholder="Örn. malzeme sertifikası 3.1"></label>
      <label class="f"><span>Dosya</span><input type="file" id="ce-dosya"></label>
    </div>` : ""}</div>
    <div class="mf">${canWrite() ? '<button class="btn primary" data-act="cert-upload">Yükle ve bağla</button>' : ""}<button class="btn ghost" data-act="close">Kapat</button></div>`, "wide");
  void sertifikalariYukle(r);
};
ACTIONS["cert-upload"] = (el, r) => {
  const st = sertifikaTalebi; if (!r || !st || st.talepId !== r.id || !canWrite()) return;
  const satirId = Number($<HTMLSelectElement>("#ce-line").value);
  const tur = $<HTMLSelectElement>("#ce-tur").value === "rapor" ? "rapor" : "sertifika";
  const dosya = $<HTMLInputElement>("#ce-dosya").files?.[0];
  const ad = $<HTMLInputElement>("#ce-ad").value.trim() || dosya?.name.replace(/\.[^.]+$/, "") || "";
  if (!dosya) { toast("Dosya seçin."); return; }
  if (!ad) { toast("Belge adını yazın."); return; }
  (el as HTMLButtonElement).disabled = true;
  void (async () => {
    try {
      const ozet = await dosyaYukle(new Uint8Array(await dosya.arrayBuffer()), () => {});
      const liste = await backend.siparisBelgesiEkle(satirId, st.kimlik, { tur, ad, ozet, dosyaAdi: dosya.name.slice(0, 120) });
      if (liste === null || sertifikaTalebi !== st) return;
      const hucre = document.querySelector<HTMLElement>(`[data-cert-line="${satirId}"]`); if (hucre) hucre.innerHTML = satirBelgeleriHTML(satirId, liste);
      $<HTMLInputElement>("#ce-dosya").value = ""; $<HTMLInputElement>("#ce-ad").value = "";
      st.kimlik = uid();
      toast(tur === "sertifika" ? "Sertifika siparişe bağlandı" : "Rapor siparişe bağlandı");
    } catch (h) {
      toast(h instanceof DosyaHatasi ? h.message : "Dosya yüklenemedi; yeniden deneyin.");
    } finally {
      if (sertifikaTalebi === st) (el as HTMLButtonElement).disabled = false;
    }
  })();
};
ACTIONS["cert-remove"] = (el) => {
  if (!sertifikaTalebi || !canWrite()) return;
  const satirId = Number(el.dataset.line), belgeId = Number(el.dataset.id);
  (el as HTMLButtonElement).disabled = true;
  void backend.siparisBelgesiKaldir(satirId, belgeId).then(liste => {
    const hucre = document.querySelector<HTMLElement>(`[data-cert-line="${satirId}"]`);
    if (hucre && liste !== null) { hucre.innerHTML = satirBelgeleriHTML(satirId, liste); toast("Belge siparişten kaldırıldı"); }
    else (el as HTMLButtonElement).disabled = false;
  });
};
ACTIONS["invoice-link"] = (el) => {
  const fs = faturaSiparisi; if (!fs || !canWrite()) return;
  const bagla = el.dataset.bagla === "1";
  $$("#fi-list button").forEach(b => { (b as HTMLButtonElement).disabled = true; });
  void backend.siparisFaturasiBagla(fs.talepId, fs.teklifId, Number(el.dataset.id), bagla).then(liste => {
    if (faturaSiparisi !== fs || !$("#fi-list")) return;
    if (liste === null) { void faturalariYukle(); return; }
    $("#fi-list").innerHTML = faturaListesiHTML(liste);
    toast(bagla ? "Fatura siparişe bağlandı, geçmişe yazıldı" : "Fatura bağı kaldırıldı, geçmişe yazıldı");
  });
};
document.addEventListener("change", (e) => {
  if (!kokIcinde(e) || (e.target as FormEl).id !== "fi-order" || !faturaSiparisi) return;
  faturaSiparisi = { talepId: faturaSiparisi.talepId, teklifId: (e.target as FormEl).value };
  void faturalariYukle();
});
document.addEventListener("change", (e) => {
  if (!kokIcinde(e) || (e.target as FormEl).id !== "oc-item") return;
  const r = S.requests[V.id ?? ""], it = (r?.items || []).find(x => x.id === (e.target as FormEl).value);
  if (it) { $("#oc-qty").value = miktarIn(it.qty); $("#oc-unit").value = it.unit; }
});
ACTIONS["set-status"] = (_el, r) => { const v = $("#st-new").value as RequestStatus; if (r && v !== r.status) { const n = clone(r); n.status = v; saveRequest(n, `Durum elle değiştirildi: ${stLabel(r.status)} → ${stLabel(v)}`); } closeModal(); };
ACTIONS["cancel-req"] = (_el, r) => { if (!r) return; const n = clone(r); n.status = "cancelled"; n.cancelReason = $("#cx-reason").value.trim(); saveRequest(n, "Talep iptal edildi" + (n.cancelReason ? ": " + n.cancelReason : "")); closeModal(); };
// açılır gelişmiş bölümlerin (ağırlıklar, ayrıntılı tablo) açık/kapalı durumu yeniden çizimde korunur
document.addEventListener("toggle", (e) => {
  if (!kokIcinde(e)) return;
  const d = e.target as HTMLDetailsElement;
  if (d instanceof HTMLDetailsElement && d.dataset.adv) UI.adv[d.dataset.adv] = d.open;
}, true);
document.addEventListener("paste", (e) => {
  if (!kokIcinde(e)) return; if (BULK && (e.target as HTMLElement).closest?.("#bulk")) bulkPaste(e); });
document.addEventListener("keydown", (e) => {
  if (!kokIcinde(e)) return;
  const t = e.target as HTMLElement;
  if (BULK && t.closest?.("#bulk")) bulkNav(e);
  if (e.key === "Escape" && $$<HTMLElement>(".menu-list").some(m => !m.hidden)) { closeMenus(); return; }
  if (e.key === "Escape") { if (BULK && !BULK.inline) bulkClose(); else if ($("#modal-root").innerHTML) closeModal(); else $("#gres").hidden = true; }
  if (e.key === "Enter" && t.matches("li[data-act], .card[data-act]")) t.click();
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && UNDO.pending && !t.closest("input, textarea, select, [contenteditable]")) { e.preventDefault(); undoLast(); }
  if (e.key === "Enter" && t.id === "gsearch") { const b = $("#gres button"); if (b) b.click(); }
});

