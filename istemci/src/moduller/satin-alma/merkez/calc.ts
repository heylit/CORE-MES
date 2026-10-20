import type { SiparisLogo } from "#paylasilan/sozlesme/satin-alma.ts";
import type { Approval, ApprovalLimit, Currency, ExcessLine, PurchaseRequest, Quality, Quote, RequestItem, Settings, Supplier, Weights } from "./tipler.ts";
import { COMMITTED, CRIT, OPEN, stLabel, type CritKey } from "./constants.ts";
import { memo, S, settings } from "./store.ts";
import { addDays, clamp, dayDiff, isNum, norm, parseNum, sum, todayStr, tsDate } from "./util.ts";
import { belirsizMiktarVar, miktarGirdisi } from "../../../ortak/veri/miktar.ts";

/* ---------------- teklif hesabı ---------------- */
export interface QuoteCalc {
  rate: number; sub: number; disc: number; net: number; ship: number; other: number; total: number;
  totalTRY: number; pvTRY: number; factor: number; vadeGain: number; covered: number; coverage: number;
  lines: Record<string, { unit: number; line: number }>;
  /** birim fiyatı TL'ye ve net bugünkü değere çeviren çarpan */
  unitFactorTRY: number;
  /** birim fiyatı iskonto sonrası TL'ye çeviren çarpan */
  unitTRY: number;
  monthly: number;
}

export function rateOf(q: Quote, set: Settings): number {
  if (isNum(q.fxRate) && q.fxRate > 0) return q.fxRate;
  return liveRate(q.currency, set) ?? 1;
}

/**
 * Açık taleplerde güncel kur kullanılır (ödeme bugünün/yarının kuruyla yapılacak).
 * Sipariş verilince kurlar karara sabitlenir; sabit kur yoksa teklif günü kuru kullanılır.
 */
export const liveRates = (req: PurchaseRequest): boolean => OPEN.includes(req.status);
/** Finansın güncel kuru; finansta yoksa boş (SA3 a). */
export function liveRate(c: Currency, set: Settings): number | null {
  if (c === "TRY") return 1;
  const v = parseNum(set.currencies[c]?.rate);
  return v !== null && v > 0 ? v : null;
}
/** Güncel kur yoksa teklifin kendi günündeki kuru kullanılır (sunucu döviz teklifinde kuru hep saklar). */
export function rateFor(req: PurchaseRequest, q: Quote, set: Settings): number {
  if (q.currency === "TRY") return 1;
  const own = isNum(q.fxRate) && q.fxRate > 0 ? q.fxRate : null;
  const cur = liveRate(q.currency, set);
  if (liveRates(req)) return cur ?? own ?? 1;
  const fx = req.award?.fx?.[q.currency];
  if (isNum(fx) && fx > 0) return fx;
  return own ?? cur ?? 1;
}
/** Sipariş anında sabitlenen kur: güncel kur, finansta yoksa o para birimindeki ilk teklifin kuru. */
export function fixedRates(r: PurchaseRequest, set: Settings): Record<string, number> {
  const fx: Record<string, number> = {};
  for (const q of r.quotes ?? []) {
    if (q.currency === "TRY" || fx[q.currency]) continue;
    const v = liveRate(q.currency, set) ?? (isNum(q.fxRate) && q.fxRate > 0 ? q.fxRate : null);
    if (v !== null) fx[q.currency] = v;
  }
  return fx;
}

export function quoteCalc(req: PurchaseRequest, q: Quote, set: Settings = settings()): QuoteCalc {
  const cur = set.currencies[q.currency] ?? { rate: 1, monthly: 0 };
  const rate = rateFor(req, q, set);
  const m = (parseNum(cur.monthly) || 0) / 100;
  let sub = 0, covered = 0;
  const lines: QuoteCalc["lines"] = {};
  for (const it of req.items ?? []) {
    const p = q.prices ? q.prices[it.id] : undefined;
    if (isNum(p)) { const l = p * (parseNum(it.qty) || 0); sub += l; covered++; lines[it.id] = { unit: p, line: l }; }
  }
  const disc = clamp((parseNum(q.discountPct) || 0) / 100, 0, 1);
  const net = sub * (1 - disc);
  const ship = q.deliveryIncluded ? 0 : parseNum(q.shipping) || 0;
  const other = parseNum(q.otherCost) || 0;
  const total = net + ship + other;
  const adv = clamp((parseNum(q.advancePct) || 0) / 100, 0, 1);
  const days = parseNum(q.payDays) || 0;
  const factor = adv + (1 - adv) / Math.pow(1 + m, days / 30);
  const totalTRY = total * rate, pvTRY = totalTRY * factor;
  const n = (req.items ?? []).length;
  return { rate, sub, disc, net, ship, other, total, totalTRY, pvTRY, factor, vadeGain: totalTRY - pvTRY, covered, coverage: n ? covered / n : 0, lines, unitFactorTRY: rate * (1 - disc) * factor, unitTRY: rate * (1 - disc), monthly: m };
}

