import type { SiparisLogo } from "#paylasilan/sozlesme/satin-alma.ts";
import type { Award, ExcessLine, Priority, PurchaseRequest, Quality, RequestStatus, Weights } from "./tipler.ts";
import { CRIT, FLOW, OPEN, COMMITTED, PRIO, QUALITY, stLabel } from "./constants.ts";
import { S, V, memo, nameOf, settings, type Page } from "./store.ts";
import {
  awardTotals, budgetUse, evaluate, lateBy, matOf, matStats, payText, priceHistory, quoteCalc, requiredApprover,
  savingsOf, spendLines, supName, supplierStats, validity, vsLast, fiyatUyarisi, type EvalRow, type Evaluation, type PriceEntry,
  awardOrders, orderDue, itemCost, planCost, type OrderInfo,
  approvalState, durumEtiketi, siparisEtiketi,
} from "./calc.ts";
import {
  $, $$, addDays, clamp, dayDiff, deltaHTML, esc, fmtDate, fmtTs, isNum, money, MONTHS, nf0, nf2, nfx, norm, numIn,
  pad, parseNum, pct, short, sum, todayStr, type FormEl,
} from "./util.ts";
import { viewMaterial, viewMaterials, viewReports, viewSettings, viewSupplier, viewSuppliers } from "./memory.ts";
import { tabSim } from "./sim.ts";
import { siparisTakibiHTML } from "./takip.ts";
import { inlineBulkHTML } from "./ui.ts";
import { getRole, viewApproval, viewApprovals, viewInbox, viewRequesterHome, viewRequestRequester } from "./roles.ts";
/* ================= render çekirdeği ================= */
export function render(): void {
  renderNav();
  const m = $("#main");
  const ae = document.activeElement as FormEl | null;
  const keep = ae && m.contains(ae) && ae.id ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  if (!S.ready) { m.innerHTML = '<p class="loading">Veriler yükleniyor…</p>'; return; }
  const P: Record<Page, () => string> = { dash: viewDash, requests: viewRequests, request: viewRequest, materials: viewMaterials, material: viewMaterial, suppliers: viewSuppliers, supplier: viewSupplier, reports: viewReports, settings: viewSettings };
  const role = getRole();
  if (V.page === "dash") P.dash = role === "approver" ? viewApprovals : role === "requester" ? viewRequesterHome : viewInbox;
  m.innerHTML = (P[V.page] ?? viewDash)();
  if (keep) { const el = document.getElementById(keep.id) as FormEl | null; if (el) { el.focus(); try { if (keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch { /* seçim desteklenmiyor */ } } }
  afterRender();
}
export function labelTables(root: ParentNode = document): void {
  $$<HTMLTableElement>("table.rt", root).forEach(t => {
    const heads = $$<HTMLElement>("thead th", t).map(th => (th.textContent ?? "").trim());
    $$<HTMLElement>("tbody tr", t).forEach(tr => $$<HTMLElement>(":scope > td", tr).forEach((td, i) => { if (heads[i] && !td.classList.contains("lead") && !td.classList.contains("acts")) td.setAttribute("data-l", heads[i]); }));
  });
}
function drawCharts(): void { $$<HTMLElement>("[data-chart]").forEach(el => { el.innerHTML = priceChartSvg(priceHistory(el.dataset.chart!), el.clientWidth || 600); }); }
let rsT: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(drawCharts, 150); });
const AFTER: (() => void)[] = [];
/** Çizimden sonra çalışacak işler (ör. satır içi teklif tablosunun canlı toplamları) */
export function onAfterRender(fn: () => void): void { AFTER.push(fn); }
function afterRender(): void {
  labelTables($("#main"));
  drawCharts();
  AFTER.forEach(fn => fn());
  if ($("#split-sum")) updateSplitSum();
}

// TMI: ikinci menüyü kabuk çizer (şartname: modül kendi menüsünü çizmez); prototipin menüsü çizilmez.
export function renderNav(): void { /* kabukta */ }
export const stChip = (k: RequestStatus): string => `<span class="st ${k}">${esc(stLabel(k))}</span>`;
export const reqChip = (r: PurchaseRequest): string => `<span class="st ${r.status}">${esc(durumEtiketi(r))}</span>`;
export const prioDot = (p?: Priority): string => `<span class="prio ${p || "normal"}" title="${PRIO[p || "normal"]} öncelik"></span>`;
export const stars = (v: unknown): string => { const n = clamp(Math.round(parseNum(v) || 3), 1, 5); return `<span class="stars" aria-label="${n} / 5">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`; };
export const supLink = (id: string | null | undefined, name?: string): string => id && S.suppliers[id] ? `<button class="btn ghost sm" data-sa-y="35" data-act="open-sup" data-id="${id}">${esc(name || S.suppliers[id].name)}</button>` : esc(name || "–");
export const matLink = (id: string | null | undefined, name?: string): string => id && S.materials[id] ? `<button class="btn ghost sm" data-sa-y="36" data-act="open-mat" data-id="${id}">${esc(name || S.materials[id].name)}</button>` : esc(name || "–");
export function empty(title: string, text: string, actions = ""): string { return `<div class="empty"><h3>${title}</h3><p>${text}</p>${actions ? `<div class="row">${actions}</div>` : ""}</div>`; }

/* ================= uyarılar ================= */
interface Alert { sev: "h" | "m" | "l"; r: PurchaseRequest; t: string; a: string }
export function alerts(): Alert[] {
  return memo("alerts", () => {
    const set = settings(), out: Alert[] = [], t = todayStr();
    Object.values(S.requests).forEach(r => {
      if (r.status === "cancelled" || r.status === "received") return;
      const ev = (r.quotes || []).length ? evaluate(r) : { elig: [] as EvalRow[] };
      if (["draft", "rfq", "eval"].includes(r.status) && (r.items || []).length && ev.elig.length < set.minQuotes)
        out.push({ sev: ev.elig.length ? "m" : (r.priority === "urgent" ? "h" : "m"), r, t: `${ev.elig.length} geçerli teklif var; en az ${set.minQuotes} önerilir.`, a: (r.rfqs || []).length ? "Hatırlat" : "Teklif iste" });
      if (OPEN.includes(r.status)) (r.quotes || []).forEach(q => {
        const v = validity(q); if (v === null) return;
        if (v < 0) out.push({ sev: "m", r, t: `${supName(q)} teklifinin geçerliliği ${fmtDate(q.validUntil)} tarihinde bitti; fiyat teyidi alın.`, a: "Teyit iste" });
        else if (v <= 3) out.push({ sev: "h", r, t: `${supName(q)} teklifinin geçerliliği ${v === 0 ? "bugün" : v + " gün içinde"} bitiyor.`, a: "Karar ver" });
      });
      if (OPEN.includes(r.status) && r.status !== "approval" && r.needDate) {
        const d = dayDiff(t, r.needDate);
        if (d < 0) out.push({ sev: "h", r, t: `İhtiyaç tarihi ${-d} gün önce geçti, karar verilmedi.`, a: "Karar ver" });
        else if (d <= 7) out.push({ sev: r.priority === "urgent" ? "h" : "m", r, t: `İhtiyaç tarihine ${d} gün kaldı; karar bekleniyor.`, a: "Karar ver" });
      }
      // #375: kartsız kalem (ana sayfadan adıyla yazılan) kart bağlanmadan siparişe dönmez; sunucu reddeder.
      const kartsiz = (r.items || []).filter(it => it.name && !it.materialId);
      if (OPEN.includes(r.status) && kartsiz.length)
        out.push({ sev: r.status === "approval" ? "h" : "m", r, t: `${kartsiz.length} kalem kart bekliyor (${kartsiz.map(it => it.name).join(", ")}); kart bağlanmadan sipariş verilmez.`, a: "Karta bağla" });
      if (r.status === "approval") {
        const tt = awardTotals(r); const ap = tt ? requiredApprover(tt.totalTRY) : null;
        out.push({ sev: "l", r, t: `Onay bekliyor${ap ? ": " + ap.role : ""}${tt ? ", " + money(tt.totalTRY, "TRY", 0) : ""}.`, a: "Onaya git" });
      }
      if (r.status === "ordered" && r.award) awardOrders(r).forEach(o => {
        const due = orderDue(o); if (!due || o.deliveredDate) return;
        const d = dayDiff(t, due), who = supName(o.q);
        if (d < 0) out.push({ sev: "h", r, t: `${who} teslimatı ${-d} gün gecikti (beklenen ${fmtDate(due)}).`, a: "Tedarikçiyi ara" });
        else if (d <= 3) out.push({ sev: "l", r, t: `${who} teslimatı ${d === 0 ? "bugün" : fmtDate(due)} bekleniyor.`, a: "Teyit et" });
      });
    });
    const o = { h: 0, m: 1, l: 2 };
    return out.sort((a, b) => o[a.sev] - o[b.sev]);
  });
}
function memoryInsights(): { k: "mat" | "sup"; id: string; t: string; s: number }[] {
  const set = settings(), out: { k: "mat" | "sup"; id: string; t: string; s: number }[] = [];
  Object.values(S.materials).forEach(m => {
    const st = matStats(m.id);
    if (st.count >= 2 && isNum(st.change) && fiyatUyarisi(st.change, set.priceAlertPct)) out.push({ k: "mat", id: m.id, t: `${esc(m.name)} fiyatı ilk alışa göre ${deltaHTML(st.change)} arttı`, s: st.change });
  });
  const sst = supplierStats();
  Object.values(S.suppliers).forEach(s => {
    const x = sst[s.id];
    if (x && x.deliveries >= 2 && (x.onTimeRate ?? 100) < 70) out.push({ k: "sup", id: s.id, t: `${esc(s.name)} teslimatlarının yalnızca ${pct(x.onTimeRate)} kadarı zamanında`, s: 100 - (x.onTimeRate ?? 0) });
    if (x && x.asked >= 3 && (x.responseRate ?? 100) < 50) out.push({ k: "sup", id: s.id, t: `${esc(s.name)} teklif isteklerinin ${pct(x.responseRate)} kadarına cevap veriyor`, s: 50 - (x.responseRate ?? 0) });
  });
  Object.values(S.requests).filter(r => OPEN.includes(r.status)).forEach(r => (r.items || []).forEach(it => {
    const mid = matOf(it); if (!mid) return;
    const st = matStats(mid);
    if (st.count >= 2 && st.suppliers.filter(s => s.wins).length === 1 && st.suppliers.length === 1) out.push({ k: "mat", id: mid, t: `${esc(it.name)} hep tek tedarikçiden alınıyor; ${esc(r.no)} için alternatif teklif isteyin`, s: 5 });
  }));
  return out.sort((a, b) => b.s - a.s).slice(0, 6);
}

/* ================= pano ================= */
function viewDash(): string {
  const reqs = Object.values(S.requests);
  if (!reqs.length && !Object.keys(S.suppliers).length) return `
    <div class="phead"><div><h1>Satın alma panosu</h1><p class="lead">Talepleri, teklifleri, kararları ve teslimatları tek yerde toplayın. Her alım; malzeme fiyat geçmişine, tedarikçi karnesine ve raporlara veri olarak eklenir.</p></div></div>
    <div class="panel">${empty("Henüz kayıt yok", "Bir satın alma talebi açarak başlayın. Kalemler malzeme kataloğuna, teklifler fiyat geçmişine kendiliğinden işlenir.", '<button class="btn primary" data-act="new-request">Yeni talep aç</button><button class="btn" data-act="new-supplier">Tedarikçi ekle</button>')}</div>`;
  const t = todayStr(), year = t.slice(0, 4), month = t.slice(0, 7);
  const open = reqs.filter(r => OPEN.includes(r.status));
  const urgent = open.filter(r => r.priority === "urgent").length;
  const sl = spendLines();
  const mSpend = sum(sl.filter(l => l.month === month).map(l => l.amount));
  const mOrders = new Set(sl.filter(l => l.month === month).map(l => l.reqId)).size;
  let ySave = 0; reqs.filter(r => r.award && COMMITTED.includes(r.status) && String(r.award.orderDate || r.award.decidedAt || "").startsWith(year)).forEach(r => { const s = savingsOf(r); ySave += s.avg + s.neg; });
  const sst = supplierStats(); const dl = sum(Object.values(sst).map(s => s.deliveries)), ot = sum(Object.values(sst).map(s => s.onTime));
  const al = alerts(), mi = memoryInsights();
  const upcoming = reqs.filter(r => r.status === "ordered").flatMap(r => awardOrders(r).filter(o => !o.deliveredDate && orderDue(o)).map(o => ({ r, o, due: orderDue(o) }))).sort((a, b) => a.due < b.due ? -1 : 1).slice(0, 5);
  const months: string[] = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.getFullYear() + "-" + pad(d.getMonth() + 1)); }
  const mv = months.map(m => ({ m, v: sum(sl.filter(l => l.month === m).map(l => l.amount)) }));
  const recent = [...reqs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
  return `
  <div class="phead"><div><h1>Satın alma panosu</h1><p class="lead">${new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Önce ilgilenmeniz gerekenler, ardından hafızanın söyledikleri.</p></div></div>
  <div class="strip">
    <div><div class="v">${open.length}</div><div class="k">Açık talep</div><div class="d">${urgent ? urgent + " acil" : "acil yok"}</div></div>
    <div><div class="v">${short(mSpend)}</div><div class="k">Bu ay sipariş</div><div class="d">${mOrders} sipariş</div></div>
    <div><div class="v">${short(ySave)}</div><div class="k">${year} tasarrufu</div><div class="d">ortalama teklife göre + pazarlık</div></div>
    <div><div class="v">${dl ? pct(ot / dl * 100) : "–"}</div><div class="k">Zamanında teslim</div><div class="d">${dl} teslimat ölçüldü</div></div>
  </div>
  <div class="detail wide-side">
    <div class="stack">
      <section class="panel"><div class="panel-h"><h2>Yapılacaklar</h2><span class="sub">${al.length ? al.length + " madde" : ""}</span></div>
        ${al.length ? `<ul class="todo">${al.slice(0, 12).map(a => `<li data-act="open" data-id="${a.r.id}" tabindex="0"><span class="sev ${a.sev}"></span><span class="no">${esc(a.r.no)}</span><span>${prioDot(a.r.priority)}<b>${esc(a.r.title)}</b><br><span class="muted small">${esc(a.t)}</span></span><span class="act btn ghost sm">${esc(a.a)}</span></li>`).join("")}</ul>` : `<div class="empty">Bekleyen iş yok. Süresi dolan teklif, yaklaşan ihtiyaç tarihi, onay veya geciken teslimat olduğunda burada görünür.</div>`}
      </section>
      <section class="panel"><div class="panel-h"><h2>Son hareketler</h2><span class="spacer"></span><button class="btn ghost sm" data-act="go" data-page="requests">Tüm talepler</button></div>${reqList(recent)}</section>
    </div>
    <div class="stack">
      <section class="panel"><div class="panel-h"><h2>Hafızadan</h2></div>
        ${mi.length ? `<ul class="todo">${mi.map(x => `<li data-act="${x.k === "mat" ? "open-mat" : "open-sup"}" data-id="${x.id}" tabindex="0" data-sa-y="37"><span class="sev m"></span><span class="small">${x.t}</span></li>`).join("")}</ul>` : `<div class="panel-b small muted">Alım geçmişi biriktikçe burada fiyat artışları, geç teslim eden tedarikçiler ve tek kaynağa bağımlı malzemeler belirir.</div>`}
      </section>
      <section class="panel"><div class="panel-h"><h2>Yaklaşan teslimatlar</h2></div>
        ${upcoming.length ? `<ul class="todo">${upcoming.map(({ r, o, due }) => { const d = dayDiff(t, due); return `<li data-act="open" data-id="${r.id}" tabindex="0" data-sa-y="38"><span><b>${esc(r.title)}</b><br><span class="small muted">${esc(supName(o.q))}${siparisEtiketi(o) ? ", " + esc(siparisEtiketi(o)) : ""}</span></span><span class="small num ${d < 0 ? "" : "muted"}">${d < 0 ? `<span class="flag bad">${-d} gün gecikti</span>` : fmtDate(due)}</span></li>`; }).join("")}</ul>` : `<div class="panel-b small muted">Sipariş verilmiş ve teslim tarihi bekleyen alım yok.</div>`}
      </section>
      <section class="panel"><div class="panel-h"><h2>Aylık sipariş hacmi</h2><span class="spacer"></span><button class="btn ghost sm" data-act="go" data-page="reports">Raporlar</button></div><div class="panel-b">${vbars(mv.map(x => ({ label: MONTHS[+x.m.slice(5) - 1] ?? "", value: x.v, cur: x.m === month })))}</div></section>
    </div>
  </div>`;
}

