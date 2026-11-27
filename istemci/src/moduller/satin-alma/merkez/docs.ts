/**
 * Belgeler: yazdırılabilir satın alma onay formu ve tedarikçiye sipariş metni.
 */
import type { PurchaseRequest } from "./tipler.ts";
import { OPEN, PRIO } from "./constants.ts";
import { S, nameOf, settings } from "./store.ts";
import { approvalState, awardOrders, awardTotals, evaluate, kurKilitli, orderDue, payText, requiredApprover, siparisEtiketi, supName, type OrderInfo } from "./calc.ts";
import { odemeAyrintisi } from "./karar-ayrintisi.ts";
import { teklifMetniSatirlari } from "./kalem-bagi.ts";
import { talepRehberi } from "./onayli-ekran.ts";
import { PRESETS } from "./views.ts";
import { esc, fmtDate, fmtTs, money, nf0, nfx, numIn, parseNum, todayStr } from "./util.ts";

/* ---------------- onay formu ---------------- */
/** Onaylanmış kararda son onaylayanın adı; onay yoksa boş (imza kutusuna gereken basamak yazılır). */
function onaylayanAdi(r: PurchaseRequest): string {
  const st = approvalState(r);
  return st.state === "approved" && st.last ? `${st.last.name || nameOf(st.last.by)}, ${fmtTs(st.last.at)}` : "";
}
/** Kararın tedarikçi payının ödemesi: karara düşen tutar, kur, avans ve vadeli kısım tahmini günleriyle, yöntem ve vade faizi. */
function odemeHucreleri(r: PurchaseRequest, o: OrderInfo | undefined, tt: ReturnType<typeof awardTotals>): { tutar: string; odeme: string } {
  const x = o && tt ? tt.ev.all.find((y) => y.q.id === o.qid) : undefined;
  if (!o || !x) return { tutar: "–", odeme: "" };
  const tl = o.items.reduce((t, it) => t + (x.c.lines[it.id]?.line ?? 0) * x.c.unitTRY, 0) + (x.c.ship + x.c.other) * x.c.rate;
  const pay = x.c.totalTRY > 0 ? tl / x.c.totalTRY : 0, d = odemeAyrintisi(r, x);
  const kur = x.q.currency === "TRY" ? "" : `kur ${nfx.format(d.kur)} (${d.kurKaynagi === "guncel" ? "güncel" : d.kurKaynagi === "kilit" ? "onaya gönderimde sabit" : d.kurKaynagi === "sabit" ? "sipariş günü" : "teklif günü"})`;
  const avans = d.avans ? `avans ${money(d.avans.tl * pay, "TRY", 0)}, ${fmtDate(d.avans.gun)}` : "";
  const kalan = d.kalan ? `vadeli ${money(d.kalan.tl * pay, "TRY", 0)}, ${d.kalan.gun ? fmtDate(d.kalan.gun) : "teslim günü bilinmiyor"}` : "";
  const faiz = d.aylikFaiz === null ? "" : `aylık faiz %${nfx.format(d.aylikFaiz)}`;
  return { tutar: money(tl, "TRY", 0), odeme: [d.yontem, kur, avans, kalan, faiz].filter(Boolean).map(esc).join("<br>") };
}
/**
 * 3590: onay formu yalnız bu karara giren kalemleri taşır; kalemler tedarikçi başına gruplu, ara toplamlı (nakliye grubun içinde).
 * Değerlendirilen teklifler ve ödeme tek tabloda; gerekçe ağırlık adıyla tek kutuda; açıklamalar tek dipnotta. kalanKalemSayisi:
 * önizlemede yeni talebe ayrılacak kalem sayısı (karar verilmiş talepte ayrılan talepler sunucudan gelir).
 */
