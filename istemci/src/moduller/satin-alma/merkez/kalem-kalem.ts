/**
 * 3442-5: karar adımında kalem kalem karşılaştırma ve kalemi miktarla tedarikçilere bölme; sipariş adımında kalem tablosu.
 * Bölme Dağıtım denemesiyle aynı yoldan gider (kalem-bol.ts): bölünen kalem talepte tedarikçi başına ayrı satır olur.
 */
import type { Award, PurchaseRequest, RequestItem } from "./tipler.ts";
import { COMMITTED, OPEN } from "./constants.ts";
import { S, V, backend, canWrite, saveRequest } from "./store.ts";
import { approvalState, awardOrders, basamakFiyati, evaluate, itemCost, itemLineCost, miktarSayisi, supName, type EvalRow, type Evaluation } from "./calc.ts";
import { $, $$, esc, isNum, kokIcinde, money, numIn, parseNum, todayStr } from "./util.ts";
import { onaylayabilir } from "./roles.ts";
import { render } from "./views.ts";
import { closeModal, openModal, toast } from "./ui.ts";
import { kalemleriBol, paylarTamam, type Dagilim } from "./kalem-bol.ts";
import { bolmeyiTaslagaIsle } from "./karar-matrisi.ts";

/** Kalemin kendisi bölünebilir mi; bölünemiyorsa nedeni. */
export function bolunemezNedeni(it: RequestItem): string | null {
  if (it.sabit === "bag") return "Parçaya, fason adımına ya da satış siparişine bağlı kalem bölünemez: bağ yeni satıra geçmez.";
  if (it.sabit === "kaynak") return "Birleştirilen talebin kalemi bölünemez; önce kalemi kaynağına ayırın.";
  if (!isNum(it.qty) || it.qty <= 0) return "Miktarı girilmemiş kalem bölünemez.";
  return null;
}
/**
 * Talep edenin daralttığı kabul sınırı kalem kimliğine bağlıdır; bölünen kalemin yeni satırına geçmez, o kalem bölünmez.
 * Sınır talep görünümünde gelmez, kalem zarflarından okunur; okunamazsa bölme kapalı kalır. Bölme penceresi ve Dağıtım denemesi ortak kullanır.
 */
export async function kabulReddi(talepId: string, kalemIdleri: readonly string[]): Promise<string | null> {
  if (!kalemIdleri.length) return null;
  const l = await backend.kalemZarflari(talepId);
  if (l === null) return "Kabul sınırı okunamadı; bölme şimdilik kapalı.";
  const ad = l.find((z) => kalemIdleri.includes(z.kalemId) && z.kabul !== null);
  return ad ? "Talep eden bu kalemin kabul sınırını daraltmış; sınır yeni satıra geçmediği için bölünemez." : null;
}
/** Talep bölmeye açık mı; değilse nedeni. */
export function bolmeKapaliNedeni(r: PurchaseRequest): string | null {
  if (COMMITTED.includes(r.status)) return "Sipariş verildi; miktar sipariş adımında \"Değiştir\" ile güncellenir.";
  if (approvalState(r).state === "approved") return "Onaylanmış karar değişmez; bölmek için karar önce reddedilmeli.";
  if (!OPEN.includes(r.status)) return "Talep açık değil.";
  return null;
}

/** Şu anki atama: verilmiş karar, yoksa önerilen tek teklif, o kaleme fiyat vermemişse kalemin en ucuzu. */
export function kalemAtamasi(r: PurchaseRequest, ev: Evaluation): Record<string, string> {
  const a = r.award;
  const o: Record<string, string> = {};
  for (const it of r.items ?? []) {
    const fiyatli = ev.elig.filter((x) => itemCost(x, it) !== null);
    const tek = a ? (a.mode === "split" ? a.splits?.[it.id] : a.quoteId) : ev.ranking[0]?.q.id;
    const sec = fiyatli.find((x) => x.q.id === tek) ?? [...fiyatli].sort((p, q) => itemCost(p, it)! - itemCost(q, it)!)[0];
    if (sec) o[it.id] = sec.q.id;
  }
  return o;
}

