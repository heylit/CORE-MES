/**
 * Rol bazlı görünümler. Herkes aynı veriyi görür ama işine göre sadeleştirilmiş ekranlarla:
 *  - Satın alma (buyer): iş kutusu ve tam talep akışı
 *  - Talep eden (requester): taleplerini açar ve durumunu izler
 *  - Onaylayan (approver): onay bekleyen kararları tek sayfada inceler, onaylar ya da reddeder
 * Rol tarayıcıda saklanan bir görünüm tercihidir; yetki denetimi değildir.
 */
import type { PurchaseRequest, RequestItem } from "./tipler.ts";
import { COMMITTED, FLOW, OPEN, PRIO, stLabel } from "./constants.ts";
import { S, settings } from "./store.ts";
import { onaylayabilecekler } from "./onaylayan.ts";
import { approvalState, awardOrders, awardTotals, budgetUse, evaluate, lateBy, orderDue, panoSayilari, payText, requiredApprover, supName, teslimBasarimi } from "./calc.ts";
import { addDays, dayDiff, esc, fmtDate, fmtTs, money, nf0, numIn, parseNum, pct, todayStr } from "./util.ts";
import { empty, faizUyarisi, headerFacts, prioDot, reqChip, tabItems, tabLog, verdictReasons } from "./views.ts";
import { onayUyarilari, simge, teklifKartlariHTML } from "./onay-karsilastirma.ts";
import { nameOf } from "./store.ts";
import { geriDugmesiHTML } from "./ui.ts";
import { gelisGunu, kalemOzeti } from "./kimlik.ts";
import { siparisOnerisiHTML } from "./siparis-satirlari.ts";

export type Role = "buyer" | "requester" | "approver";
export const ROLES: Record<Role, string> = { buyer: "Satın alma", requester: "Talep eden", approver: "Onaylayan" };
// TMI: ekran seti, açılan TMI sayfasından gelir (kullanıcı kararı 5 ve 7); görünüm seçicisi yok, tarayıcıda saklanmaz.
let gecerliRol: Role = "buyer";
export function getRole(): Role { return gecerliRol; }
export function setRole(r: Role): void { gecerliRol = r; }
// Onayla/Reddet yalnız onay işlemi olan kişiye çizilir: sunucu işlemsiz onayı 403 ile reddeder (TMI Ç5).
let onayIslemi = false;
export function onaylayabilir(): boolean { return onayIslemi; }
export function setOnaylayabilir(v: boolean): void { onayIslemi = v; }

