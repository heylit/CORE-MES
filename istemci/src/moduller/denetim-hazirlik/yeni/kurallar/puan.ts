import { PROGRAMLAR, type Karar, type ProgramTanimi } from '../icerik/programlar.ts';
import type { Calisma, Cevap, Profil, ProgramKodu, Seviye, Soru } from '../tipler.ts';

// Prototipin genel durumu (state, PG, W()) yerine kurallara tek nesne verilir; useDenetim().kb.
export interface KuralBaglami {
  profil: Profil;
  program: ProgramKodu;
  pg: ProgramTanimi;
  calisma: Calisma;
}

export const kuralBaglami = (profil: Profil, program: ProgramKodu): KuralBaglami => ({
  profil, program, pg: PROGRAMLAR[program], calisma: profil.pw[program],
});

export interface Risk { q: Soru; v: number; lvl: Seviye }
export interface GrupPuani { num: number; den: number; n: number; a: number }
export interface PuanSonucu {
  pct: number | null;
  defPct: number | null;
  isoMajor: number;
  isoMinor: number;
  answered: number;
  na: number;
  total: number;
  groups: Record<string, GrupPuani>;
  risks: Risk[];
  major: number;
  minor: number;
  obs: number;
  good: number;
  verdict: Karar | null;
}

// Tanımlı (savunma) şartlar yalnız açıkça seçilince sayılır.
export const aktifSorular = (pg: ProgramTanimi, def: boolean): Soru[] => pg.Q.filter((x) => def || !x.d);

// Hazırlık puanı: soru ağırlığı (1-3) x puan; N/A dışarıda. Kritik soruda 0 majör, 1 ve altı minör, 2 gözlem.
// Savunma ekleri (S) ayrı yüzdedir ve karara girmez.
export function puanHesapla(qs: readonly Soru[], ans: Readonly<Record<string, Cevap>>, pg: ProgramTanimi): PuanSonucu {
  let num = 0, den = 0, dnum = 0, dden = 0, answered = 0, na = 0, good = 0;
  const groups: Record<string, GrupPuani> = {};
  const risks: Risk[] = [];
  const ci = { major: 0, minor: 0 };
  for (const x of qs) {
    const g = groups[x.g] ?? (groups[x.g] = { num: 0, den: 0, n: 0, a: 0 });
    g.n++;
    const a = ans[x.id];
    if (a === undefined) continue;
    answered++;
    g.a++;
    if (a === 'na') { na++; continue; }
    const v = Number(a);
    if (x.g === 'S') { dnum += v * x.w; dden += 3 * x.w; } else { num += v * x.w; den += 3 * x.w; }
    g.num += v * x.w;
    g.den += 3 * x.w;
    let lvl: Seviye | null = null;
    if (v === 0 && x.w === 3) lvl = 'major';
    else if (v <= 1) lvl = 'minor';
    else if (v === 2) lvl = 'obs';
    else good++;
    if (lvl) {
      risks.push({ q: x, v, lvl });
      if (x.g !== 'S' && lvl !== 'obs') ci[lvl]++;
    }
  }
  const sira: Record<Seviye, number> = { major: 0, minor: 1, obs: 2 };
  risks.sort((a, b) => sira[a.lvl] - sira[b.lvl] || b.q.w - a.q.w || a.v - b.v);
  const pct = den ? Math.round((num / den) * 100) : null;
  const c = { major: 0, minor: 0, obs: 0 };
  for (const r of risks) c[r.lvl]++;
  return {
    pct, defPct: dden ? Math.round((dnum / dden) * 100) : null, isoMajor: ci.major, isoMinor: ci.minor, answered, na, total: qs.length, groups, risks,
    major: c.major, minor: c.minor, obs: c.obs, good, verdict: pct === null ? null : pg.verdict(pct, ci),
  };
}

export const grupYuzdesi = (g: GrupPuani | undefined): number | null => (g && g.den ? Math.round((g.num / g.den) * 100) : null);

// Kanıt işaretlerinden puan önerisi: hiçbiri 0, hepsi 3, yarıdan az 1, yarı ve üstü 2.
export function puanOner(isaretler: readonly boolean[] | undefined): Cevap | null {
  if (!isaretler || isaretler.length === 0) return null;
  const k = isaretler.filter(Boolean).length;
  const n = isaretler.length;
  if (k === 0) return '0';
  if (k === n) return '3';
  return k / n < 0.5 ? '1' : '2';
}

// Örnek kipinde programın örnek cevapları ve örnek kapanışları gösterilir; kişinin cevapları değişmez.
export const gecerliCevaplar = (kb: KuralBaglami): Readonly<Record<string, Cevap>> => (kb.calisma.example ? kb.pg.EXAMPLE : kb.calisma.ans);
export const kapananlar = (kb: KuralBaglami): Readonly<Record<string, boolean>> => (kb.calisma.example ? kb.calisma.exDone : kb.calisma.done);

export function hazirlikIstatistigi(kb: KuralBaglami): { tot: number; done: number; per: { n: number; k: number }[] } {
  let tot = 0, done = 0;
  const per = kb.pg.PREP.map((p) => {
    const n = p.items.length;
    const k = p.items.filter((i) => kb.calisma.checks[i[0]]).length;
    tot += n;
    done += k;
    return { n, k };
  });
  return { tot, done, per };
}

export const dokumanIstatistigi = (kb: KuralBaglami): { k: number; n: number } => ({
  k: kb.pg.DOCS.filter((d) => kb.calisma.docs[d[0]]).length, n: kb.pg.DOCS.length,
});

export const programSorulari = (profil: Profil, k: ProgramKodu): Soru[] => aktifSorular(PROGRAMLAR[k], profil.pw[k].def);
export const programPuani = (profil: Profil, k: ProgramKodu): PuanSonucu => puanHesapla(programSorulari(profil, k), profil.pw[k].ans, PROGRAMLAR[k]);

// Program açık, takvimde ya da cevaplanmışsa kullanılıyordur (yalnız o programın KYS yapı taşları ve Bugün maddeleri bunu ister).
export const programKullaniliyor = (profil: Profil, k: ProgramKodu, acikProgram: ProgramKodu): boolean =>
  acikProgram === k || profil.audits.some((a) => a.prog === k) || Object.keys(profil.pw[k].ans).length > 0;
