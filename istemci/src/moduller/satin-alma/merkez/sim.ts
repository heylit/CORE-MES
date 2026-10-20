/**
 * Dağıtım denemesi: kalemlerin miktarını tedarikçiler arasında ayar çubuklarıyla dağıtıp
 * fiyat, termin ve sipariş sayısı dengesini kayıt yapmadan görmek için.
 * Beğenilen dağılım karara aktarılabilir; miktarı bölünen kalem ayrı satırlara ayrılır.
 */
import type { Award, PurchaseRequest, RequestItem, SimScenario } from "./tipler.ts";
import { OPEN } from "./constants.ts";
import { S, V, saveRequest } from "./store.ts";
import { evaluate, itemCost, miktarSayisi, optimalSplit, supName, payText, type EvalRow, type Evaluation } from "./calc.ts";
import { BELIRSIZ_MIKTAR } from "../../../ortak/veri/miktar.ts";
import { $, $$, addDays, clamp, clone, dayDiff, esc, fmtDate, money, nf0, numIn, parseNum, pct, sum, todayStr, uid, kokIcinde, type FormEl } from "./util.ts";
import { empty, render } from "./views.ts";
import { closeModal, openModal, toast } from "./ui.ts";

/** kalem kimliği → teklif kimliği → miktar */
type Alloc = Record<string, Record<string, number>>;
interface SimGroup { x: EvalRow; goods: number; extras: number; lead: number | null; late: number | null; lines: { it: RequestItem; qty: number }[] }
interface SimKpi {
  goods: number; extras: number; total: number; orders: number;
  lastDay: number | null; onTimePct: number | null;
  perItem: Record<string, { qty: number; byNeed: number; allocated: number }>;
  groups: SimGroup[]; complete: boolean;
}
interface SimState {
  rid: string; alloc: Alloc; balance: number;
  /** kalem kimliği → denge (% hızlıya); null = miktarlar elle ya da hazır dağılımla ayarlandı */
  itemBal: Record<string, number | null>;
  /** toplu çubuğun etkilemediği kalemler */
  excluded: Record<string, boolean>;
}

export const SIMS: Record<string, SimState> = {};
const qtyOf = (it: RequestItem): number => parseNum(it.qty) || 0;
const whole = (n: number): boolean => Math.abs(n - Math.round(n)) < 1e-9;
const roundQ = (v: number, it: RequestItem): number => (whole(qtyOf(it)) ? Math.round(v) : Math.round(v * 100) / 100);
const stepOf = (it: RequestItem): number => (whole(qtyOf(it)) ? 1 : Math.max(0.01, Math.round(qtyOf(it)) / 100));

interface Offer { x: EvalRow; u: number; lead: number | null }
/** Kalem için fiyat vermiş uygun teklifler: birim net maliyet (TL, iskonto ve vade sonrası) ve termin */
function offers(ev: Evaluation, it: RequestItem): Offer[] {
  return ev.elig
    .map((x) => ({ x, u: itemCost(x, it), lead: parseNum(x.q.leadDays) }))
    .filter((o): o is Offer => o.u !== null);
}
const cheapest = (os: Offer[]): Offer | undefined => [...os].sort((a, b) => a.u - b.u)[0];

/* ---------------- hazır dağılımlar ---------------- */
/**
 * Fiyat–termin merdiveni: teklifler ucuzdan pahalıya dizilir; bir teklif ancak kendinden ucuz olanların
 * hepsinden daha hızlıysa basamak olur. Hem daha pahalı hem daha yavaş (ya da eşit) teklif merdivene girmez.
 * İlk basamak en ucuz, son basamak en hızlı tekliftir.
 */
function ladder(os: Offer[]): Offer[] {
  const sorted = [...os].sort((a, b) => a.u - b.u || (a.lead ?? Infinity) - (b.lead ?? Infinity));
  const out: Offer[] = [];
  let best = Infinity;
  for (const o of sorted) { const l = o.lead ?? Infinity; if (!out.length || l < best) { out.push(o); best = l; } }
  return out;
}
/**
 * Kalem dengesi: t (0–100) merdivende yürür. Basamaklar eşit aralıklıdır; t iki basamağın arasındaysa
 * miktar bu iki teklif arasında orantılı bölünür. 0 = en ucuz, 100 = en hızlı.
 */