/** Tek teklif ve toplu giriş aynı iletiyi gösterir: döviz teklifi kursuz kaydedilmez (SA3 a). */
export const KUR_ILETISI = "Teklif günündeki kuru girin.";
/** Finansın güncel kuru yalnız kur gününün teklifine önerilir; başka günün teklifinde kur boşsa sunucu o günün kurunu finanstan alır
 *  ya da kuru ister (SA3 a: o günün kuru saklanır). */
export function otomatikKur(c: Currency, tarih: string, set: Settings): number | null {
  if (c === "TRY") return 1;
  return tarih !== "" && tarih === set.ratesDate ? liveRate(c, set) : null;
}
/** Teklifin kaydedilecek kuru: TRY için 1, girilen kur, yoksa kur gününün teklifinde finansın kuru; değilse boş (sunucu çözer). */
export function kaydedilecekKur(c: Currency, girilen: number | null | undefined, set: Settings, tarih: string): number | null {
  if (c === "TRY") return 1;
  return isNum(girilen) && girilen > 0 ? girilen : otomatikKur(c, tarih, set);
}
/** Ekran kursuz kaydı yalnız kur gününün teklifinde ve finansta kur yokken durdurur; başka günün kurunu sunucu finanstan alır ya da ister. */
export const kurIstenir = (c: Currency, girilen: number | null | undefined, set: Settings, tarih: string): boolean =>
  c !== "TRY" && kaydedilecekKur(c, girilen, set, tarih) === null && tarih === set.ratesDate;
/** S6 b: kalem karta bağlanınca birim kartın birimi olur; yazılan birim farklıysa kullanıcıya söylenecek ileti, değilse boş. */
/** Denetim #37: kalem miktarı ortak ayrıştırıcıdan okunur; virgülsüz "1.250" binlik mi ondalık mı belli değildir (soru 71). Fiyat buradan geçmez. */
export function miktarSayisi(v: string): number | null | "belirsiz" {
  const m = miktarGirdisi(v);
  if (belirsizMiktarVar(m)) return "belirsiz";
  return /^\d+(\.\d+)?$/.test(m) ? Number(m) : null;
}
export interface YapistirilanKalem { name: string; qty: number; unit: string; spec: string }
/** Toplu yapıştırma satırı "ad, miktar, birim, açıklama" (sekme ya da ;). Belirsiz miktar yarım liste eklemesin diye bütün yapıştırmayı durdurur. */
export function yapistirilanKalemler(metin: string): YapistirilanKalem[] | "belirsiz" {
  const kalemler: YapistirilanKalem[] = [];
  for (const satir of metin.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
    const p = satir.split(/\t|;/);
    if (!p[0]) continue;
    const q = miktarSayisi(p[1] ?? "");
    if (q === "belirsiz") return "belirsiz";
    kalemler.push({ name: p[0].trim(), qty: q ?? 1, unit: (p[2] || "").trim() || "adet", spec: (p[3] || "").trim() });
  }
  return kalemler;
}
const miktarBicimi = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4, useGrouping: false });
/** Miktar girdisi binliksiz yazılır: ekranın kendi yazdığı "1.250" yeniden okununca belirsiz sayılmasın. */
export const miktarIn = (n: unknown): string => (isNum(n) ? miktarBicimi.format(n) : "");
export function birimUyarisi(yazilan: string | null | undefined, kartBirimi: string | null | undefined): string | null {
  const kart = (kartBirimi ?? "").trim();
  if (kart === "" || norm(yazilan) === "" || norm(yazilan) === norm(kart)) return null;
  return `Birim kartla aynı yapıldı: ${kart}`;
}
/** SAT-41: finansta pasif firma, seçim listelerinde adın yanında görünür; sunucu o firmayla yeni teklifi reddeder. */
export const pasifEki = (s: Pick<Supplier, "active">): string => (s.active === false ? " (pasif)" : "");
export function supName(q: Quote): string { const s = S.suppliers[q.supplierId]; return s ? s.name : q.supplierName || "Bilinmeyen tedarikçi"; }
export function payText(q: Quote): string {
  const adv = parseNum(q.advancePct) || 0, d = parseNum(q.payDays) || 0;
  if (!d && !adv) return "Peşin";
  if (adv >= 100) return "%100 avans";
  return (adv ? `%${Math.round(adv)} avans, kalan ` : "") + (d ? `${d} gün vade` : "peşin");
}
export const validity = (q: Quote): number | null => (q.validUntil ? dayDiff(todayStr(), q.validUntil) : null);

