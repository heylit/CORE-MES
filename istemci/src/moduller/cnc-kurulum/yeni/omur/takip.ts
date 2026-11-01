import {
  dirtyUsage, invKey, num, state, wearRec,
} from './cekirdek.ts';
import type { CarkKarti, DepoKarti, OmurKarti, Takim, Tezgah } from './tipler.ts';

// Takım ömrü çarkı: satır başına bir tezgâh (kartlar cepler), sonra depo grupları (kartlar stok girilmiş kalemler).
export interface TezgahSatiri { key: string; depot?: false; m: Tezgah; title: string; cards: OmurKarti[]; n: { over: number; crit: number } }
export interface DepoSatiri {
  key: string;
  depot: true;
  title: string;
  cards: DepoKarti[];
  n: { crit: number; short: number; low: number; ok: number };
}
export type CarkSatiri = TezgahSatiri | DepoSatiri;

export const satirKotu = (d: CarkSatiri): number => (d.depot ? d.n.crit : d.n.over + d.n.crit);

export interface Toplamlar {
  tot: { over: number; crit: number; warn: number; ok: number };
  dt: { short: number; low: number; ok: number };
  noSpare: number;
}

// Yan panelin üst özetleri: bütün tezgâhlar, depo ve yedeği olmayan biten takımlar.
export function toplamlar(defs: readonly CarkSatiri[]): Toplamlar {
  const tot = { over: 0, crit: 0, warn: 0, ok: 0 }, dt = { short: 0, low: 0, ok: 0 };
  let noSpare = 0;
  defs.forEach((x) => {
    if (x.depot) { dt.short += x.n.short; dt.low += x.n.low; dt.ok += x.n.ok; return; }
    x.cards.forEach((cc) => {
      if (cc.st !== 'na') tot[cc.st]++;
      if ((cc.st === 'over' || cc.st === 'crit') && cc.spare === 0) noSpare++;
    });
  });
  return { tot, dt, noSpare };
}

// Takım değiştirildi: kullanım sıfırlanır, başlangıç bugündür. Kullanıcı isterse depodan bir yedek düşer. Sunucuya giden takım
// olayı ve stok düşüşü bu durum farkından çekirdekte türetilir (kopruKur), görünüm ucu çağırmaz.
export function takimDegisti(c: Pick<OmurKarti, 'm' | 'p' | 't'>, depodanDus: boolean, simdi: number = Date.now()): void {
  const W0 = state.wear[c.m.id] || (state.wear[c.m.id] = {});
  W0[c.p] = { id: c.t.id, used: 0, parts: 0, since: simdi };
  if (depodanDus) {
    const iv = state.inv[invKey(c.t)];
    if (iv && iv.qty != null && iv.qty > 0) { iv.qty--; delete iv.demo; }
  }
  dirtyUsage();
}

export function kullanimDuzelt(c: Pick<OmurKarti, 'm' | 'p' | 't'>, deger: string): void {
  const r = wearRec(c.m.id, c.p, c.t.id);
  r.used = Math.max(0, num(deger, 0));
  delete r.demo;
}

// Parça başı kesme süresi elle girilir (program yoksa); `state.ptime[tezgâh][cep]`.
export function parcaSuresi(c: Pick<OmurKarti, 'm' | 'p' | 't'>, deger: string): void {
  const pt = state.ptime || (state.ptime = {});
  (pt[c.m.id] = pt[c.m.id] || {})[c.p] = { id: c.t.id, tp: Math.max(0.01, num(deger, 0.5)) };
}

export function depoAdedi(c: DepoKarti, fark: 1 | -1): void {
  const iv = state.inv[c.key];
  if (iv) { iv.qty = Math.max(0, (iv.qty ?? 0) + fark); delete iv.demo; }
  dirtyUsage();
}

// Depo kalemi analize açılırken, aynı takım bir tezgâhta takılıysa o cebin kartı alınır.
export function tezgahtakiKart(defs: readonly CarkSatiri[], t: Takim): OmurKarti | null {
  for (const x of defs) if (!x.depot) for (const y of x.cards) if (y.t.id === t.id) return y;
  return null;
}

export const karttaTezgahMi = (c: CarkKarti | null): c is OmurKarti => c !== null && c.depot !== true;