function balanceItem(ev: Evaluation, it: RequestItem, t: number): Record<string, number> | null {
  const steps = ladder(offers(ev, it));
  if (!steps.length) return null;
  const q = qtyOf(it);
  if (steps.length === 1) return { [steps[0]!.x.q.id]: q };
  const pos = (clamp(t, 0, 100) / 100) * (steps.length - 1);
  const i = Math.min(Math.floor(pos), steps.length - 2), frac = pos - i;
  const hi = roundQ(q * frac, it), lo = roundQ(q - hi, it);
  const out: Record<string, number> = {};
  if (lo > 0) out[steps[i]!.x.q.id] = lo;
  if (hi > 0) out[steps[i + 1]!.x.q.id] = hi;
  return out;
}
/** Her kalemin t%'si en hızlı, kalanı en ucuz tedarikçiye */
function balanceAlloc(r: PurchaseRequest, ev: Evaluation, t: number): Alloc {
  const out: Alloc = {};
  for (const it of r.items ?? []) { const a = balanceItem(ev, it, t); if (a) out[it.id] = a; }
  return out;
}
/** Dağılım bir denge değerine denk geliyorsa o değer; değilse null */
function deriveBal(ev: Evaluation, it: RequestItem, a: Record<string, number> | undefined): number | null {
  const cur = a ?? {};
  const hits: number[] = [];
  for (let t = 0; t <= 100; t += 1) {
    const b = balanceItem(ev, it, t); if (!b) return null;
    const keys = new Set([...Object.keys(b), ...Object.keys(cur)]);
    if ([...keys].every((k) => Math.abs((b[k] ?? 0) - (cur[k] ?? 0)) < 1e-9)) hits.push(t);
  }
  if (!hits.length) return null;
  // yuvarlama yüzünden birden çok değer aynı dağılımı verebilir: yuvarlak olanı, yoksa ortadakini seç
  return hits.find((t) => t % 5 === 0) ?? hits[Math.floor(hits.length / 2)]!;
}
function deriveAll(r: PurchaseRequest, ev: Evaluation, st: SimState): void {
  for (const it of r.items ?? []) st.itemBal[it.id] = deriveBal(ev, it, st.alloc[it.id]);
}
/** Merdiven tek basamaksa (en ucuz aynı zamanda en hızlıysa) kalem çubuğu anlamsızdır */
function endpoints(ev: Evaluation, it: RequestItem): { steps: Offer[]; out: Offer[]; same: boolean } {
  const os = offers(ev, it); const steps = ladder(os);
  return { steps, out: os.filter((o) => !steps.includes(o)), same: steps.length < 2 };
}
/** Nakliye dahil en uygun bütün-kalem dağılımı */
function optimalAlloc(r: PurchaseRequest, ev: Evaluation): Alloc {
  const plan = optimalSplit(r, ev.elig);
  const out: Alloc = {};
  if (!plan) return balanceAlloc(r, ev, 0);
  for (const it of r.items ?? []) { const qid = plan.assign[it.id]; if (qid) out[it.id] = { [qid]: qtyOf(it) }; }
  return out;
}
/** Fiyat veren tedarikçiler arasında eşit */
function equalAlloc(r: PurchaseRequest, ev: Evaluation): Alloc {
  const out: Alloc = {};
  for (const it of r.items ?? []) {
    const os = offers(ev, it).sort((a, b) => a.u - b.u); if (!os.length) continue;
    const q = qtyOf(it); let left = q;
    out[it.id] = {};
    os.forEach((o, i) => { const v = i === os.length - 1 ? left : roundQ(q / os.length, it); if (v > 0) out[it.id]![o.x.q.id] = v; left = roundQ(left - v, it); });
  }
  return out;
}
/** Mevcut karar varsa ondan, yoksa en uygun dağılımdan başla */
function startAlloc(r: PurchaseRequest, ev: Evaluation): Alloc {
  const a = r.award;
  if (a?.mode === "split" && a.splits) { const out: Alloc = {}; for (const it of r.items ?? []) { const q = a.splits[it.id]; if (q) out[it.id] = { [q]: qtyOf(it) }; } return out; }
  if (a?.mode === "single" && a.quoteId) { const out: Alloc = {}; for (const it of r.items ?? []) out[it.id] = { [a.quoteId]: qtyOf(it) }; return out; }
  return optimalAlloc(r, ev);
}
function stateFor(r: PurchaseRequest, ev: Evaluation): SimState {
  let st = SIMS[r.id];
  if (!st) { st = SIMS[r.id] = { rid: r.id, alloc: startAlloc(r, ev), balance: 0, itemBal: {}, excluded: {} }; deriveAll(r, ev, st); }
  return st;
}

/* ---------------- sonuç hesabı ---------------- */
function kpiOf(r: PurchaseRequest, ev: Evaluation, alloc: Alloc): SimKpi {
  const today = todayStr();
  const perItem: SimKpi["perItem"] = {};
  const groups: SimGroup[] = [];
  for (const x of ev.elig) {
    const lines = (r.items ?? []).map((it) => ({ it, qty: alloc[it.id]?.[x.q.id] ?? 0 })).filter((l) => l.qty > 0);
    if (!lines.length) continue;
    const goods = sum(lines.map((l) => l.qty * (itemCost(x, l.it) ?? 0)));
    const extras = (x.c.ship + x.c.other) * x.c.rate * x.c.factor; // sipariş başına tam masraf
    const lead = parseNum(x.q.leadDays);
    const late = r.needDate && lead !== null ? Math.max(0, dayDiff(r.needDate, addDays(today, lead))) || null : null;
    groups.push({ x, goods, extras, lead, late, lines });
  }
  let complete = true;
  for (const it of r.items ?? []) {
    const allocated = sum(Object.values(alloc[it.id] ?? {}));
    const byNeed = sum(groups.filter((g) => g.lead !== null && !g.late).map((g) => g.lines.find((l) => l.it.id === it.id)?.qty ?? 0));
    perItem[it.id] = { qty: qtyOf(it), byNeed: r.needDate ? byNeed : allocated, allocated };
    if (Math.abs(allocated - qtyOf(it)) > 1e-6) complete = false;
  }
  const goods = sum(groups.map((g) => g.goods)), extras = sum(groups.map((g) => g.extras));
  const onTime = sum(groups.filter((g) => g.lead !== null && !g.late).map((g) => g.goods));
  const leads = groups.map((g) => g.lead).filter((l): l is number => l !== null);
  return {
    goods, extras, total: goods + extras, orders: groups.length,
    lastDay: leads.length ? Math.max(...leads) : null,
    onTimePct: r.needDate && goods > 0 ? (onTime / goods) * 100 : null,
    perItem, groups, complete,
  };
}
function bestSingle(ev: Evaluation, r: PurchaseRequest): EvalRow | null {
  const full = ev.elig.filter((x) => x.c.covered === (r.items ?? []).length);
  return full.length ? full.reduce((a, b) => (a.c.pvTRY <= b.c.pvTRY ? a : b)) : null;
}