/* ---------------- katalog eşleme ---------------- */
export function matIndex(): Record<string, string> {
  return memo("matIndex", () => {
    const o: Record<string, string> = {};
    for (const m of Object.values(S.materials)) { o[norm(m.name)] = m.id; for (const a of m.aliases ?? []) o[norm(a)] = m.id; }
    return o;
  });
}
export function matOf(it: Pick<RequestItem, "materialId" | "name">): string | null {
  if (it.materialId && S.materials[it.materialId]) return it.materialId;
  return matIndex()[norm(it.name)] ?? null;
}
// Ekran adı katalogla eşleşen kalemi bağlı gösterir; talep kataloğa sonradan eklenen kalemden önce açıldıysa bağ kayıtta yoktur
// ve sunucu siparişi "kart bekliyor" diye reddeder. Siparişte eşleşen kalem bağlanır; elle verilmiş bağ değişmez.
export function kataloglaEslesenleriBagla(items: RequestItem[] | undefined): void {
  (items || []).forEach(it => { if (!it.materialId && it.name) it.materialId = matOf(it); });
}
export function nextNo(): string {
  const y = new Date().getFullYear();
  let max = 0;
  for (const r of Object.values(S.requests)) { const m = String(r.no || "").match(/^ST-(\d{4})-(\d+)$/); if (m && +m[1]! === y) max = Math.max(max, +m[2]!); }
  return `ST-${y}-${String(max + 1).padStart(3, "0")}`;
}

/* ---------------- karar yardımcıları ---------------- */
export function awardedQuoteFor(r: PurchaseRequest, itemId: string): string | null {
  const a = r.award;
  if (!a) return null;
  if (a.mode === "split") return a.splits?.[itemId] ?? null;
  return a.quoteId ?? null;
}
export const isCommitted = (r: PurchaseRequest): boolean => !!r.award && (COMMITTED.includes(r.status) || r.status === "approval");

/* ---------------- harcama ---------------- */
export interface SpendLine { reqId: string; no: string; date: string; month: string; supplierId: string; materialId: string | null; category: string; department: string; amount: number }

export function spendLines(): SpendLine[] {
  return memo("spend", () => {
    const set = settings(), out: SpendLine[] = [];
    for (const r of Object.values(S.requests)) {
      if (!r.award || !COMMITTED.includes(r.status)) continue;
      const date = r.award.orderDate || r.award.decidedAt || tsDate(r.updatedAt);
      const byQ: Record<string, { q: Quote; items: RequestItem[] }> = {};
      for (const it of r.items ?? []) {
        const qid = awardedQuoteFor(r, it.id);
        const q = (r.quotes ?? []).find((x) => x.id === qid);
        if (!q || !q.prices || !isNum(q.prices[it.id])) continue;
        (byQ[q.id] ??= { q, items: [] }).items.push(it);
      }
      const orders = awardOrders(r);
      for (const { q, items } of Object.values(byQ)) {
        const c = quoteCalc(r, q, set);
        const qdate = orders.find((o) => o.qid === q.id)?.orderDate || date;
        const goods = sum(items.map((it) => c.lines[it.id]!.line)) * (1 - c.disc);
        const extra = c.ship + c.other; // sipariş başına tam masraf, seçilen kalemlere dağıtılır
        for (const it of items) {
          const g = c.lines[it.id]!.line * (1 - c.disc);
          const amount = (g + (goods ? (extra * g) / goods : 0)) * c.rate;
          const mid = matOf(it); const mat = mid ? S.materials[mid] : undefined;
          out.push({ reqId: r.id, no: r.no, date: qdate, month: String(qdate).slice(0, 7), supplierId: q.supplierId, materialId: mid, category: mat?.category || it.category || "Kategorisiz", department: r.department || "Belirtilmemiş", amount });
        }
      }
    }
    return out;
  });
}

/* ---------------- iş kutusu sayıları ---------------- */
export interface PanoSayilari { onayBekleyen: number; acikTalep: number; acikSiparisTutari: number; acikSiparis: number; gecikenTeslim: number; buAyHarcama: number }
/** İş kutusunun üst şeridi. Tutarlar TL, iskonto ve masraf dahil (harcama satırlarıyla aynı hesap). */
export function panoSayilari(bugun: string = todayStr()): PanoSayilari {
  const talepler = Object.values(S.requests);
  const satirlar = spendLines();
  let acikSiparisTutari = 0, acikSiparis = 0, gecikenTeslim = 0;
  for (const r of talepler) {
    if (r.status !== "ordered") continue;
    for (const o of awardOrders(r)) {
      if (o.deliveredDate) continue;
      acikSiparis++;
      acikSiparisTutari += sum(satirlar.filter((l) => l.reqId === r.id && l.supplierId === o.supplierId).map((l) => l.amount));
      const termin = orderDue(o);
      if (termin && termin < bugun) gecikenTeslim++;
    }
  }
  const ay = bugun.slice(0, 7);
  return {
    onayBekleyen: talepler.filter((r) => r.status === "approval" && approvalState(r).state !== "approved").length,
    acikTalep: talepler.filter((r) => OPEN.includes(r.status)).length,
    acikSiparisTutari, acikSiparis, gecikenTeslim,
    buAyHarcama: sum(satirlar.filter((l) => l.month === ay).map((l) => l.amount)),
  };
}
export interface TeslimBasarimi { supplierId: string; ad: string; teslim: number; zamaninda: number; oran: number; ortGecikme: number | null }
/** Teslim alınmış siparişi olan tedarikçiler, en çok teslim edenden başlayarak. */
export function teslimBasarimi(): TeslimBasarimi[] {
  return Object.entries(supplierStats())
    .filter(([, s]) => s.deliveries > 0)
    .map(([id, s]) => ({
      supplierId: id, ad: S.suppliers[id]?.name ?? "Bilinmeyen tedarikçi", teslim: s.deliveries, zamaninda: s.onTime,
      oran: (s.onTime / s.deliveries) * 100, ortGecikme: s.lateDays.length ? sum(s.lateDays) / s.lateDays.length : null,
    }))
    .sort((a, b) => b.teslim - a.teslim || a.ad.localeCompare(b.ad, "tr"));
}