/* ================= satın alma: iş kutusu ================= */
export interface Job { r: PurchaseRequest; info: string; flag?: string; act: string; tab: string; ret?: boolean; due?: string }
export function jobs(): Record<string, Job[]> {
  const t = todayStr(), set = settings();
  const g: Record<string, Job[]> = { quotes: [], decide: [], approval: [], order: [], delivery: [], draft: [] };
  const list = Object.values(S.requests).sort((a, b) => (a.needDate || "9999").localeCompare(b.needDate || "9999"));
  for (const r of list) {
    const need = r.needDate ? dayDiff(t, r.needDate) : null;
    const needFlag = need !== null && OPEN.includes(r.status) ? (need < 0 ? `<span class="flag bad">ihtiyaç ${-need} gün geçti</span>` : need <= 5 ? `<span class="flag warn">ihtiyaca ${need} gün</span>` : "") : "";
    const nq = (r.quotes || []).length, rfqs = r.rfqs || [];
    const pending = rfqs.filter(x => !(r.quotes || []).some(q => q.supplierId === x.supplierId)).length;
    if (r.status === "draft") g.draft!.push({ r, info: `${(r.items || []).length} kalem`, flag: needFlag, act: "Teklif iste", tab: "rfq" });
    else if (r.status === "rfq") {
      const exp = (r.quotes || []).filter(q => q.validUntil && q.validUntil >= t && dayDiff(t, q.validUntil) <= 3).length;
      g.quotes!.push({ r, info: nq ? `${nq} teklif geldi, ${pending} bekleniyor` : `${rfqs.length} tedarikçiden istendi`, flag: exp ? `<span class="flag warn">${exp} teklifin süresi doluyor</span>` : needFlag, act: "Teklifleri gir", tab: "quotes" });
    }
    else if (r.status === "eval") {
      const aps = approvalState(r);
      if (aps.state === "rejected") { g.decide!.push({ r, info: `Reddedildi: ${aps.last?.note || "gerekçe yok"}`, flag: '<span class="flag bad">ret</span>', act: "Gözden geçir", tab: "compare", ret: true }); continue; }
      const ev = nq ? evaluate(r) : null, top = ev?.ranking[0];
      const exp = (r.quotes || []).filter(q => q.validUntil && q.validUntil >= t && dayDiff(t, q.validUntil) <= 3).length;
      g.decide!.push({ r, info: top ? `${nq} teklif, önerilen ${supName(top.q)} ${money(top.c.pvTRY, "TRY", 0)}` : `${nq} teklif`, flag: exp ? `<span class="flag warn">${exp} teklifin süresi doluyor</span>` : needFlag, act: "Karar ver", tab: "compare" });
    } else if (r.status === "approval") {
      const aps = approvalState(r), tt = awardTotals(r);
      if (aps.state === "approved") g.order!.push({ r, info: [tt ? money(tt.totalTRY, "TRY", 0) : "", aps.last?.name || "onaylandı"].filter(Boolean).join(", "), flag: needFlag, act: "Sipariş ver", tab: "decision" });
      else { const req = tt ? requiredApprover(tt.totalTRY) : null; g.approval!.push({ r, info: `${req ? req.role + " onayı bekleniyor" : "onay bekleniyor"}${tt ? ", " + money(tt.totalTRY, "TRY", 0) : ""}`, flag: aps.resubmitted ? '<span class="flag warn">yeniden gönderildi</span>' : "", act: "Aç", tab: "decision" }); }
    } else if (r.status === "ordered") {
      const os = awardOrders(r).filter(o => !o.deliveredDate);
      const dues = os.map(o => orderDue(o)).filter(Boolean).sort();
      const late = dues[0] ? dayDiff(t, dues[0]) : null;
      g.delivery!.push({ r, info: `${os.map(o => supName(o.q)).join(", ")}${dues[0] ? `, beklenen ${fmtDate(dues[0])}` : ""}`, flag: late !== null && late < 0 ? `<span class="flag bad">${-late} gün gecikti</span>` : late !== null && late <= 2 ? '<span class="flag warn">yakında</span>' : "", act: "Siparişi aç", tab: "decision", ...(dues[0] ? { due: dues[0] } : {}) });
    }
  }
  void set;
  // Geri gönderilen karar en üstte: onaylayan bekliyor. Teslimat beklenen güne göre: en yakın gelecek önde.
  g.decide!.sort((a, b) => Number(!!b.ret) - Number(!!a.ret));
  g.delivery!.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  return g;
}
/** İş kutusu sayısı (onayda bekleyenler hariç; onlar başkasının adımında) ve acil iş var mı */
export function jobCount(): { n: number; hot: boolean } {
  const g = jobs(); let n = 0, hot = false;
  for (const [k, list] of Object.entries(g)) { if (k === "approval") continue; n += list.length; if (list.some(j => (j.flag || "").includes("flag bad"))) hot = true; }
  return { n, hot };
}
// Sıra satın almacının elindeki işin aciliyetidir (2400): onaylı sipariş ve karar önce; teklif istenmemiş talep tedarik süresinin
// başladığı yerdir, teklif ve teslim beklemesinin önüne alınır. Onayda olan başkasının adımıdır, en sonda.
export const GROUPS: [string, string, string][] = [
  ["order", "Sipariş verilecekler", "Onaylandı, tedarikçiye sipariş geçilecek"],
  ["decide", "Karar verilecekler", "Teklifler toplandı ya da onaylayan geri gönderdi"],
  ["draft", "Satın almada", "Henüz teklif istenmedi"],
  ["quotes", "Teklif bekleyenler", "Tedarikçilerden cevap ya da teklif girişi bekleniyor"],
  ["delivery", "Teslimat bekleyenler", "Siparişi verildi, teslim alınacak"],
  ["approval", "Onayda", "Onaylayanın kararı bekleniyor"],
];
// Adımda bekleme son harekete göre (sunucu talep hareketi); hareket yoksa açılıştan. Bir günden az yazılmaz.
export function adimdaGun(r: PurchaseRequest, simdi = Date.now()): number | null {
  const son = Math.max(r.createdAt || 0, ...(r.log || []).map(h => h.at || 0));
  if (!son) return null;
  const gun = Math.floor((simdi - son) / 86400000);
  return gun >= 1 ? gun : null;
}
function jobRow(j: Job, primary: boolean): string {
  const gun = adimdaGun(j.r);
  const info = gun === null ? j.info : `${j.info} · ${nf0.format(gun)} gündür bu adımda`;
  return `<li><button class="job" data-act="open-at" data-id="${j.r.id}" data-tab="${j.tab}">
    <span class="no num">${esc(j.r.no)}</span>
    <span class="tt"><span class="ln">${prioDot(j.r.priority)}<b>${esc(j.r.title)}</b></span><span class="sub">${esc(info)}</span></span>
    <span class="fl">${j.flag || ""}</span>
    <span class="btn sm ${primary ? "primary" : ""}">${esc(j.act)}</span></button></li>`;
}
export function viewInbox(): string {
  const g = jobs();
  const total = GROUPS.reduce((n, [k]) => n + (k === "approval" ? 0 : g[k]!.length), 0);
  const now = new Date();
  const head = `<div class="phead"><div><h1>İş kutusu</h1><p class="lead">${now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}. ${total ? `Sizi bekleyen ${total} talep işi var.` : "Sizi bekleyen talep işi yok."}</p></div></div>`;
  const strip = panoSeridi();
  if (!Object.keys(S.requests).length) return head + strip + `<div class="panel">${empty("Henüz talep yok", "Talepler Taleplerim sayfasından açılır; satın alma burada teklif toplar, karar verir ve sipariş geçer.")}</div>`;
  const bugun = todayStr(), hafta = addDays(bugun, 7);
  const buHafta = g.delivery!.filter(j => j.due && j.due >= bugun && j.due <= hafta).length;
  const altYazi = (k: string, d: string) => (k === "delivery" && buHafta ? `${d}; bu hafta ${nf0.format(buHafta)} teslimat` : d);
  const groups = GROUPS.filter(([k]) => g[k]!.length).map(([k, l, d], gi) => `<section class="panel jobs"><div class="panel-h"><h2>${l}</h2><span class="cnt">${g[k]!.length}</span><span class="sub">${altYazi(k, d)}</span></div>
    <ul class="joblist">${g[k]!.map(j => jobRow(j, gi === 0)).join("")}</ul></section>`).join("");
  return head + strip + `<div class="inbox">${groups || `<div class="panel">${empty("Bekleyen iş yok", "Tüm talepler ya tamamlandı ya da başkasının adımında.", '<button class="btn" data-act="go" data-page="requests">Tüm talepler</button>')}</div>`}${teslimPaneli()}</div>`;
}
// Finans ana sayfası gibi: önce durumu söyleyen sayılar, altında yapılacaklar ve tedarikçilerin teslim başarımı.
function panoSeridi(): string {
  const p = panoSayilari();
  // Her kutu sayısının listesini açar (2400): durumlar Talepler süzgecine, harcama Raporlar'a gider.
  const kutu = (v: string, k: string, d: string, hedef: string) =>
    `<button type="button" data-act="pano-git" data-v="${hedef}"><span class="v">${v}</span><span class="k">${k}</span><span class="d">${d}</span></button>`;
  return `<div class="strip" data-sa-pano>
    ${kutu(nf0.format(p.onayBekleyen), "Onay bekleyen", "onaylayanın kararında", "approval")}
    ${kutu(nf0.format(p.acikTalep), "Açık talep", "siparişe dönmemiş", "open")}
    ${kutu(money(p.acikSiparisTutari, "TRY", 0), "Açık sipariş tutarı", `${nf0.format(p.acikSiparis)} sipariş, ${nf0.format(p.acikSiparisTalep)} talepte teslim bekliyor`, "ordered")}
    ${kutu(nf0.format(p.gecikenTeslim), "Geciken teslim", `termini geçmiş sipariş, ${nf0.format(p.gecikenTalep)} talepte`, "late")}
    ${kutu(money(p.buAyHarcama, "TRY", 0), "Bu ay harcama", "verilen siparişler, iskonto ve masraf dahil", "reports")}
  </div>`;
}
function teslimPaneli(): string {
  const liste = teslimBasarimi().slice(0, 6);
  const govde = liste.length
    ? `<ul class="joblist">${liste.map(t => `<li><button class="job" data-act="open-sup" data-id="${esc(t.supplierId)}"><span class="tt"><span class="ln"><b>${esc(t.ad)}</b></span><span class="sub">${nf0.format(t.zamaninda)} / ${nf0.format(t.teslim)} teslim zamanında${t.ortGecikme === null ? "" : `, geç gelenler ortalama ${nf0.format(t.ortGecikme)} gün`}</span></span><span class="fl num">${pct(t.oran)}</span></button></li>`).join("")}</ul>`
    : `<div class="panel-b muted">Henüz teslim alınmış sipariş yok.</div>`;
  return `<section class="panel jobs" data-sa-teslim><div class="panel-h"><h2>Tedarikçi teslim başarımı</h2><span class="sub">Teslim alınan siparişlerde termine uyum</span></div>${govde}</section>`;
}