/* ================= grafik yardımcıları ================= */
export interface BarDatum { label: string; value: number; cur?: boolean; max?: number; over?: boolean; text?: string; html?: string; k?: string }
export function vbars(data: BarDatum[]): string {
  const max = Math.max(1, ...data.map(d => d.value));
  return `<div class="vbars" role="img" aria-label="Aylık değerler">${data.map(d => `<div class="c" title="${esc(d.label)}: ${money(d.value, "TRY", 0)}"><b>${d.value ? short(d.value).replace(" ₺", "") : ""}</b><i class="${d.cur ? "cur" : ""}" style="height:${(d.value / max * 100).toFixed(1)}%"></i><span>${esc(d.label)}</span></div>`).join("")}</div>`;
}
export function hbars(data: BarDatum[], opts: { empty?: string } = {}): string {
  if (!data.length) return `<p class="small muted">${opts.empty || "Veri yok."}</p>`;
  const max = Math.max(1, ...data.map(d => d.max || d.value));
  return `<div class="hbars">${data.map(d => `<div class="r"><span class="l" title="${esc(d.label)}">${d.html || esc(d.label)}</span><span class="t"><i class="${d.over ? "over" : ""}" style="width:${clamp(d.value / max * 100, 0, 100).toFixed(1)}%"></i></span><span class="v">${d.text || short(d.value)}</span></div>`).join("")}</div>`;
}
export function priceChart(mid: string): string {
  const h = priceHistory(mid);
  if (h.length < 2) return `<p class="small muted">Grafik için en az iki fiyat kaydı gerekiyor.</p>`;
  return `<div class="chart"><div class="plot" data-chart="${mid}"></div><div class="legend" data-sa-y="39"><span><i data-sa-y="40"></i>Satın alınan fiyat</span><span><i data-sa-y="41"></i>Alınan diğer teklifler</span></div></div>`;
}
function priceChartSvg(h: PriceEntry[], W: number): string {
  if (h.length < 2) return "";
  W = Math.max(280, Math.round(W)); const H = 240, L = 70, R = 16, T = 16, B = 30;
  const ts = h.map(e => Date.parse(e.date + "T00:00:00")); const minT = Math.min(...ts), maxT = Math.max(...ts) || minT + 1;
  const vs = h.map(e => e.unitTRY); let minV = Math.min(...vs), maxV = Math.max(...vs);
  const padV = (maxV - minV) * 0.15 || maxV * 0.1 || 1; minV = Math.max(0, minV - padV); maxV += padV;
  const x = (t: number) => L + (maxT === minT ? (W - L - R) / 2 : (t - minT) / (maxT - minT) * (W - L - R));
  const y = (v: number) => T + (1 - (v - minV) / (maxV - minV)) * (H - T - B);
  const won = h.filter(e => e.won);
  const ticks = [minV, (minV + maxV) / 2, maxV];
  const path = won.map((e, i) => (i ? "L" : "M") + x(Date.parse(e.date + "T00:00:00")).toFixed(1) + " " + y(e.unitTRY).toFixed(1)).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Birim fiyat geçmişi">
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--sa-line-2)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="var(--sa-muted)">${nf2.format(v)}</text>`).join("")}
    <text x="${L}" y="${H - 8}" font-size="12" fill="var(--sa-muted)">${fmtDate(h[0]!.date)}</text>
    <text x="${W - R}" y="${H - 8}" font-size="12" fill="var(--sa-muted)" text-anchor="end">${fmtDate(h[h.length - 1]!.date)}</text>
    ${path ? `<path d="${path}" fill="none" stroke="var(--sa-c1)" stroke-width="2"/>` : ""}
    ${h.map(e => `<circle cx="${x(Date.parse(e.date + "T00:00:00")).toFixed(1)}" cy="${y(e.unitTRY).toFixed(1)}" r="${e.won ? 5 : 4}" fill="${e.won ? "var(--sa-c1)" : "var(--sa-surface)"}" stroke="${e.won ? "var(--sa-surface)" : "var(--sa-c2)"}" stroke-width="${e.won ? 1.5 : 1.5}"><title>${esc(e.supplier)}, ${fmtDate(e.date)}: ${money(e.unitTRY)}${e.won ? " (alındı)" : ""}</title></circle>`).join("")}
  </svg>`;
}