export function approvalFormHTML(r: PurchaseRequest, kalanKalemSayisi = 0): string {
  const set = settings(), a = r.award;
  const tt = a ? awardTotals(r) : null;
  const ev = (r.quotes || []).length ? evaluate(r) : null;
  const orders = awardOrders(r);
  const ap = tt ? requiredApprover(tt.totalTRY) : null;
  const gruplar = orders.map((o) => {
    const c = tt?.ev.all.find((x) => x.q.id === o.qid)?.c;
    let ara = 0;
    const satirlar = o.items.map((it) => {
      const p = o.q.prices[it.id] ?? 0, qty = parseNum(it.qty) || 0, tl = p * qty * (c ? c.unitTRY : 1);
      ara += tl;
      return `<tr><td>${esc(it.name)}${it.spec ? `<br><small>${esc(it.spec)}</small>` : ""}</td><td class="r">${numIn(qty)} ${esc(it.unit)}</td><td class="r">${money(p, o.q.currency)}</td><td class="r">${money(tl)}</td></tr>`;
    }).join("");
    const masraf = c && c.ship + c.other > 0 ? (c.ship + c.other) * c.rate : 0;
    ara += masraf;
    return `<tr class="doc-grup"><th colspan="4">${esc(supName(o.q))}</th></tr>${satirlar}
      ${masraf ? `<tr><td colspan="3">Nakliye ve diğer masraflar</td><td class="r">${money(masraf)}</td></tr>` : ""}
      ${orders.length > 1 ? `<tr class="doc-ara"><td colspan="3">Ara toplam: ${esc(supName(o.q))}</td><td class="r">${money(ara)}</td></tr>` : ""}`;
  }).join("");
  const faizsiz = !!tt && orders.some((o) => tt.ev.all.find((x) => x.q.id === o.qid)?.c.faizYok);
  const secilen = new Set(orders.map((o) => o.qid));
  const kalanlar = r.ayrilma?.ayrilanlar ?? [];
  const kalanNotu = kalanKalemSayisi > 0 ? `Kalan ${kalanKalemSayisi} kalem bu karara girmiyor; onaya gönderilince yeni talebe ayrılır, ayrı onaya gelir.`
    : kalanlar.length ? kalanlar.map((x) => `Kalan ${x.kalemSayisi} kalem ${esc(x.no)} talebinde, ayrı onaya gelir.`).join(" ") : "";
  const agirlik = ev ? Object.values(PRESETS).find((p) => (Object.keys(p.w) as (keyof typeof p.w)[]).every((k) => {
    const tw = Object.values(ev.w).reduce((t, v) => t + (+v || 0), 0) || 1; return Math.round((+ev.w[k] || 0) / tw * 100) === p.w[k];
  }))?.l ?? "Özel" : null;
  const gerekce = a?.reason || (a?.mode === "single" && ev?.ranking[0]?.q.id === a.quoteId ? "Değerlendirmede en yüksek puanı alan teklif seçildi." : a?.mode === "split" ? "Kalem bazlı dağılım seçildi." : "Gerekçe yazılmamış.");
  const dovizli = (r.quotes || []).some((q) => q.currency !== "TRY");
  const sign = (t: string, name: string) => `<div class="sig"><div class="sig-t">${t}</div><div class="sig-n">${esc(name)}</div><div class="sig-l">İmza / tarih</div></div>`;
  return `<div class="doc">
    <div class="doc-h"><div><div class="doc-co">${esc(set.company || "Firma adı")}</div><h2>Satın Alma Onay Formu</h2></div>
      <table class="doc-meta"><tr><th>Form no</th><td>${esc(r.no)}</td></tr><tr><th>Karar tarihi</th><td>${fmtDate(a?.decidedAt || todayStr())}</td></tr><tr><th>Düzenleme</th><td>${fmtDate(todayStr())}</td></tr></table></div>
    ${kalanNotu ? `<p class="doc-box" data-doc-kalan>${kalanNotu}</p>` : ""}
    <h3>Talep</h3>
    <table class="doc-kv"><tr><th>Konu</th><td>${esc(r.title)}</td><th>Birim</th><td>${esc(r.department || "–")}</td></tr>
      <tr><th>Talep eden</th><td>${esc(r.requester || "–")}</td><th>İhtiyaç tarihi</th><td>${fmtDate(r.needDate)}</td></tr>
      <tr><th>Öncelik</th><td>${PRIO[r.priority || "normal"]}</td><th>Karar</th><td>${a?.mode === "split" ? `Kalem bazlı, ${orders.length} tedarikçi` : "Tek tedarikçi"}</td></tr></table>
    <h3>Sipariş edilecek kalemler</h3>
    <table class="doc-t"><thead><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Birim fiyat</th><th class="r">Tutar (TL)</th></tr></thead>
      <tbody>${gruplar}</tbody>
      <tfoot><tr><td colspan="3">Toplam (KDV hariç)</td><td class="r">${tt ? money(tt.totalTRY) : "–"}</td></tr>
      <tr><td colspan="3">Net bugünkü maliyet${faizsiz ? "" : " (vade etkisi dahil)"}</td><td class="r">${tt ? money(tt.pvTRY) : "–"}</td></tr></tfoot></table>
    ${ev ? `<h3>Değerlendirilen teklifler ve ödeme</h3>
    <table class="doc-t"><thead><tr><th>Tedarikçi</th><th class="r">Net, tüm kalemler*</th><th class="r">Termin</th><th>Ödeme</th><th class="r">Puan</th><th class="r">Bu karar (TL)</th><th>Ödeme planı</th></tr></thead><tbody>
      ${ev.ranking.map((x) => { const o = orders.find((y) => y.qid === x.q.id), od = odemeHucreleri(r, o, tt); return `<tr${secilen.has(x.q.id) ? ' class="doc-sec"' : ""}><td>${secilen.has(x.q.id) ? "<b>&#10003; " : ""}${esc(supName(x.q))}${secilen.has(x.q.id) ? "</b> <small>(seçildi)</small>" : ""}${x.c.covered < (r.items || []).length ? " <small>(eksik kalemli)</small>" : ""}</td><td class="r">${money(x.c.pvTRY, "TRY", 0)}</td><td class="r">${parseNum(x.q.leadDays) ?? "–"} gün</td><td>${esc(payText(x.q))}${x.q.deliveryTerm ? `<br><small>${esc(x.q.deliveryTerm)}</small>` : ""}</td><td class="r">${nf0.format(x.score)}</td><td class="r">${od.tutar}</td><td><small>${od.odeme}</small></td></tr>`; }).join("")}
      ${ev.all.filter((x) => !ev.elig.includes(x)).map((x) => `<tr><td>${esc(supName(x.q))} <small>(değerlendirme dışı)</small></td><td class="r">${money(x.c.totalTRY, "TRY", 0)}</td><td colspan="5"></td></tr>`).join("")}
    </tbody></table>` : ""}
    <h3>Gerekçe</h3><p class="doc-box">${esc(gerekce)}${agirlik ? `<br><small>Değerlendirme ağırlığı: ${esc(agirlik)} (maliyet ${ev!.w.cost}, termin ${ev!.w.lead}, tedarikçi ${ev!.w.supplier}, garanti ${ev!.w.warranty})</small>` : ""}</p>
    <p class="doc-note">* Tedarikçinin bütün kalemleri tek başına aldığındaki net maliyet; bu kararın tutarı "Bu karar" sütunundadır. Tutarlar KDV hariç.${faizsiz ? " Faiz Finans'ta girilmediği için vade etkisi hesaba katılmadı." : ""}${dovizli ? ` Döviz teklifler ${kurKilitli(r) ? "onaya gönderimde sabitlenen kurla" : OPEN.includes(r.status) ? "güncel kurla" : a?.fx ? "sipariş günü sabitlenen kurla" : "teklif günündeki kurla"} TL'ye çevrilmiştir.` : ""} Ödeme günleri tahminidir (vadeli kısım ${a?.vadeBaslangici === "siparis" ? "siparişten" : "beklenen teslimden"} sayılır).</p>
    <div class="doc-onay"><h3>Onay</h3>
    <p class="doc-note">Gereken onay seviyesi: <b>${esc(ap?.role || "–")}</b>${tt ? ` (${money(tt.totalTRY, "TRY", 0)})` : ""}${(a?.approvals || []).length ? "<br>" + (a?.approvals || []).map((x) => `${fmtTs(x.at)}: ${x.decision === "approved" ? "Onaylandı" : "Reddedildi"}, ${esc(x.name || nameOf(x.by))}${x.note ? " (" + esc(x.note) + ")" : ""}`).join("<br>") : ""}</p>
    <div class="sigs">${sign("Talep eden", r.requester || "")}${sign("Satın alma", a?.by || "")}${sign("Onaylayan", onaylayanAdi(r) || (ap ? `Bekleniyor: ${ap.role}` : ""))}</div></div>
  </div>`;
}

/* ---------------- sipariş metni ---------------- */
export function poText(r: PurchaseRequest, o: OrderInfo): string {
  const set = settings(), s = S.suppliers[o.supplierId];
  const L: string[] = [];
  // Sipariş numarası sipariş verilince oluşur; öncesinde talep numarası sipariş numarası sanılmasın diye ayrı yazılır.
  // 3574-2a: değişmiş sipariş revizyon numarasıyla gider; son uygulanan değişikliğin satırları işaretlenir.
  const gecmis = r.siparisGecmisi?.[o.qid];
  const rev = gecmis && gecmis.no > 0 ? gecmis.no : 0;
  const degisen = new Set((gecmis?.degisiklikler ?? []).find((d) => d.degisiklikNo === rev)?.ozet.flatMap((x) => (x.kalemId ? [x.kalemId] : [])) ?? []);
  L.push(`Konu: ${siparisEtiketi(o) ? `Sipariş ${siparisEtiketi(o)}` : `Sipariş (talep ${r.no})`}${rev ? ` R${rev} (değişiklik)` : ""}, ${r.title}`);
  L.push("");
  L.push(s?.contact ? `Sayın ${s.contact},` : `${supName(o.q)} yetkilisine,`);
  L.push("");
  L.push(rev ? `Siparişimizde aşağıdaki değişiklik yapılmıştır; geçerli hâli R${rev}'dir. İşaretli satırlar değişmiştir.` : `${fmtDate(o.q.date)} tarihli teklifinize istinaden aşağıdaki kalemleri sipariş ediyoruz.`);
  L.push("");
  let total = 0;
  o.items.forEach((it, i) => {
    const p = o.q.prices[it.id] ?? 0, qty = parseNum(it.qty) || 0; total += p * qty;
    L.push(`${i + 1}. ${it.name}${it.spec ? ` (${it.spec})` : ""}: ${numIn(qty)} ${it.unit} × ${money(p, o.q.currency)} = ${money(p * qty, o.q.currency)}${degisen.has(it.id) ? ` [R${rev} değişti]` : ""}`);
    // 2875: fason firması hangi parçaya hangi işlemi yapacağını siparişte de görür; teklif isteme metniyle aynı satırlar.
    const satir = (r.award?.lines ?? []).find((l) => l.itemId === it.id && l.quoteId === o.qid);
    for (const t of teklifMetniSatirlari(it, satir?.parcaRevizyonu ?? null)) L.push(`   ${t}`);
    // 3574-1: satırın kendi termini (siparişinkinden ayrıysa) tedarikçiye yazılır; satır notu iç nottur, yazılmaz.
    if (satir?.expectedDate) L.push(`   Termin: ${fmtDate(satir.expectedDate)}`);
  });
  const disc = (parseNum(o.q.discountPct) || 0) / 100;
  if (disc) { L.push(`İskonto %${numIn(disc * 100)}: −${money(total * disc, o.q.currency)}`); total *= 1 - disc; }
  const ship = o.q.deliveryIncluded ? 0 : parseNum(o.q.shipping) || 0;
  if (ship) { L.push(`Nakliye: ${money(ship, o.q.currency)}`); total += ship; }
  L.push(`Toplam: ${money(total, o.q.currency)} (KDV hariç)`);
  L.push("");
  L.push(`Ödeme: ${payText(o.q)}`);
  if (o.q.deliveryTerm) L.push(`Teslim şekli: ${o.q.deliveryTerm}`);
  // 3279 a: Kalite'nin şartlı onayındaki şart tedarikçiye giden sipariş metnine yazılır (on izleme: "şart sipariş notuna eklenir").
  const rehber = talepRehberi(r, o.supplierId);
  for (const sart of rehber?.sartlar ?? []) L.push(`Kalite şartı: ${sart}`);
  // 3279-2 a: proje müşterisinin şartlı onayındaki şart da yazılır.
  for (const sart of rehber?.musteri?.sartlar ?? []) L.push(`${rehber?.musteri?.ad ?? 'Müşteri'} şartı: ${sart}`);
  const due = orderDue(o);
  if (due) L.push(`Beklenen teslim tarihi: ${fmtDate(due)}`);
  // 3574-1: teslim yeri ve tedarikçiye not firma başlığından; boşsa satır yazılmaz (veri yoksa yazılmaz). İç not yazılmaz.
  const baslik = r.award?.mode === "split" ? r.award.orders?.[o.qid] : r.award;
  if (baslik?.teslimYeri) L.push(`Teslim yeri: ${baslik.teslimYeri}`);
  if (baslik?.tedarikciNotu) L.push(`Not: ${baslik.tedarikciNotu}`);
  L.push("");
  L.push("Siparişi teyit etmenizi ve sevkiyat bilgisini paylaşmanızı rica ederiz.");
  L.push("");
  L.push("Saygılarımızla,");
  if (set.company) L.push(set.company);
  return L.join("\n");
}

