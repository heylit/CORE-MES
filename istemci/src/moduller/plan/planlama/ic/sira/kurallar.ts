import type { Derleme, OkunanPlan } from '../../motor/kurallar.ts';

// Tezgâh sırası (w-v20 v20SiraKur): tezgâhın şimdiden sonra başlayan, başlamamış ilk on beş işi plandaki sırasıyla. `ilk` açılıştaki sıradır;
// "Baştaki sıraya dön" ona döner. Fason tezgâhın sırası yoktur.
export const SIRA_SINIRI = 15;
export interface TezgahSirasi { m: string; ids: string[]; ilk: string[] }

export const siraTezgahlari = (cx: Derleme): string[] => Object.keys(cx.M).filter((m) => !m.startsWith('@'));

export function siraKur(p: OkunanPlan, cx: Derleme, m: string): TezgahSirasi {
  const ids = Object.values(p.ops).filter((r) => r.m === m && Number.isFinite(r.S) && r.S >= cx.now && !r.act)
    .sort((a, b) => a.S - b.S).slice(0, SIRA_SINIRI).map((r) => r.id);
  return { m, ids, ilk: ids };
}

export const siraDegisti = (q: TezgahSirasi): boolean => q.ids.some((id, i) => id !== q.ilk[i]);

// Bir öne ya da bir arkaya (v20SiraYon): sabit iş ve sabit işin yeri değişmez; sınırdaki iş yerinde kalır.
export function siraYon(q: TezgahSirasi, id: string, yon: -1 | 1, sabit: (id: string) => boolean): TezgahSirasi | 'sabit' | null {
  const i = q.ids.indexOf(id), k = i + yon; const h = q.ids[k];
  if (i < 0 || h === undefined) return null;
  if (sabit(id) || sabit(h)) return 'sabit';
  const ids = q.ids.slice(); ids[i] = h; ids[k] = id;
  return { ...q, ids };
}

// Sürükle bırak (pmSirala, sabit süzgeci): iş bırakıldığı işin yerine geçer; sabit iş tutulmaz, sabit işlerin yeri kaymaz.
export function siraTasi(q: TezgahSirasi, id: string, hedef: string, sabit: (id: string) => boolean): TezgahSirasi | 'sabit' | null {
  const i = q.ids.indexOf(id), k = q.ids.indexOf(hedef);
  if (i < 0 || k < 0 || i === k) return null;
  if (sabit(id)) return 'sabit';
  const ids = q.ids.filter((x) => x !== id); ids.splice(k, 0, id);
  return q.ids.every((x, j) => !sabit(x) || ids[j] === x) ? { ...q, ids } : 'sabit';
}