/* ================= talepler ================= */
/** Talep tutarı: karar varsa karar tutarı, yoksa en uygun tam teklifin net maliyeti */
function reqValue(r: PurchaseRequest): { v: number | null; who: string } {
  const tt = r.award ? awardTotals(r) : null;
  if (tt) return { v: tt.totalTRY, who: tt.x ? supName(tt.x.q) : "kalem bazlı" };
  const ev = (r.quotes || []).length ? evaluate(r) : null;
  const best = ev ? ev.elig.filter(x => x.c.covered === (r.items || []).length).sort((a, b) => a.c.pvTRY - b.c.pvTRY)[0] : null;
  return best ? { v: best.c.pvTRY, who: supName(best.q) } : { v: null, who: "" };
}
/** Panoda kısa liste: tek satırda no, talep, durum, tutar */
function reqList(list: PurchaseRequest[]): string {
  if (!list.length) return `<div class="empty">Henüz talep yok.</div>`;
  return `<ul class="rlist">${list.map(r => { const v = reqValue(r); return `<li data-act="open" data-id="${r.id}" tabindex="0"><span class="no num">${esc(r.no)}</span><span class="tt"><span class="ln">${prioDot(r.priority)}<b title="${esc(r.title)}">${esc(r.title)}</b></span><span class="sub">${esc([r.department, (r.items || []).length + " kalem"].filter(Boolean).join(", "))}</span></span>${reqChip(r)}<span class="amt num">${v.v === null ? "–" : money(v.v, "TRY", 0)}</span></li>`; }).join("")}</ul>`;
}
const SORTS: Record<string, (r: PurchaseRequest) => string | number> = {
  no: r => r.no, title: r => norm(r.title), status: r => (r.status === "cancelled" ? 99 : FLOW.indexOf(r.status)),
  quotes: r => (r.quotes || []).length, value: r => reqValue(r).v ?? -1, need: r => r.needDate || "9999",
};
export function reqTable(list: PurchaseRequest[], compact = false, sortable = false): string {
  if (!list.length) return `<div class="empty">Bu filtreye uyan talep yok.</div>`;
  const t = todayStr();
  const th = (k: string, label: string, cls = "") => sortable
    ? `<th class="${cls}" aria-sort="${V.sort === k ? (V.dir > 0 ? "ascending" : "descending") : "none"}"><button class="sortbtn" data-act="sort" data-k="${k}">${label}${V.sort === k ? (V.dir > 0 ? " ▲" : " ▼") : ""}</button></th>`
    : `<th class="${cls}">${label}</th>`;
  return `<div class="tw"><table class="rt"><thead><tr>${th("no", "No")}${th("title", "Talep")}${th("status", "Durum")}${compact ? "" : th("quotes", "Teklif", "r")}${th("value", "En iyi / seçilen", "r")}${compact ? "" : th("need", "İhtiyaç")}</tr></thead><tbody>
  ${list.map(r => {
    const tt = r.award ? awardTotals(r) : null;
    const ev = (r.quotes || []).length ? evaluate(r) : null;
    const best = ev ? ev.elig.filter(x => x.c.covered === (r.items || []).length).sort((a, b) => a.c.pvTRY - b.c.pvTRY)[0] : null;
    const d = r.needDate ? dayDiff(t, r.needDate) : null;
    const nd = r.needDate ? `${fmtDate(r.needDate)}${OPEN.includes(r.status) && d !== null ? (d < 0 ? ' <span class="flag bad">geçti</span>' : d <= 7 ? ` <span class="flag warn">${d} gün</span>` : "") : ""}` : "–";
    const val = tt ? `${money(tt.totalTRY, "TRY", 0)}<span class="sub">${tt.x ? esc(supName(tt.x.q)) : "kalem bazlı"}</span>` : best ? `${money(best.c.pvTRY, "TRY", 0)}<span class="sub">${esc(supName(best.q))}</span>` : "–";
    return `<tr class="click" data-act="open" data-id="${r.id}"><td class="num muted">${esc(r.no)}</td><td class="lead">${prioDot(r.priority)}<b>${esc(r.title)}</b><span class="sub">${esc([r.department, (r.items || []).length + " kalem"].filter(Boolean).join(", "))}</span></td><td>${reqChip(r)}${ilerlemeNoktalari(r)}</td>${compact ? "" : `<td class="r num">${(r.quotes || []).length}${(r.rfqs || []).length ? `<span class="sub">${(r.rfqs || []).length} istendi</span>` : ""}</td>`}<td class="r num">${val}</td>${compact ? "" : `<td class="num">${nd}</td>`}</tr>`;
  }).join("")}</tbody></table></div>`;
}
function filteredRequests(): PurchaseRequest[] {
  let list = Object.values(S.requests);
  if (V.status === "open") list = list.filter(r => OPEN.includes(r.status));
  else if (V.status !== "all") list = list.filter(r => r.status === V.status);
  if (V.prio) list = list.filter(r => (r.priority || "normal") === V.prio);
  if (V.dept) list = list.filter(r => norm(r.department) === norm(V.dept));
  const q = norm(V.q);
  if (q) list = list.filter(r => norm([r.no, r.title, r.department, r.requester, ...(r.items || []).map(i => i.name), ...(r.quotes || []).map(supName)].join(" ")).includes(q));
  const po: Record<Priority, number> = { urgent: 0, normal: 1, low: 2 };
  const key = SORTS[V.sort];
  if (key) return list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * V.dir; });
  return list.sort((a, b) => (po[a.priority || "normal"] - po[b.priority || "normal"]) || ((b.createdAt || 0) - (a.createdAt || 0)));
}
const STATUS_FILTERS: [string, string, (r: PurchaseRequest) => boolean][] = [
  ["open", "Açık", r => OPEN.includes(r.status)], ["approval", "Onayda", r => r.status === "approval"],
  ["ordered", "Siparişte", r => r.status === "ordered"], ["received", "Tamamlanan", r => r.status === "received"],
  ["cancelled", "İptal", r => r.status === "cancelled"], ["all", "Tümü", () => true],
];
function viewRequests(): string {
  const all = Object.values(S.requests);
  const depts = [...new Set([...(settings().departments || []).map(d => d.name), ...all.map(r => r.department).filter(Boolean)])] as string[];
  const list = filteredRequests();
  const board = V.view === "board";
  return `
  <div class="phead"><div><h1>Talepler</h1></div><span class="spacer"></span>
    <div class="seg" role="group" aria-label="Görünüm"><button data-act="view" data-v="list" aria-pressed="${!board}">Liste</button><button data-act="view" data-v="board" aria-pressed="${board}">Akış panosu</button></div></div>
  ${board ? "" : `<div class="chips qf" role="group" aria-label="Durum">${STATUS_FILTERS.map(([k, l, f]) => `<button class="chip" data-act="status-chip" data-v="${k}" aria-pressed="${V.status === k}">${l} <b class="num">${all.filter(f).length}</b></button>`).join("")}</div>`}
  <div class="row" data-sa-y="2">
    <div data-sa-y="3"><input id="req-search" type="search" placeholder="No, talep, kalem veya tedarikçi" value="${esc(V.q)}" data-in="req-search" aria-label="Taleplerde ara"></div>

    <div data-sa-y="42"><select data-ch="prio-filter" aria-label="Öncelik"><option value="">Her öncelik</option>${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${V.prio === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div data-sa-y="43"><select data-ch="dept-filter" aria-label="Birim"><option value="">Tüm birimler</option>${depts.map(d => `<option ${norm(V.dept) === norm(d) ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
  </div>
  ${!all.length ? `<div class="panel">${empty("Henüz talep yok", "Malzeme veya hizmet ihtiyacını kalemleriyle girin. Daha önce alınmış kalemler için son fiyat ve tedarikçiler otomatik gelir.", '<button class="btn primary" data-act="new-request">Yeni talep aç</button>')}</div>`
      : board ? boardHTML() : `<div class="panel">${reqTable(list, false, true)}</div>`}`;
}
function boardHTML(): string {
  const saveStatus = V.status; V.status = "all"; const list = filteredRequests(); V.status = saveStatus;
  const t = todayStr();
  return `<div class="board">${FLOW.map(k => {
    const items = list.filter(r => r.status === k);
    return `<div class="bcol"><h4><span>${stLabel(k)}</span><span class="num">${items.length}</span></h4>${items.slice(0, 40).map(r => {
      const d = r.needDate ? dayDiff(t, r.needDate) : null;
      const tt = r.award ? awardTotals(r) : null;
      return `<div class="card" data-act="open" data-id="${r.id}" tabindex="0"><span class="xs muted num">${esc(r.no)}${r.department ? ", " + esc(r.department) : ""}</span><span class="t">${prioDot(r.priority)}${esc(r.title)}</span>${ilerlemeNoktalari(r)}<span class="xs muted">${(r.items || []).length} kalem, ${(r.quotes || []).length} teklif${tt ? ", " + short(tt.totalTRY) : ""}</span>${OPEN.includes(k) && d !== null && d <= 7 ? `<span>${d < 0 ? `<span class="flag bad">ihtiyaç ${-d} gün geçti</span>` : `<span class="flag warn">ihtiyaca ${d} gün</span>`}</span>` : ""}</div>`;
    }).join("") || '<span class="xs faint" data-sa-y="44">Boş</span>'}</div>`;
  }).join("")}</div>`;
}

/* ================= talep detayı ================= */
/** Talebin altı adımı; ilerleme çizgisi, bölümler ve listedeki noktalar aynı sırayı kullanır (kart #939). */
const ADIMLAR = [["items", "Talep"], ["quotes", "Teklif"], ["compare", "Karar"], ["approval", "Onay"], ["order", "Sipariş"], ["delivery", "Teslim"]] as const;
const KARAR_SONRASI = ["approval", "order", "delivery"];
/** Şimdiki adımın sırası: 6 bütün adımlar bitti, -1 iptal. Reddedilen karar karar adımına döner. */
export function adimSirasi(r: PurchaseRequest): number {
  switch (r.status) {
    case "cancelled": return -1;
    case "draft": return (r.items || []).length ? 1 : 0;
    case "rfq": return 1;
    case "eval": return 2;
    case "approval": { const st = approvalState(r).state; return st === "rejected" ? 2 : st === "approved" ? 4 : 3; }
    case "ordered": return 5;
    case "received": return 6;
  }
}
/** Talebin aşamasına göre açık olacak bölüm */
function defaultSection(r: PurchaseRequest): string {
  const i = adimSirasi(r);
  return i < 0 ? "items" : ADIMLAR[Math.min(i, 5)]![0];
}
/** Liste ve panoda talebin ilerlemesi: altı nokta, biten yeşil, şimdiki koyu. */
export function ilerlemeNoktalari(r: PurchaseRequest): string {
  const i = adimSirasi(r);
  const etiket = i < 0 ? "İptal" : i > 5 ? "Bütün adımlar tamam" : `Adım ${i + 1}/6: ${ADIMLAR[i]![1]}`;
  return `<span class="sa-noktalar" role="img" aria-label="${etiket}" title="${etiket}">${ADIMLAR.map((_, k) => `<i class="${i < 0 ? "" : k < i ? "done" : k === i ? "cur" : ""}"></i>`).join("")}</span>`;
}
/** İşin kimde beklediği; biten ya da iptal talepte null. */
function kimde(r: PurchaseRequest): string | null {
  const i = adimSirasi(r);
  if (i < 0 || i > 5) return null;
  if (i === 3) { const tt = awardTotals(r); const req = tt ? requiredApprover(tt.totalTRY) : null; return req?.role || "Onaylayan"; }
  if (i === 5) return "Tedarikçi (teslimat)";
  const rfqs = r.rfqs || [];
  if (i === 1 && rfqs.length && rfqs.some(x => !(r.quotes || []).some(q => q.supplierId === x.supplierId)) && !(r.quotes || []).length) return "Tedarikçi (teklif)";
  return "Satın alma";
}
function viewRequest(): string {
  const r = S.requests[V.id!];
  if (!r) return `<div class="panel">${empty("Talep bulunamadı", "Silinmiş olabilir.", '<button class="btn" data-act="go" data-page="requests">Taleplere dön</button>')}</div>`;
  if (getRole() === "approver") return viewApproval(r);
  if (getRole() === "requester") return viewRequestRequester(r);
  const nq = (r.quotes || []).length;
  const tab = V.tab || defaultSection(r);
  const curI = adimSirasi(r);
  // Eski "decision" bağlantıları karar sonrasının şimdiki adımını açar.
  const sec = tab === "sim" ? "compare" : tab === "decision" ? (curI >= 3 ? ADIMLAR[Math.min(curI, 5)]![0] : "approval") : tab;
  const t = todayStr(), d = r.needDate ? dayDiff(t, r.needDate) : 0;
  const meta = [
    r.department && esc(r.department),
    r.requester && `Talep eden ${esc(r.requester)}`,
    r.uretimEmriNo && `Üretim emri ${esc(r.uretimEmriNo)}`,
    r.needDate && `İhtiyaç ${fmtDate(r.needDate)}${OPEN.includes(r.status) ? (d < 0 ? ` <span class="flag bad">${-d} gün geçti</span>` : ` <span class="faint">(${d} gün)</span>`) : ""}`,
    `${prioDot(r.priority)}${PRIO[r.priority || "normal"]}`,
  ].filter(Boolean);
  const flow = flowHTML(r, sec);
  const cur = defaultSection(r);
  const order = ADIMLAR.map(([k]) => k as string);
  const ev = nq ? evaluate(r) : null;
  const tt = r.award ? awardTotals(r) : null;
  const aps = approvalState(r);
  const rfqs = r.rfqs || [], pending = rfqs.filter(x => !(r.quotes || []).some(q => q.supplierId === x.supplierId)).length;
  const sums: Record<string, string> = {
    items: `${(r.items || []).length} kalem${headerFacts(r).find(f => f.startsWith("tahmini")) ? ", " + headerFacts(r).find(f => f.startsWith("tahmini")) : ""}`,
    quotes: nq ? `${nq} teklif${pending ? `, ${pending} cevap bekleniyor` : ""}` : rfqs.length ? `${rfqs.length} tedarikçiden istendi, cevap bekleniyor` : "henüz teklif istenmedi",
    compare: tt ? `karar: ${esc(tt.x ? supName(tt.x.q) : "kalem bazlı")}, <b class="num">${money(tt.totalTRY, "TRY", 0)}</b>` : ev && ev.ranking[0] ? `önerilen: ${esc(supName(ev.ranking[0].q))}, <b class="num">${money(ev.ranking[0].c.pvTRY, "TRY", 0)}</b> net` : "teklifler girilince",
    approval: aps.state === "approved" || COMMITTED.includes(r.status) ? "onaylandı" : aps.state === "rejected" ? '<span class="flag bad">karar reddedildi</span>' : r.award ? "onay bekliyor" : "karardan sonra",
    order: COMMITTED.includes(r.status) ? "sipariş verildi" : aps.state === "approved" ? "onaylandı, sipariş verilecek" : "onaydan sonra",
    delivery: r.status === "received" ? "teslim alındı" : r.status === "ordered" ? "teslimat bekleniyor" : "siparişten sonra",
    log: `${(r.log || []).length} kayıt`,
  };
  const sira = (k: string) => order.indexOf(k);
  const done = (k: string) => sira(k) >= 0 && sira(k) < curI;
  const titles: Record<string, string> = { items: "Kalemler", quotes: "Teklifler", compare: "Karşılaştır ve karar ver", approval: "Onay", order: "Sipariş", delivery: "Teslim ve değerlendirme", log: "Geçmiş" };
  const content = (k: string): string => {
    if (k === "items") return tabItems(r);
    if (k === "quotes") return tabQuotes(r);
    if (k === "compare") {
      if (!nq) return tabCompare(r);
      // TMI (kullanıcı kararı): paylaştırma çubukları karşılaştırmanın içinde açık durur, ayrı ekran yok. Prototipin koşulu: talep
      // açık ve en az iki tedarikçi fiyat vermiş.
      const paylas = OPEN.includes(r.status) && evaluate(r).elig.length >= 2
        ? `<div class="stack sa-paylastir" id="sa-paylastir"><div class="sa-paylastir-h"><h3>Paylaştırma</h3><span class="small muted">Siparişi tek tedarikçiye değil, miktarı çubuklarla tedarikçiler arasında bölerek verin; beğendiğiniz dağılımı karara aktarın.</span></div>${tabSim(r)}</div>`
        : "";
      // Kart #956: önde tek tablo ve tek düğme; ağırlık, kalem kalem tablo, bölme ve paylaştırma kapalı "Ayrıntılar" altında.
      const acik = UI.adv.detay || r.award?.mode === "split";
      return `<div data-sa-y="46">${tabDecision(r, "select")}</div>
        <details class="adv sa-detay" data-adv="detay" ${acik ? "open" : ""}><summary>Ayrıntılar ve bölme <span class="muted">(ağırlıklar, kalem kalem tablo, bölme, paylaştırma)</span></summary>
        <div class="stack">${tabCompare(r, true)}${tabDecision(r, "split")}${paylas}</div></details>`;
    }
    if (k === "approval" || k === "order" || k === "delivery") return tabDecision(r, k);
    return tabLog(r);
  };
  const section = (k: string, i: number) => {
    const open = sec === k, st = done(k) ? "done" : k === cur ? "cur" : "";
    return `<section class="fsec ${open ? "open" : ""} ${st}" data-sec="${k}">
      <button class="fsec-h tab" data-act="tab" data-tab="${k}" aria-expanded="${open}" aria-selected="${open}">
        <span class="fn">${done(k) ? "✓" : i ? i : ""}</span><span class="ft">${titles[k]}</span><span class="fsum">${sums[k]}</span><span class="chev" aria-hidden="true">${open ? "▴" : "▾"}</span>
      </button>
      ${open ? `<div class="fsec-b">${content(k)}</div>` : ""}
    </section>`;
  };
  return `
  <div class="crumb"><button data-act="go" data-page="requests">Talepler</button> / <span class="num">${esc(r.no)}</span></div>
  <div class="rhead">
    <div class="ttl"><div class="row" data-sa-y="19"><h1>${esc(r.title)}</h1>${reqChip(r)}</div>
      <p class="rmeta">${meta.map(m => `<span>${m}</span>`).join("")}${headerFacts(r).map(f => `<span class="fact">${f}</span>`).join("")}</p></div>
    <div class="ract">${reqMenuHTML(r)}</div>
  </div>
  ${ilerlemeCizgisi(r, curI)}
  ${r.status === "cancelled" ? `<div class="callout" data-sa-y="1">Bu talep iptal edildi${r.cancelReason ? ": " + esc(r.cancelReason) : "."} Kayıt ve teklifler hafızada kalır.</div>` : flow.bar}
  <div class="flow">${order.map((k, i) => section(k, i + 1)).join("")}${section("log", 0)}</div>`;
}
/** Başlık satırında kısa sayılar: teklif durumu, tutar, bütçe */
export function headerFacts(r: PurchaseRequest): string[] {
  const out: string[] = [];
  const nq = (r.quotes || []).length, nr = (r.rfqs || []).length;
  out.push(`${nq} teklif${nr ? ` / ${nr} istendi` : ""}`);
  const tt = r.award ? awardTotals(r) : null;
  if (tt) out.push(`karar <b class="num">${money(tt.totalTRY, "TRY", 0)}</b>`);
  else {
    const est = sum((r.items || []).map(it => { const mid = matOf(it); const st = mid ? matStats(mid) : null; return st && st.last ? st.last.unitTRY * (parseNum(it.qty) || 0) : 0; }));
    if (est) out.push(`tahmini <b class="num">${money(est, "TRY", 0)}</b>`);
  }
  const bu = r.department ? budgetUse(r.department, todayStr().slice(0, 4)) : null;
  if (bu && bu.budget) out.push(`${esc(r.department)} bütçesi ${pct(bu.used / bu.budget * 100)}`);
  return out;
}
/** Talep işlemleri menüsü (açılır liste yerine) */
function reqMenuHTML(r: PurchaseRequest): string {
  const open = OPEN.includes(r.status);
  const items: [string, string, string?][] = [
    ["req-edit", "Talebi düzenle"],
    ...(open && (r.items || []).length ? [["rfq", "Teklif iste"] as [string, string]] : []),
    ...(r.award ? [["approval-form", "Onay formunu göster"] as [string, string]] : []),
    ["req-dup", "Tekrar talep et (kopyala)"],
    // Teslim alınan talebin durumu elle değişmez, yalnız taslak silinir (SAT-07, SAT-66); sunucunun reddedeceği işlem menüde durmaz.
    ...(r.status !== "received" ? [["req-status", "Durumu elle değiştir"] as [string, string]] : []),
    ...(r.status !== "cancelled" && r.status !== "received" ? [["req-cancel", "Talebi iptal et"] as [string, string]] : []),
    ...(r.status === "draft" ? [["req-delete", "Talebi sil", "danger"] as [string, string, string]] : []),
  ];
  return `<div class="menu"><button class="btn" data-act="menu" aria-haspopup="menu" aria-expanded="false">İşlemler <span aria-hidden="true">▾</span></button>
    <div class="menu-list" role="menu" hidden>${items.map(([act, l, cls]) => `<button role="menuitem" class="${cls ?? ""}" data-act="${act}">${l}</button>`).join("")}</div></div>`;
}
/** Süreç adımları ve sıradaki adım tek bantta; birincil düğme başlığa çıkar */
/** Altı adım yan yana: biten ✓, şimdiki vurgulu, adımın altında kısa bilgi; adıma basmak bölümünü açar. */
function ilerlemeCizgisi(r: PurchaseRequest, curI: number): string {
  const nq = (r.quotes || []).length, nr = (r.rfqs || []).length;
  const tt = r.award ? awardTotals(r) : null;
  const aps = approvalState(r);
  const req = tt ? requiredApprover(tt.totalTRY) : null;
  const bilgi: Record<string, string> = {
    items: `${(r.items || []).length} kalem`,
    quotes: nq ? `${nq} teklif${nr > nq ? ` / ${nr}` : ""}` : nr ? `${nr} istendi` : "istenmedi",
    compare: tt ? (tt.x ? supName(tt.x.q) : "kalem bazlı") : "bekliyor",
    approval: aps.state === "approved" || COMMITTED.includes(r.status) ? "onaylandı" : aps.state === "rejected" ? "reddedildi" : r.award ? `${req?.role || "onay"} bekliyor` : "—",
    order: COMMITTED.includes(r.status) ? "verildi" : "—",
    delivery: r.status === "received" ? "alındı" : r.status === "ordered" ? "bekleniyor" : "—",
  };
  return `<ol class="sa-ilerleme${curI < 0 ? " iptal" : ""}" aria-label="Talebin ilerlemesi">${ADIMLAR.map(([k, l], j) => {
    const st = curI < 0 ? "" : j < curI ? "done" : j === curI ? "cur" : "";
    return `<li class="${st}"><button class="tab" data-act="tab" data-tab="${k}"${j === curI ? ' aria-current="step"' : ""}><span class="ai">${st === "done" ? "✓" : j + 1}</span><span class="al">${l}</span><span class="ab">${esc(bilgi[k] ?? "")}</span></button></li>`;
  }).join("")}</ol>`;
}
/** "Şimdi yapılacak" kutusu: ne gerekiyor, kimde bekliyor ve tek birincil düğme. */
function flowHTML(r: PurchaseRequest, tab: string): { bar: string } {
  const n = nextStep(r);
  n.b = n.b.filter(([act, , , t]) => !(act === "tab" && (t === tab || (t === "decision" && KARAR_SONRASI.includes(tab)))));
  const pi = n.b.findIndex(x => x[2]);
  const prim = pi >= 0 ? n.b.splice(pi, 1)[0]! : n.b.shift();
  const btn = (b: NextBtn, cls: string) => `<button class="btn ${cls}" data-act="${b[0]}" ${b[3] ? `data-tab="${b[3]}"` : ""}>${esc(b[1])}</button>`;
  const kim = kimde(r);
  return {
    bar: `<div class="nextline sa-simdi ${n.cls}" role="status"><span class="nd"></span><span class="nt"><span class="sa-simdi-k">${n.cls === "done" ? "Durum" : "Şimdi yapılacak"}${kim ? `, bekleyen: ${esc(kim)}` : ""}</span><b>${esc(n.t)}</b>${n.s ? ` <span>${esc(n.s)}</span>` : ""}</span>${prim ? btn(prim, "primary") : ""}${n.b.map(b => btn(b, "sm")).join("")}</div>`,
  };
}

/* talebin bulunduğu aşamaya göre tek, net bir sonraki adım */
type NextBtn = [act: string, label: string, primary: number, tab?: string];
export function nextStep(r: PurchaseRequest): { cls: string; t: string; s: string; b: NextBtn[] } {
  const set = settings(), items = (r.items || []).length, q = (r.quotes || []).length, rfqs = r.rfqs || [];
  const pending = rfqs.filter(x => !(r.quotes || []).some(qq => qq.supplierId === x.supplierId));
  const a = r.award, ap = a && (a.approvals || []).slice(-1)[0];
  if (r.status === "cancelled") return { cls: "done", t: "Talep iptal edildi", s: r.cancelReason || "Kayıt ve teklifler hafızada kalır.", b: [] };
  if (!items) return { cls: "warn", t: "Kalemleri ekleyin", s: "Ne alınacağını miktar ve birimiyle girin.", b: [["edit-request", "Kalem ekle", 1]] };
  if (r.status === "received") return a && !a.lessons ? { cls: "done", t: "Alım tamamlandı", s: "Bir sonraki alıma not bırakın: neler iyi gitti, neye dikkat edilmeli?", b: [["tab", "Not ekle", 0, "decision"]] } : { cls: "done", t: "Alım tamamlandı", s: a && a.deliveredDate ? `Teslim ${fmtDate(a.deliveredDate)}${a.quality ? ", kalite: " + QUALITY[a.quality as Quality] : ""}` : "", b: [] };
  if (r.status === "ordered") {
    const os = awardOrders(r), wait = os.filter(o => !o.deliveredDate);
    const lateO = wait.filter(o => orderDue(o) && dayDiff(todayStr(), orderDue(o)) < 0);
    const next = wait.map(o => orderDue(o)).filter(Boolean).sort()[0];
    const head = os.length > 1 ? `${os.length - wait.length}/${os.length} sipariş teslim alındı` : "Teslimat bekleniyor";
    return { cls: lateO.length ? "bad" : "", t: lateO.length ? `${lateO.map(o => supName(o.q)).join(", ")} teslimatı gecikti` : head, s: next ? `Sıradaki beklenen teslim ${fmtDate(next)}${os.length > 1 ? "; bekleyenler: " + wait.map(o => supName(o.q)).join(", ") : a && siparisEtiketi(a) ? ", sipariş " + siparisEtiketi(a) : ""}` : "", b: [["tab", "Siparişi aç", 1, "decision"]] };
  }
  const aps = approvalState(r);
  if (aps.state === "rejected") return { cls: "bad", t: "Karar reddedildi", s: `${aps.last?.name || "Onaylayan"}: ${aps.last?.note || "gerekçe yazılmadı"}. Kararı gözden geçirip yeniden onaya gönderin.`, b: [["tab", "Kararı gözden geçir", 1, "compare"]] };
  if (a && ap && aps.state === "approved") return { cls: "", t: "Onaylandı, siparişi verin", s: `${ap.name || "Onaylayan"} onayladı. Sipariş verildiğinde kurlar sabitlenir.`, b: [["tab", "Sipariş ver", 1, "decision"]] };
  if (a) { const tt = awardTotals(r); const req = tt ? requiredApprover(tt.totalTRY) : null; return { cls: "warn", t: "Onay bekleniyor", s: `${[req ? req.role + " onayı gerekli" : "", tt ? money(tt.totalTRY, "TRY", 0) : ""].filter(Boolean).join(", ")}. Karar özetini onaylayana gönderebilirsiniz.`.replace(/^\. /, ""), b: [["tab", "Onay ekranı", 1, "decision"], ["copy-summary", "Özeti kopyala", 0]] }; }
  if (!rfqs.length && !q) return { cls: "", t: "Tedarikçilerden teklif isteyin", s: "Hafıza bu kalemleri daha önce veren tedarikçileri önerir; hepsine aynı formatta soru gider.", b: [["rfq", "Teklif iste", 1], ["bulk", "Elimde teklifler var", 0]] };
  const ev = q ? evaluate(r) : null;
  if (!ev || !ev.elig.length) return { cls: "", t: pending.length ? `${pending.length} tedarikçiden cevap bekleniyor` : "Teklifleri girin", s: pending.length ? pending.map(x => (S.suppliers[x.supplierId] || {}).name).filter(Boolean).join(", ") : "", b: ([["bulk", "Teklifleri gir", 1], pending.length ? ["tab", "Hatırlat", 0, "quotes"] : null] as (NextBtn | null)[]).filter((x): x is NextBtn => !!x) };
  if (ev.elig.length < set.minQuotes && pending.length) return { cls: "warn", t: `${ev.elig.length} teklif geldi, ${pending.length} cevap bekleniyor`, s: `En az ${set.minQuotes} teklifle karar vermek önerilir. Beklemek istemiyorsanız şimdiki tekliflerle karar verebilirsiniz.`, b: [["bulk", "Teklifleri gir", 1], ["tab", "Hatırlat", 0, "quotes"], ["tab", "Karşılaştır", 0, "compare"]] };
  const top = ev.ranking[0]!;
  return { cls: "", t: `Karar verin: önerilen ${supName(top.q)}`, s: `${ev.elig.length} teklif karşılaştırıldı, net maliyet ${money(top.c.pvTRY, "TRY", 0)}, puan ${nf0.format(top.score)}.`, b: [["tab", "Karşılaştırmayı gör", 1, "compare"], ["pick-top", "Önerileni seç", 0]] };
}
export function tabLog(r: PurchaseRequest): string {
  const log = (r.log || []).slice().reverse();
  return `<div class="panel"><div class="panel-b">${log.length ? `<ul class="log">${log.map(l => `<li><time>${fmtTs(l.at)}</time><span>${esc(l.t)}${l.by ? `<span class="by"> ${esc(nameOf(l.by))}</span>` : ""}</span></li>`).join("")}</ul>` : '<p class="muted">Bu talepte henüz kayıtlı hareket yok. Teklif, karar, onay ve teslimat adımları burada tarih ve kişiyle birlikte tutulur.</p>'}</div></div>`;
}
/** simple: talep eden ve onaylayan için sade liste (hafıza paneli ve satın alma düzenlemesi yok) */
export function tabItems(r: PurchaseRequest, simple = false): string {
  const items = r.items || [];
  if (!items.length) return `<div class="panel">${empty("Kalem yok", "Teklif istemeden önce ne alınacağını miktar ve birimiyle girin.", '<button class="btn primary" data-act="edit-request">Kalem ekle</button>')}</div>`;
  const prevSup: Record<string, { id: string; name: string; items: Set<string>; wins: number }> = {}; const lessons: { r: PurchaseRequest; t: string }[] = [];
  let est = 0;
  const rows = items.map(it => {
    const mid = matOf(it), m = mid ? S.materials[mid] : null, st = mid ? matStats(mid) : null;
    const prev = st ? st.buys.filter(e => e.reqId !== r.id) : [];
    const last = prev[prev.length - 1];
    if (last) est += last.unitTRY * (parseNum(it.qty) || 0);
    if (st) st.suppliers.forEach(s => { prevSup[s.supplierId] = prevSup[s.supplierId] || { id: s.supplierId, name: s.name, items: new Set(), wins: 0 }; prevSup[s.supplierId]!.items.add(it.name); prevSup[s.supplierId]!.wins += s.wins; });
    if (mid) Object.values(S.requests).forEach(o => { if (o.id !== r.id && o.award && o.award.lessons && (o.items || []).some(x => matOf(x) === mid)) lessons.push({ r: o, t: o.award.lessons! }); });
    return `<tr><td class="lead"><b>${m ? matLink(mid, it.name) : esc(it.name)}</b>${m ? `<span class="sub">${esc(m.code || "")}${m.category ? ", " + esc(m.category) : ""}</span>` : '<span class="sub">katalogda yok</span>'}${it.spec ? `<span class="sub">${esc(it.spec)}</span>` : ""}</td>
      <td class="r num">${numIn(parseNum(it.qty))} ${esc(it.unit)}</td>
      <td class="r num">${last ? `${money(last.unitTRY)}<span class="sub">${esc(last.supplier)}, ${fmtDate(last.date)}</span>` : '<span class="faint">ilk alım</span>'}</td>
      <td class="r num">${st && isNum(st.avgTRY) ? money(st.avgTRY) : "–"}${st && st.quotes ? `<span class="sub">${st.quotes} teklif kaydı</span>` : ""}</td>
      <td class="r num">${last ? money(last.unitTRY * (parseNum(it.qty) || 0), "TRY", 0) : "–"}</td></tr>`;
  });
  const ps = Object.values(prevSup).sort((a, b) => b.wins - a.wins);
  const uniq: { r: PurchaseRequest; t: string }[] = []; const seen = new Set<string>(); lessons.forEach(l => { if (!seen.has(l.r.id)) { seen.add(l.r.id); uniq.push(l); } });
  return `<div class="stack">
  <div class="panel"><div class="panel-h"><h2>Kalemler</h2><span class="sub">${items.length} kalem${est ? ", son fiyatlarla tahmini " + money(est, "TRY", 0) : ""}</span><span class="spacer"></span>${simple && r.status !== "draft" ? "" : `<button class="btn sm" data-act="edit-request">Düzenle</button>`}</div>
    <div class="tw"><table class="rt"><thead><tr><th>Kalem</th><th class="r">Miktar</th><th class="r">Son alış (birim)</th><th class="r">12 ay ort. teklif</th><th class="r">Tahmini tutar</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>${r.notes ? `<div class="panel-f small"><span class="muted">Talep notu:</span> ${esc(r.notes)}</div>` : ""}</div>
  ${!simple && (ps.length || uniq.length) ? `<div class="callout memory"><h3>Hafıza bu kalemler hakkında ne diyor</h3>
    ${ps.length ? `<p class="small" data-sa-y="5">Bu kalemler için daha önce teklif veren tedarikçiler:</p><div class="chips" data-sa-y="20">${ps.map(p => `<button class="chip" data-act="open-sup" data-id="${p.id}">${esc(p.name)}${p.wins ? ` <span class="faint">${p.wins} kez seçildi</span>` : ""}</button>`).join("")}</div>` : ""}
    ${uniq.length ? `<p class="small" data-sa-y="14">Önceki alımlardan notlar:</p>${uniq.slice(0, 4).map(l => `<div class="note" data-sa-y="20"><span class="xs muted">${esc(l.r.no)}, ${esc(l.r.title)}</span><br>${esc(l.t)}</div>`).join("")}` : ""}
  </div>` : ""}
  </div>`;
}
function tabQuotes(r: PurchaseRequest): string {
  const quotes = r.quotes || [], set = settings(), rfqs = r.rfqs || [];
  const pending = rfqs.filter(x => !quotes.some(q => q.supplierId === x.supplierId));
  const rfqPanel = rfqs.length ? `<section class="panel"><div class="panel-h"><h2>Teklif istekleri</h2><span class="sub">${rfqs.length - pending.length}/${rfqs.length} cevap geldi</span><span class="spacer"></span><button class="btn sm" data-act="rfq">Başka tedarikçiden iste</button>${pending.length ? '<button class="btn sm" data-act="bulk">Teklifleri gir</button>' : ""}</div>
    <div class="tw"><table class="rt"><thead><tr><th>Tedarikçi</th><th>İstendi</th><th>Son cevap</th><th>Durum</th><th></th></tr></thead><tbody>
    ${rfqs.map(x => { const q = quotes.find(q => q.supplierId === x.supplierId); const late = !q && x.dueDate && x.dueDate < todayStr(); const s = S.suppliers[x.supplierId]; return `<tr><td class="lead">${supLink(x.supplierId, s ? s.name : "Silinmiş tedarikçi")}</td><td class="num">${fmtDate(x.sentAt)}</td><td class="num">${fmtDate(x.dueDate)}</td><td>${q ? `<span class="flag good">cevap geldi ${fmtDate(q.date)}</span>` : late ? '<span class="flag bad">süre geçti</span>' : '<span class="flag mute">bekleniyor</span>'}</td><td class="r acts">${q ? "" : `<button class="btn sm" data-act="remind" data-sid="${x.supplierId}">Hatırlatma metni</button> <button class="btn sm" data-act="new-quote" data-sid="${x.supplierId}">Teklifini gir</button>`}</td></tr>`; }).join("")}
    </tbody></table></div></section>` : "";
  if (OPEN.includes(r.status) && (r.items || []).length) return `<div class="stack">${rfqPanel}${inlineBulkHTML(r)}</div>`;
  if (!quotes.length) return `<div class="stack">${rfqPanel}<div class="panel">${empty("Henüz teklif yok", rfqs.length ? "Tedarikçilerden cevap geldikçe teklifleri girin. Fiyatları Excel sütunundan toplu yapıştırabilirsiniz." : "Önce tedarikçilere aynı formatta teklif isteyin; hafıza bu kalemleri daha önce veren tedarikçileri önerir.", `${rfqs.length ? "" : '<button class="btn" data-act="rfq">Teklif iste</button>'}<button class="btn" data-act="new-quote" ${(r.items || []).length ? "" : "disabled"}>Tek teklif formu</button><button class="btn primary" data-act="bulk" ${(r.items || []).length ? "" : "disabled"}>Teklifleri gir</button>`)}</div></div>`;
  return `<div class="stack">${rfqPanel}
  <section class="panel"><div class="panel-h"><h2>Alınan teklifler</h2><span class="spacer"></span><button class="btn sm ghost" data-act="new-quote">Tek teklif formu</button><button class="btn sm" data-act="bulk">Teklifleri gir</button></div><div class="tw"><table class="rt"><thead><tr><th>Tedarikçi</th><th class="r">Toplam</th><th>Ödeme ve termin</th><th>Durum</th><th></th></tr></thead><tbody>
  ${quotes.map(q => {
    const c = quoteCalc(r, q, set), v = validity(q), s = S.suppliers[q.supplierId];
    const neg = isNum(q.firstTotal) && q.firstTotal - c.total > 0.005 ? `<span class="sub">ilk teklif ${money(q.firstTotal, q.currency)} ${deltaHTML((c.total - q.firstTotal) / q.firstTotal * 100)}</span>` : "";
    const fl: string[] = [];
    fl.push(q.compliant === false ? '<span class="flag bad">teknik uygun değil</span>' : c.covered < (r.items || []).length ? `<span class="flag warn">${c.covered}/${(r.items || []).length} kalem</span>` : '<span class="flag good">tüm kalemler</span>');
    if (v !== null) fl.push(v < 0 ? '<span class="flag bad">geçerlilik doldu</span>' : v <= 5 ? `<span class="flag warn">geçerlilik ${v} gün</span>` : `<span class="sub">geçerli ${fmtDate(q.validUntil)}</span>`);
    if (s && s.status === "suspended") fl.push('<span class="flag bad">askıda</span>');
    return `<tr><td class="lead"><b>${supLink(q.supplierId, supName(q))}</b><span class="sub">${fmtDate(q.date)}${q.revisions ? `, ${q.revisions}. revizyon` : ""}${q.note ? ", " + esc(q.note) : ""}</span></td>
    <td class="r num">${money(c.total, q.currency)}${q.currency !== "TRY" ? `<span class="sub">${money(c.totalTRY)}, kur ${nfx.format(c.rate)}</span>` : ""}${neg}</td>
    <td>${payText(q)}<span class="sub">${isNum(parseNum(q.leadDays)) ? parseNum(q.leadDays) + " gün termin" : "termin yok"}${q.deliveryTerm ? ", " + esc(q.deliveryTerm) : ""}</span></td>
    <td><div class="flags" data-sa-y="47">${fl.join("")}</div></td>
    <td class="acts"><div class="qacts"><button class="btn sm" data-act="edit-quote" data-qid="${q.id}">Düzenle</button><button class="btn sm ghost danger" data-act="del-quote" data-qid="${q.id}" aria-label="Teklifi sil">Sil</button></div></td></tr>`;
  }).join("")}</tbody></table></div></section>
</div>`;
}
export const UI: { wDraft: { id: string; w: Weights } | null; adv: Record<string, boolean> } = { wDraft: null, adv: {} };
function tabCompare(r: PurchaseRequest, detay = false): string {
  if (!(r.quotes || []).length) return `<div class="panel">${empty("Karşılaştırılacak teklif yok", "Teklifler girildikçe sıralama, kalem bazlı tablo ve geçmiş fiyatlarla kıyas burada oluşur.", '<button class="btn primary" data-act="bulk">Teklifleri gir</button>')}</div>`;
  const ev = evaluate(r, UI.wDraft && UI.wDraft.id === r.id ? UI.wDraft.w : null);
  const tw = sum(CRIT.map(c => +ev.w[c.k] || 0)) || 1;
  const preset = Object.entries(PRESETS).find(([, p]) => CRIT.every(c => Math.round((+ev.w[c.k] || 0) / tw * 100) === p.w[c.k]));
  return `<div class="stack">
    ${detay ? "" : `<div class="verdict-wrap" id="verdict">${verdictHTML(r, ev)}</div>`}
    <details class="adv" data-adv="weights" ${UI.adv.weights ? "open" : ""}><summary>Ağırlıklar: <b>${preset ? PRESETS[preset[0]]!.l : "özel"}</b> <span class="muted">(maliyet %${nf0.format((+ev.w.cost || 0) / tw * 100)}, termin %${nf0.format((+ev.w.lead || 0) / tw * 100)}, tedarikçi %${nf0.format((+ev.w.supplier || 0) / tw * 100)}, garanti %${nf0.format((+ev.w.warranty || 0) / tw * 100)})</span> · değiştir</summary>
    <section class="panel"><div class="panel-h"><h2>Neye önem veriyorsunuz?</h2><span class="spacer"></span><div class="presets">${Object.entries(PRESETS).map(([k, p]) => `<button class="chip" data-act="preset" data-k="${k}" aria-pressed="${!!preset && preset[0] === k}" title="${p.d}">${p.l}</button>`).join("")}</div></div>
      <div class="panel-b"><div class="weights">${CRIT.map(c => `<label><span class="wv"><span><i class="${c.c}" data-sa-y="48"></i>${c.l}</span><b id="wv-${c.k}">%${nf0.format((+ev.w[c.k] || 0) / tw * 100)}</b></span><input type="range" min="0" max="100" step="5" value="${+ev.w[c.k] || 0}" data-w="${c.k}" aria-label="${c.l} ağırlığı"></label>`).join("")}</div></div>
    </section></details>
    ${detay ? "" : `<section class="panel" id="rank-panel">${rankHTML(r, ev)}</section>`}
    ${ev.split && ev.split.suggested ? `<div class="callout"><h3>Kalem bazlı bölme seçeneği</h3><p data-sa-y="20">${ev.split.best ? `Kalemleri ${ev.split.used.length} tedarikçiye bölerseniz nakliye ve masraflar dahil net maliyet ${money(ev.split.total, "TRY", 0)} olur; en uygun tek tedarikçi ${esc(supName(ev.split.best.q))} ile ${money(ev.split.bestTotal, "TRY", 0)}. Fark <b>${money(ev.split.saving, "TRY", 0)}</b>.` : `Hiçbir tedarikçi tüm kalemlere teklif vermedi; alım ancak bölünerek yapılabilir. En uygun dağılım nakliye dahil ${money(ev.split.total, "TRY", 0)}.`}</p>
      <ul data-sa-y="49">${ev.split.plan.groups.map(g => `<li>${esc(supName(g.x.q))}: ${g.items.map(it => esc(it.name)).join(", ")}${g.extras > 0.5 ? ` <span class="muted small">(+${money(g.extras, "TRY", 0)} nakliye ve masraf)</span>` : ""}${g.late ? ` <span class="flag bad">ihtiyaç tarihini ${g.late} gün kaçırır</span>` : ""}</li>`).join("")}</ul>
      <div class="row" data-sa-y="16"><button class="btn sm" data-act="split-review">Dağılımı karar ekranında incele</button><button class="btn sm" data-act="paylastir-git">Miktarı bölerek dene</button><span class="small muted">Ayrı siparişler, ayrı teslimat takibi gerektirir.</span></div></div>` : ""}
    <details class="adv" data-adv="matrix" ${UI.adv.matrix ? "open" : ""}><summary>Kalem kalem karşılaştırma tablosu</summary><section class="panel"><div class="panel-h"><h2>Kalem ve şart karşılaştırması</h2><span class="spacer"></span><button class="btn sm" data-act="csv">CSV indir</button></div>${matrixHTML(r, ev)}</section></details>
    <p class="small muted">Tutarlar KDV hariç. Net maliyet: vade etkisi dahil, ${OPEN.includes(r.status) ? "güncel" : "sipariş günü"} kurla TL. Her teklifin adım adım hesabı için "Hesabı göster".</p>
  </div>`;
}
export const PRESETS: Record<string, { l: string; d: string; w: Weights }> = {
  balanced: { l: "Dengeli", d: "Maliyet öncelikli, teslim ve güvenilirlik de önemli", w: { cost: 50, lead: 20, supplier: 20, warranty: 10 } },
  price: { l: "Fiyat odaklı", d: "Standart malzeme, acelesi yok", w: { cost: 70, lead: 10, supplier: 15, warranty: 5 } },
  urgent: { l: "Acil ihtiyaç", d: "Hat duruşu riski, zamanında gelmesi şart", w: { cost: 35, lead: 40, supplier: 20, warranty: 5 } },
  trust: { l: "Kalite ve güven", d: "Kritik parça, tedarikçi geçmişi belirleyici", w: { cost: 40, lead: 15, supplier: 35, warranty: 10 } }
};
/* sıralamanın birincisini sade bir dille gerekçelendirir */
/** Önerilen teklifin gerekçeleri (öneri kartı ve onaylayan ekranı ortak kullanır) */
export function verdictReasons(r: PurchaseRequest, ev: Evaluation): string[] {
  const top = ev.ranking[0]!; if (!top) return [];
  const sec = ev.ranking[1];
  const why: string[] = [];
  const cheapest = ev.elig.filter(x => x.c.covered === (r.items || []).length).sort((a, b) => a.c.pvTRY - b.c.pvTRY)[0];
  if (cheapest && cheapest.q.id === top.q.id) why.push(`En düşük net maliyet: ${money(top.c.pvTRY, "TRY", 0)}${sec ? `, ikinciden ${money(sec.c.pvTRY - top.c.pvTRY, "TRY", 0)} ucuz` : ""}`);
  else if (cheapest) why.push(`Net maliyet ${money(top.c.pvTRY, "TRY", 0)}; en ucuz teklif (${supName(cheapest.q)}) ${money(top.c.pvTRY - cheapest.c.pvTRY, "TRY", 0)} daha düşük`);
  const ld = parseNum(top.q.leadDays);
  if (ld !== null) { const late = top.late; const slack = r.needDate ? dayDiff(addDays(todayStr(), ld), r.needDate) : null; why.push(late ? `Termin ${ld} gün; ihtiyaç tarihini ${late} gün kaçırıyor` : `Termin ${ld} gün${slack !== null ? `, ihtiyaç tarihine ${slack} gün pay` : ""}`); }
  if (top.c.vadeGain > 1) why.push(`${payText(top.q)}: vade avantajı ${money(top.c.vadeGain, "TRY", 0)}`);
  const st = supplierStats()[top.q.supplierId];
  if (st && st.deliveries) why.push(`Geçmiş teslimatların ${pct(st.onTimeRate)} kadarı zamanında (${st.onTime}/${st.deliveries})`);
  return why;
}
export function verdictHTML(r: PurchaseRequest, ev: Evaluation): string {
  const top = ev.ranking[0]!; if (!top) return "";
  const sec = ev.ranking[1];
  const why = verdictReasons(r, ev), warn: string[] = [];
  if (top.fill > 0) warn.push(`${(r.items || []).length - top.c.covered} kaleme teklif vermedi`);
  if (top.suspended) warn.push("tedarikçi askıda");
  const v = validity(top.q); if (v !== null && v <= 3) warn.push(v < 0 ? "teklifin geçerliliği doldu" : `teklif ${v} gün içinde geçersiz olacak`);
  let vs = "";
  if (sec) {
    const dc = sec.c.pvTRY - top.c.pvTRY, dl = (parseNum(sec.q.leadDays) ?? 0) - (parseNum(top.q.leadDays) ?? 0);
    const parts = [];
    if (Math.abs(dc) >= 1) parts.push(dc > 0 ? `${money(dc, "TRY", 0)} daha pahalı` : `${money(-dc, "TRY", 0)} daha ucuz`);
    if (dl) parts.push(dl > 0 ? `${dl} gün daha yavaş` : `${-dl} gün daha hızlı`);
    vs = `İkinci sıradaki ${supName(sec.q)} (puan ${nf0.format(sec.score)})${parts.length ? ": " + parts.join(", ") : ""}.${Math.abs(top.score - sec.score) < 3 ? " Puanlar çok yakın; ağırlıkları değiştirerek sonucu sınayın." : ""}`;
  }
  if (ev.split && ev.split.suggested && ev.split.best) vs += ` Alternatif: kalemleri ${ev.split.used.length} tedarikçiye bölmek nakliye dahil ${money(ev.split.saving, "TRY", 0)} daha ucuz.`;
  return `<div class="verdict"><div><div class="vk">Önerilen teklif</div><h2>${esc(supName(top.q))}</h2><ul>${why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>${warn.length ? `<div class="flags" data-sa-y="5">${warn.map(w => `<span class="flag warn">${esc(w)}</span>`).join("")}</div>` : ""}${vs ? `<p class="vs">${esc(vs)}</p>` : ""}</div>
    <div class="vside"><div class="vscore">${nf0.format(top.score)}<small> / 100</small></div><div class="row"><button class="btn" data-act="calc" data-qid="${top.q.id}">Hesabı göster</button>${OPEN.includes(r.status) ? `<button class="btn primary" data-act="pick" data-qid="${top.q.id}">Bu teklifi seç</button>` : ""}</div></div></div>`;
}
export function rankHTML(r: PurchaseRequest, ev: Evaluation): string {
  const off = ev.all.filter(x => !ev.elig.includes(x));
  const awardQ = r.award && r.award.mode !== "split" ? r.award.quoteId : null;
  return `<div class="panel-h"><h2>Sıralama</h2><span class="spacer"></span><div class="legend">${CRIT.map(c => `<span><i class="${c.c}"></i>${c.l}</span>`).join("")}</div></div>
  ${ev.ranking.length ? `<ol class="rank">${ev.ranking.map((x, i) => {
    const v = validity(x.q), fl: string[] = [];
    if (x.fill > 0) fl.push(`<span class="flag warn">${(r.items || []).length - x.c.covered} kalem eksik, tek başına seçilemez</span>`);
    if (x.late) fl.push(`<span class="flag bad">ihtiyaç tarihini ${x.late} gün kaçırır</span>`);
    if (x.suspended) fl.push('<span class="flag bad">askıdaki tedarikçi</span>');
    if (v !== null && v < 0) fl.push('<span class="flag bad">geçerlilik doldu</span>');
    else if (v !== null && v <= 5) fl.push(`<span class="flag warn">geçerlilik ${v} gün</span>`);
    if (awardQ === x.q.id) fl.push('<span class="flag good">seçildi</span>');
    return `<li class="${i === 0 ? "top" : ""}"><span class="pos">${i + 1}</span>
      <div class="who"><b>${esc(supName(x.q))}</b><div class="facts"><span>${money(x.c.pvTRY, "TRY", 0)} net</span><span>${isNum(parseNum(x.q.leadDays)) ? parseNum(x.q.leadDays) + " gün termin" : "termin yok"}</span><span>${payText(x.q)}</span></div></div>
      <div class="barwrap"><div class="bar" role="img" aria-label="Puan dağılımı">${CRIT.map(c => `<span class="${c.c}" style="width:${x.parts[c.k].toFixed(2)}%" title="${c.l}: ${nf0.format(x.s[c.k])} / 100"></span>`).join("")}</div>${fl.length ? `<div class="flags">${fl.join("")}</div>` : ""}</div>
      <div class="row" data-sa-y="10"><span class="score">${nf0.format(x.score)}</span><button class="btn sm ghost" data-act="calc" data-qid="${x.q.id}">Hesabı göster</button>${OPEN.includes(r.status) ? `<button class="btn sm ${i === 0 ? "primary" : ""}" data-act="pick" data-qid="${x.q.id}">Seç</button>` : ""}</div></li>`;
  }).join("")}</ol>` : `<div class="empty">Değerlendirmeye uygun teklif yok. Fiyatları ve teknik uygunluk işaretini kontrol edin.</div>`}
  ${off.length ? `<div class="panel-f small muted">Sıralama dışı: ${off.map(x => esc(supName(x.q)) + (x.q.compliant === false ? " (teknik uygun değil)" : " (fiyat girilmemiş)")).join(", ")}</div>` : ""}`;
}
function matrixHTML(r: PurchaseRequest, ev: Evaluation): string {
  const cols = ev.all, items = r.items || [];
  const eligSet = new Set(ev.elig.map(x => x.q.id));
  const winner = ev.ranking[0] ? ev.ranking[0].q.id : null;
  const best = (vals: (number | null)[], dir: "min" | "max"): Set<number> => {
    const ok = vals.map((v, i) => ({ v, i })).filter((o): o is { v: number; i: number } => isNum(o.v) && eligSet.has(cols[o.i]!.q.id));
    if (ok.length < 2) return new Set<number>();
    const target = dir === "min" ? Math.min(...ok.map(o => o.v)) : Math.max(...ok.map(o => o.v));
    if (ok.every(o => Math.abs(o.v - target) < 1e-9)) return new Set<number>();
    return new Set(ok.filter(o => Math.abs(o.v - target) < 1e-9).map(o => o.i));
  };
  const row = (label: string, cells: string[], vals?: (number | null)[] | null, dir?: "min" | "max" | null, cls = ""): string => {
    const b = dir && vals ? best(vals, dir) : new Set<number>();
    return `<tr class="${cls}"><td class="rl">${label}</td>${cells.map((c, i) => `<td class="r ${b.has(i) ? "best" : ""} ${eligSet.has(cols[i]!.q.id) ? "" : "off"}">${c}</td>`).join("")}</tr>`;
  };
  const sec = (l: string) => `<tr class="sec"><td class="rl">${l}</td>${cols.map(() => "<td></td>").join("")}</tr>`;
  const sst = supplierStats();
  let h = `<div class="tw"><table class="matrix"><thead><tr><th class="rl">Kalem / şart</th>${cols.map(x => `<th class="r ${x.q.id === winner ? "win" : ""}"><span class="sn">${esc(supName(x.q))}</span>${esc(x.q.currency)}, ${fmtDate(x.q.date)}</th>`).join("")}</tr></thead><tbody>`;
  h += sec("Birim fiyatlar");
  items.forEach(it => {
    const vals = cols.map(x => x.c.lines[it.id] ? x.c.lines[it.id]!.unit * x.c.unitTRY : null);
    const any = vals.find(isNum); const vl = isNum(any) ? vsLast(r, it, any) : null;
    h += row(`${esc(it.name)}<span class="sub">${numIn(parseNum(it.qty))} ${esc(it.unit)}${vl ? `, son alış ${money(vl.last.unitTRY)}` : ""}</span>`,
      cols.map(x => { const l = x.c.lines[it.id]; if (!l) return '<span class="faint">teklif yok</span>'; const d = vsLast(r, it, l.unit * x.c.unitTRY); return `${money(l.unit, x.q.currency)}<span class="sub">${money(l.line, x.q.currency)}${d ? " " + deltaHTML(d.pct) : ""}</span>`; }), vals, "min");
  });
  h += sec("Ticari şartlar");
  h += row("Ara toplam", cols.map(x => money(x.c.sub, x.q.currency)));
  h += row("İskonto", cols.map(x => x.c.disc ? "%" + nfx.format(x.c.disc * 100) : "–"));
  h += row("Nakliye ve diğer masraflar", cols.map(x => x.q.deliveryIncluded && !x.c.other ? "dahil" : money(x.c.ship + x.c.other, x.q.currency)));
  h += row("Toplam (teklif para birimi)", cols.map(x => money(x.c.total, x.q.currency)));
  h += row(OPEN.includes(r.status) ? "Kur (güncel)" : "Kur (sipariş günü)", cols.map(x => x.q.currency === "TRY" ? "–" : `${nfx.format(x.c.rate)}${isNum(x.q.fxRate) && Math.abs(x.q.fxRate - x.c.rate) > 1e-6 ? `<span class="sub">teklif günü ${nfx.format(x.q.fxRate)}</span>` : ""}`));
  h += row("Toplam TL", cols.map(x => money(x.c.totalTRY)), cols.map(x => x.c.covered === items.length ? x.c.totalTRY : null), "min", "key");
  h += row("Ödeme şekli", cols.map(x => payText(x.q)), cols.map(x => (parseNum(x.q.payDays) || 0) * (1 - clamp((parseNum(x.q.advancePct) || 0) / 100, 0, 1))), "max", "wrap");
  h += row("Vade avantajı", cols.map(x => x.c.vadeGain > 0.5 ? money(x.c.vadeGain) : "–"));
  h += row("Net bugünkü maliyet", cols.map(x => money(x.c.pvTRY)), cols.map(x => x.c.covered === items.length ? x.c.pvTRY : null), "min", "key");
  h += sec("Teslimat");
  h += row("Termin", cols.map(x => { const l = parseNum(x.q.leadDays); const late = lateBy(r, x.q); return l === null ? "–" : `${l} gün${late ? `<span class="sub"><span class="flag bad">${late} gün geç</span></span>` : ""}`; }), cols.map(x => parseNum(x.q.leadDays)), "min");
  h += row("Tahmini teslim", cols.map(x => { const l = parseNum(x.q.leadDays); return l === null ? "–" : fmtDate(addDays((r.award && r.award.orderDate) || todayStr(), l)); }));
  h += row("Teslim şekli", cols.map(x => esc(x.q.deliveryTerm || "–")), null, null, "wrap");
  h += row("Garanti", cols.map(x => isNum(parseNum(x.q.warrantyMonths)) ? parseNum(x.q.warrantyMonths) + " ay" : "–"), cols.map(x => parseNum(x.q.warrantyMonths)), "max");
  h += row("Teklif geçerliliği", cols.map(x => { const v = validity(x.q); return v === null ? "–" : v < 0 ? '<span class="flag bad">doldu</span>' : fmtDate(x.q.validUntil); }));
  h += sec("Tedarikçi geçmişi");
  h += row("Puanınız", cols.map(x => { const s = S.suppliers[x.q.supplierId]; return s ? stars(s.rating) : "–"; }), cols.map(x => { const s = S.suppliers[x.q.supplierId]; return s ? parseNum(s.rating) : null; }), "max");
  h += row("Zamanında teslim", cols.map(x => { const st = sst[x.q.supplierId]; return st && st.deliveries ? `${pct(st.onTimeRate)}<span class="sub">${st.onTime}/${st.deliveries} teslimat</span>` : '<span class="faint">kayıt yok</span>'; }), cols.map(x => { const st = sst[x.q.supplierId]; return st && st.deliveries ? st.onTimeRate : null; }), "max");
  h += row("Kalite", cols.map(x => { const st = sst[x.q.supplierId]; return st && st.qualityN ? pct(st.qualityRate) + " sorunsuz" : '<span class="faint">kayıt yok</span>'; }));
  h += row("Teknik uygunluk", cols.map(x => x.q.compliant === false ? '<span class="flag bad">uygun değil</span>' : '<span class="flag good">uygun</span>'));
  h += row("Toplam puan", cols.map(x => { const e = ev.elig.find(y => y.q.id === x.q.id); return e ? nf0.format(e.score) : "–"; }), cols.map(x => { const e = ev.elig.find(y => y.q.id === x.q.id); return e ? e.score : null; }), "max", "key");
  return h + "</tbody></table></div>";
}

/* ================= karar, onay, sipariş, teslim ================= */
export function tabDecision(r: PurchaseRequest, part: "select" | "split" | "approval" | "order" | "delivery" | "all" = "all"): string {
  const ev = (r.quotes || []).length ? evaluate(r) : null;
  if ((!ev || !ev.elig.length) && part === "split") return "";
  if (!ev || !ev.elig.length) return `<div class="panel">${empty("Karar için teklif gerekiyor", "Fiyatı girilmiş ve teknik olarak uygun en az bir teklif olmalı.", '<button class="btn primary" data-act="bulk">Teklifleri gir</button>')}</div>`;
  const a: Partial<Award> = r.award || {}, top = ev.ranking[0]!;
  const sel = a.quoteId || top.q.id;
  const canSplit = !!ev.split;
  const tt = r.award ? awardTotals(r) : null;
  const ap = tt ? requiredApprover(tt.totalTRY) : null;
  const approvals = a.approvals || [];
  const aps = approvalState(r);
  const approved = aps.state === "approved";
  // Sunucu durum dışı onay ve siparişi zaten reddeder; düğme yalnız işlem geçerliyken görünür (SA4).
  const canApprove = aps.state === "pending" && r.status === "approval";
  const bu = r.department && tt ? budgetUse(r.department, todayStr().slice(0, 4)) : null;
  const decided = !!r.award;
  const ordered = COMMITTED.includes(r.status);
  const isSplit = decided && a.mode === "split";
  const orders = awardOrders(r);
  const assign = a.mode === "split" && a.splits ? a.splits : (canSplit ? ev.split!.plan.assign : {});
  const panel = (_n: number, title: string, state: string, body: string, open: boolean) => `<section class="panel"><div class="panel-h"><h2>${title}</h2><span class="spacer"></span>${state}</div>${open ? `<div class="panel-b stack">${body}</div>` : ""}</section>`;
  const splitLabel = !ev.split ? "" : ev.split.suggested ? ` <span class="flag good">${ev.split.best ? money(ev.split.saving, "TRY", 0) + " daha uygun" : "gerekli"}</span>` : ' <span class="muted small">(en uygun seçenek tek tedarikçi)</span>';
  const delivered = orders.filter(o => o.deliveredDate).length;
  // Kart #956: teklifler tek tabloda; önerilen seçili gelir, satıra basmak seçer, önerilenden ayrılınca gerekçe açılır; tek düğme.
  const lock = ordered ? "disabled" : "";
  const tekSecili = (qid: string) => !isSplit && qid === sel;
  const nitelik = (x: EvalRow): string[] => {
    const v = validity(x.q), fl: string[] = [];
    if (x.fill > 0) fl.push(`<span class="flag warn">${(r.items || []).length - x.c.covered} kalem eksik</span>`);
    if (x.late) fl.push(`<span class="flag bad">ihtiyacı ${x.late} gün kaçırır</span>`);
    if (x.suspended) fl.push('<span class="flag bad">askıdaki tedarikçi</span>');
    if (v !== null && v < 0) fl.push('<span class="flag bad">geçerlilik doldu</span>');
    else if (v !== null && v <= 5) fl.push(`<span class="flag warn">geçerlilik ${v} gün</span>`);
    return fl;
  };
  const satir = (x: EvalRow, i: number) => {
    const ld = parseNum(x.q.leadDays), gm = parseNum(x.q.warrantyMonths), fl = nitelik(x);
    return `<tr class="click${tekSecili(x.q.id) ? " sel" : ""}" data-act="sec-teklif" data-qid="${x.q.id}">
      <td><input type="radio" name="d-sec" value="${x.q.id}" ${tekSecili(x.q.id) ? "checked" : ""} ${lock} aria-label="${esc(supName(x.q))} teklifini seç"></td>
      <td class="lead"><b>${esc(supName(x.q))}</b>${i === 0 ? ' <span class="flag good">Önerilen</span>' : ""}${fl.length ? `<span class="sub">${fl.join(" ")}</span>` : ""}</td>
      <td class="r num">${money(x.c.pvTRY, "TRY", 0)}</td><td class="num">${isNum(ld) ? ld + " gün" : "–"}</td><td>${esc(payText(x.q))}</td>
      <td class="num">${isNum(gm) ? gm + " ay" : "–"}</td><td class="r num"><b>${nf0.format(x.score)}</b></td>
      <td class="r"><button class="btn sm ghost" data-act="calc" data-qid="${x.q.id}">Hesap</button></td></tr>`;
  };
  const disarida = ev.all.filter(x => !ev.elig.includes(x));
  const neden = verdictReasons(r, ev);
  const tekGerekce = !isSplit && sel !== top.q.id;
  const p1 = `<section class="panel sa-karar" data-top="${top.q.id}">
    <div class="panel-h"><h2>Teklifler</h2><span class="sub">${ordered ? "Sipariş verildiği için seçim kilitli" : "Önerilen seçili gelir; başka teklif için satırına basın"}</span><span class="spacer"></span>${decided ? '<span class="flag good">karar verildi</span>' : ""}</div>
    ${isSplit ? '<div class="callout small">Karar kalem bazlı bölmeyle verildi; ayrıntısı "Ayrıntılar ve bölme" altında. Tek tedarikçiye dönmek için bir satır seçip onaya gönderin.</div>' : ""}
    <div class="tw"><table class="rt sa-karar-t"><thead><tr><th><span class="sr-only">Seç</span></th><th>Tedarikçi</th><th class="r">Net maliyet</th><th>Termin</th><th>Ödeme</th><th>Garanti</th><th class="r">Puan</th><th></th></tr></thead><tbody>
      ${ev.ranking.map(satir).join("")}
      ${disarida.map(x => `<tr class="off"><td></td><td class="lead">${esc(supName(x.q))}<span class="sub">${x.q.compliant === false ? "teknik uygun değil" : "fiyat girilmemiş"}</span></td><td colspan="6" class="muted small">Değerlendirme dışı</td></tr>`).join("")}
    </tbody></table></div>
    ${neden.length ? `<p class="small muted">Neden önerildi: ${neden.map(esc).join("; ")}.</p>` : ""}
    <input type="hidden" id="d-quote" value="${esc(sel)}">
    <input type="hidden" id="d-by" value="${esc(a.by || S.me?.name || "")}">
    <label class="f" id="d-reason-wrap" ${tekGerekce ? "" : "hidden"}><span>Gerekçe <small>— önerilen teklif seçilmediği için zorunlu</small></span><textarea id="d-reason" placeholder="Örn. termin kritik, ikinci sıradaki tedarikçi stoktan teslim ediyor" ${lock}>${esc(!isSplit ? a.reason || "" : "")}</textarea></label>
    ${ordered ? "" : `<div class="row"><button class="btn primary" data-act="save-decision" data-mode="single">${aps.state === "rejected" ? "Yeniden onaya gönder" : decided ? "Kararı güncelle ve onaya gönder" : "Onaya gönder"}</button>${decided ? '<button class="btn ghost danger" data-act="clear-decision">Kararı kaldır</button>' : ""}</div>`}
  </section>`;
  const bolme = canSplit ? `<section class="panel" id="d-split-panel"><div class="panel-h"><h2>Kalem bazlı böl</h2>${splitLabel}</div><div class="panel-b stack">
    <div id="d-split">${splitEditorHTML(r, ev, assign, ordered)}</div>
    <label class="f"><span>Gerekçe <small>— en uygun dağılım seçilmezse zorunlu</small></span><textarea id="d-reason-split" ${lock}>${esc(isSplit ? a.reason || "" : "")}</textarea></label>
    ${ordered ? "" : '<div class="row"><button class="btn" data-act="save-decision" data-mode="split">Bölerek onaya gönder</button></div>'}
  </div></section>` : "";
  const p2 = `${panel(2, "Onay", approved ? '<span class="flag good">onaylandı</span>' : aps.state === "rejected" ? '<span class="flag bad">reddedildi</span>' : aps.resubmitted ? '<span class="flag warn">yeniden onay bekliyor</span>' : decided ? '<span class="flag warn">onay bekliyor</span>' : '<span class="flag mute">karardan sonra</span>', `
    <div class="kv">
      <div><div class="k">Tutar</div><div class="v">${tt ? money(tt.totalTRY, "TRY", 0) : "–"}</div><div class="d">KDV hariç${isSplit ? ", nakliye dahil" : ""}</div></div>
      <div><div class="k">Gereken onay</div><div class="v" data-sa-y="22">${ap ? esc(ap.role) : "–"}</div><div class="d">Ayarlar'daki limitlere göre</div></div>
      ${bu && tt ? `<div><div class="k">${esc(r.department)} bütçesi</div><div class="v">${bu.budget ? pct((bu.used + (ordered ? 0 : tt!.totalTRY)) / bu.budget * 100) : "–"}</div><div class="d">${bu.budget ? `bu alımla ${short(bu.used + (ordered ? 0 : tt!.totalTRY))} / ${short(bu.budget)}` : "bütçe tanımlı değil"}</div></div>` : ""}
    </div>
    ${approvals.length ? `<ul class="log">${approvals.map(x => `<li><time>${fmtTs(x.at)}</time><span><b>${x.decision === "approved" ? "Onaylandı" : "Reddedildi"}</b>, ${esc(x.name || nameOf(x.by))}${x.note ? `: ${esc(x.note)}` : ""}</span></li>`).join("")}</ul>` : ""}
    ${canApprove ? `<div class="grid g2"><label class="f"><span>Onaylayan</span><input type="text" id="ap-name" value="${esc(S.me?.name ?? "")}" readonly></label><label class="f"><span>Not</span><input type="text" id="ap-note" placeholder="İsteğe bağlı"></label></div>
    <div class="row"><button class="btn good" data-act="approve">Onayla</button><button class="btn" data-act="approval-form">Onay formu</button><button class="btn bad" data-act="reject">Reddet ve değerlendirmeye geri gönder</button><span class="small muted">Onay özetini e-postayla göndermek için aşağıdaki karar özetini kopyalayın.</span></div>` : ordered ? "" : `<div class="row"><button class="btn" data-act="approval-form">Onay formu</button><span class="small muted">${aps.state === "rejected" ? "Karar reddedildi. Seçimi güncelleyip yeniden onaya gönderin." : approved ? "Karar onaylandı; sipariş verilebilir." : "Onay, karar onaya gönderildiğinde açılır."}</span></div>`}`, decided)}`;
  const p3 = `${panel(3, isSplit ? `Siparişler (${orders.length} tedarikçi)` : "Sipariş", ordered ? '<span class="flag good">sipariş verildi</span>' : '<span class="flag mute">onaydan sonra</span>', `
    ${approved || ordered ? `${isSplit ? ordersFormHTML(r, orders) : singleOrderHTML(r, a)}
    <div class="row"><button class="btn primary" data-act="place-order">${ordered ? "Sipariş bilgisini güncelle" : isSplit ? "Siparişleri verildi olarak işaretle" : "Siparişi verildi olarak işaretle"}</button>${ordered ? '<button class="btn" data-act="order-item-change">Kalemi değiştir</button><button class="btn" data-act="order-close">Kalanı kapat</button><button class="btn" data-act="order-invoices">Faturalar</button><button class="btn" data-act="order-certs">Sertifikalar</button>' : ""}</div>
    ${teslimYontemiHTML(r)}` : '<p class="small muted">Sipariş, karar onaylandıktan sonra verilir.</p>'}`, decided)}`;
  // Kart #1124: sipariş verilince üzerinde mal kabul ve finans takibi ile ödeme planı görünür.
  const pt = ordered ? `<section class="panel" data-sa-takip-paneli><div class="panel-h"><h2>Sipariş takibi</h2><span class="sub">mal kabul, fatura ve ödeme planı</span></div><div class="panel-b">${siparisTakibiHTML(r, orders)}</div></section>` : "";
  const p4 = `${panel(4, "Teslim ve değerlendirme", r.status === "received" ? '<span class="flag good">teslim alındı</span>' : isSplit && delivered ? `<span class="flag warn">${delivered}/${orders.length} teslim alındı</span>` : '<span class="flag mute">siparişten sonra</span>', `
    ${teslimBilgisiHTML(a, orders, isSplit)}
    <label class="f"><span>Bu alımdan öğrenilenler <small>— bir sonraki alımda kalemlerin ve tedarikçinin sayfasında görünür</small></span><textarea id="t-lessons" placeholder="Örn. Muadil marka sorunsuz çıktı. Ambalaj hasarlı geldi, sevkiyatta palet şartı koyun.">${esc(a.lessons || "")}</textarea></label>
    <div class="row"><button class="btn primary" data-act="save-lessons">Öğrenilenleri kaydet</button><span class="small muted">Teslim stokta mal kabul belgesiyle alınır, kalite GKK adımından gelir; burada yalnız görüntülenir.</span></div>`, ordered)}`;
  const ps = `${decided ? `<section class="panel"><div class="panel-h"><h2>Karar özeti</h2><span class="sub">Onay e-postası veya dosya için</span><span class="spacer"></span><button class="btn sm" data-act="approval-form">Onay formu</button><button class="btn sm" data-act="copy-summary">Kopyala</button><button class="btn sm" data-act="csv">CSV indir</button></div><div class="panel-b"><pre class="out">${esc(summaryText(r))}</pre></div></section>` : ""}`;
  if (part === "select") return p1;
  if (part === "split") return bolme;
  if (part !== "all") return decided ? `<div class="stack">${part === "approval" ? p2 + ps : part === "order" ? p3 + pt : pt + p4}</div>` : `<div class="panel">${empty("Henüz karar verilmedi", "Önce karşılaştırıp bir teklif ya da dağılım seçin; karar onaya gönderilince bu bölüm açılır.", '<button class="btn primary" data-act="tab" data-tab="compare">Karşılaştır ve karar ver</button>')}</div>`;
  return `<div class="stack">${p1}${p2}${p3}${pt}${p4}${ps}</div>`;
}
/** Siparişin Logo rozeti (#205 karar 1): durum, gönderildiyse Logo kayıt numarası, hatada metni. İptal varsa onun durumu öne geçer. */
export function logoRozeti(l: SiparisLogo | null | undefined): string {
  if (!l) return "";
  const r = (ton: string, metin: string, baslik = "") => ` <span class="flag ${ton}"${baslik ? ` title="${esc(baslik)}"` : ""}>${esc(metin)}</span>`;
  if (l.iptalDurumu === "gonderildi") return r("mute", `Logo: iptal edildi${l.kayitNo ? ` (${l.kayitNo})` : ""}`);
  if (l.iptalDurumu === "bekliyor") return r("warn", "Logo: iptal bekliyor");
  if (l.iptalDurumu === "hata") return r("bad", "Logo: iptal hatası", l.iptalHata ?? "");
  if (l.kapatmaDurumu === "gonderildi") return r("mute", `Logo: kalanı kapatıldı${l.kayitNo ? ` (${l.kayitNo})` : ""}`);
  if (l.kapatmaDurumu === "bekliyor") return r("warn", "Logo: kapatma bekliyor");
  if (l.kapatmaDurumu === "hata") return r("bad", "Logo: kapatma hatası", l.kapatmaHata ?? "");
  if (l.guncellemeDurumu === "bekliyor") return r("warn", `Logo: düzenleme bekliyor${l.kayitNo ? ` (${l.kayitNo})` : ""}`);
  if (l.guncellemeDurumu === "hata") return r("bad", "Logo: düzenleme hatası", l.guncellemeHata ?? "");
  if (l.durum === "gonderildi") return r("good", `Logo: gönderildi${l.kayitNo ? ` (${l.kayitNo})` : ""}`);
  if (l.durum === "hata") return r("bad", `Logo hatası: ${l.hata ?? ""}`);
  return r("warn", "Logo: gönderim bekliyor");
}
/* Kart #1310: malzemeyi tedarikçi mi getirir, biz mi alırız; "biz alacağız" siparişi sevkiyat bekleme listesine alım olarak düşer */
function teslimYontemiHTML(r: PurchaseRequest): string {
  const dugme = (v: string, l: string) => `<button data-act="teslim-yontemi" data-v="${v}" aria-pressed="${r.teslimYontemi === v}">${l}</button>`;
  return `<div class="row" data-sa-teslim-yontemi><span class="small">Teslim</span><div class="seg" role="group" aria-label="Teslim yöntemi">${dugme("firma_getirir", "Tedarikçi getirir")}${dugme("biz_alacagiz", "Biz alacağız")}</div><span class="small muted">${r.teslimYontemi === "biz_alacagiz" ? "Sipariş sevkiyatta tedarikçiden alım olarak bekler." : "Biz alacaksak sipariş sevkiyatta alım olarak bekler."}</span></div>`;
}
function singleOrderHTML(r: PurchaseRequest, a: Partial<Award>): string {
  const selQ = (r.quotes || []).find(q => q.id === a.quoteId);
  const ld = selQ ? parseNum(selQ.leadDays) : null;
  const expDefault = a.expectedDate || (a.orderDate && ld !== null ? addDays(a.orderDate, ld) : "");
  return `<p class="small muted">Sipariş no: ${a.orderNo ? `<b>${esc(a.orderNo)}</b>` : "sipariş verilince TMI verir (numara kuralı)"}${logoRozeti(a.logo)}</p><div class="grid g3">
      <label class="f"><span>Logo / tedarikçi no</span><input type="text" id="o-po" value="${esc(a.poNo || "")}"></label>
      <label class="f"><span>Sipariş tarihi</span><input type="date" id="o-date" value="${esc(a.orderDate || todayStr())}"></label>
      <label class="f"><span>Beklenen teslim <small>— boşsa termine göre</small></span><input type="date" id="o-exp" value="${esc(expDefault)}"></label>
    </div>${selQ ? `<div class="row"><button class="btn sm" data-act="po-text" data-qid="${selQ.id}">Sipariş metni</button><span class="small muted">Tedarikçiye gönderilecek sipariş e-postası</span></div>` : ""}`;
}
/* kalem bazlı kararda her tedarikçiye ayrı sipariş satırı */
function ordersFormHTML(r: PurchaseRequest, orders: OrderInfo[]): string {
  return `<div class="tw"><table class="itbl rt" id="orders-form"><thead><tr><th>Tedarikçi</th><th>Sipariş no</th><th>Logo / tedarikçi no</th><th>Sipariş tarihi</th><th>Beklenen teslim</th><th></th></tr></thead><tbody>
  ${orders.map(o => { const ld = parseNum(o.q.leadDays); return `<tr data-order="${o.qid}"><td class="lead"><b>${esc(supName(o.q))}</b><span class="sub">${o.items.map(it => esc(it.name)).join(", ")}${ld !== null ? `, termin ${ld} gün` : ""}</span></td>
    <td class="num">${o.orderNo ? esc(o.orderNo) : '<span class="muted">sipariş verilince</span>'}${logoRozeti(o.logo)}</td>
    <td><input type="text" data-of="poNo" value="${esc(o.poNo)}"></td>
    <td><input type="date" data-of="orderDate" value="${esc(o.orderDate || todayStr())}"></td>
    <td><input type="date" data-of="expectedDate" value="${esc(o.expectedDate)}" title="Boşsa sipariş tarihi + termin"></td>
    <td class="acts"><button class="btn sm" data-act="po-text" data-qid="${o.qid}">Sipariş metni</button></td></tr>`; }).join("")}
  </tbody></table></div><p class="small muted">Beklenen teslim boş bırakılırsa sipariş tarihine termin eklenir.</p>`;
}
// TMI: teslim stokta mal kabul belgesiyle alınır, kalite GKK adımından gelir; satın almada yalnız görüntülenir (SAT-37, SAT-38).
function teslimBilgisiHTML(a: { deliveredDate?: string; quality?: Quality; expectedDate?: string }, orders: OrderInfo[], isSplit: boolean): string {
  const fazla = (x: ExcessLine[]) => x.map(f => ` <span class="flag warn">fazla teslim: ${esc(f.item)} +${nfx.format(f.qty)} ${esc(f.unit)}</span>`).join("");
  const satir = (ad: string, teslim: string | undefined, kalite: Quality | "" | undefined, beklenen: string | undefined, asim: ExcessLine[]) =>
    `<tr><td>${esc(ad)}</td><td class="num">${fmtDate(beklenen)}</td><td class="num">${teslim ? fmtDate(teslim) : '<span class="muted">Stok mal kabulü bekleniyor</span>'}${fazla(asim)}</td><td>${kalite ? esc(QUALITY[kalite]) : "–"}</td></tr>`;
  const govde = isSplit
    ? orders.map(o => satir(supName(o.q), o.deliveredDate, o.quality as Quality | "", o.expectedDate, o.excess)).join("")
    : satir(orders[0] ? supName(orders[0].q) : "", a.deliveredDate, a.quality, a.expectedDate, orders[0]?.excess ?? []);
  return `<div class="tw"><table class="rt"><thead><tr><th>Tedarikçi</th><th>Beklenen</th><th>Teslim</th><th>Kalite</th></tr></thead><tbody>${govde}</tbody></table></div>`;
}

/* kalem → tedarikçi ataması; toplam canlı hesaplanır (updateSplitSum) */
function splitEditorHTML(r: PurchaseRequest, ev: Evaluation, assign: Record<string, string>, locked: boolean): string {
  const opt = ev.split!.plan.assign;
  return `<p class="small muted" data-sa-y="30">Her kalemi hangi tedarikçiden alacağınızı seçin. Başlangıçta nakliye dahil en uygun dağılım seçilidir. Her tedarikçinin nakliye ve diğer masrafları sipariş başına tam eklenir. Bir kalemin miktarını birden fazla tedarikçiye bölmek için yukarıdaki <button class="btn sm ghost" data-sa-y="51" data-act="paylastir-git">Paylaştırma</button> bölümünü kullanın.</p>
  <div class="tw"><table class="itbl rt"><thead><tr><th>Kalem</th><th>Tedarikçi</th><th class="r">Birim (net)</th><th class="r">Tutar (net)</th></tr></thead><tbody>
  ${(r.items || []).map(it => { const opts = ev.elig.map(x => ({ x, u: itemCost(x, it) })).filter((o): o is { x: EvalRow; u: number } => o.u !== null).sort((a, b) => a.u - b.u);
    return `<tr><td class="lead"><b>${esc(it.name)}</b><span class="sub">${numIn(parseNum(it.qty))} ${esc(it.unit)}</span></td>
    <td><select data-split="${it.id}" ${locked ? "disabled" : ""} aria-label="${esc(it.name)} tedarikçisi">${opts.map(o => `<option value="${o.x.q.id}" ${assign[it.id] === o.x.q.id ? "selected" : ""}>${esc(supName(o.x.q))}, ${money(o.u)}${o.x.q.id === opt[it.id] ? " (en uygun dağılım)" : ""}</option>`).join("")}</select></td>
    <td class="r num" data-su="${it.id}"></td><td class="r num" data-st="${it.id}"></td></tr>`; }).join("")}
  </tbody></table></div>
  <div id="split-sum" data-sa-y="14"></div>`;
}
export function readSplitAssign(): Record<string, string> { const o: Record<string, string> = {}; $$("[data-split]").forEach(s => { o[s.dataset.split!] = s.value; }); return o; }
export function updateSplitSum(): void {
  const r = S.requests[V.id ?? ""]; const box = $("#split-sum"); if (!r || !box) return;
  const ev = evaluate(r); if (!ev.split) return;
  const plan = planCost(r, ev.all, readSplitAssign());
  (r.items || []).forEach(it => { const g = plan.groups.find(g => g.items.includes(it)); const u = g ? itemCost(g.x, it) : null;
    const su = $(`[data-su="${it.id}"]`), st = $(`[data-st="${it.id}"]`); if (su) su.textContent = u === null ? "–" : money(u); if (st) st.textContent = u === null ? "–" : money(u * (parseNum(it.qty) || 0)); });
  const opt = ev.split.plan, best = ev.split.best;
  const diffOpt = plan.total - opt.total;
  box.innerHTML = `<div class="note">
    ${plan.groups.map(g => `<div class="row" data-sa-y="52"><b>${esc(supName(g.x.q))}</b><span class="small">${g.items.length} kalem, mal ${money(g.goods, "TRY", 0)}${g.extras > 0.5 ? ` + nakliye ve masraf ${money(g.extras, "TRY", 0)}` : ", nakliye dahil"}</span>${g.late ? `<span class="flag bad">ihtiyaç tarihini ${g.late} gün kaçırır</span>` : ""}</div>`).join("")}
    <div class="row" data-sa-y="53"><span>Toplam net maliyet: <b class="num">${money(plan.total, "TRY", 0)}</b></span>
    ${best ? `<span class="small">${plan.total < best.c.pvTRY - 0.5 ? `<span class="flag good">tek tedarikçiden ${money(best.c.pvTRY - plan.total, "TRY", 0)} ucuz</span>` : `<span class="flag warn">tek tedarikçiden (${esc(supName(best.q))}) ${money(plan.total - best.c.pvTRY, "TRY", 0)} pahalı</span>`}</span>` : '<span class="small muted">hiçbir tedarikçi tüm kalemlere teklif vermedi</span>'}
    ${diffOpt > 0.5 ? `<span class="small"><span class="flag warn">en uygun dağılımdan ${money(diffOpt, "TRY", 0)} pahalı; gerekçe yazın</span> <button class="btn sm" data-act="split-optimal">En uygun dağılımı uygula</button></span>` : ""}</div>
    <p class="xs muted" data-sa-y="20">Fiyatların parça siparişte de geçerli olduğunu tedarikçiden teyit edin; paket fiyatı vermiş olabilir.</p></div>`;
}
export function summaryText(r: PurchaseRequest): string {
  const ev = evaluate(r), a: Partial<Award> = r.award || {};
  const tt = awardTotals(r);
  const L: string[] = [];
  L.push(`Satın alma karar özeti`);
  L.push(`${r.no}: ${r.title}`);
  if (r.department || r.requester) L.push(`Birim: ${r.department || "-"}   Talep eden: ${r.requester || "-"}   Öncelik: ${PRIO[r.priority || "normal"]}`);
  if (r.needDate) L.push(`İhtiyaç tarihi: ${fmtDate(r.needDate)}`);
  L.push("");
  L.push("Kalemler:");
  (r.items || []).forEach(i => { const mid = matOf(i); const st = mid ? matStats(mid) : null; const prev = st ? st.buys.filter(e => e.reqId !== r.id) : []; const last = prev[prev.length - 1]; L.push(`  - ${i.name}: ${numIn(parseNum(i.qty))} ${i.unit}${last ? ` (son alış ${money(last.unitTRY)}, ${last.supplier})` : ""}`); });
  L.push("");
  if (a.mode === "split") {
    L.push(`Karar: kalem bazlı sipariş, ${tt && tt.plan ? tt.plan.groups.length : ""} tedarikçi`);
    if (tt && tt.plan) tt.plan.groups.forEach(g => {
      const o = awardOrders(r).find(x => x.qid === g.x.q.id);
      L.push(`  ${supName(g.x.q)}${o && siparisEtiketi(o) ? " (" + siparisEtiketi(o) + ")" : ""}: ${g.items.map(it => it.name).join(", ")}; mal ${money(g.goods)}${g.extras > 0.5 ? ` + nakliye ve masraf ${money(g.extras)}` : ""}; ${payText(g.x.q)}, termin ${isNum(parseNum(g.x.q.leadDays)) ? parseNum(g.x.q.leadDays) + " gün" : "-"}`);
    });
    if (tt) { L.push(`Toplam: ${money(tt.totalTRY)} (KDV hariç, nakliye dahil), net bugünkü maliyet ${money(tt.pvTRY)}`); if (tt.ev.split && tt.ev.split.best) L.push(`En uygun tek tedarikçi ${supName(tt.ev.split.best.q)}: ${money(tt.ev.split.bestTotal)} net`); }
  } else if (tt && tt.x) {
    const x = tt.x;
    L.push(`Seçilen tedarikçi: ${supName(x.q)}`);
    L.push(`Tutar: ${money(x.c.total, x.q.currency)}${x.q.currency !== "TRY" ? ` (${money(x.c.totalTRY)}, kur ${nfx.format(x.c.rate)})` : ""}, KDV hariç`);
    L.push(`Ödeme: ${payText(x.q)}   Termin: ${isNum(parseNum(x.q.leadDays)) ? parseNum(x.q.leadDays) + " gün" : "-"}   Teslim: ${x.q.deliveryTerm || "-"}`);
    L.push(`Net bugünkü maliyet: ${money(x.c.pvTRY)}`);
    if (isNum(x.q.firstTotal) && x.q.firstTotal - x.c.total > 0.005) L.push(`Pazarlık kazancı: ${money(x.q.firstTotal - x.c.total, x.q.currency)}`);
  }
  if (tt) { const ap = requiredApprover(tt.totalTRY); if (ap) L.push(`Gereken onay: ${ap.role}`); }
  L.push("");
  L.push(`Değerlendirilen ${ev.all.length} teklif (ağırlıklar: maliyet ${ev.w.cost}, termin ${ev.w.lead}, tedarikçi ${ev.w.supplier}, garanti ${ev.w.warranty}):`);
  ev.ranking.forEach((x, i) => L.push(`  ${i + 1}. ${supName(x.q)}: ${money(x.c.pvTRY)} net, ${isNum(parseNum(x.q.leadDays)) ? parseNum(x.q.leadDays) + " gün" : "termin yok"}, ${payText(x.q)}, puan ${nf0.format(x.score)}`));
  ev.all.filter(x => !ev.elig.includes(x)).forEach(x => L.push(`  -  ${supName(x.q)}: değerlendirme dışı`));
  if (a.reason) { L.push(""); L.push(`Gerekçe: ${a.reason}`); }
  if (a.by) L.push(`Karar veren: ${a.by}`);
  L.push(`Karar tarihi: ${fmtDate(a.decidedAt || todayStr())}`);
  return L.join("\n");
}