/* ---------------- fiyat hafızası ---------------- */
export interface PriceEntry {
  date: string; cAt: number; reqId: string; no: string; supplierId: string; supplier: string;
  unit: number; currency: string; unitTRY: number; qty: number; won: boolean; leadDays: number | null; payText: string;
}
export function priceHistory(mid: string): PriceEntry[] {
  return memo("ph:" + mid, () => {
    const set = settings(), out: PriceEntry[] = [];
    for (const r of Object.values(S.requests)) for (const it of r.items ?? []) {
      if (matOf(it) !== mid) continue;
      for (const q of r.quotes ?? []) {
        const p = q.prices?.[it.id];
        if (!isNum(p)) continue;
        const rate = rateFor(r, q, set);
        const disc = clamp((parseNum(q.discountPct) || 0) / 100, 0, 1);
        out.push({ date: q.date || tsDate(r.createdAt), cAt: r.createdAt || 0, reqId: r.id, no: r.no, supplierId: q.supplierId, supplier: supName(q), unit: p, currency: q.currency, unitTRY: p * rate * (1 - disc), qty: parseNum(it.qty) || 0, won: awardedQuoteFor(r, it.id) === q.id && isCommitted(r), leadDays: parseNum(q.leadDays), payText: payText(q) });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cAt - b.cAt));
  });
}
export interface SupplierPrice { supplierId: string; name: string; n: number; wins: number; sumTRY: number; last: PriceEntry; avgTRY: number }
export interface MatStats {
  h: PriceEntry[]; buys: PriceEntry[]; last: PriceEntry | null; first: PriceEntry | null; count: number; quotes: number;
  avgTRY: number | null; minTRY: number | null; change: number | null; qty: number; suppliers: SupplierPrice[];
}
export function matStats(mid: string): MatStats {
  return memo("ms:" + mid, () => {
    const h = priceHistory(mid);
    const buys = h.filter((e) => e.won);
    const last = buys[buys.length - 1] ?? null, first = buys[0] ?? null;
    const yearAgo = addDays(todayStr(), -365);
    const recent = h.filter((e) => e.date >= yearAgo);
    const sups: Record<string, SupplierPrice> = {};
    for (const e of h) {
      const s = (sups[e.supplierId] ??= { supplierId: e.supplierId, name: e.supplier, n: 0, wins: 0, sumTRY: 0, last: e, avgTRY: 0 });
      s.n++; s.sumTRY += e.unitTRY; if (e.won) s.wins++; s.last = e;
    }
    return {
      h, buys, last, first, count: buys.length, quotes: h.length,
      avgTRY: recent.length ? sum(recent.map((e) => e.unitTRY)) / recent.length : null,
      minTRY: h.length ? Math.min(...h.map((e) => e.unitTRY)) : null,
      change: first && last && first !== last && first.unitTRY ? ((last.unitTRY - first.unitTRY) / first.unitTRY) * 100 : null,
      qty: sum(buys.map((e) => e.qty)),
      suppliers: Object.values(sups).map((s) => ({ ...s, avgTRY: s.sumTRY / s.n })).sort((a, b) => a.avgTRY - b.avgTRY),
    };
  });
}
/** Teklif kaleminin son alışa göre sapması */
export function vsLast(r: PurchaseRequest, it: RequestItem, unitTRY: number): { last: PriceEntry; pct: number } | null {
  const mid = matOf(it);
  if (!mid) return null;
  const prev = matStats(mid).buys.filter((e) => e.reqId !== r.id);
  const last = prev[prev.length - 1];
  if (!last || !last.unitTRY) return null;
  return { last, pct: ((unitTRY - last.unitTRY) / last.unitTRY) * 100 };
}
/** SAT-61: fiyat artışı ayardaki uyarı yüzdesine eşit ya da üstündeyse uyarı ("pazarlık payı"); sapma yoksa uyarı yok */
export function fiyatUyarisi(pct: number | null | undefined, esikYuzde: number): boolean {
  return isNum(pct) && pct >= esikYuzde;
}

/* ---------------- tedarikçi karnesi ---------------- */
export interface SupplierStat {
  quotes: number; asked: number; answered: number; respDays: number[]; wins: number; evaluated: number;
  deliveries: number; onTime: number; qualityN: number; qualityOk: number; lateDays: number[]; gapPct: number[]; leads: number[];
  spendTRY: number; lastQuote: string | null;
  responseRate: number | null; avgResp: number | null; onTimeRate: number | null; qualityRate: number | null;
  avgGap: number | null; avgLead: number | null; winRate: number | null;
}
const emptyStat = (): SupplierStat => ({ quotes: 0, asked: 0, answered: 0, respDays: [], wins: 0, evaluated: 0, deliveries: 0, onTime: 0, qualityN: 0, qualityOk: 0, lateDays: [], gapPct: [], leads: [], spendTRY: 0, lastQuote: null, responseRate: null, avgResp: null, onTimeRate: null, qualityRate: null, avgGap: null, avgLead: null, winRate: null });
export const EMPTY_STATS: SupplierStat = emptyStat();