/* ================= talep eden ================= */
export function viewRequesterHome(): string {
  const list = Object.values(S.requests).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const open = list.filter(r => OPEN.includes(r.status) || r.status === "ordered");
  const done = list.filter(r => r.status === "received" || r.status === "cancelled").slice(0, 8);
  const row = (r: PurchaseRequest) => `<li><button class="job" data-act="open" data-id="${r.id}"><span class="no num">${esc(r.no)}</span><span class="tt"><span class="ln">${prioDot(r.priority)}<b>${esc(r.title)}</b></span><span class="sub">${esc(requesterStatus(r))}</span></span><span class="fl">${reqChip(r)}</span></button></li>`;
  return `<div class="phead"><div><h1>Taleplerim</h1><p class="lead">İhtiyacınızı talep olarak açın; satın alma teklifleri toplayıp sonuçlandırır.</p></div><span class="spacer"></span><button class="btn primary" data-act="new-request">Yeni talep</button></div>
  <div class="inbox">
    <section class="panel jobs"><div class="panel-h"><h2>Süren talepler</h2><span class="cnt">${open.length}</span></div>${open.length ? `<ul class="joblist">${open.map(row).join("")}</ul>` : `<div class="panel-b muted">Süren talebiniz yok.</div>`}</section>
    ${done.length ? `<section class="panel jobs"><div class="panel-h"><h2>Tamamlananlar</h2></div><ul class="joblist">${done.map(row).join("")}</ul></section>` : ""}
  </div>`;
}
/** Talep eden için sade durum cümlesi */
function requesterStatus(r: PurchaseRequest): string {
  const nq = (r.quotes || []).length;
  if (r.status === "draft") return "Satın almada; teklif istenecek";
  if (r.status === "rfq") return nq ? `${nq} teklif geldi, diğerleri bekleniyor` : "Tedarikçilerden teklif bekleniyor";
  if (r.status === "eval") return `${nq} teklif değerlendiriliyor`;
  if (r.status === "approval") return approvalState(r).state === "approved" ? "Onaylandı, sipariş verilecek" : "Onay bekliyor";
  if (r.status === "ordered") { const d = awardOrders(r).map(o => orderDue(o)).filter(Boolean).sort().slice(-1)[0]; return `Sipariş verildi${d ? `, beklenen teslim ${fmtDate(d)}` : ""}`; }
  if (r.status === "received") return `Teslim alındı ${fmtDate(r.award?.deliveredDate)}`;
  return `İptal edildi${r.cancelReason ? ": " + r.cancelReason : ""}`;
}
export function viewRequestRequester(r: PurchaseRequest): string {
  const idx = FLOW.indexOf(r.status);
  const tt = r.award ? awardTotals(r) : null;
  const orders = awardOrders(r);
  return `${geriDugmesiHTML(r.no, "Taleplerime dön")}
  <div class="rhead"><div class="ttl"><div class="row" data-sa-y="19"><h1>${esc(r.title)}</h1>${reqChip(r)}</div>
    <p class="rmeta"><span>${esc(r.department || "")}</span><span>İhtiyaç ${fmtDate(r.needDate)}</span><span>${prioDot(r.priority)}${PRIO[r.priority || "normal"]}</span></p></div>
    <div class="ract">${r.status === "draft" ? '<button class="btn" data-act="req-edit">Talebi düzenle</button>' : ""}${OPEN.includes(r.status) ? '<button class="btn ghost danger" data-act="req-cancel">İptal et</button>' : ""}</div></div>
  <div class="panel tl"><ol class="timeline">${FLOW.map((k, i) => `<li class="${r.status === "cancelled" ? "" : i < idx ? "done" : i === idx ? "cur" : ""}"><b>${stLabel(k)}</b>${i === idx ? `<span>${esc(requesterStatus(r))}</span>` : ""}</li>`).join("")}</ol></div>
  ${tt ? `<section class="panel"><div class="panel-h"><h2>Sonuç</h2></div><div class="panel-b"><p>${orders.map(o => `<b>${esc(supName(o.q))}</b>: ${o.items.map(it => esc(it.name)).join(", ")}${orderDue(o) ? `, beklenen teslim ${fmtDate(orderDue(o))}` : ""}${o.deliveredDate ? `, teslim alındı ${fmtDate(o.deliveredDate)}` : ""}`).join("<br>")}</p><p class="small muted" data-sa-y="20">Toplam ${money(tt.totalTRY, "TRY", 0)} (KDV hariç)</p></div></section>` : ""}
  ${tabItems(r, true)}
  <details class="adv"><summary>Hareket geçmişi (${(r.log || []).length})</summary>${tabLog(r)}</details>`;
}