/* ---------------- kalem dengesi ---------------- */
function itemBalLabel(st: SimState, it: RequestItem): string {
  const v = st.itemBal[it.id];
  return v === null || v === undefined ? "özel" : `%${v}`;
}
const shortName = (o: Offer): string => supName(o.x.q).split(" ")[0]!;
function itemBalHTML(ev: Evaluation, st: SimState, it: RequestItem): string {
  const e = endpoints(ev, it);
  const outNote = e.out.length ? `<span class="xs faint" title="Merdivende daha ucuz ve daha hızlı bir teklif var">Dengede yok (hem pahalı hem yavaş): ${e.out.map((o) => esc(shortName(o))).join(", ")}</span>` : "";
  if (e.same) return `<div class="ibal"><span class="xs faint">${e.steps[0] ? `En ucuz aynı zamanda en hızlı: ${esc(shortName(e.steps[0]))}` : "teklif yok"}</span>${outNote}</div>`;
  const v = st.itemBal[it.id];
  const n = e.steps.length;
  return `<div class="ibal">
    <div class="ibal-r"><input type="range" data-ib="${it.id}" min="0" max="100" step="1" value="${v ?? 0}" list="ibt-${it.id}" aria-label="${esc(it.name)}: fiyat ile termin arasındaki denge"><b class="xs num" data-ibv="${it.id}">${itemBalLabel(st, it)}</b></div>
    <datalist id="ibt-${it.id}">${e.steps.map((_, i) => `<option value="${Math.round((i / (n - 1)) * 100)}">`).join("")}</datalist>
    <div class="ibal-st">${e.steps.map((o, i) => `<span title="${esc(supName(o.x.q))}: ${money(o.u)}, ${o.lead ?? "?"} gün">${i === 0 ? "◂ " : ""}${esc(shortName(o))}${i === n - 1 ? " ▸" : ""}<i>${o.lead ?? "?"} gün</i></span>`).join("")}</div>
    ${outNote}
    <label class="chk xs"><input type="checkbox" data-iex="${it.id}" ${st.excluded[it.id] ? "" : "checked"}> toplu ayara dahil</label>
  </div>`;
}
/** Toplu çubuğun etiketi: dahil kalemlerin dengesi aynıysa o değer, değilse "karışık" */
function globalLabel(r: PurchaseRequest, ev: Evaluation, st: SimState): string {
  const vals = (r.items ?? []).filter((it) => !st.excluded[it.id] && !endpoints(ev, it).same).map((it) => st.itemBal[it.id]);
  if (!vals.length) return `%${st.balance}`;
  if (vals.some((v) => v === null || v === undefined)) return "özel";
  return vals.every((v) => v === vals[0]) ? `%${vals[0]}` : "karışık";
}
function refreshBalLabels(r: PurchaseRequest, ev: Evaluation, st: SimState): void {
  for (const it of r.items ?? []) {
    const lab = $<HTMLElement>(`[data-ibv="${it.id}"]`); if (lab) lab.textContent = itemBalLabel(st, it);
    const sl = $(`[data-ib="${it.id}"]`); const v = st.itemBal[it.id];
    if (sl && v !== null && v !== undefined && Number(sl.value) !== v) sl.value = String(v);
  }
  const g = $<HTMLElement>("#sim-bal-v"); if (g) g.textContent = globalLabel(r, ev, st);
}