export function supplierStats(): Record<string, SupplierStat> {
  return memo("supStats", () => {
    const st: Record<string, SupplierStat> = {}, set = settings();
    const g = (id: string) => (st[id] ??= emptyStat());
    for (const r of Object.values(S.requests)) {
      const nItems = (r.items ?? []).length;
      const full = (r.quotes ?? []).filter((q) => q.compliant !== false).map((q) => ({ q, c: quoteCalc(r, q, set) })).filter((x) => nItems && x.c.covered === nItems);
      const bestPV = full.length ? Math.min(...full.map((x) => x.c.pvTRY)) : null;
      for (const x of r.rfqs ?? []) {
        const s = g(x.supplierId); s.asked++;
        const q = (r.quotes ?? []).find((q) => q.supplierId === x.supplierId);
        if (q) { s.answered++; if (x.sentAt && q.date) s.respDays.push(Math.max(0, dayDiff(x.sentAt, q.date))); }
      }
      for (const q of r.quotes ?? []) {
        if (!q.supplierId) continue;
        const s = g(q.supplierId); s.quotes++;
        if (!s.lastQuote || (q.date || "") > s.lastQuote) s.lastQuote = q.date;
        const ld = parseNum(q.leadDays); if (ld !== null) s.leads.push(ld);
        const me = full.find((x) => x.q.id === q.id);
        if (me && full.length >= 2 && bestPV !== null) { s.evaluated++; s.gapPct.push(bestPV ? ((me.c.pvTRY - bestPV) / bestPV) * 100 : 0); }
      }
      const a = r.award;
      if (!a || r.status === "cancelled" || !isCommitted(r)) continue;
      const winners = new Set<string>();
      if (a.mode === "split") for (const qid of Object.values(a.splits ?? {})) { const q = (r.quotes ?? []).find((x) => x.id === qid); if (q) winners.add(q.supplierId); }
      else { const q = (r.quotes ?? []).find((x) => x.id === a.quoteId); if (q) winners.add(q.supplierId); }
      winners.forEach((id) => g(id).wins++);
      // her sipariş ayrı ölçülür (kalem bazlı kararda her tedarikçinin kendi teslimi)
      if (COMMITTED.includes(r.status)) for (const o of awardOrders(r)) {
        if (!o.deliveredDate) continue;
        const s = g(o.supplierId), due = orderDue(o);
        if (due) { s.deliveries++; const late = dayDiff(due, o.deliveredDate); if (late <= 0) s.onTime++; else s.lateDays.push(late); }
        if (o.quality) { s.qualityN++; if (o.quality === "ok") s.qualityOk++; }
      }
    }
    for (const l of spendLines()) if (l.supplierId) g(l.supplierId).spendTRY += l.amount;
    for (const s of Object.values(st)) {
      s.responseRate = s.asked ? (s.answered / s.asked) * 100 : null;
      s.avgResp = s.respDays.length ? sum(s.respDays) / s.respDays.length : null;
      s.onTimeRate = s.deliveries ? (s.onTime / s.deliveries) * 100 : null;
      s.qualityRate = s.qualityN ? (s.qualityOk / s.qualityN) * 100 : null;
      s.avgGap = s.gapPct.length ? sum(s.gapPct) / s.gapPct.length : null;
      s.avgLead = s.leads.length ? sum(s.leads) / s.leads.length : null;
      s.winRate = s.quotes ? (s.wins / s.quotes) * 100 : null;
    }
    return st;
  });
}
/** Tedarikçi performans puanı (0-100): puanınız, zamanında teslim ve kalite */
export function perfScore(supId: string): number {
  const s = S.suppliers[supId];
  const st = supplierStats()[supId] ?? EMPTY_STATS;
  const parts: [number, number][] = [[((parseNum(s?.rating) || 3) / 5) * 100, 1]];
  if (st.onTimeRate !== null) parts.push([st.onTimeRate, 1.5]);
  if (st.qualityRate !== null) parts.push([st.qualityRate, 1]);
  return sum(parts.map((p) => p[0] * p[1])) / sum(parts.map((p) => p[1]));
}

/* ---------------- değerlendirme ---------------- */
export interface EvalRow {
  q: Quote; c: QuoteCalc; sup: Supplier | undefined;
  fill: number; scorePV: number; s: Record<CritKey, number>; parts: Record<CritKey, number>; score: number;
  late: number | null; suspended: boolean;
}
export interface PlanGroup { x: EvalRow; items: RequestItem[]; goods: number; extras: number; late: number | null }
export interface Plan { ok: boolean; assign: Record<string, string>; goods: number; extras: number; total: number; groups: PlanGroup[] }
export interface Split { plan: Plan; total: number; used: string[]; best: EvalRow | null; bestTotal: number | null; saving: number | null; suggested: boolean }
export interface Evaluation { all: EvalRow[]; elig: EvalRow[]; ranking: EvalRow[]; bestUnit: Record<string, { u: number; qid: string }>; w: Weights; split: Split | null; set: Settings }

