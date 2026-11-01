/**
 * Belgeler: yazdırılabilir satın alma onay formu ve tedarikçiye sipariş metni.
 */
import type { PurchaseRequest } from "./tipler.ts";
import { OPEN, PRIO } from "./constants.ts";
import { S, nameOf, settings } from "./store.ts";
import { awardOrders, awardTotals, evaluate, orderDue, payText, requiredApprover, siparisEtiketi, supName, type OrderInfo } from "./calc.ts";
import { esc, fmtDate, fmtTs, isNum, money, nf0, numIn, parseNum, todayStr } from "./util.ts";

/* ---------------- onay formu ---------------- */
export function approvalFormHTML(r: PurchaseRequest): string {
  const set = settings(), a = r.award;
  const tt = a ? awardTotals(r) : null;
  const ev = (r.quotes || []).length ? evaluate(r) : null;
  const orders = awardOrders(r);
  const ap = tt ? requiredApprover(tt.totalTRY) : null;
  const rows = orders.flatMap((o) => o.items.map((it) => {
    const p = o.q.prices[it.id] ?? 0, qty = parseNum(it.qty) || 0;
    const c = tt?.ev.all.find((x) => x.q.id === o.qid)?.c;
    return `<tr><td>${esc(it.name)}${it.spec ? `<br><small>${esc(it.spec)}</small>` : ""}</td><td class="r">${numIn(qty)} ${esc(it.unit)}</td><td>${esc(supName(o.q))}</td><td class="r">${money(p, o.q.currency)}</td><td class="r">${money(p * qty * (c ? c.unitTRY : 1))}</td></tr>`;
  })).join("");
  const extras = orders.map((o) => { const c = tt?.ev.all.find((x) => x.q.id === o.qid)?.c; return c && c.ship + c.other > 0 ? `<tr><td colspan="4">Nakliye ve diğer masraflar: ${esc(supName(o.q))}</td><td class="r">${money((c.ship + c.other) * c.rate)}</td></tr>` : ""; }).join("");
  const sign = (t: string, name: string) => `<div class="sig"><div class="sig-t">${t}</div><div class="sig-n">${esc(name)}</div><div class="sig-l">İmza / tarih</div></div>`;
  return `<div class="doc">
    <div class="doc-h"><div><div class="doc-co">${esc(set.company || "Firma adı")}</div><h2>Satın Alma Onay Formu</h2></div>
      <table class="doc-meta"><tr><th>Form no</th><td>${esc(r.no)}</td></tr><tr><th>Karar tarihi</th><td>${fmtDate(a?.decidedAt || todayStr())}</td></tr><tr><th>Düzenleme</th><td>${fmtDate(todayStr())}</td></tr></table></div>
    <h3>Talep</h3>
    <table class="doc-kv"><tr><th>Konu</th><td>${esc(r.title)}</td><th>Birim</th><td>${esc(r.department || "–")}</td></tr>
      <tr><th>Talep eden</th><td>${esc(r.requester || "–")}</td><th>İhtiyaç tarihi</th><td>${fmtDate(r.needDate)}</td></tr>
      <tr><th>Öncelik</th><td>${PRIO[r.priority || "normal"]}</td><th>Karar</th><td>${a?.mode === "split" ? `Kalem bazlı, ${orders.length} tedarikçi` : "Tek tedarikçi"}</td></tr></table>
    <h3>Sipariş edilecek kalemler</h3>
    <table class="doc-t"><thead><tr><th>Kalem</th><th class="r">Miktar</th><th>Tedarikçi</th><th class="r">Birim fiyat</th><th class="r">Tutar (TL)</th></tr></thead>
      <tbody>${rows}${extras}</tbody>
      <tfoot><tr><td colspan="4">Toplam (KDV hariç)</td><td class="r">${tt ? money(tt.totalTRY) : "–"}</td></tr>
      <tr><td colspan="4">Net bugünkü maliyet (vade etkisi dahil)</td><td class="r">${tt ? money(tt.pvTRY) : "–"}</td></tr></tfoot></table>
    <p class="doc-note">${orders.map((o) => `${esc(supName(o.q))}: ${esc(payText(o.q))}, termin ${isNum(parseNum(o.q.leadDays)) ? parseNum(o.q.leadDays) + " gün" : "belirtilmemiş"}${o.q.deliveryTerm ? ", " + esc(o.q.deliveryTerm) : ""}`).join("<br>")}</p>
    ${ev ? `<h3>Değerlendirilen teklifler</h3>
    <table class="doc-t"><thead><tr><th>#</th><th>Tedarikçi</th><th class="r">Toplam (TL)</th><th class="r">Net maliyet</th><th>Ödeme</th><th class="r">Termin</th><th class="r">Puan</th></tr></thead><tbody>
      ${ev.ranking.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(supName(x.q))}${x.c.covered < (r.items || []).length ? " <small>(eksik kalemli)</small>" : ""}</td><td class="r">${money(x.c.totalTRY, "TRY", 0)}</td><td class="r">${money(x.c.pvTRY, "TRY", 0)}</td><td>${esc(payText(x.q))}</td><td class="r">${parseNum(x.q.leadDays) ?? "–"} gün</td><td class="r">${nf0.format(x.score)}</td></tr>`).join("")}
      ${ev.all.filter((x) => !ev.elig.includes(x)).map((x) => `<tr><td>–</td><td>${esc(supName(x.q))} <small>(değerlendirme dışı)</small></td><td class="r">${money(x.c.totalTRY, "TRY", 0)}</td><td colspan="4"></td></tr>`).join("")}
    </tbody></table>
    <p class="doc-note">Ağırlıklar: maliyet ${ev.w.cost}, termin ${ev.w.lead}, tedarikçi ${ev.w.supplier}, garanti ${ev.w.warranty}.${(r.quotes || []).some((q) => q.currency !== "TRY") ? ` Döviz teklifler ${OPEN.includes(r.status) ? "güncel kurla" : a?.fx ? "sipariş günü sabitlenen kurla" : "teklif günündeki kurla"} TL'ye çevrilmiştir.` : ""}</p>` : ""}
    <h3>Gerekçe</h3><p class="doc-box">${esc(a?.reason || (a?.mode === "single" && ev?.ranking[0]?.q.id === a.quoteId ? "Değerlendirmede en yüksek puanı alan teklif seçildi." : a?.mode === "split" ? "Kalem bazlı dağılım seçildi." : "Gerekçe yazılmamış."))}</p>
    <h3>Onay</h3>
    <p class="doc-note">Gereken onay seviyesi: <b>${esc(ap?.role || "–")}</b>${tt ? ` (${money(tt.totalTRY, "TRY", 0)})` : ""}${(a?.approvals || []).length ? "<br>" + (a?.approvals || []).map((x) => `${fmtTs(x.at)}: ${x.decision === "approved" ? "Onaylandı" : "Reddedildi"}, ${esc(x.name || nameOf(x.by))}${x.note ? " (" + esc(x.note) + ")" : ""}`).join("<br>") : ""}</p>
    <div class="sigs">${sign("Talep eden", r.requester || "")}${sign("Satın alma", a?.by || "")}${sign("Onaylayan", ap?.role || "")}</div>
  </div>`;
}

/* ---------------- sipariş metni ---------------- */
export function poText(r: PurchaseRequest, o: OrderInfo): string {
  const set = settings(), s = S.suppliers[o.supplierId];
  const L: string[] = [];
  L.push(`Konu: Sipariş ${siparisEtiketi(o) || r.no}, ${r.title}`);
  L.push("");
  L.push(s?.contact ? `Sayın ${s.contact},` : `${supName(o.q)} yetkilisine,`);
  L.push("");
  L.push(`${fmtDate(o.q.date)} tarihli teklifinize istinaden aşağıdaki kalemleri sipariş ediyoruz.`);
  L.push("");
  let total = 0;
  o.items.forEach((it, i) => {
    const p = o.q.prices[it.id] ?? 0, qty = parseNum(it.qty) || 0; total += p * qty;
    L.push(`${i + 1}. ${it.name}${it.spec ? ` (${it.spec})` : ""}: ${numIn(qty)} ${it.unit} × ${money(p, o.q.currency)} = ${money(p * qty, o.q.currency)}`);
  });
  const disc = (parseNum(o.q.discountPct) || 0) / 100;
  if (disc) { L.push(`İskonto %${numIn(disc * 100)}: −${money(total * disc, o.q.currency)}`); total *= 1 - disc; }
  const ship = o.q.deliveryIncluded ? 0 : parseNum(o.q.shipping) || 0;
  if (ship) { L.push(`Nakliye: ${money(ship, o.q.currency)}`); total += ship; }
  L.push(`Toplam: ${money(total, o.q.currency)} (KDV hariç)`);
  L.push("");
  L.push(`Ödeme: ${payText(o.q)}`);
  if (o.q.deliveryTerm) L.push(`Teslim şekli: ${o.q.deliveryTerm}`);
  const due = orderDue(o);
  if (due) L.push(`Beklenen teslim tarihi: ${fmtDate(due)}`);
  // Teslimat adresi kayıtta tutulmuyor; uydurma yer tutucu yerine satır yazılmaz (kural: veri yoksa yazılmaz).
  L.push("");
  L.push("Siparişi teyit etmenizi ve sevkiyat bilgisini paylaşmanızı rica ederiz.");
  L.push("");
  L.push("Saygılarımızla,");
  if (set.company) L.push(set.company);
  return L.join("\n");
}

/** Yazdırma: belgeyi sayfanın dışındaki yazdırma alanına koyar ve yazdırma penceresini açar */
export function printDoc(html: string): void {
  let root = document.getElementById("print-root");
  if (!root) { root = document.createElement("div"); root.id = "print-root"; document.body.appendChild(root); }
  root.innerHTML = html;
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  try { window.print(); } catch { /* yazdırma bu görünümde engellenmiş olabilir */ }
  setTimeout(done, 1500);
}
