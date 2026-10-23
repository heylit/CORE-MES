import type { KmAyarlari, Lot } from './tipler.ts';

// ISO 2859-1 / ANSI-ASQ Z1.4 tek örneklemeli planlar: tablolar uygulamadakiyle aynı (kod harfi, ana tablo, ok kuralı, sıkılık geçişi).
export const SEVIYELER = ['S-1', 'S-2', 'S-3', 'S-4', 'I', 'II', 'III'] as const;
export const KOD_TABLOSU: [number, number, string][] = [[2, 8, 'AAAAAAB'], [9, 15, 'AAAAABC'], [16, 25, 'AABBBCD'], [26, 50, 'ABBCCDE'], [51, 90, 'BBCCCEF'],
  [91, 150, 'BBCDDFG'], [151, 280, 'BCDEEGH'], [281, 500, 'BCDEFHJ'], [501, 1200, 'CCEFGJK'], [1201, 3200, 'CDEGHKL'], [3201, 10000, 'CDFGJLM'],
  [10001, 35000, 'CDFHKMN'], [35001, 150000, 'DEGJLNP'], [150001, 500000, 'DEGJMPQ'], [500001, Infinity, 'DEHKNQR']];
export const HARFLER = 'ABCDEFGHJKLMNPQRS'.split('');
export const NUMUNELER = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150];
export const AQL_DEGERLERI = ['0.010', '0.015', '0.025', '0.040', '0.065', '0.10', '0.15', '0.25', '0.40', '0.65', '1.0', '1.5', '2.5', '4.0', '6.5', '10'];
export const YUZDE_YUZ = '%100';
export const aqlMetni = (a: string): string => (a === YUZDE_YUZ ? '%100 muayene' : String(a).replace('.', ','));
const NORMAL_DIZI: Record<number, [number, number]> = { 0: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [5, 6], 7: [7, 8], 8: [10, 11], 9: [14, 15], 10: [21, 22] };
const SIKI_DIZI: Record<number, [number, number]> = { 0: [0, 1], 2: [1, 2], 3: [2, 3], 4: [3, 4], 5: [5, 6], 6: [8, 9], 7: [12, 13], 8: [18, 19] };
export const SIKI = 'Sıkılaştırılmış';
export const DURDURULDU = 'Durduruldu';
export const SIKILIKLAR = ['Normal', SIKI];

type Hucre = [number, number] | '↓' | '↑' | null | undefined;

export function aqlHucresi(i: number, j: number, siddet: string): Hucre {
  if (siddet === SIKI) {
    const e = i + j - 16;
    if (e < 0 || e === 1) return '↓';
    if (e > 8) return '↑';
    return SIKI_DIZI[e];
  }
  if (i > 15) return null;
  const d = i + j - 14;
  if (d < 0 || d === 2) return '↓';
  if (d === 1 || d > 10) return '↑';
  return NORMAL_DIZI[d];
}

export function kodHarfi(N: number, seviye: string): string | null {
  const r = KOD_TABLOSU.find((x) => N >= x[0] && N <= x[1]);
  const i = (SEVIYELER as readonly string[]).indexOf(seviye);
  return r && i >= 0 ? r[2][i] ?? null : null;
}

export interface AqlPlani {
  kod: string; kodK: string; n: number; ac: number; re: number; yuzde100?: boolean; not: string; yol: number[]; j: number;
}

export function aqlPlani(Nh: number | string | null | undefined, seviye: string, aql: string, siddet: string): AqlPlani | null {
  const N = Math.floor(Number(Nh));
  if (!N || N < 2) return null;
  if (aql === YUZDE_YUZ) return { kod: '—', kodK: '—', n: N, ac: 0, re: 1, yuzde100: true, not: '%100 muayene, sıfır kabul', yol: [], j: -1 };
  const L = kodHarfi(N, seviye);
  const j = AQL_DEGERLERI.indexOf(aql);
  if (!L || j < 0) return null;
  let i = HARFLER.indexOf(L);
  const enCok = siddet === SIKI ? 16 : 15;
  const yol = [i];
  let v: Hucre;
  let not = '';
  for (let g = 0; g < 40; g++) {
    v = aqlHucresi(i, j, siddet);
    if (Array.isArray(v)) break;
    if (v === '↓') {
      if (i < enCok) i++;
      else {
        not = 'Tablo sınırı: üstteki plan kullanıldı';
        do i--; while (i > 0 && !Array.isArray(aqlHucresi(i, j, siddet)));
        v = aqlHucresi(i, j, siddet);
        yol.push(i);
        break;
      }
    } else if (i > 0) i--;
    else {
      i++;
      not = 'A satırında yukarı ok: alttaki ilk plan kullanıldı';
    }
    yol.push(i);
  }
  if (!Array.isArray(v)) return null;
  const r: AqlPlani = { kod: L, kodK: HARFLER[i] ?? L, n: NUMUNELER[i] ?? N, ac: v[0], re: v[1], yol, j, not };
  if (HARFLER[i] !== L && !not) r.not = `Ok kuralı: ${L} → ${HARFLER[i]}`;
  if (r.n >= N) {
    r.yuzde100 = true;
    r.n = N;
    r.not = `${r.not ? `${r.not}; ` : ''}numune ≥ parti, %100 muayene`;
  }
  return r;
}