const zero = (): Record<CritKey, number> => ({ cost: 0, lead: 0, supplier: 0, warranty: 0 });

/* ---------------- kalem bazlı dağılım ----------------
   Kalem maliyeti: birim fiyat × miktar; TL'ye çevrilmiş, iskonto ve vade sonrası.
   Kullanılan her teklifin nakliye ve diğer masrafları sipariş başına TAM eklenir. */
export function itemCost(x: EvalRow, it: RequestItem): number | null { const l = x.c.lines[it.id]; return l ? l.unit * x.c.unitFactorTRY : null; }
const extrasPV = (x: EvalRow): number => (x.c.ship + x.c.other) * x.c.rate * x.c.factor;

export function planCost(req: PurchaseRequest, rows: EvalRow[], assign: Record<string, string>): Plan {
  const by: Record<string, PlanGroup> = {};
  let goods = 0, ok = true;
  for (const it of req.items ?? []) {
    const qid = assign[it.id];
    const x = rows.find((y) => y.q.id === qid);
    const u = x ? itemCost(x, it) : null;
    if (!x || u === null || !qid) { ok = false; continue; }
    const amt = u * (parseNum(it.qty) || 0);
    goods += amt;
    const g = (by[qid] ??= { x, items: [], goods: 0, extras: 0, late: null });
    g.items.push(it); g.goods += amt;
  }
  const groups = Object.values(by);
  for (const g of groups) { g.extras = extrasPV(g.x); g.late = g.x.late ?? lateBy(req, g.x.q); }
  const extras = sum(groups.map((g) => g.extras));
  return { ok, assign, goods, extras, total: goods + extras, groups };
}

/**
 * Tedarikçi alt kümelerini dener; her kümede kalemi kümedeki en ucuz teklife atar ve masraflarla toplamı en düşük olanı seçer.
 * Nakliye yüzünden "her kalemde en ucuz" yaklaşımı yanıltabildiği için tam arama yapılır (12 teklife kadar).
 */
export function optimalSplit(req: PurchaseRequest, rows: EvalRow[]): Plan | null {
  const items = req.items ?? [];
  let pool = rows.slice();
  if (pool.length > 12) pool = pool.sort((a, b) => b.c.covered - a.c.covered || a.c.pvTRY - b.c.pvTRY).slice(0, 12);
  let best: Plan | null = null;
  for (let mask = 1; mask < 1 << pool.length; mask++) {
    const sub = pool.filter((_, i) => mask & (1 << i));
    const assign: Record<string, string> = {};
    let ok = true;
    for (const it of items) {
      let bx: EvalRow | null = null, bu = Infinity;
      for (const x of sub) { const u = itemCost(x, it); if (u !== null && u < bu) { bu = u; bx = x; } }
      if (!bx) { ok = false; break; }
      assign[it.id] = bx.q.id;
    }
    if (!ok) continue;
    const p = planCost(req, rows, assign);
    if (!best || p.total < best.total - 1e-9) best = p;
  }
  return best;
}

/* ---------------- siparişler ---------------- */
export interface OrderInfo {
  qid: string; q: Quote; supplierId: string; items: RequestItem[];
  orderNo: string; poNo: string; orderDate: string; expectedDate: string; deliveredDate: string; quality: Quality | ""; excess: ExcessLine[];
  logo: SiparisLogo | null;
}
/** Görünen sipariş numarası: TMI numarası, varsa yanında Logo / tedarikçi numarası (kart #544). */
export function siparisEtiketi(o: { orderNo?: string; poNo?: string }): string {
  return [o.orderNo, o.poNo].filter(Boolean).join(" / ");
}
/** Karara bağlı siparişler: tek tedarikçide bir, kalem bazlı kararda her tedarikçiye bir sipariş */
export function awardOrders(r: PurchaseRequest): OrderInfo[] {
  const a = r.award;
  if (!a) return [];
  if (a.mode === "split") {
    const by: Record<string, RequestItem[]> = {};
    for (const it of r.items ?? []) { const qid = a.splits?.[it.id]; if (qid) (by[qid] ??= []).push(it); }
    return Object.entries(by).flatMap(([qid, items]) => {
      const q = (r.quotes ?? []).find((x) => x.id === qid);
      const o = a.orders?.[qid] ?? {};
      return q ? [{ qid, q, supplierId: q.supplierId, items, orderNo: o.orderNo ?? "", poNo: o.poNo ?? "", orderDate: o.orderDate ?? "", expectedDate: o.expectedDate ?? "", deliveredDate: o.deliveredDate ?? "", quality: o.quality ?? "", excess: o.excess ?? [], logo: o.logo ?? null }] : [];
    });
  }
  const q = (r.quotes ?? []).find((x) => x.id === a.quoteId);
  if (!q) return [];
  return [{ qid: q.id, q, supplierId: q.supplierId, items: (r.items ?? []).filter((it) => isNum(q.prices?.[it.id])), orderNo: a.orderNo ?? "", poNo: a.poNo ?? "", orderDate: a.orderDate ?? "", expectedDate: a.expectedDate ?? "", deliveredDate: a.deliveredDate ?? "", quality: a.quality ?? "", excess: a.excess ?? [], logo: a.logo ?? null }];
}
export function orderDue(o: { q: Quote; expectedDate: string; orderDate: string }): string {
  const ld = parseNum(o.q.leadDays);
  return o.expectedDate || (o.orderDate && ld !== null ? addDays(o.orderDate, ld) : "");
}

