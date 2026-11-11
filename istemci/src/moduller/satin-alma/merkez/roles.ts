/**
 * Rol bazlı görünümler. Herkes aynı veriyi görür ama işine göre sadeleştirilmiş ekranlarla:
 *  - Satın alma (buyer): iş kutusu ve tam talep akışı
 *  - Talep eden (requester): taleplerini açar ve durumunu izler
 *  - Onaylayan (approver): onay bekleyen kararları tek sayfada inceler, onaylar ya da reddeder
 * Rol tarayıcıda saklanan bir görünüm tercihidir; yetki denetimi değildir.
 */
import type { PurchaseRequest } from "./tipler.ts";
import { COMMITTED, FLOW, OPEN, PRIO, stLabel } from "./constants.ts";
import { S, settings } from "./store.ts";
import { approvalState, awardOrders, awardTotals, evaluate, orderDue, panoSayilari, payText, requiredApprover, supName, teslimBasarimi } from "./calc.ts";
import { addDays, dayDiff, esc, fmtDate, fmtTs, money, nf0, parseNum, pct, todayStr } from "./util.ts";
import { butceHTML } from "./butce.ts";
import { empty, headerFacts, prioDot, reqChip, tabItems, tabLog, verdictReasons } from "./views.ts";
import { nameOf } from "./store.ts";
import { geriDugmesiHTML } from "./ui.ts";

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
    if (r.status === "draft") g.draft!.push({ r, info: `${(r.items || []).length} kalem`, flag: needFlag, act: "Teklif iste", tab: "quotes" });
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
  return Object.values(S.requests).filter(r => r.status === "approval" && approvalState(r).state === "pending")
    .sort((a, b) => acil(a) - acil(b) || (a.needDate || "9999").localeCompare(b.needDate || "9999"));
}
export const pendingApprovalCount = (): number => pendingApprovals().length;
export function viewApprovals(): string {
  const list = pendingApprovals();
  // "Son kararlarınız" yalnız bu kişinin onay ve retleridir; başkasının kararı listeye girmez.
  const ben = S.me?.id ?? null;
  const recent = Object.values(S.requests).flatMap(r => (r.award?.approvals || []).filter(a => ben !== null && a.by === ben).slice(-1).map(a => ({ r, a }))).sort((x, y) => y.a.at - x.a.at).slice(0, 6);
  return `<div class="phead"><div><h1>Onay bekleyenler</h1><p class="lead">${list.length ? `${list.length} karar onayınızı bekliyor.` : "Onay bekleyen karar yok."}</p></div></div>
  <div class="inbox">
    <section class="panel jobs"><div class="panel-h"><h2>Bekleyenler</h2><span class="cnt">${list.length}</span></div>
    ${list.length ? `<ul class="joblist">${list.map(r => { const tt = awardTotals(r); const req = tt ? requiredApprover(tt.totalTRY) : null; return `<li><button class="job" data-act="open" data-id="${r.id}"><span class="no num">${esc(r.no)}</span><span class="tt"><span class="ln">${prioDot(r.priority)}<b>${esc(r.title)}</b></span><span class="sub">${esc([r.department, tt ? (tt.x ? supName(tt.x.q) : "kalem bazlı") : "", req ? `${req.role} onayı` : ""].filter(Boolean).join(", "))}${approvalState(r).resubmitted ? ' <span class="flag warn">yeniden gönderildi</span>' : ""}</span></span><span class="fl num"><b>${tt ? money(tt.totalTRY, "TRY", 0) : ""}</b></span><span class="btn sm primary">İncele</span></button></li>`; }).join("")}</ul>` : `<div class="panel-b muted">Şu an bekleyen bir karar yok.</div>`}</section>
    ${recent.length ? `<section class="panel jobs"><div class="panel-h"><h2>Son kararlarınız</h2></div><ul class="joblist">${recent.map(({ r, a }) => `<li><button class="job" data-act="open" data-id="${r.id}"><span class="no num">${esc(r.no)}</span><span class="tt"><b>${esc(r.title)}</b><span class="sub">${fmtTs(a.at)}, ${esc(a.name || nameOf(a.by))}${a.note ? ": " + esc(a.note) : ""}</span></span><span class="fl">${a.decision === "approved" ? '<span class="flag good">onaylandı</span>' : '<span class="flag bad">reddedildi</span>'}</span></button></li>`).join("")}</ul></section>` : ""}
  </div>`;
}
export function viewApproval(r: PurchaseRequest): string {
  const tt = r.award ? awardTotals(r) : null;
  const aps = approvalState(r);
  const back = geriDugmesiHTML(r.no, "Onay bekleyenlere dön");
  const head = `<div class="rhead"><div class="ttl"><div class="row" data-sa-y="19"><h1>${esc(r.title)}</h1>${reqChip(r)}</div>
    <p class="rmeta"><span>${esc(r.department || "")}</span>${r.requester ? `<span>Talep eden ${esc(r.requester)}</span>` : ""}<span>İhtiyaç ${fmtDate(r.needDate)}</span>${headerFacts(r).map(f => `<span class="fact">${f}</span>`).join("")}</p></div>
    <div class="ract">${COMMITTED.includes(r.status) && r.award ? '<button class="btn" data-act="order-item-change">Siparişteki kalemi değiştir</button>' : ""}<button class="btn" data-act="approval-form">Onay formu</button></div></div>`;
  if (!r.award || !tt) return back + head + `<div class="panel">${empty("Bu talepte henüz karar yok", "Satın alma karar verip onaya gönderdiğinde burada görünür.")}</div>`;
  const ev = tt.ev, top = ev.ranking[0];
  const req = requiredApprover(tt.totalTRY);
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
  return back + head + status + yeniden + `
  <div class="appr">
    <section class="panel appr-main"><div class="panel-b">
      <div class="vk">Satın almanın kararı</div>
      <h2 data-sa-y="21">${r.award.mode === "split" ? `${orders.length} tedarikçiye bölünmüş sipariş` : esc(supName(tt.x!.q))}</h2>
      <div class="appr-amt"><b class="num">${money(tt.totalTRY, "TRY", 0)}</b><span class="muted">KDV hariç, net bugünkü maliyet ${money(tt.pvTRY, "TRY", 0)}</span></div>
      <ul class="appr-why">${orders.map(o => `<li><b>${esc(supName(o.q))}</b>: ${o.items.map(it => esc(it.name)).join(", ")}; ${esc(payText(o.q))}, termin ${parseNum(o.q.leadDays) ?? "?"} gün</li>`).join("")}
        ${chosenIsTop ? verdictReasons(r, ev).map(w => `<li>${esc(w)}</li>`).join("") : ""}</ul>
      ${r.award.reason ? `<div class="note"><span class="xs muted">Gerekçe</span><br>${esc(r.award.reason)}</div>` : !chosenIsTop && r.award.mode === "single" ? '<div class="note small">Önerilen teklif seçilmedi; gerekçe yazılmamış.</div>' : ""}
    </div></section>
    <section class="panel"><div class="panel-b kv">
      <div><div class="k">Gereken onay</div><div class="v" data-sa-y="22">${esc(req?.role || "–")}</div></div>
      ${butceHTML(r, "onay")}
      <div><div class="k">Değerlendirilen</div><div class="v">${ev.elig.length} teklif</div><div class="d">${(r.rfqs || []).length} tedarikçiden istendi</div></div>
    </div></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Değerlendirilen teklifler</h2></div><div class="tw"><table class="rt"><thead><tr><th>#</th><th>Tedarikçi</th><th class="r">Net maliyet</th><th>Ödeme</th><th class="r">Termin</th><th class="r">Puan</th></tr></thead><tbody>
    ${ev.ranking.map((x, i) => { const chosen = orders.some(o => o.qid === x.q.id); return `<tr class="${chosen ? "chosen" : ""}"><td>${i + 1}</td><td class="lead"><b>${esc(supName(x.q))}</b>${chosen ? ' <span class="flag good">seçilen</span>' : ""}${x.c.covered < (r.items || []).length ? ' <span class="flag warn">eksik kalemli</span>' : ""}</td><td class="r num">${money(x.c.pvTRY, "TRY", 0)}</td><td>${esc(payText(x.q))}</td><td class="r num">${parseNum(x.q.leadDays) ?? "–"} gün</td><td class="r num">${nf0.format(x.score)}</td></tr>`; }).join("")}
  </tbody></table></div></section>
  ${aps.state === "pending" && r.status === "approval" ? `<section class="panel appr-act"><div class="panel-b">
    <label class="f"><span>Not <small>— ret için zorunlu</small></span><input type="text" id="ap-note" placeholder="Örn. vade kısa, tekrar pazarlık edin"></label>
    <div class="row" data-sa-y="14"><button class="btn good" data-act="approve">Onayla</button><button class="btn bad" data-act="reject">Reddet</button></div>
  </div></section>` : ""}
  <details class="adv"><summary>Kalemler ve hareket geçmişi</summary>${tabItems(r, true)}${tabLog(r)}</details>`;
}