export function kalemKalemHTML(r: PurchaseRequest): string {
  const ev = evaluate(r);
  if (ev.elig.length < 2 || !(r.items ?? []).length) return "";
  const cols = ev.elig;
  const atama = kalemAtamasi(r, ev);
  const kapali = bolmeKapaliNedeni(r);
  // Bölünen kalem talepte aynı kart, açıklama ve birimle birden çok satırdır; bölündüğü ayrıca saklanmaz, satırlar yan yana gösterilir.
  const anahtar = (x: RequestItem) => `${x.materialId ?? x.name}|${x.spec}|${x.unit}`;
  const gruplar = new Map<string, RequestItem[]>();
  for (const x of r.items ?? []) gruplar.set(anahtar(x), [...(gruplar.get(anahtar(x)) ?? []), x]);
  const ad = (qid: string | undefined) => { const q = r.quotes.find((y) => y.id === qid); return q ? supName(q) : "atanmamış"; };
  const satir = (it: RequestItem): string => {
    const grup = gruplar.get(anahtar(it))!;
    const toplam = grup.reduce((a, x) => a + (x.qty ?? 0), 0);
    const payli = grup.length > 1 ? `<span class="sub xs" data-kk-payli>Aynı kalem ${grup.length} satırda: toplam ${numIn(toplam)} ${esc(it.unit)} (${grup.map((x) => `${numIn(x.qty)} ${esc(ad(atama[x.id]))}`).join(" + ")})</span>` : "";
    const birimler = cols.map((x) => itemCost(x, it));
    const fiyatli = birimler.filter(isNum);
    const enAz = fiyatli.length >= 2 ? Math.min(...fiyatli) : null;
    const neden = bolunemezNedeni(it) ?? kapali;
    // Düğme öteki karar düğmeleri gibi çizilir; yazma yetkisini sunucu denetler (degisiklikReddi), canWrite tıklamada.
    const bol = fiyatli.length < 2 ? '<span class="xs muted">tek teklif</span>'
      : neden ? `<span class="xs muted" title="${esc(neden)}">bölünemez</span>`
      : `<button class="btn sm" data-act="kk-bol" data-item="${it.id}">Miktarı böl</button>`;
    return `<tr data-kk-kalem="${it.id}"><td class="lead"><b>${esc(it.name)}</b><span class="sub">${numIn(it.qty)} ${esc(it.unit)}${it.karsilik ? ` (${esc(it.karsilik)})` : ""}</span>${payli}${neden && fiyatli.length >= 2 ? `<span class="sub xs">${esc(neden)}</span>` : ""}</td>
      ${cols.map((x, i) => {
        const u = birimler[i];
        if (!isNum(u)) return `<td class="r" data-l="${esc(supName(x.q))}"><span class="faint">teklif yok</span></td>`;
        const t = itemLineCost(x, it);
        const secili = atama[it.id] === x.q.id, ucuz = enAz !== null && Math.abs(u - enAz) < 0.005;
        const fl = secili ? `<span class="flag good">${ucuz ? "seçili · en ucuz" : "seçili"}</span>` : ucuz ? '<span class="flag">en ucuz</span>' : "";
        return `<td class="r num${enAz !== null && Math.abs(u - enAz) < 0.005 ? " best" : ""}" data-l="${esc(supName(x.q))}">${money(u)}<span class="sub">${t === null ? "" : `tutar ${money(t, "TRY", 0)}`}${fl ? ` ${fl}` : ""}</span></td>`;
      }).join("")}
      <td class="acts">${bol}</td></tr>`;
  };
  return `<section class="panel" id="sa-kalem-kalem" data-sa-kalem-kalem><div class="panel-h"><h2>Kalem kalem karşılaştırma</h2><span class="sub">birim net fiyat, TL</span></div>
    <div class="tw"><table class="itbl rt sa-kk"><thead><tr><th>Kalem</th>${cols.map((x) => `<th class="r">${esc(supName(x.q))}</th>`).join("")}<th><span class="sr-only">Miktarı böl</span></th></tr></thead>
    <tbody>${(r.items ?? []).map(satir).join("")}</tbody></table></div>
    <p class="panel-f small muted">Birim fiyat iskonto, vade ve kur sonrası TL; nakliye ve masraf sipariş başına ayrıca eklenir. "Seçili" verilmiş karar ya da öneridir. "Miktarı böl" bir kalemin miktarını tedarikçilere paylaştırır; kalem talepte tedarikçi başına ayrı satır olur ve karar onaya gider.</p>
  </section>`;
}