/**
 * Termin puanı:
 * - İhtiyaç tarihi varsa zamanında yetişen her teklif 100; her gecikme günü 100/15 puan düşürür.
 * - İhtiyaç tarihi yoksa en kısa termine göre her fazla gün 100/30 puan düşürür.
 * - Termin bilinmiyorsa 0.
 */
export const LATE_ZERO_DAYS = 15, SPREAD_ZERO_DAYS = 30, WARRANTY_CAP = 12;
export function leadScore(req: PurchaseRequest, q: Quote, minLead: number): number {
  const ld = parseNum(q.leadDays);
  if (ld === null) return 0;
  if (req.needDate) return clamp(100 - ((lateBy(req, q) ?? 0) * 100) / LATE_ZERO_DAYS, 0, 100);
  return clamp(100 - ((ld - minLead) * 100) / SPREAD_ZERO_DAYS, 0, 100);
}

export function lateBy(req: PurchaseRequest, q: Quote): number | null {
  const ld = parseNum(q.leadDays);
  if (!req.needDate || ld === null) return null;
  const base = req.award?.orderDate || todayStr();
  const d = dayDiff(req.needDate, addDays(base, ld));
  return d > 0 ? d : null;
}

export function evaluate(req: PurchaseRequest, wOverride?: Weights | null): Evaluation {
  const run = (): Evaluation => {
    const set = settings(), items = req.items ?? [];
    const all: EvalRow[] = (req.quotes ?? []).map((q) => ({ q, c: quoteCalc(req, q, set), sup: S.suppliers[q.supplierId], fill: 0, scorePV: 0, s: zero(), parts: zero(), score: 0, late: null, suspended: false }));
    const elig = all.filter((x) => x.q.compliant !== false && x.c.covered > 0);
    const maxUnit: Record<string, number> = {}, bestUnit: Evaluation["bestUnit"] = {};
    for (const it of items) for (const x of elig) {
      const l = x.c.lines[it.id];
      if (!l) continue;
      const u = l.unit * x.c.unitFactorTRY;
      if (maxUnit[it.id] === undefined || u > maxUnit[it.id]!) maxUnit[it.id] = u;
      if (!bestUnit[it.id] || u < bestUnit[it.id]!.u) bestUnit[it.id] = { u, qid: x.q.id };
    }
    for (const x of elig) {
      let fill = 0;
      for (const it of items) if (!x.c.lines[it.id] && maxUnit[it.id] !== undefined) fill += maxUnit[it.id]! * (parseNum(it.qty) || 0);
      x.fill = fill; x.scorePV = x.c.pvTRY + fill;
    }
    const w = wOverride ?? req.weights ?? set.weights;
    const minPV = elig.length ? Math.min(...elig.map((x) => x.scorePV)) : 0;
    const leads = elig.map((x) => parseNum(x.q.leadDays)).filter((v): v is number => v !== null);
    const minLead = leads.length ? Math.min(...leads) : 0;
    const maxW = Math.max(0, ...elig.map((x) => parseNum(x.q.warrantyMonths) || 0));
    const tw = (+w.cost || 0) + (+w.lead || 0) + (+w.supplier || 0) + (+w.warranty || 0) || 1;
    for (const x of elig) {
      x.s = {
        cost: x.scorePV > 0 ? (minPV / x.scorePV) * 100 : 100,
        lead: leadScore(req, x.q, minLead),
        supplier: perfScore(x.q.supplierId),
        // garanti 12 aya kadar orantılı; üstü ek puan getirmez
        warranty: maxW > 0 ? (Math.min(parseNum(x.q.warrantyMonths) || 0, WARRANTY_CAP) / Math.min(maxW, WARRANTY_CAP)) * 100 : 100,
      };
      x.score = 0;
      for (const cr of CRIT) { const p = (x.s[cr.k] * (+w[cr.k] || 0)) / tw; x.parts[cr.k] = p; x.score += p; }
      x.late = lateBy(req, x.q);
      x.suspended = x.sup?.status === "suspended";
    }
    // tüm kalemlere teklif verenler önce: eksik kalemli teklif tek başına seçilemez
    const nIt = items.length;
    const ranking = [...elig].sort((a, b) => Number(b.c.covered === nIt) - Number(a.c.covered === nIt) || b.score - a.score);
    // kalem bazlı bölme: nakliye ve masraflar dahil en uygun dağılım, en uygun tek tedarikçiyle kıyaslanır
    let split: Split | null = null;
    if (elig.length >= 2 && items.length >= 2) {
      const opt = optimalSplit(req, elig);
      if (opt) {
        const full = elig.filter((x) => x.c.covered === items.length);
        const best = full.length ? full.reduce((a, b) => (a.c.pvTRY <= b.c.pvTRY ? a : b)) : null;
        const saving = best ? best.c.pvTRY - opt.total : null;
        split = { plan: opt, total: opt.total, used: opt.groups.map((g) => g.x.q.id), best, bestTotal: best ? best.c.pvTRY : null, saving, suggested: opt.groups.length >= 2 && (!best || (saving ?? 0) > 0.5) };
      }
    }
    return { all, elig, ranking, bestUnit, w, split, set };
  };
  return wOverride ? run() : memo(`ev:${req.id}:${req.updatedAt ?? 0}`, run);
}