/* ---------------- ekran ---------------- */
export function tabSim(r: PurchaseRequest): string {
  if (!OPEN.includes(r.status)) return `<div class="panel">${empty("Deneme yalnızca karar aşamasına kadar yapılabilir", "Sipariş verildikten sonra dağılım değiştirilemez. Bir sonraki benzer alımda deneyebilirsiniz.")}</div>`;
  const ev = evaluate(r);
  if (ev.elig.length < 2) return `<div class="panel">${empty("Deneme için en az iki teklif gerekiyor", "Dağılımı kıyaslayabilmek için en az iki tedarikçinin fiyat vermiş olması gerekir.", '<button class="btn primary" data-act="bulk">Teklifleri gir</button>')}</div>`;
  const st = stateFor(r, ev);
  const cols = ev.elig;
  const items = r.items ?? [];
  setTimeout(simLive, 0); // tablo yerleştikten sonra sonuçları çiz
  return `<div class="stack" id="sim" data-rid="${r.id}">
    <div class="sim-banner"><b>Deneme modu.</b> Çubuklarla yaptığınız dağılım karar değildir. Beğendiğiniz dağılımları senaryo olarak kaydedip yan yana karşılaştırabilir, birini karara aktarabilirsiniz. Senaryolar talebe kaydedilir, ekip de görür.</div>
    <section class="panel"><div class="panel-h"><h2>Fiyat ↔ termin dengesi</h2><span class="spacer"></span>
      <div class="presets"><button class="chip" data-act="sim-opt" title="Bütün kalem, nakliye dahil en düşük toplam">Nakliye dahil en uygun</button><button class="chip" data-act="sim-cheap">Hepsi en ucuza</button><button class="chip" data-act="sim-fast">Hepsi en hızlıya</button><button class="chip" data-act="sim-equal">Eşit böl</button></div></div>
      <div class="panel-b"><div class="sim-bal"><span class="small muted">En ucuz</span><input type="range" id="sim-bal" min="0" max="100" step="5" value="${st.balance}" aria-label="Hızlı tedarikçiye verilecek pay"><span class="small muted">En hızlı</span><b id="sim-bal-v" class="num">${globalLabel(r, ev, st)}</b></div>
      <details class="howto"><summary>Nasıl çalışır?</summary><p class="small muted">Her kalemin teklifleri ucuzdan hızlıya bir merdiven oluşturur; her basamak bir öncekinden daha hızlı (ve daha pahalı) tedarikçidir. Çubuğu hıza doğru ittikçe miktar basamak basamak bir sonraki daha hızlı tedarikçiye kayar; iki basamağın arasında miktar ikisine bölünür. Hem daha pahalı hem daha yavaş teklifler merdivene girmez. Toplu çubuk "toplu ayara dahil" kalemlerin hepsini birlikte taşır; kalem çubuklarıyla ayrı ayrı, miktar kutularıyla da istediğiniz tedarikçiye elle dağıtabilirsiniz.</p></details></div>
    </section>
    <div class="strip" id="sim-kpi"></div>
    <section class="panel"><div class="panel-h"><h2>Senaryolar</h2><span class="sub">Dağılımları kaydedip yan yana karşılaştırın</span><span class="spacer"></span><button class="btn sm primary" data-act="sim-save">Bu dağılımı senaryo olarak kaydet</button></div><div id="sim-scn"></div></section>
    <section class="panel"><div class="panel-h"><h2>Teslimat birikimi</h2><span class="sub">Mal bedelinin günlere göre ne kadarı elinize geçer${r.needDate ? `; ihtiyaç tarihi ${fmtDate(r.needDate)}` : ""}</span></div><div class="panel-b"><div id="sim-chart" class="chart" data-sa-y="23"></div></div></section>
    <section class="panel"><div class="panel-h"><h2>Miktar dağılımı</h2><span class="sub">Bir tedarikçinin payını artırınca fark en pahalı tedarikçiden düşülür; azaltınca en ucuza verilir.</span></div>
      <div class="tw"><table class="simt"><thead><tr><th class="rl">Kalem</th>${cols.map((x) => `<th><span class="sn">${esc(supName(x.q))}</span><span class="sub">${parseNum(x.q.leadDays) ?? "?"} gün termin, ${esc(payText(x.q))}${x.c.ship + x.c.other > 0 ? `, +${money((x.c.ship + x.c.other) * x.c.rate, "TRY", 0)} nakliye` : ""}</span></th>`).join("")}</tr></thead><tbody>
      ${items.map((it) => `<tr><td class="rl"><b>${esc(it.name)}</b><span class="sub">${numIn(qtyOf(it))} ${esc(it.unit)}</span><span class="sub" data-sneed="${it.id}"></span>${itemBalHTML(ev, st, it)}</td>
        ${cols.map((x) => { const u = itemCost(x, it); if (u === null) return '<td class="off"><span class="faint small">teklif yok</span></td>';
          const v = st.alloc[it.id]?.[x.q.id] ?? 0;
          return `<td><div class="sc"><input type="range" data-sr="${it.id}" data-q="${x.q.id}" min="0" max="${qtyOf(it)}" step="${stepOf(it)}" value="${v}" aria-label="${esc(it.name)}, ${esc(supName(x.q))} miktarı"><div class="row" data-sa-y="24"><input type="text" inputmode="decimal" data-sn="${it.id}" data-q="${x.q.id}" value="${numIn(v)}" aria-label="${esc(it.name)}, ${esc(supName(x.q))} miktarı"><span class="sub">${money(u)}</span></div></div></td>`; }).join("")}</tr>`).join("")}
      </tbody><tfoot>
        <tr><td class="rl">Mal bedeli (net)</td>${cols.map((x) => `<td data-sg="${x.q.id}:goods">–</td>`).join("")}</tr>
        <tr><td class="rl">Nakliye ve masraf</td>${cols.map((x) => `<td data-sg="${x.q.id}:extras">–</td>`).join("")}</tr>
        <tr><td class="rl">Teslim</td>${cols.map((x) => `<td data-sg="${x.q.id}:arr">–</td>`).join("")}</tr>
      </tfoot></table></div>
    </section>
    <div class="row"><button class="btn primary" data-act="sim-apply">Bu dağılımı karara aktar</button><span class="small muted">Karar onaya gönderilir. Miktarı bölünen kalemler talepte ayrı satırlara ayrılır.</span></div>
  </div>`;
}

function current(): { r: PurchaseRequest; ev: Evaluation; st: SimState } | null {
  const box = $<HTMLElement>("#sim"); if (!box) return null;
  const r = S.requests[box.dataset.rid ?? ""]; if (!r) return null;
  const ev = evaluate(r);
  return { r, ev, st: stateFor(r, ev) };
}

/** sonuç şeridi, tedarikçi satırları, kalem uyarıları, grafik ve senaryolar */
export function simLive(): void {
  const c = current(); if (!c) return;
  const { r, ev, st } = c;
  const k = kpiOf(r, ev, st.alloc);
  const single = bestSingle(ev, r);
  const opt = optimalSplit(r, ev.elig);
  const kpi = $<HTMLElement>("#sim-kpi");
  if (kpi) {
    const vsS = single ? k.total - single.c.pvTRY : null;
    kpi.innerHTML = `
      <div><div class="v">${money(k.total, "TRY", 0)}</div><div class="k">Net maliyet, nakliye dahil</div><div class="d">${vsS === null ? "tek tedarikçi seçeneği yok" : Math.abs(vsS) < 1 ? "en uygun tek tedarikçiyle aynı" : `en uygun tek tedarikçiden ${money(Math.abs(vsS), "TRY", 0)} ${vsS > 0 ? "pahalı" : "ucuz"}`}${opt && k.total - opt.total > 1 ? `; en uygun dağılımdan ${money(k.total - opt.total, "TRY", 0)} pahalı` : ""}</div></div>
      <div><div class="v">${k.onTimePct === null ? "–" : pct(k.onTimePct)}</div><div class="k">İhtiyaç tarihinde elde</div><div class="d">${r.needDate ? "mal bedeli olarak" : "ihtiyaç tarihi girilmemiş"}</div></div>
      <div><div class="v">${k.lastDay === null ? "–" : fmtDate(addDays(todayStr(), k.lastDay))}</div><div class="k">Son teslim</div><div class="d">${k.lastDay === null ? "termin bilinmiyor" : `bugünden ${k.lastDay} gün sonra`}</div></div>
      <div><div class="v">${k.orders}</div><div class="k">Sipariş</div><div class="d">${k.extras > 0.5 ? `nakliye ve masraf ${money(k.extras, "TRY", 0)}` : "ek nakliye yok"}</div></div>`;
  }
  for (const x of ev.elig) {
    const g = k.groups.find((gg) => gg.x.q.id === x.q.id);
    const set = (f: string, html: string) => { const el = $<HTMLElement>(`[data-sg="${x.q.id}:${f}"]`); if (el) el.innerHTML = html; };
    set("goods", g ? money(g.goods, "TRY", 0) : '<span class="faint">sipariş yok</span>');
    set("extras", g ? (g.extras > 0.5 ? money(g.extras, "TRY", 0) : "dahil") : "–");
    set("arr", g ? (g.lead === null ? "termin yok" : `${fmtDate(addDays(todayStr(), g.lead))}${g.late ? ` <span class="flag bad">${g.late} gün geç</span>` : ""}`) : "–");
  }
  for (const it of r.items ?? []) {
    const p = k.perItem[it.id]; const el = $<HTMLElement>(`[data-sneed="${it.id}"]`);
    if (!el || !p) continue;
    const miss = roundQ(p.qty - p.allocated, it);
    el.innerHTML = miss > 0 ? `<span class="flag warn">${numIn(miss)} ${esc(it.unit)} dağıtılmadı</span>`
      : r.needDate ? (p.byNeed >= p.qty - 1e-9 ? '<span class="flag good">tamamı ihtiyaç tarihinde</span>' : `<span class="flag ${p.byNeed > 0 ? "warn" : "bad"}">ihtiyaç tarihinde ${numIn(p.byNeed)}/${numIn(p.qty)}</span>`) : "";
  }
  drawCurve(r, k);
  drawScenarios(r, ev, st);
}