/* ================= onaylayan ================= */
function pendingApprovals(): PurchaseRequest[] {
  // Önce acil, sonra ihtiyaç tarihi (tarihsiz sonda).
  const acil = (r: PurchaseRequest) => (r.priority === "urgent" ? 0 : 1);
  return Object.values(S.requests).filter(r => r.status === "approval" && (approvalState(r).state === "pending" || !!r.siparisOnerisi))
    .sort((a, b) => acil(a) - acil(b) || (a.needDate || "9999").localeCompare(b.needDate || "9999"));
}
export const pendingApprovalCount = (): number => pendingApprovals().length;
/** Kararın onaya gönderildiği an: hareket geçmişindeki son "onaya gönderildi" kaydı, yoksa karar günü; ikisi de yoksa boş (V2). */
export function onayaGidis(r: PurchaseRequest): number | null {
  const l = [...(r.log || [])].reverse().find(x => /onaya gönderildi/i.test(x.t));
  if (l) return l.at;
  const g = r.award?.decidedAt ? Date.parse(`${r.award.decidedAt}T00:00:00`) : NaN;
  return Number.isNaN(g) ? null : g;
}
export function beklemeMetni(an: number | null, simdi = Date.now()): string {
  if (an === null) return "–";
  const saat = Math.max(0, Math.floor((simdi - an) / 3600000));
  return saat < 48 ? `${saat} saat` : `${Math.floor(saat / 24)} gün`;
}
/** Listede dikkat isteyenler: önerilen seçilmedi, kararın termini ihtiyacı kaçırır, yeniden gönderildi, bütçe aşılır. */
export function onayDikkatleri(r: PurchaseRequest): string[] {
  const tt = awardTotals(r); if (!tt) return [];
  const top = tt.ev.ranking[0], fl: string[] = [];
  if (r.award?.mode === "single" && top && r.award.quoteId !== top.q.id) fl.push(`<span class="flag warn">${simge("flag")} önerilen seçilmedi</span>`);
  const gec = awardOrders(r).map(o => lateBy(r, o.q) ?? 0).reduce((m, v) => Math.max(m, v), 0);
  if (gec > 0) fl.push(`<span class="flag bad">${simge("alert")} ihtiyacı ${gec} gün kaçırır</span>`);
  if (approvalState(r).resubmitted) fl.push('<span class="flag warn">yeniden gönderildi</span>');
  const bu = r.department ? budgetUse(r.department, todayStr().slice(0, 4)) : null;
  if (bu && bu.budget && bu.used + tt.totalTRY > bu.budget) fl.push(`<span class="flag bad">${simge("lira")} bütçe aşılır</span>`);
  return fl;
}
// 3574-1: onay listesinde sipariş onayı karar onayından ayrı sayılır.
function siparisSayisiMetni(list: readonly PurchaseRequest[]): string {
  const siparis = list.filter((r) => r.siparisOnerisi).length, karar = list.length - siparis;
  return [karar ? `${karar} karar` : "", siparis ? `${siparis} sipariş` : ""].filter(Boolean).join(" ve ");
}
export function viewApprovals(): string {
  const list = pendingApprovals();
  // "Son kararlarınız" yalnız bu kişinin onay ve retleridir; başkasının kararı listeye girmez.
  const ben = S.me?.id ?? null;
  const benimkiler = Object.values(S.requests).flatMap(r => (r.award?.approvals || []).filter(a => ben !== null && a.by === ben).map(a => ({ r, a })));
  const recent = Object.values(S.requests).flatMap(r => (r.award?.approvals || []).filter(a => ben !== null && a.by === ben).slice(-1).map(a => ({ r, a }))).sort((x, y) => y.a.at - x.a.at).slice(0, 6);
  // 3466-2: bekleyenler tablo; üstte dört özet sayı.
  const satirlar = list.map(r => ({ r, tt: awardTotals(r), an: onayaGidis(r), dikkat: onayDikkatleri(r) }));
  const toplam = satirlar.reduce((t, x) => t + (x.tt ? x.tt.totalTRY : 0), 0);
  const enEski = satirlar.reduce<number | null>((m, x) => (x.an === null ? m : m === null ? x.an : Math.min(m, x.an)), null);
  const ayBasi = Date.parse(`${todayStr().slice(0, 7)}-01T00:00:00`);
  const buAy = benimkiler.filter(x => x.a.at >= ayBasi);
  const ozet = (simgeAd: Parameters<typeof simge>[0], k: string, v: string, d: string) => `<section class="panel"><div class="panel-b sa-oy-ozet"><span class="xs muted">${simge(simgeAd)} ${k}</span><b class="num">${v}</b><span class="xs muted">${d}</span></div></section>`;
  const karar = (r: PurchaseRequest, tt: ReturnType<typeof awardTotals>) => {
    if (!tt) return "–";
    if (r.award?.mode === "split") { const o = awardOrders(r); return `${o.length} tedarikçiye bölündü<span class="sub">${esc(o.map(x => supName(x.q)).join(", "))}</span>`; }
    const i = tt.ev.ranking.findIndex(x => x.q.id === r.award?.quoteId);
    return `${tt.x ? esc(supName(tt.x.q)) : "–"}<span class="sub">${i === 0 ? "önerilen" : i > 0 ? `${i + 1}. sıradaki teklif` : ""}</span>`;
  };
  return `<div class="phead"><div><h1>Onay bekleyenler</h1><p class="lead">${list.length ? `${siparisSayisiMetni(list)} onayınızı bekliyor. Toplam ${money(toplam, "TRY", 0)} (KDV hariç).` : "Onay bekleyen karar yok."}</p></div></div>
  <div class="sa-oy-ozetler">
    ${ozet("clock", "Bekleyen", String(list.length), enEski !== null ? `en eskisi ${beklemeMetni(enEski)}` : "–")}
    ${ozet("lira", "Toplam tutar", money(toplam, "TRY", 0), "KDV hariç")}
    ${ozet("alert", "Dikkat isteyen", String(satirlar.filter(x => x.dikkat.length).length), "önerilen seçilmedi, ihtiyaç kaçıyor, bütçe")}
    ${ozet("check", "Bu ay kararlarınız", String(buAy.filter(x => x.a.decision === "approved").length), `${buAy.filter(x => x.a.decision === "rejected").length} ret`)}
  </div>
  <div class="inbox">
    <section class="panel jobs"><div class="panel-h"><h2>Bekleyenler</h2><span class="cnt">${list.length}</span></div>
    ${list.length ? `<div class="tw"><table class="rt sa-oy-liste"><thead><tr><th>Talep</th><th>Karar</th><th class="r">Tutar</th><th>Gereken onay</th><th>İhtiyaç</th><th>Bekliyor</th><th>Dikkat</th><th><span class="sr-only">Aç</span></th></tr></thead><tbody>
    ${satirlar.map(({ r, tt, an, dikkat }) => { const req = tt ? requiredApprover(tt.totalTRY) : null; return `<tr class="click" data-act="open" data-id="${r.id}"><td class="lead"><span class="no num">${esc(r.no)}</span> ${prioDot(r.priority)}<b>${esc(r.title)}</b>${r.siparisOnerisi ? ' <span class="flag info">Sipariş onayı</span>' : ""}<span class="sub">${esc([r.department, `${(r.items || []).length} kalem`, `${(r.quotes || []).length} teklif`].filter(Boolean).join(", "))}${tt ? `, ${esc(tt.x ? supName(tt.x.q) : "kalem bazlı")}` : ""}${req ? `, ${esc(req.role)} onayı` : ""}</span></td>
      <td data-l="Karar">${karar(r, tt)}</td><td class="r num" data-l="Tutar"><b>${tt ? money(tt.totalTRY, "TRY", 0) : "–"}</b></td><td data-l="Gereken onay">${esc(req?.role || "–")}</td><td class="num" data-l="İhtiyaç">${r.needDate ? fmtDate(r.needDate) : "–"}</td><td class="num sa-oy-nowrap" data-l="Bekliyor">${beklemeMetni(an)}</td>
      <td data-l="Dikkat">${dikkat.length ? `<div class="flags">${dikkat.join("")}</div>` : ""}</td><td class="acts"><span class="btn sm primary">İncele</span></td></tr>`; }).join("")}
    </tbody></table></div>` : `<div class="panel-b muted">Şu an bekleyen bir karar yok.</div>`}</section>
    ${recent.length ? `<section class="panel jobs"><div class="panel-h"><h2>Son kararlarınız</h2></div><ul class="joblist">${recent.map(({ r, a }) => `<li><button class="job" data-act="open" data-id="${r.id}"><span class="no num sa-oy-nowrap">${esc(r.no)}</span><span class="tt"><b>${esc(r.title)}</b><span class="sub">${fmtTs(a.at)}, ${esc(a.name || nameOf(a.by))}${a.note ? ": " + esc(a.note) : ""}</span></span><span class="fl">${a.decision === "approved" ? '<span class="flag good">onaylandı</span>' : '<span class="flag bad">reddedildi</span>'}</span></button></li>`).join("")}</ul></section>` : ""}
  </div>`;
}
export function viewApproval(r: PurchaseRequest): string {
  const tt = r.award ? awardTotals(r) : null;
  const aps = approvalState(r);
  const back = geriDugmesiHTML(r.no, "Onay bekleyenlere dön");
  // 3442-3: onaylayan kaydırınca da talebin kimliği (no, ad, geliş, ihtiyaç, kalemler) üstte kalır; yazılar soluk değil.
  const gelis = gelisGunu(r);
  const head = `<div class="rhead sa-onay-kimlik"><div class="ttl"><div class="row" data-sa-y="19"><span class="sa-kimlik-no">${esc(r.no)}</span><h1>${esc(r.title)}</h1>${reqChip(r)}</div>
    <p class="rmeta">${gelis ? `<span>Geliş ${fmtDate(gelis)}</span>` : ""}<span>İhtiyaç ${fmtDate(r.needDate)}</span><span>${esc(kalemOzeti(r))}</span>${r.department ? `<span>${esc(r.department)}</span>` : ""}${r.requester ? `<span>Talep eden ${esc(r.requester)}</span>` : ""}${headerFacts(r).map(f => `<span class="fact">${f}</span>`).join("")}</p></div>
    <div class="ract">${COMMITTED.includes(r.status) && r.award ? '<button class="btn" data-act="order-item-change">Siparişteki kalemi değiştir</button>' : ""}<button class="btn" data-act="approval-form">Onay formu</button></div></div>`;
  if (!r.award || !tt) return back + head + `<div class="panel">${empty("Bu talepte henüz karar yok", "Satın alma karar verip onaya gönderdiğinde burada görünür.")}</div>`;
  const ev = tt.ev, top = ev.ranking[0];
  const req = requiredApprover(tt.totalTRY);
  const bu = r.department ? budgetUse(r.department, todayStr().slice(0, 4)) : null;
  const orders = awardOrders(r);
  const chosenIsTop = r.award.mode === "single" && top && r.award.quoteId === top.q.id;
  const status = aps.state === "approved" ? '<div class="nextline done"><span class="nd"></span><span class="nt"><b>Onaylandı</b> <span>' + esc(aps.last?.name || "") + ", " + fmtTs(aps.last?.at ?? 0) + "</span></span></div>"
    : aps.state === "rejected" ? '<div class="nextline bad"><span class="nd"></span><span class="nt"><b>Reddedildi</b> <span>' + esc(aps.last?.note || "") + "</span></span></div>"
    : r.status !== "approval" ? `<div class="nextline"><span class="nd"></span><span class="nt"><b>${esc(stLabel(r.status))}</b></span></div>` : "";
  // Yeniden gönderilen kararda önceki ret notu ve retten sonra talepte yapılanlar (hareket geçmişinden) en üstte durur.
  const ret = aps.resubmitted ? aps.last : null;
  const sonra = ret ? (r.log || []).filter(l => l.at > ret.at) : [];
  const yeniden = ret ? `<div class="callout sa-yeniden" role="note"><b>Yeniden gönderildi.</b> Önceki ret: ${esc(ret.name || nameOf(ret.by))}, ${fmtTs(ret.at)}${ret.note ? `: “${esc(ret.note)}”` : ""}
    ${sonra.length ? `<ul class="small">${sonra.slice(-8).map(l => `<li>${fmtTs(l.at)}: ${esc(l.t)}</li>`).join("")}</ul>` : '<p class="small muted">Retten sonra talepte kayıtlı değişiklik yok.</p>'}</div>` : "";
  // Bölünmüş kalem aynı adla birden çok satırdadır (3442-5): o adda miktar da yazılır, tedarikçiler arası pay görünsün.
  const adSayisi = new Map<string, number>(); for (const it of r.items || []) adSayisi.set(it.name, (adSayisi.get(it.name) ?? 0) + 1);
  const kalemAdi = (it: RequestItem) => ((adSayisi.get(it.name) ?? 0) > 1 ? `${it.name} ${numIn(it.qty ?? 0)} ${it.unit ?? ""}`.trim() : it.name);
  // 3466-1 (karar C): teklifler tedarikçi kartları olarak yan yana; onay kutusu yanda sabit, telefonda Onayla/Reddet altta.
  const secilen = new Set(orders.map(o => o.qid));
  const butceYuzde = bu && bu.budget ? (bu.used + (r.status === "approval" ? tt.totalTRY : 0)) / bu.budget * 100 : null;
  const uyarilar = onayUyarilari(r, ev, secilen, butceYuzde);
  const bekliyor = aps.state === "pending" && r.status === "approval";
  const disarida = ev.all.filter(x => !ev.elig.includes(x));
  const onaylar = r.award.approvals || [];
  const yan = `<aside class="sa-oy-yan"><section class="panel appr-act sa-oy-onay"><div class="panel-h"><h2>Onayınız</h2><span class="spacer"></span>${bekliyor ? '<span class="flag warn">bekliyor</span>' : aps.state === "approved" ? '<span class="flag good">onaylandı</span>' : aps.state === "rejected" ? '<span class="flag bad">reddedildi</span>' : ""}</div><div class="panel-b">
    <div><div class="xs muted">Tutar (KDV hariç)</div><div class="sa-oy-tutar num">${money(tt.totalTRY, "TRY", 0)}</div><div class="xs muted">net bugünkü maliyet ${money(tt.pvTRY, "TRY", 0)}</div></div>
    <div><div class="xs muted">Gereken onay</div><div class="v" data-sa-y="22"><b>${esc(req?.role || "Limit tanımlı değil")}</b></div>${req ? `<div class="xs muted sa-onaylayan">${esc(onaylayabilecekler(settings(), req))}</div>` : ""}</div>
    <div><div class="xs muted">${esc(r.department || "Birim")} bütçesi</div><div>${butceYuzde !== null ? pct(butceYuzde) : "–"}</div><div class="xs muted">${butceYuzde !== null ? "bu alımla birlikte" : "bütçe tanımlı değil"}</div></div>
    ${onaylar.length ? `<ul class="sa-oy-gecmis">${onaylar.map(x => `<li>${simge(x.decision === "approved" ? "check" : "x")} <span><b>${x.decision === "approved" ? "Onaylandı" : "Reddedildi"}</b>, ${esc(x.name || nameOf(x.by))}, ${fmtTs(x.at)}${x.note ? `: ${esc(x.note)}` : ""}</span></li>`).join("")}</ul>` : ""}
    ${bekliyor ? `<label class="f"><span>Not <small>— ret için zorunlu</small></span><input type="text" id="ap-note" placeholder="Örn. vade kısa, tekrar pazarlık edin" data-onay-eylemi="reddet"></label>
    <div class="row sa-oy-dugmeler" data-sa-y="14"><button class="btn good" id="ap-onayla" data-act="approve" data-onay-eylemi="onayla">${simge("check")} Onayla</button><button class="btn bad" data-act="reject">Reddet</button></div>` : ""}
  </div></section></aside>`;
  const alt = bekliyor ? `<div class="sa-oy-alt" role="group" aria-label="Onay"><button class="btn good" data-act="approve">${simge("check")} Onayla</button><button class="btn bad" data-act="ret-penceresi">Reddet</button></div>` : "";
  // 3574-1: onaya düşen sipariş (onaylı kararı aşan ya da yeni firmalı) aynı sayfada onaylanır.
  const oneri = r.siparisOnerisi ? siparisOnerisiHTML(r, onaylayabilir(), r.siparisOnerisi.onerenId === S.me?.id) : "";
  return back + head + oneri + status + yeniden + (uyarilar.length ? `<div class="flags sa-oy-uyari" role="note">${uyarilar.join("")}</div>` : "") + `
  <div class="sa-oy">
    <div class="stack sa-oy-ana">
      <section class="panel appr-main"><div class="panel-b">
        <div class="vk">Satın almanın kararı</div>
        <h2 data-sa-y="21">${simge("user")} ${r.award.mode === "split" ? `${orders.length} tedarikçiye bölünmüş sipariş` : esc(supName(tt.x!.q))}</h2>
        <div class="appr-amt"><b class="num">${money(tt.totalTRY, "TRY", 0)}</b><span class="muted">KDV hariç, net bugünkü maliyet ${money(tt.pvTRY, "TRY", 0)}</span></div>
        <ul class="appr-why">${orders.map(o => `<li><b>${esc(supName(o.q))}</b>: ${o.items.map(it => esc(kalemAdi(it))).join(", ")}; ${esc(payText(o.q))}, termin ${parseNum(o.q.leadDays) ?? "?"} gün</li>`).join("")}
          ${chosenIsTop ? verdictReasons(r, ev).map(w => `<li>${esc(w)}</li>`).join("") : ""}</ul>
        ${r.award.reason ? `<div class="note"><span class="xs muted">Gerekçe</span><br>${esc(r.award.reason)}</div>` : !chosenIsTop && r.award.mode === "single" ? '<div class="note small">Önerilen teklif seçilmedi; gerekçe yazılmamış.</div>' : ""}
      </div></section>
      <section class="panel sa-oy-teklifler"><div class="panel-h"><h2>Teklifler yan yana</h2><span class="sub">${ev.ranking.length} teklif, karar ilk sırada</span></div><div class="panel-b stack">
        ${teklifKartlariHTML(r, ev, secilen, tt.pvTRY)}
        ${disarida.length ? `<p class="small muted">Değerlendirme dışı: ${disarida.map(x => esc(supName(x.q)) + (x.q.compliant === false ? " (teknik uygun değil)" : " (fiyat girilmemiş)")).join(", ")}</p>` : ""}
        ${faizUyarisi(ev.elig.filter(x => x.c.faizYok).map(x => x.q.currency))}
        <p class="small muted">${simge("target")} satırın en iyi değeri. Tutarlar KDV hariç. Net bugünkü maliyet vade etkisi dahil, ${r.status === "approval" ? "güncel" : "sipariş günü"} kurla TL.${r.award.mode === "split" ? " Bölünmüş kararda kartlar tekliflerin tamamıdır; siparişlere düşen tutar Onay formundadır." : ""}</p>
      </div></section>
      <details class="adv"><summary>Kalemler ve hareket geçmişi</summary>${tabItems(r, true)}${tabLog(r)}</details>
    </div>
    ${yan}
  </div>${alt}`;
}