/* ---------------- bölme penceresi ---------------- */
interface Pay { x: EvalRow; miktar: number }
function paylar(r: PurchaseRequest, it: RequestItem, ev: Evaluation): Pay[] {
  return ev.elig.filter((x) => itemCost(x, it) !== null).map((x) => {
    const v = miktarSayisi($<HTMLInputElement>(`[data-kk-q="${x.q.id}"]`)?.value ?? "");
    return { x, miktar: typeof v === "number" ? v : v === null ? 0 : Number.NaN };
  });
}
/** Payın birim ve tutarı payın kendi miktarıyla (kademe ve en az miktar), TL. */
export function payHesabi(x: EvalRow, kalemId: string, miktar: number): { birim: number; tutar: number; enAz: number | null; kademe: boolean } | null {
  if (miktar <= 0) return null;
  const l = basamakFiyati(x.q, kalemId, miktar);
  if (!l) return null;
  return { birim: l.unit * x.c.unitFactorTRY, tutar: l.line * x.c.unitFactorTRY, enAz: l.alinan ?? null, kademe: l.tier !== undefined };
}
function bolPenceresi(r: PurchaseRequest, it: RequestItem): void {
  const ev = evaluate(r);
  const atama = kalemAtamasi(r, ev);
  const teklifler = ev.elig.filter((x) => itemCost(x, it) !== null).sort((a, b) => itemCost(a, it)! - itemCost(b, it)!);
  openModal(`<div class="mh"><h2>Miktarı böl: ${esc(it.name)}</h2></div><div class="mb stack" data-kk-pencere="${it.id}">
    <p><b>${esc(it.name)}</b>, toplam <b class="num">${numIn(it.qty)} ${esc(it.unit)}</b>. Miktarı tedarikçilere paylaştırın; toplam kalem miktarına eşit olmalı.</p>
    <div class="tw"><table class="itbl rt"><thead><tr><th>Tedarikçi</th><th class="r">Birim (net TL)</th><th class="r">Miktar (${esc(it.unit)})</th><th class="r">Tutar (net TL)</th></tr></thead><tbody>
    ${teklifler.map((x) => `<tr><td class="lead"><b>${esc(supName(x.q))}</b><span class="sub">${isNum(parseNum(x.q.leadDays)) ? `termin ${parseNum(x.q.leadDays)} gün` : "termin yok"}</span></td>
      <td class="r num" data-l="Birim (net TL)" data-kk-u="${x.q.id}">${money(itemCost(x, it))}</td>
      <td class="r" data-l="Miktar (${esc(it.unit)})"><input type="text" inputmode="decimal" class="num" data-kk-q="${x.q.id}" value="${atama[it.id] === x.q.id ? numIn(it.qty) : "0"}" aria-label="${esc(supName(x.q))} miktarı"></td>
      <td class="r num" data-l="Tutar (net TL)" data-kk-t="${x.q.id}"></td></tr>`).join("")}
    </tbody></table></div>
    <div id="kk-ozet" aria-live="polite"></div>
    <div id="kk-kabul" class="small muted">Kabul sınırı denetleniyor...</div>
    ${r.status === "eval" ? "" : '<label class="f"><span>Gerekçe <small>— isteğe bağlı, karar özetine yazılır</small></span><textarea id="kk-gerekce" maxlength="2000" placeholder="Örn. termin riski için miktarın bir kısmı ikinci tedarikçiden"></textarea></label>'}
    <details class="xs muted" data-kk-yardim=""><summary>Bölme nasıl çalışır</summary><p>Bölünen kalemin teklif fiyatı, kademesi, en az miktarı ve alternatifi yeni satırlara kopyalanır; alternatif uygunluğu yeni satırda yeniden değerlendirilir. ${r.status === "eval" ? "Karar, sayfanın altındaki çubuktan gönderilir." : "\"Böl ve onaya gönder\" kararı onaya gönderir, varsa onaylar sıfırlanır. \"Yalnız böl\" kalemi satırlara ayırır, karar vermez; onaydaki karar geri çekilir ve karar sayfanın altındaki çubuktan gönderilir."}</p></details>
  </div><div class="mf"><button class="btn primary" data-act="kk-bol-yes" data-item="${it.id}" disabled>${r.status === "eval" ? "Böl" : "Böl ve onaya gönder"}</button>${r.status === "eval" ? "" : `<button class="btn" data-act="kk-bol-sadece" data-item="${it.id}" disabled>Yalnız böl</button>`}<button class="btn ghost" data-act="close">Vazgeç</button></div>`, true, true);
  ozetiYaz(r, it);
  void kabulReddi(r.id, [it.id]).catch(() => "Kabul sınırı okunamadı; bölme şimdilik kapalı.").then((red) => {
    const kutu = $<HTMLElement>("#kk-kabul"); if (!kutu || $<HTMLElement>(`[data-kk-pencere="${it.id}"]`) === null) return;
    kutu.textContent = red ?? ""; kutu.dataset.kkKabul = red === null ? "tamam" : "red";
    ozetiYaz(r, it);
  });
}
function ozetiYaz(r: PurchaseRequest, it: RequestItem): void {
  const ev = evaluate(r);
  const ps = paylar(r, it, ev);
  const uyarilar: string[] = [];
  let toplam = 0;
  for (const p of ps) {
    const h = payHesabi(p.x, it.id, p.miktar);
    const u = $<HTMLElement>(`[data-kk-u="${p.x.q.id}"]`), t = $<HTMLElement>(`[data-kk-t="${p.x.q.id}"]`);
    const tam = itemCost(p.x, it);
    if (u) u.innerHTML = `${h ? money(h.birim) : money(tam)}${h && tam !== null && Math.abs(h.birim - tam) >= 0.005 ? `<span class="sub" data-kk-kademe>${numIn(p.miktar)} ${esc(it.unit)} payında; ${numIn(it.qty)} ${esc(it.unit)}'da ${money(tam)}</span>` : ""}`;
    if (t) t.textContent = h ? money(h.tutar, "TRY", 0) : "–";
    if (h) toplam += h.tutar;
    if (h?.enAz !== null && h) uyarilar.push(`${supName(p.x.q)} en az ${numIn(h.enAz)} ${it.unit} satıyor: talepteki pay ${numIn(p.miktar)} ${it.unit} kalır, sipariş ve tutar ${numIn(h.enAz)} ${it.unit} ile verilir`);
  }
  const dagitilan = ps.reduce((a, p) => a + Math.max(0, p.miktar), 0);
  const tamam = paylarTamam(it.qty ?? 0, ps.map((p) => p.miktar));
  const tekPay = ps.filter((p) => p.miktar > 0).length;
  const kabul = $<HTMLElement>("#kk-kabul")?.dataset.kkKabul;
  const dugme = $<HTMLButtonElement>('[data-act="kk-bol-yes"]');
  if (dugme) dugme.disabled = !tamam || tekPay < 2 || kabul !== "tamam";
  const sadece = $<HTMLButtonElement>('[data-act="kk-bol-sadece"]');
  if (sadece) sadece.disabled = !tamam || tekPay < 2 || kabul !== "tamam";
  const kutu = $<HTMLElement>("#kk-ozet");
  const neden = !tamam ? "Paylar kalem miktarına eşit olmalı." : tekPay < 2 ? "En az iki tedarikçiye pay verin." : kabul === undefined ? "Kabul sınırı denetleniyor." : kabul !== "tamam" ? "Kabul sınırı bölmeye izin vermiyor (aşağıdaki nota bakın)." : null;
  if (kutu) kutu.innerHTML = `<div class="note small"><div class="row"><span>Dağıtılan <b class="num">${numIn(dagitilan)} / ${numIn(it.qty)} ${esc(it.unit)}</b></span>
    ${tamam ? "" : '<span class="flag warn">toplam kalem miktarına eşit değil</span>'}${tamam && tekPay < 2 ? '<span class="flag mute">en az iki tedarikçiye pay verin</span>' : ""}
    <span class="spacer"></span><span>Kalem tutarı <b class="num">${money(toplam, "TRY", 0)}</b></span></div>
    ${neden ? `<div class="small" data-kk-neden="">Düğmeler kapalı: ${esc(neden)}</div>` : ""}
    ${uyarilar.map((u) => `<div class="xs">${esc(u)}</div>`).join("")}</div>`;
}
/** Bölmenin kararı: öteki kalemler şu anki atamasını korur; tek tedarikçi kalırsa karar tektir. */
export function bolunmusKarar(r: PurchaseRequest, kalemId: string, pay: Record<string, number>, gerekce: string): { talep: PurchaseRequest; metin: string } {
  const ev = evaluate(r);
  const atama = kalemAtamasi(r, ev);
  const dagilim: Dagilim = Object.fromEntries((r.items ?? []).map((it) => [it.id, it.id === kalemId ? pay : atama[it.id] ? { [atama[it.id]!]: it.qty ?? 0 } : {}]));
  const ad = (qid: string) => supName(r.quotes.find((q) => q.id === qid)!);
  const { talep: n, atama: yeni, bolunenler } = kalemleriBol(r, dagilim, ad);
  const kullanilan = [...new Set(Object.values(yeni))];
  const eski: Partial<Award> = r.award ?? {};
  const karar: Award = {
    mode: kullanilan.length === 1 ? "single" : "split", quoteId: kullanilan.length === 1 ? kullanilan[0]! : null,
    ...(kullanilan.length === 1 ? {} : { splits: yeni }),
    reason: gerekce || "Kalem miktarla bölündü", by: S.me?.name ?? "", decidedAt: todayStr(), approvals: [],
    ...(eski.fx ? { fx: eski.fx } : {}),
  };
  n.award = karar;
  n.status = "approval";
  return { talep: n, metin: `Kalem bölündü: ${bolunenler.join("; ")}. Karar onaya gönderildi.` };
}
/** Değerlendirmede Böl yalnız kalemi satırlara ayırır; karar tek sayfadaki çubukla gönderilir (3590). */
export function bolunmusTalep(r: PurchaseRequest, kalemId: string, pay: Record<string, number>): { talep: PurchaseRequest; atama: Record<string, string>; metin: string } {
  const ad = (qid: string) => supName(r.quotes.find((q) => q.id === qid)!);
  const { talep: n, atama, bolunenler } = kalemleriBol(r, { [kalemId]: pay }, ad);
  n.award = null;
  return { talep: n, atama, metin: `Kalem bölündü: ${bolunenler.join("; ")}.` };
}

