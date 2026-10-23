// Ana sayfanın veri kısmı (prototip 21794-21896): tezgâh durumları, takım ömrü ve depo özetleri, bugünkü üretim.
// Örnek aşınma verisi burada yazılmaz (210.1, K5 a): prototipin hData'sındaki seedDemo çağrısı yoktur.
import { state } from '../depo.ts';
import { allMachines, machine } from '../secici.ts';
import { depotCards, machineCards, toolsOf, type DepoKarti, type OmurDurumu, type OmurKarti } from '../hesap/omur.ts';
import type { Tezgah } from '../veri/tipler.ts';
import { PR, prFinalDone, prProgress } from '../hesap/hazirlik.ts';

export type MakineDurumuAnahtari = 'run' | 'setup' | 'idle' | 'down';
export const MSTAT: readonly { k: MakineDurumuAnahtari; t: string }[] = [
  { k: 'run', t: 'Çalışıyor' }, { k: 'setup', t: 'Hazırlıkta' }, { k: 'idle', t: 'Boşta' }, { k: 'down', t: 'Arıza / bakım' },
];

export type { DepoKarti, OmurDurumu, OmurKarti } from '../hesap/omur.ts';
export type TezgahKaydi = Tezgah;
type Sayac = Record<OmurDurumu, number>;

// Elle seçilmiş durum yoksa: hazırlanan tezgâhta hazırlık başlamış ve bitmemişse "Hazırlıkta", değilse "Boşta".
export function hStat(mid: string): MakineDurumuAnahtari {
  const s = (state.mstat as Record<string, MakineDurumuAnahtari> | undefined)?.[mid];
  return s ?? (mid === state.machine && PR.seq?.length && !prFinalDone() && prProgress().d > 0 ? 'setup' : 'idle');
}
export function hStatOf(k: string): (typeof MSTAT)[number] { return MSTAT.find((s) => s.k === k) ?? MSTAT[2]!; }
export const hPct = (x: number): number => Math.round(x * 100);

export function setMstat(mid: string, v: MakineDurumuAnahtari): void {
  const ms = (state.mstat ?? (state.mstat = {})) as Record<string, string>;
  ms[mid] = v;
}

export interface AnaVeri {
  machines: { m: TezgahKaydi; cards: OmurKarti[]; n: Sayac; worst: OmurKarti | null; fill: number }[];
  urgent: OmurKarti[];
  depot: DepoKarti[];
  tot: Sayac;
  dep: { short: number; low: number; ok: number };
  today: number;
}

// Hesap hatası tek kartı düşürmesin diye prototipte try/catch vardı; aynı korunur.
export function hData(simdi: Date = new Date()): AnaVeri {
  const D0: AnaVeri = { machines: [], urgent: [], depot: [], tot: { over: 0, crit: 0, warn: 0, ok: 0, na: 0 }, dep: { short: 0, low: 0, ok: 0 }, today: 0 };
  (allMachines() as TezgahKaydi[]).forEach((m) => {
    let cards: OmurKarti[] = [];
    const arr = toolsOf(m) as string[];
    try { cards = machineCards(m) as OmurKarti[]; } catch { cards = []; }
    const n: Sayac = { over: 0, crit: 0, warn: 0, ok: 0, na: 0 };
    let worst: OmurKarti | null = null;
    cards.forEach((c) => {
      // lifeCard st'yi her kartta yazar; tip isteğe bağlı olduğu için boşu "takip yok" sayılır.
      const st = c.st ?? 'na';
      n[st] = (n[st] || 0) + 1; D0.tot[st] = (D0.tot[st] || 0) + 1;
      if (c.pct != null && (!worst || c.pct < (worst.pct ?? Infinity))) worst = c;
      if (c.st === 'over' || c.st === 'crit') D0.urgent.push(c);
    });
    D0.machines.push({ m, cards, n, worst, fill: arr.filter((x) => x !== 'empty').length });
  });
  D0.urgent.sort((a, b) => (a.st === 'over' ? -1 : 0) - (b.st === 'over' ? -1 : 0) || (a.pct ?? 0) - (b.pct ?? 0));
  let dc: Record<string, DepoKarti[]> = {};
  try { dc = depotCards() as Record<string, DepoKarti[]>; } catch { dc = {}; }
  Object.keys(dc).forEach((g) => dc[g]!.forEach((c) => {
    const st = c.stock.st as keyof AnaVeri['dep'];
    if (D0.dep[st] != null) D0.dep[st]++;
    if (st === 'short' || st === 'low') D0.depot.push(c);
  }));
  D0.depot.sort((a, b) => (a.stock.st === 'short' ? -1 : 0) - (b.stock.st === 'short' ? -1 : 0) || (a.stock.avail ?? 0) - (b.stock.avail ?? 0));
  const t0 = new Date(simdi); t0.setHours(0, 0, 0, 0);
  D0.today = ((state.wearLog ?? []) as { ts: number; n?: number }[]).filter((l) => l.ts >= t0.getTime()).reduce((a, l) => a + (l.n || 0), 0);
  return D0;
}

export const hazirlananTezgah = (): TezgahKaydi => machine() as TezgahKaydi;