// İşletim karakteristiği: p kusur oranında partinin kabul olasılığı (binom).
export function kabulOlasiligi(n: number, ac: number, p: number): number {
  if (p <= 0) return 1;
  if (p >= 1) return ac >= n ? 1 : 0;
  let t = Math.exp(n * Math.log(1 - p));
  let s = t;
  for (let k = 0; k < ac; k++) {
    t = (((t * (n - k)) / (k + 1)) * p) / (1 - p);
    s += t;
  }
  return Math.min(1, s);
}

// Kabul olasılığının hedefe düştüğü kusur oranı (ikiye bölme).
export function oranBul(n: number, ac: number, hedef: number): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (kabulOlasiligi(n, ac, m) > hedef) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

// c = 0 planı: LTPD (%) ve güven (%) için en küçük numune; parti verilirse hipergeometrik.
export function c0Numune(N: number | null | undefined, ltpd: number, guven: number): number | null {
  const p = ltpd / 100;
  const beta = 1 - guven / 100;
  if (!(p > 0 && p < 1)) return null;
  if (!N || N <= 0) return Math.ceil(Math.log(beta) / Math.log(1 - p));
  const D = Math.max(1, Math.ceil(p * N));
  let P = 1;
  for (let n = 1; n <= N; n++) {
    P *= (N - D - n + 1) / (N - n + 1);
    if (P <= beta) return n;
  }
  return N;
}

export const yuzdeMetni = (x: number): string => `${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: x < 0.001 ? 3 : 2 })}%`;

export interface VarsayilanAql { seviye: string; kr: string; mj: string; mn: string }
export const varsayilanAql = (g: KmAyarlari): VarsayilanAql => ({ seviye: g.seviye || 'II', kr: g.kritik || YUZDE_YUZ, mj: g.major || '1.0', mn: g.minor || '2.5' });

export const lotAnahtari = (pn: unknown, tedarikci: unknown): string => `${String(pn ?? '').trim().toLocaleUpperCase('tr')}|${tedarikci || 'IC'}`;

export interface GecisDurumu { st: string; sonraki: string; gecmis: boolean[]; sayi: number }

// Sıkılık geçişi: normalde 5 lotta 2 ret sıkılaştırır; sıkılaştırılmışta 5 ardışık kabul normale döndürür, 5 ret durdurur. Yeniden
// başlatma (`tip: reset`) sıkılaştırılmıştan başlatır; yeniden sunum sayılmaz.
export function gecisDurumu(lotlar: readonly Lot[], anahtar: string, haric?: string): GecisDurumu {
  const L = lotlar.filter((l) => l.anahtar === anahtar && l._id !== haric)
    .sort((a, b) => (a.tarih || '').localeCompare(b.tarih || '') || (a.no || '').localeCompare(b.no || ''));
  let st = 'Normal';
  let pencere: boolean[] = [];
  let sKabul = 0;
  let sRet = 0;
  let nKabul = 0;
  const gecmis: boolean[] = [];
  for (const l of L) {
    if (l.tip === 'reset') {
      st = SIKI;
      sKabul = 0;
      sRet = 0;
      continue;
    }
    if (l.yenidenSunum) continue;
    const ok = l.karar === 'Kabul';
    gecmis.push(ok);
    if (st === DURDURULDU) continue;
    if (st === 'Normal') {
      pencere.push(ok);
      if (pencere.length > 5) pencere.shift();
      nKabul = ok ? nKabul + 1 : 0;
      if (pencere.filter((x) => !x).length >= 2) {
        st = SIKI;
        pencere = [];
        sKabul = 0;
        sRet = 0;
        nKabul = 0;
      }
    } else if (ok) {
      sKabul++;
      if (sKabul >= 5) {
        st = 'Normal';
        pencere = [];
        nKabul = 0;
      }
    } else {
      sKabul = 0;
      sRet++;
      if (sRet >= 5) st = DURDURULDU;
    }
  }
  let sonraki: string;
  if (st === 'Normal') {
    sonraki = nKabul >= 10
      ? '10 ardışık kabul: indirgenmiş muayene koşulu oluştu (sorumlu otorite onayıyla).'
      : `Son ${Math.min(pencere.length, 5)} lotta ${pencere.filter((x) => !x).length} ret; 5 lot içinde 2 ret sıkılaştırılmışa geçirir.`;
  } else if (st === SIKI) sonraki = `Normale dönüş için ${5 - sKabul} ardışık kabul gerekli; toplam ret ${sRet}/5.`;
  else sonraki = '5 lot sıkılaştırılmışta reddedildi: kabul muayenesi durduruldu. Tedarikçi DÖF\'ü doğrulanınca yeniden başlatın.';
  return { st, sonraki, gecmis: gecmis.slice(-8), sayi: L.length };
}

export function butunAnahtarlar(lotlar: readonly Lot[]): { k: string; son: Lot; s: GecisDurumu }[] {
  const m = new Map<string, Lot>();
  lotlar.forEach((l) => { if (l.anahtar) m.set(l.anahtar, l); });
  return [...m.entries()].map(([k, son]) => ({ k, son, s: gecisDurumu(lotlar, k) }));
}

export interface PlanSatiri { sinif: 'Kritik' | 'Majör' | 'Minör'; aql: string; plan: AqlPlani | null }
export const planSatirlari = (N: number | string | null | undefined, seviye: string, a: { kr: string; mj: string; mn: string }, siddet: string): PlanSatiri[] =>
  ([['Kritik', a.kr], ['Majör', a.mj], ['Minör', a.mn]] as const).map(([sinif, aql]) => ({ sinif, aql, plan: aqlPlani(N, seviye, aql, siddet) }));