/** Sipariş metni penceresinin gövdesi: metin (Kalite şartı satırları dahil) önceden dolu ve gönderilmeden değiştirilebilir; kopyalanan, alandaki son haldir. */
export function siparisMetniGovdesi(r: PurchaseRequest, o: OrderInfo): string {
  return `<label class="f"><span>Sipariş metni ve notu <small>— gönderilmeden değiştirilebilir</small></span><textarea id="po-out" rows="18" aria-describedby="po-out-not">${esc(poText(r, o))}</textarea></label>
    <p class="small muted" id="po-out-not">Değişiklik kaydedilmez; kopyalayıp tedarikçiye gönderin.</p>`;
}

/** Yazdırma: belgeyi sayfanın dışındaki yazdırma alanına koyar ve yazdırma penceresini açar. Alan body'nin doğrudan çocuğudur
 * (pencereler body'ye açılır); baskıda body'nin öteki çocukları gizlenir, kağıt ölçeksiz ve beyaz zeminle A4'e basılır. */
export function printDoc(html: string): void {
  let root = document.getElementById("print-root");
  if (!root) { root = document.createElement("div"); root.id = "print-root"; root.className = "sa-kok sa-baski-koku"; document.body.appendChild(root); }
  root.innerHTML = html;
  document.body.classList.add("sa-baskida");
  const done = () => { document.body.classList.remove("sa-baskida"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  try { window.print(); } catch { /* yazdırma bu görünümde engellenmiş olabilir */ }
  setTimeout(done, 1500);
}
