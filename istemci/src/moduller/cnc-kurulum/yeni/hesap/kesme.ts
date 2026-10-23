import { fint, fmt } from '../bicim.ts';
import { htype, isLatheTool } from '../veri/takim-turu.ts';
import type { IsMalzemesi, Kalem, Tezgah } from '../veri/tipler.ts';

// Prototipin HESAPLAR bölümü: tutucu metni, kesme verisi önerisi, soğutma önerisi. Metinler ve yuvarlamalar prototipinkidir.

export function holderOf(t: Kalem | null | undefined, m: Tezgah): string {
  if (!t || t.kind === 'empty') return '—';
  if (t.live) return 'Canlı takım ünitesi · ER25 pens';
  if (isLatheTool(t)) return m.type === 'millturn' ? 'Capto C6 torna adaptörü' : (t.kind === 'lt_bore' || t.kind === 'lt_ithread' ? 'Taret baralama tutucusu' : 'Taret radyal kalem tutucusu');
  if (m.type === 'lathe') return 'Taret eksenel tutucu · ER32';
  const s = fmt(t.s || t.d);
  const ad: Record<string, string> = {
    arbor: 'malafa (kabuk freze)', tap: 'senkron kılavuz tutucu', none: t.kind === 'probe' ? 'prob gövdesi' : 'baralama tutucusu',
    er: `ER32 pens Ø${s}`, hyd: `hidrolik mandren Ø${s}`, weldon: `Weldon Ø${s}`, shrink: `shrink-fit Ø${s}`,
  };
  return `${m.taper} ${String(ad[htype(t)])}`;
}

export interface KesmeOnerisi {
  vc?: number; n?: number; f?: number; F?: number; fz?: number; smax?: number;
  mode?: string; note?: string; warn?: string; capped?: boolean;
}

const yuvarla3 = (x: number): number => Number(x.toFixed(3));

export function cutData(t: Kalem | null | undefined, mat: IsMalzemesi, m: Tezgah): KesmeOnerisi | null {
  if (!t || t.kind === 'empty' || t.kind === 'probe') return null;
  const hss = t.tm === 'H';
  const base = hss ? mat.vcH : mat.vcK;
  if (!base) return { warn: 'Bu malzemede HSS takım önerilmez' };
  const cut = t.cut ?? {};
  const o: KesmeOnerisi = { vc: Math.round(base * (t.vm ?? Number.NaN)) };
  const vc = o.vc ?? Number.NaN;
  if (isLatheTool(t) && !t.d) {
    o.mode = 'G96 · sabit kesme hızı';
    if (cut.pitch) { o.f = cut.pitch; o.note = 'Diş adımı = ilerleme (mm/dev)'; } else o.f = yuvarla3((cut.fr ?? Number.NaN) * mat.fk);
    o.smax = m.spindle || m.rpm;
    return o;
  }
  const partTurns = (m.type === 'lathe' && !t.live) || isLatheTool(t);
  const max = t.live ? (m.liveRpm || 6000) : (m.type === 'millturn' && isLatheTool(t) ? (m.spindle || 4000) : m.rpm);
  let n = vc * 1000 / (Math.PI * (t.d ?? Number.NaN));
  if (n > max) { n = max; o.capped = true; }
  o.n = Math.round(n);
  if (partTurns) o.mode = 'G97 · parça döner';
  if (cut.pitch) { o.f = cut.pitch; o.F = Math.round(n * cut.pitch); o.note = 'Senkron kılavuz: F = n × adım'; }
  else if (cut.fr) { o.f = yuvarla3(cut.fr * mat.fk); o.F = Math.round(o.f * n); }
  else { o.fz = yuvarla3((cut.fz ?? Number.NaN) * mat.fk); o.F = Math.round(o.fz * (t.z ?? Number.NaN) * n); }
  if (o.capped) o.warn = `Devir tezgâh sınırına (${fint(max)} dev/dk) çekildi`;
  return o;
}

const SOGUTMA: Record<string, string> = { P: 'bor5', K: 'air', M: 'bor8', N: 'bor8', S: 'tsc', H: 'air' };
export function coolHint(mat: Pick<IsMalzemesi, 'iso'>): string | undefined { return SOGUTMA[mat.iso]; }