function drawCurve(r: PurchaseRequest, k: SimKpi): void {
  const el = $<HTMLElement>("#sim-chart"); if (!el) return;
  const pts = k.groups.filter((g) => g.lead !== null).sort((a, b) => a.lead! - b.lead!);
  if (!pts.length || k.goods <= 0) { el.innerHTML = '<p class="small muted">Termin bilgisi olmadığı için çizilemiyor.</p>'; return; }
  const need = r.needDate ? dayDiff(todayStr(), r.needDate) : null;
  const maxD = Math.max(pts[pts.length - 1]!.lead!, need ?? 0) + 3;
  const W = Math.max(300, el.clientWidth || 600), H = 210, L = 46, R = 16, T = 14, B = 30;
  const xs = (d: number) => L + (d / maxD) * (W - L - R), ys = (p: number) => T + (1 - p / 100) * (H - T - B);
  let cum = 0, path = `M${xs(0)} ${ys(0)}`;
  const marks: string[] = [];
  const byDay = new Map<number, SimGroup[]>();
  for (const g of pts) byDay.set(g.lead!, [...(byDay.get(g.lead!) ?? []), g]);
  for (const [d, gs] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    path += ` L${xs(d)} ${ys(cum)}`;
    cum += (sum(gs.map((g) => g.goods)) / k.goods) * 100;
    path += ` L${xs(d)} ${ys(cum)}`;
    marks.push(`<circle cx="${xs(d)}" cy="${ys(cum)}" r="4" fill="var(--sa-c1)"><title>${gs.map((g) => esc(supName(g.x.q))).join(", ")}: ${d}. gün, toplam %${nf0.format(cum)}</title></circle><text x="${xs(d) + 6}" y="${ys(cum) - 6}" font-size="12" fill="var(--sa-muted)">${esc(gs.map((g) => supName(g.x.q).split(" ")[0]).join(", "))}</text>`);
  }
  path += ` L${xs(maxD)} ${ys(cum)}`;
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Teslimat birikimi">
    ${[0, 50, 100].map((p) => `<line x1="${L}" x2="${W - R}" y1="${ys(p)}" y2="${ys(p)}" stroke="var(--sa-line-2)"/><text x="${L - 8}" y="${ys(p) + 4}" text-anchor="end" font-size="12" fill="var(--sa-muted)">%${p}</text>`).join("")}
    ${need !== null && need >= 0 ? `<line x1="${xs(need)}" x2="${xs(need)}" y1="${T}" y2="${H - B}" stroke="var(--sa-bad)" stroke-dasharray="4 4"/><text x="${xs(need) + 4}" y="${T + 10}" font-size="12" fill="var(--sa-bad)">İhtiyaç</text>` : ""}
    <path d="${path}" fill="none" stroke="var(--sa-c1)" stroke-width="2.5"/>${marks.join("")}
    <text x="${L}" y="${H - 8}" font-size="12" fill="var(--sa-muted)">Bugün</text><text x="${W - R}" y="${H - 8}" font-size="12" fill="var(--sa-muted)" text-anchor="end">+${maxD} gün</text>
  </svg>`;
}

/** Senaryo hâlâ bu talebin kalemlerine uyuyor mu (karara aktarma kalemleri bölebilir) */
const validScenario = (r: PurchaseRequest, sc: SimScenario): boolean => Object.keys(sc.alloc).every((id) => (r.items ?? []).some((it) => it.id === id));

function drawScenarios(r: PurchaseRequest, ev: Evaluation, st: SimState): void {
  const el = $<HTMLElement>("#sim-scn"); if (!el) return;
  const scs = r.scenarios ?? [];
  if (!scs.length) { el.innerHTML = '<div class="panel-b small muted">Henüz senaryo yok. Çubuklarla bir dağılım kurup "senaryo olarak kaydet"e basın; ikinci bir dağılım kurup onu da kaydedin. Senaryolar burada yan yana karşılaştırılır.</div>'; return; }
  const cols = [{ id: "", name: "Şu anki dağılım", alloc: st.alloc, valid: true }, ...scs.map((sc) => ({ id: sc.id, name: sc.name, alloc: sc.alloc, valid: validScenario(r, sc) }))];
  const ks = cols.map((c) => kpiOf(r, ev, c.alloc));
  const ok = cols.map((c, i) => c.valid && ks[i]!.complete);
  const best = (vals: (number | null)[], dir: "min" | "max"): Set<number> => {
    const xs = vals.map((v, i) => ({ v, i })).filter((o): o is { v: number; i: number } => o.v !== null && ok[o.i]!);
    if (xs.length < 2) return new Set();
    const t = dir === "min" ? Math.min(...xs.map((o) => o.v)) : Math.max(...xs.map((o) => o.v));
    if (xs.every((o) => Math.abs(o.v - t) < 0.5)) return new Set();
    return new Set(xs.filter((o) => Math.abs(o.v - t) < 0.5).map((o) => o.i));
  };
  const minT = Math.min(...ks.filter((_, i) => ok[i]).map((k) => k.total));
  const row = (label: string, cells: string[], vals?: (number | null)[], dir?: "min" | "max", cls = "") => {
    const b = vals && dir ? best(vals, dir) : new Set<number>();
    return `<tr class="${cls}"><td class="rl">${label}</td>${cells.map((c, i) => `<td class="r ${b.has(i) ? "best" : ""} ${i === 0 ? "cur" : ""}">${c}</td>`).join("")}</tr>`;
  };
  const sec = (l: string) => `<tr class="sec"><td class="rl">${l}</td>${cols.map(() => "<td></td>").join("")}</tr>`;
  const today = todayStr();
  let h = `<div class="scn-bar">${scs.map((sc, i) => `<button class="chip" data-act="sim-load" data-id="${sc.id}" ${validScenario(r, sc) ? "" : "disabled"} title="Bu dağılımı yükle">${esc(sc.name)} <b class="num">${ok[i + 1] ? money(ks[i + 1]!.total, "TRY", 0) : "geçersiz"}</b></button>`).join("")}</div>`;
  h += `<div class="tw"><table class="matrix scn"><thead><tr><th class="rl">Karşılaştırma</th>${cols.map((c, i) => `<th class="r ${i === 0 ? "cur" : ""}"><span class="sn">${esc(c.name)}</span>${!c.valid ? '<span class="flag warn">kalemler değişti</span>' : !ks[i]!.complete ? '<span class="flag warn">eksik dağıtım</span>' : ""}</th>`).join("")}</tr></thead><tbody>`;
  h += row("Net maliyet, nakliye dahil", ks.map((k) => money(k.total, "TRY", 0)), ks.map((k) => k.total), "min", "key");
  h += row("En düşüğe göre", ks.map((k, i) => (!ok[i] ? "–" : k.total - minT < 1 ? "en düşük" : "+" + money(k.total - minT, "TRY", 0))));
  if (r.needDate) h += row("İhtiyaç tarihinde elde", ks.map((k) => (k.onTimePct === null ? "–" : pct(k.onTimePct))), ks.map((k) => k.onTimePct), "max");
  h += row("Son teslim", ks.map((k) => (k.lastDay === null ? "–" : fmtDate(addDays(today, k.lastDay)))), ks.map((k) => k.lastDay), "min");
  h += row("Sipariş sayısı", ks.map((k) => String(k.orders)), ks.map((k) => k.orders), "min");
  h += row("Nakliye ve masraf", ks.map((k) => (k.extras > 0.5 ? money(k.extras, "TRY", 0) : "yok")), ks.map((k) => k.extras), "min");
  h += sec("Kalem dağılımı");
  for (const it of r.items ?? []) {
    h += row(`${esc(it.name)}<span class="sub">${numIn(qtyOf(it))} ${esc(it.unit)}</span>`, cols.map((c) => {
      const parts = Object.entries(c.alloc[it.id] ?? {}).filter(([, v]) => v > 0);
      return parts.length ? parts.map(([q, v]) => { const x = ev.all.find((y) => y.q.id === q); return `${esc(x ? supName(x.q).split(" ")[0]! : "?")} ${numIn(v)}`; }).join("<br>") : '<span class="faint">–</span>';
    }), undefined, undefined, "wrap");
  }
  h += sec("Tedarikçi tutarları");
  for (const x of ev.elig) {
    const vals = ks.map((k) => { const g = k.groups.find((gg) => gg.x.q.id === x.q.id); return g ? g.goods + g.extras : null; });
    if (vals.every((v) => v === null)) continue;
    h += row(esc(supName(x.q)), vals.map((v) => (v === null ? '<span class="faint">–</span>' : money(v, "TRY", 0))));
  }
  h += `<tr class="acts-row"><td class="rl"></td>${cols.map((c, i) => i === 0 ? `<td class="cur"><button class="btn sm" data-act="sim-save">Kaydet</button></td>` : `<td><div class="scn-acts">${c.valid ? `<button class="btn sm" data-act="sim-load" data-id="${c.id}">Yükle</button><button class="btn sm" data-act="sim-apply-scn" data-id="${c.id}">Karara aktar</button>` : ""}<button class="btn sm ghost" data-act="sim-rename" data-id="${c.id}">Adı</button><button class="btn sm ghost danger" data-act="sim-del" data-id="${c.id}">Sil</button></div></td>`).join("")}</tr>`;
  el.innerHTML = h + "</tbody></table></div>";
}

/** Çubukların ve kutuların konumunu dağılıma göre günceller (yeniden çizmeden; sürükleme akıcı kalsın) */
function syncInputs(st: SimState, only?: string): void {
  $$("[data-sr]").forEach((i) => { const it = i.dataset.sr!; if (only && it !== only) return; const v = st.alloc[it]?.[i.dataset.q!] ?? 0; if (Number(i.value) !== v) i.value = String(v); });
  $$("[data-sn]").forEach((i) => { const it = i.dataset.sn!; if (only && it !== only) return; if (i === document.activeElement) return; i.value = numIn(st.alloc[it]?.[i.dataset.q!] ?? 0); });
}

/** Bir tedarikçinin miktarını değiştirir; toplam kalem miktarını korumak için diğerlerini ayarlar */
function setQty(r: PurchaseRequest, ev: Evaluation, st: SimState, itemId: string, qid: string, raw: number): void {
  const it = (r.items ?? []).find((x) => x.id === itemId); if (!it) return;
  const q = qtyOf(it);
  const cur = (st.alloc[itemId] ??= {});
  const others = offers(ev, it).filter((o) => o.x.q.id !== qid);
  let v = clamp(roundQ(raw, it), 0, q);
  const old = cur[qid] ?? 0;
  if (v > old) {
    let need = v - old;
    for (const o of [...others].sort((a, b) => b.u - a.u)) { // önce en pahalıdan düş
      const have = cur[o.x.q.id] ?? 0; const take = Math.min(have, need);
      if (take > 0) { cur[o.x.q.id] = roundQ(have - take, it); need = roundQ(need - take, it); }
      if (need <= 0) break;
    }
    // dağıtılmamış miktar varsa ondan kullan
    const free = roundQ(q - sum(Object.values(cur)), it);
    if (need > 0 && free > 0) need = Math.max(0, roundQ(need - free, it));
    v = roundQ(v - need, it);
  } else if (v < old) {
    const back = cheapest(others);
    if (back) cur[back.x.q.id] = roundQ((cur[back.x.q.id] ?? 0) + (old - v), it); // en ucuza ver
    else v = old;
  }
  cur[qid] = v;
  for (const k of Object.keys(cur)) if ((cur[k] ?? 0) <= 0) delete cur[k];
}

/* ---------------- karara aktarma ---------------- */
function applyModal(r: PurchaseRequest, ev: Evaluation, st: SimState): void {
  const k = kpiOf(r, ev, st.alloc);
  if (!k.complete) { toast("Her kalemin tamamını dağıtın; dağıtılmamış miktar var."); return; }
  const splitItems = (r.items ?? []).filter((it) => Object.values(st.alloc[it.id] ?? {}).filter((v) => v > 0).length > 1);
  openModal(`<div class="mh"><h2>Dağılımı karara aktar</h2></div><div class="mb">
    <p>${k.orders === 1 ? "Tüm kalemler tek tedarikçiden alınacak." : `${k.orders} tedarikçiye ayrı sipariş verilecek.`} Net maliyet nakliye dahil <b>${money(k.total, "TRY", 0)}</b>.</p>
    <ul data-sa-y="25">${k.groups.map((g) => `<li><b>${esc(supName(g.x.q))}</b>: ${g.lines.map((l) => `${esc(l.it.name)} ${numIn(l.qty)} ${esc(l.it.unit)}`).join(", ")}</li>`).join("")}</ul>
    ${splitItems.length ? `<div class="note small">Miktarı bölünen ${splitItems.length} kalem (${splitItems.map((it) => esc(it.name)).join(", ")}) talepte ayrı satırlara ayrılacak; tekliflerdeki birim fiyatlar yeni satırlara kopyalanır. Bu değişiklik hareket geçmişine yazılır.</div>` : ""}
    <p class="small muted">Karar onaya gönderilir; mevcut karar ve onaylar varsa yenisiyle değiştirilir.</p>
  </div><div class="mf"><button class="btn primary" data-act="sim-apply-yes">Karara aktar</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, true);
}