/* ---------------- sipariş adımı: kalem tablosu ---------------- */
export function siparisKalemleriHTML(r: PurchaseRequest): string {
  const a = r.award;
  if (!a) return "";
  const ordered = COMMITTED.includes(r.status);
  const degistir = ordered && onaylayabilir();
  const satirlar = awardOrders(r).flatMap((o) => o.items.map((it) => {
    const l = a.lines?.find((x) => x.itemId === it.id && x.quoteId === o.qid);
    const miktar = l?.qty ?? it.qty ?? null;
    const h = isNum(miktar) ? basamakFiyati(o.q, it.id, miktar) : null;
    const alinan = l?.received ?? null;
    // Mal kabul yoksa teslim alınan sıfırdır (bilinmiyor değil): sunucu teslimsiz satırda boş gönderir.
    const birim = l?.unit ?? it.unit;
    return `<tr><td class="lead"><b>${esc(it.name)}</b>${it.spec ? `<span class="sub">${esc(it.spec)}</span>` : ""}</td>
      <td data-l="Tedarikçi">${esc(supName(o.q))}${o.orderNo ? `<span class="sub">${esc(o.orderNo)}</span>` : ""}</td>
      <td class="r num" data-l="Sipariş miktarı">${isNum(miktar) ? `${numIn(miktar)} ${esc(birim)}` : "–"}</td>
      <td class="r num" data-l="Birim fiyat">${h ? money(h.unit, o.q.currency) : "–"}</td>
      <td class="r num" data-l="Tutar">${h ? money(h.line, o.q.currency) : "–"}</td>
      <td class="r num" data-l="Teslim alınan">${ordered ? `${numIn(alinan ?? 0)} ${esc(birim)}` : "–"}</td>
      <td class="r num" data-l="Kalan">${ordered && isNum(miktar) ? `${numIn(Math.max(0, miktar - (alinan ?? 0)))} ${esc(birim)}` : "–"}</td>
      <td class="acts">${degistir ? `<button class="btn sm" data-act="order-item-change" data-item="${it.id}">Değiştir</button>` : ""}</td></tr>`;
  }));
  if (!satirlar.length) return "";
  return `<div data-sa-siparis-kalemleri><h3 class="small">Kalem kalem sipariş</h3><div class="tw"><table class="itbl rt"><thead><tr><th>Kalem</th><th>Tedarikçi</th><th class="r">Sipariş miktarı</th><th class="r">Birim fiyat</th><th class="r">Tutar</th><th class="r">Teslim alınan</th><th class="r">Kalan</th><th><span class="sr-only">Değiştir</span></th></tr></thead>
    <tbody>${satirlar.join("")}</tbody></table></div>
    <p class="xs muted">Tutarlar KDV hariç, teklif para biriminde; nakliye ve masraf hariç.${degistir ? " Miktar ve birim \"Değiştir\" ile güncellenir; gerekçesiyle geçmişe yazılır, Logo'ya gitmiş siparişe düzenleme gider." : ""}</p></div>`;
}