export interface AwardTotals { totalTRY: number; pvTRY: number; ev: Evaluation; x?: EvalRow; suppliers: string[]; plan?: Plan }
export function awardTotals(r: PurchaseRequest): AwardTotals | null {
  const a = r.award;
  if (!a) return null;
  const ev = evaluate(r);
  if (a.mode === "split" && a.splits) {
    const plan = planCost(r, ev.all, a.splits);
    let totalTRY = 0;
    const sups = new Set<string>();
    for (const g of plan.groups) {
      totalTRY += sum(g.items.map((it) => g.x.c.lines[it.id]!.line)) * g.x.c.unitTRY + (g.x.c.ship + g.x.c.other) * g.x.c.rate;
      sups.add(g.x.q.supplierId);
    }
    return { totalTRY, pvTRY: plan.total, ev, suppliers: [...sups], plan };
  }
  const x = ev.all.find((x) => x.q.id === a.quoteId);
  return x ? { totalTRY: x.c.totalTRY, pvTRY: x.c.pvTRY, ev, x, suppliers: [x.q.supplierId] } : null;
}
export function savingsOf(r: PurchaseRequest): { avg: number; neg: number } {
  const t = awardTotals(r);
  if (!t) return { avg: 0, neg: 0 };
  const full = t.ev.elig.filter((x) => x.c.covered === (r.items ?? []).length).map((x) => x.c.pvTRY);
  const avg = full.length > 1 ? Math.max(0, sum(full) / full.length - t.pvTRY) : 0;
  const neg = t.x && isNum(t.x.q.firstTotal) ? Math.max(0, (t.x.q.firstTotal - t.x.c.total) * t.x.c.rate) : 0;
  return { avg, neg };
}
export function requiredApprover(amountTRY: number): ApprovalLimit | null {
  const lim = [...(settings().approvalLimits ?? [])].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
  return lim.find((l) => l.max === null || l.max === undefined || amountTRY <= l.max) ?? lim[lim.length - 1] ?? null;
}
export function budgetUse(dept: string, year: string | number): { budget: number; used: number } {
  const d = (settings().departments ?? []).find((x) => norm(x.name) === norm(dept));
  const used = sum(spendLines().filter((l) => norm(l.department) === norm(dept) && String(l.date).startsWith(String(year))).map((l) => l.amount));
  return { budget: d ? parseNum(d.budget) || 0 : 0, used };
}

/**
 * Onay durumu, tek kaynaktan:
 *  - "approved": son onay kaydı onay ve talep onay/sipariş aşamasında
 *  - "rejected": son kayıt ret ve talep değerlendirmeye dönmüş
 *  - "pending":  karar onaya gönderilmiş (ret sonrası yeniden gönderilmiş olabilir)
 */
export function approvalState(r: PurchaseRequest): { state: "none" | "pending" | "approved" | "rejected"; last: Approval | null; resubmitted: boolean } {
  const a = r.award;
  if (!a) return { state: "none", last: null, resubmitted: false };
  const last = (a.approvals ?? []).slice(-1)[0] ?? null;
  if (last?.decision === "approved" && ["approval", "ordered", "received"].includes(r.status)) return { state: "approved", last, resubmitted: false };
  if (last?.decision === "rejected" && r.status === "eval") return { state: "rejected", last, resubmitted: false };
  return { state: "pending", last, resubmitted: last?.decision === "rejected" };
}

/** BR1: talebin birimi ayarlardaki listede olmalı; boş birim serbest. Sunucunun iletisiyle aynı. */
export function birimReddi(birim: string, liste: readonly string[]): string | null {
  const b = birim.trim();
  return b === "" || liste.includes(b) ? null : `Birim listede yok: ${b}. Ayarlar'dan ekleyin ya da listeden seçin.`;
}

/** Talebin görünen durumu: onaylanıp sipariş bekleyen talep kayıtta hâlâ "onay"dadır; başlık bunu ayırır. */
export function durumEtiketi(r: PurchaseRequest): string {
  return r.status === "approval" && approvalState(r).state === "approved" ? "Onaylandı, sipariş bekliyor" : stLabel(r.status);
}