function applyAlloc(r: PurchaseRequest, st: SimState): void {
  const n = clone(r);
  const items: RequestItem[] = [];
  const assign: Record<string, string> = {};
  const moved: string[] = [];
  for (const it of n.items ?? []) {
    const parts = Object.entries(st.alloc[it.id] ?? {}).filter(([, v]) => v > 0);
    if (parts.length <= 1) { items.push(it); if (parts[0]) assign[it.id] = parts[0][0]; continue; }
    for (const [qid, qty] of parts) {
      const ni: RequestItem = { ...it, id: uid(), qty };
      for (const q of n.quotes) { const p = q.prices[it.id]; if (p !== undefined) q.prices[ni.id] = p; }
      items.push(ni); assign[ni.id] = qid;
    }
    for (const q of n.quotes) delete q.prices[it.id];
    moved.push(`${it.name} ${numIn(qtyOf(it))} → ${parts.map(([qid, qty]) => `${numIn(qty)} ${supName(n.quotes.find((q) => q.id === qid)!)}`).join(" + ")}`);
  }
  n.items = items;
  const used = [...new Set(Object.values(assign))];
  const award: Award = used.length === 1
    ? { mode: "single", quoteId: used[0]!, reason: "Dağıtım denemesinden aktarıldı", by: "", decidedAt: todayStr(), approvals: [] }
    : { mode: "split", quoteId: null, splits: assign, reason: "Dağıtım denemesinden aktarıldı", by: "", decidedAt: todayStr(), approvals: [] };
  if (r.award?.fx) award.fx = r.award.fx;
  n.award = award;
  n.status = "approval";
  saveRequest(n, `Dağıtım denemesi karara aktarıldı (${used.length} tedarikçi)${moved.length ? ": " + moved.join("; ") : ""}`);
  delete SIMS[r.id];
  closeModal();
  V.tab = "decision"; render(); window.scrollTo(0, 0);
  toast("Dağılım karara aktarıldı, onay bekliyor");
}