/* ---------------- olaylar ---------------- */
document.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (!kokIcinde(e) || !t.dataset?.kkQ) return;
  const r = S.requests[V.id ?? ""]; const id = t.closest<HTMLElement>("[data-kk-pencere]")?.dataset.kkPencere;
  const it = r?.items?.find((x) => x.id === id);
  if (r && it) ozetiYaz(r, it);
});
document.addEventListener("click", (e) => {
  if (!kokIcinde(e)) return;
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act^='kk-']"); if (!el) return;
  const r = S.requests[V.id ?? ""]; const it = r?.items?.find((x) => x.id === el.dataset.item);
  if (!r || !it || !canWrite()) return;
  const neden = bolunemezNedeni(it) ?? bolmeKapaliNedeni(r);
  if (neden) { toast(neden); return; }
  if (el.dataset.act === "kk-bol") { bolPenceresi(r, it); return; }
  if (el.dataset.act !== "kk-bol-yes" && el.dataset.act !== "kk-bol-sadece") return;
  const ev = evaluate(r);
  const ps = paylar(r, it, ev);
  if (!paylarTamam(it.qty ?? 0, ps.map((p) => p.miktar)) || ps.filter((p) => p.miktar > 0).length < 2) { toast("Miktarı en az iki tedarikçiye, toplamı kalem miktarına eşit olacak şekilde paylaştırın."); return; }
  if ($<HTMLElement>("#kk-kabul")?.dataset.kkKabul !== "tamam") { toast("Bu kalem bölünemez; kabul sınırı notuna bakın."); return; }
  const pay = Object.fromEntries(ps.filter((p) => p.miktar > 0).map((p) => [p.x.q.id, p.miktar]));
  if (r.status === "eval" || el.dataset.act === "kk-bol-sadece") {
    const b = bolunmusTalep(r, it.id, pay);
    // Yalnız böl: karar çekilir, talep değerlendirmeye döner (sunucu geçişi: teklif isteniyor ve onayda → değerlendirme).
    b.talep.status = "eval";
    closeModal();
    saveRequest(b.talep, b.metin);
    bolmeyiTaslagaIsle(b.talep, it.id, b.atama);
    render();
    toast("Kalem bölündü; karar çubuğundan gönderin");
    return;
  }
  const { talep, metin } = bolunmusKarar(r, it.id, pay, ($<HTMLTextAreaElement>("#kk-gerekce")?.value ?? "").trim());
  closeModal();
  saveRequest(talep, metin);
  render();
  $$<HTMLElement>("#sa-kalem-kalem").forEach((x) => x.scrollIntoView({ block: "start" }));
  toast("Kalem bölündü, karar onay bekliyor");
});
