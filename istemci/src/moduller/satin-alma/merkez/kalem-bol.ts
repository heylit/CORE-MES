/**
 * Kalemin miktarını tedarikçilere bölmek (3442-5): bölünen kalem talepte her tedarikçi için ayrı satır olur,
 * çünkü karar ve sipariş satırı kalem başına tek tedarikçi taşır (karar_kalemi anahtarı talep + kalem).
 * Dağıtım denemesi ve karar adımındaki "Böl" aynı işlevi kullanır.
 */
import type { PurchaseRequest, RequestItem } from "./tipler.ts";
import { clone, numIn, uid } from "./util.ts";

/** kalem kimliği → teklif kimliği → miktar */
export type Dagilim = Record<string, Record<string, number>>;

export interface Bolunmus {
  talep: PurchaseRequest;
  /** kalem kimliği (yeni satırlar dahil) → teklif kimliği; dağılımı olmayan kalem yer almaz */
  atama: Record<string, string>;
  /** hareket geçmişi için: "Kalem 100 → 60 A + 40 B" */
  bolunenler: string[];
}

/**
 * Tek tedarikçili kalem olduğu gibi kalır; birden çok tedarikçiye düşen kalem her pay için yeni kimlikli satır olur.
 * Teklifin kaleme bağlı bütün alanları (fiyat, kademe, en az miktar, alternatif) yeni satırlara kopyalanır:
 * kopyalanmayan kademe ya da alternatif bölünmüş siparişte sessizce kaybolur.
 */
export function kalemleriBol(r: PurchaseRequest, dagilim: Dagilim, ad: (teklifId: string) => string): Bolunmus {
  const n = clone(r);
  const kalemler: RequestItem[] = [];
  const atama: Record<string, string> = {};
  const bolunenler: string[] = [];
  for (const it of n.items ?? []) {
    const paylar = Object.entries(dagilim[it.id] ?? {}).filter(([, m]) => m > 0);
    if (paylar.length <= 1) { kalemler.push(it); if (paylar[0]) atama[it.id] = paylar[0][0]; continue; }
    if (it.sabit) throw new Error(`${it.name}: bağlı kalem bölünemez`);
    for (const [qid, miktar] of paylar) {
      const yeni: RequestItem = { ...it, id: uid(), qty: miktar };
      for (const q of n.quotes) {
        if (q.prices[it.id] !== undefined) q.prices[yeni.id] = q.prices[it.id]!;
        if (q.tiers?.[it.id]) q.tiers[yeni.id] = clone(q.tiers[it.id]!);
        if (q.minQty && it.id in q.minQty) q.minQty[yeni.id] = q.minQty[it.id] ?? null;
        if (q.alternatives && it.id in q.alternatives) q.alternatives[yeni.id] = clone(q.alternatives[it.id] ?? null);
      }
      kalemler.push(yeni); atama[yeni.id] = qid;
    }
    for (const q of n.quotes) {
      delete q.prices[it.id];
      if (q.tiers) delete q.tiers[it.id];
      if (q.minQty) delete q.minQty[it.id];
      if (q.alternatives) delete q.alternatives[it.id];
      if (q.altResults) delete q.altResults[it.id];
    }
    bolunenler.push(`${it.name} ${numIn(it.qty ?? 0)} → ${paylar.map(([qid, m]) => `${numIn(m)} ${ad(qid)}`).join(" + ")}`);
  }
  n.items = kalemler;
  return { talep: n, atama, bolunenler };
}

/** Payların toplamı kalem miktarına eşit mi (kesirli birimde yüzde bir tolerans). */
export function paylarTamam(miktar: number, paylar: readonly number[]): boolean {
  const t = paylar.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  return paylar.every((p) => p >= 0 && Number.isFinite(p)) && Math.abs(t - miktar) < 0.005;
}