/** miktar elle değişince o kalemin dengesi artık dağılımı tarif etmez */
function markManual(c: { r: PurchaseRequest; ev: Evaluation; st: SimState }, itemId: string): void {
  const it = (c.r.items ?? []).find((x) => x.id === itemId);
  c.st.itemBal[itemId] = it ? deriveBal(c.ev, it, c.st.alloc[itemId]) : null; // denk gelen denge varsa göster
  refreshBalLabels(c.r, c.ev, c.st);
}

/* ---------------- olaylar ---------------- */
document.addEventListener("input", (e) => {
  if (!kokIcinde(e)) return;
  const t = e.target as FormEl;
  if (!t.closest || !t.closest("#sim")) return;
  const c = current(); if (!c) return;
  if (t.id === "sim-bal") {
    const v = Number(t.value); c.st.balance = v;
    for (const it of c.r.items ?? []) {
      if (c.st.excluded[it.id]) continue;
      const a = balanceItem(c.ev, it, v); if (a) { c.st.alloc[it.id] = a; c.st.itemBal[it.id] = v; }
    }
    refreshBalLabels(c.r, c.ev, c.st); syncInputs(c.st); simLive(); return;
  }
  if (t.dataset.sr) { setQty(c.r, c.ev, c.st, t.dataset.sr, t.dataset.q!, Number(t.value)); markManual(c, t.dataset.sr); syncInputs(c.st, t.dataset.sr); simLive(); return; }
  if (t.dataset.ib) {
    const it = (c.r.items ?? []).find((x) => x.id === t.dataset.ib); if (!it) return;
    const v = Number(t.value); const a = balanceItem(c.ev, it, v);
    if (a) { c.st.alloc[it.id] = a; c.st.itemBal[it.id] = v; }
    refreshBalLabels(c.r, c.ev, c.st); syncInputs(c.st, it.id); simLive();
  }
});
document.addEventListener("change", (e) => {
  if (!kokIcinde(e)) return;
  const t = e.target as FormEl;
  if (t.dataset?.iex && t.closest("#sim")) {
    const c = current(); if (!c) return;
    c.st.excluded[t.dataset.iex] = !t.checked; refreshBalLabels(c.r, c.ev, c.st); return;
  }
  if (!t.dataset || !t.dataset.sn || !t.closest("#sim")) return;
  const c = current(); if (!c) return;
  const v = miktarSayisi(t.value);
  if (v === "belirsiz") toast(BELIRSIZ_MIKTAR);
  if (typeof v !== "number") { syncInputs(c.st, t.dataset.sn); return; }
  setQty(c.r, c.ev, c.st, t.dataset.sn, t.dataset.q!, v);
  markManual(c, t.dataset.sn);
  t.value = numIn(c.st.alloc[t.dataset.sn]?.[t.dataset.q!] ?? 0);
  syncInputs(c.st, t.dataset.sn); simLive();
});
document.addEventListener("click", (e) => {
  if (!kokIcinde(e)) return;
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act^='sim-']"); if (!el) return;
  const act = el.dataset.act!;
  if (act === "sim-rename-ok") {
    const r = S.requests[V.id ?? ""]; const name = ($("#scn-name")?.value ?? "").trim(); if (!r || !name) { toast("Bir ad yazın."); return; }
    const n = clone(r); n.scenarios = (n.scenarios ?? []).map((x) => (x.id === el.dataset.id ? { ...x, name } : x)); saveRequest(n); closeModal(); return;
  }
  if (act === "sim-apply-yes") { const r = S.requests[V.id ?? ""]; const st = r ? SIMS[r.id] : undefined; if (r && st) applyAlloc(r, st); return; }
  const c = current(); if (!c) return;
  const { r, ev, st } = c;
  /** hazır dağılım; itemBal null ise kalemler "elle" görünür (dağılım bir denge değeriyle tarif edilemez) */
  const preset = (alloc: Alloc, bal: number, itemBal: number | null) => {
    st.alloc = alloc; st.balance = bal;
    for (const it of r.items ?? []) st.itemBal[it.id] = itemBal;
    if (itemBal === null) deriveAll(r, ev, st);
    const b = $("#sim-bal"); if (b) b.value = String(bal);
    refreshBalLabels(r, ev, st); syncInputs(st); simLive();
  };
  if (act === "sim-opt") preset(optimalAlloc(r, ev), 0, null);
  else if (act === "sim-cheap") preset(balanceAlloc(r, ev, 0), 0, 0);
  else if (act === "sim-fast") preset(balanceAlloc(r, ev, 100), 100, 100);
  else if (act === "sim-equal") preset(equalAlloc(r, ev), st.balance, null);
  else if (act === "sim-save") {
    if (!kpiOf(r, ev, st.alloc).complete) { toast("Her kalemin tamamını dağıtın; dağıtılmamış miktar var."); return; }
    const scs = r.scenarios ?? [];
    const nums = scs.map((x) => Number((x.name.match(/^Senaryo (\d+)$/) ?? [])[1] ?? 0));
    const name = `Senaryo ${Math.max(0, ...nums) + 1}`;
    const n = clone(r);
    n.scenarios = [...scs, { id: uid(), name, alloc: clone(st.alloc), itemBal: { ...st.itemBal }, createdAt: Date.now(), by: S.me?.id ?? "" }];
    saveRequest(n);
    toast(`${name} kaydedildi; karşılaştırma tablosuna eklendi`);
  }
  else if (act === "sim-load") { const sc = (r.scenarios ?? []).find((x) => x.id === el.dataset.id); if (sc) { st.alloc = clone(sc.alloc); st.itemBal = { ...(sc.itemBal ?? {}) }; deriveAll(r, ev, st); refreshBalLabels(r, ev, st); syncInputs(st); simLive(); toast(`${sc.name} yüklendi`); } }
  else if (act === "sim-del") { const n = clone(r); n.scenarios = (n.scenarios ?? []).filter((x) => x.id !== el.dataset.id); saveRequest(n); }
  else if (act === "sim-rename") {
    const sc = (r.scenarios ?? []).find((x) => x.id === el.dataset.id); if (!sc) return;
    openModal(`<div class="mh"><h2>Senaryonun adı</h2></div><div class="mb"><label class="f"><span>Ad</span><input type="text" id="scn-name" maxlength="80" value="${esc(sc.name)}" placeholder="Örn. Acil kısmı hızlı tedarikçiden"></label></div><div class="mf"><button class="btn primary" data-act="sim-rename-ok" data-id="${sc.id}">Kaydet</button><button class="btn ghost" data-act="close">Vazgeç</button></div>`, true);
  }
  else if (act === "sim-apply-scn") { const sc = (r.scenarios ?? []).find((x) => x.id === el.dataset.id); if (sc) { st.alloc = clone(sc.alloc); st.itemBal = { ...(sc.itemBal ?? {}) }; syncInputs(st); simLive(); applyModal(r, ev, st); } }
  else if (act === "sim-apply") applyModal(r, ev, st);
});
window.addEventListener("resize", () => { if ($("#sim")) { const c = current(); if (c) drawCurve(c.r, kpiOf(c.r, c.ev, c.st.alloc)); } });
