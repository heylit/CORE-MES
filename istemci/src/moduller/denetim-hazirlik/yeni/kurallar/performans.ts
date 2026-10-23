import { CL_EY, EY_KEYS } from '../icerik/eydep.ts';
import { PROGRAMLAR, PROGRAM_SIRASI } from '../icerik/programlar.ts';
import { ayEkle, bugunTarihi } from '../tarih.ts';
import type { Denetim, Madde, OzTuru, Profil, ProgramKodu, Seviye } from '../tipler.ts';
import { grupYuzdesi, type GrupPuani } from './puan.ts';
import { turPuani } from './oz.ts';

// Performans: denetim ve öz değerlendirmelerin ortak zaman çizelgesi ve madde matrisi ("kör nokta", "tekrarlayan" sinyalleri).

export type Kaynak = 'dis' | 'mus' | 'ic' | 'oz';
export const KAYNAKLAR: Record<Kaynak, string> = { dis: 'Dış denetim', mus: 'Müşteri denetimi', ic: 'İç denetim', oz: 'Öz değerlendirme' };
export const denetimKaynagi = (a: Denetim): Exclude<Kaynak, 'oz'> => (/İç denetim|Ön değerlendirme/.test(a.type || '') ? 'ic' : /Müşteri/.test(a.type || '') ? 'mus' : 'dis');

export interface PerformansSuzgeci { p: Record<ProgramKodu, boolean>; s: Record<Kaynak, boolean>; per: string }
export const BOS_SUZGEC: PerformansSuzgeci = { p: { iso9001: true, as9100: true, eydep: true }, s: { dis: true, mus: true, ic: true, oz: true }, per: '12' };

export type PerformansOlayi =
  | { t: 'audit'; src: Exclude<Kaynak, 'oz'>; k: ProgramKodu; a: Denetim; date: string }
  | { t: 'oz'; src: 'oz'; k: ProgramKodu; r: OzTuru; date: string; pct: number | null; groups: Record<string, GrupPuani> };

export function performansOlaylari(profil: Profil, f: PerformansSuzgeci): PerformansOlayi[] {
  const out: PerformansOlayi[] = [];
  const kesim = f.per === 'all' ? '' : ayEkle(bugunTarihi(), -Number(f.per));
  for (const k of PROGRAM_SIRASI) {
    if (!f.p[k]) continue;
    for (const a of profil.audits) {
      if (a.kind !== 'audit' || a.prog !== k || a.status !== 'done') continue;
      const src = denetimKaynagi(a);
      if (!f.s[src]) continue;
      const d = a.end || a.date;
      if (kesim && d < kesim) continue;
      out.push({ t: 'audit', src, k, a, date: d });
    }
    if (f.s.oz) {
      for (const r of profil.pw[k].oz.rounds) {
        if (kesim && r.date < kesim) continue;
        const sc = turPuani(r, PROGRAMLAR[k]);
        out.push({ t: 'oz', src: 'oz', k, r, date: r.date, pct: sc.pct, groups: sc.groups });
      }
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

type Sayac = Record<Seviye, number> & { n: number };
export type SinyalTonu = 'bad' | 'warn' | 'good' | 'obs' | '';
export interface MatrisSatiri {
  g: string;
  ad: string;
  last: { p: number; d: string } | null;
  f: { ic: Sayac; ex: Sayac };
  off: { p: number; d: string } | null;
  pre: { p: number; d: string } | null;
  sig: string;
  sc: SinyalTonu;
  rep: number;
}

// ey: EYDEP alanları (ön değerlendirme ve resmi alan puanı), değilse ISO/AS maddeleri (iç ve dış bulgular).
export function performansMatrisi(olaylar: readonly PerformansOlayi[], ey: boolean): MatrisSatiri[] {
  const keys = ey ? EY_KEYS : ['4', '5', '6', '7', '8', '9', '10'];
  const progs: ProgramKodu[] = ey ? ['eydep'] : ['iso9001', 'as9100'];
  const CLx: Record<string, Madde> = ey ? CL_EY : PROGRAMLAR.iso9001.CL;
  const oz = olaylar.filter((e): e is Extract<PerformansOlayi, { t: 'oz' }> => e.t === 'oz' && progs.includes(e.k));
  const au = olaylar.filter((e): e is Extract<PerformansOlayi, { t: 'audit' }> => e.t === 'audit' && progs.includes(e.k));
  return keys.map((g) => {
    let last: MatrisSatiri['last'] = null;
    for (const e of oz) {
      const p = grupYuzdesi(e.groups[g]);
      if (p != null) last = { p, d: e.date };
    }
    const f = { ic: { major: 0, minor: 0, obs: 0, n: 0 }, ex: { major: 0, minor: 0, obs: 0, n: 0 } };
    const denetimler = new Set<string>();
    for (const e of au) {
      for (const it of e.a.res.items) {
        if (it.g !== g) continue;
        const b = e.src === 'ic' ? f.ic : f.ex;
        b[it.lvl]++;
        b.n++;
        denetimler.add(e.a.id);
      }
    }
    let off: MatrisSatiri['off'] = null;
    let pre: MatrisSatiri['pre'] = null;
    if (ey) {
      for (const e of au) {
        const v = e.a.res.areas[g];
        if (v == null) continue;
        if (e.src === 'ic') pre = { p: v, d: e.date };
        else off = { p: v, d: e.date };
      }
    }
    let sig = '';
    let sc: SinyalTonu = '';
    if (ey) {
      const ref = off ?? pre;
      if (last && ref) {
        const df = last.p - ref.p;
        if (df >= 15) { sig = 'Kör nokta'; sc = 'bad'; } else if (df <= -15) { sig = 'Kendinize fazla sert'; sc = 'obs'; } else { sig = 'Tutarlı'; sc = 'good'; }
      }
    } else {
      const nf = f.ic.major + f.ic.minor + f.ex.major + f.ex.minor;
      if (last && nf && last.p >= 70) { sig = 'Kör nokta'; sc = 'bad'; } else if (nf && denetimler.size >= 2) { sig = 'Tekrarlayan'; sc = 'warn'; } else if (last && nf) { sig = 'Bilinen zayıflık'; sc = 'warn'; } else if (last && !nf && last.p >= 85) { sig = 'Güçlü'; sc = 'good'; } else if (!last && nf) { sig = 'Öz değerlendirme yok'; sc = 'obs'; }
    }
    return { g, ad: CLx[g]?.s ?? g, last, f, off, pre, sig, sc, rep: denetimler.size };
  });
}
