import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { kalibrasyonKuraliBetigi } from '../kalibrasyon/disari.ts';
import { KITAPLIK_KIMLIKLERI, sayfaKur } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';

// Uygulamanın bugünkü hesaplarını sabitler (geçiş planı 8.1). Hesaplar HTML uygulamasının içindedir; çerçeveye kurulan
// sayfadan (cihaz durumu orada Kalibrasyon kuralına bağlanır) yalnız bu saf işlevlerin tanımları ayıklanıp kurulur.
const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, ''])) as Parameters<typeof sayfaKur>[0]['kitapliklar'];
const SATIRLAR = sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir: false } }).split('\n');

function sabit(bas: string): string {
  const s = SATIRLAR.find((x) => x.startsWith(bas));
  if (!s) throw new Error(`Paketten ayıklanamadı: ${bas}`);
  return s;
}

function islev(ad: string): string {
  const i = SATIRLAR.findIndex((s) => s.startsWith(`function ${ad}(`));
  if (i < 0) throw new Error(`Paketten ayıklanamadı: ${ad}`);
  let derinlik = 0;
  const cikti: string[] = [];
  for (let k = i; k < SATIRLAR.length; k++) {
    const satir = SATIRLAR[k] ?? '';
    cikti.push(satir);
    for (const ch of satir) {
      if (ch === '{') derinlik++;
      else if (ch === '}') derinlik--;
    }
    if (derinlik === 0) break;
  }
  return cikti.join('\n');
}

interface Karakteristik {
  tip?: string;
  nominal?: string;
  alt?: string;
  ust?: string;
  olcum?: string;
  olcumler?: string[];
}
interface Seri {
  pts: { v: number }[];
  lo: number;
  hi: number;
}
interface SpcSonuc {
  n: number;
  mean: number;
  cp: number | null;
  cpk: number | null;
  r1: number[];
  r2: number[];
  ctl: boolean;
  oos: number;
  status: { t: string; c: string };
}
interface AqlSonuc {
  kod: string;
  kodK: string;
  n: number;
  ac: number;
  re: number;
  yuzde100?: boolean;
  not: string;
}
interface Hesaplar {
  charRes(c: Karakteristik): string;
  msStatus(c: Karakteristik, v: string): string;
  msWorst(c: Karakteristik): { v: string; s: string };
  genTol(nom: string, sinif: string): number | null;
  devToTol(nom: string, us: number, ls: number): { nominal: string; alt: string; ust: string } | null;
  spcStats(s: Seri): SpcSonuc;
  spcAdvice(s: SpcSonuc & { hi: number; lo: number }): string[];
  codeLetter(N: number, seviye: string): string | null;
  aqlPlan(N: number, seviye: string, aql: string, siddet: string): AqlSonuc | null;
  pAcc(n: number, ac: number, p: number): number;
  c0n(N: number, ltpd: number, guven: number): number | null;
  devStatus(d: { sonKal?: string; periyot?: number; kullanimDisi?: boolean } | null): { t: string; next?: string; k?: number };
  supGrade(s: { kaliteSkor?: number; teslimatSkor?: number }): { t: string; g: number };
  partStatus(p: { acikNcr: { ciddiyet: string }[]; yarim: unknown[]; sonMuayene?: { s: string } | null }): { t: string; c: string };
}

function kur(): Hesaplar {
  const ISO = SATIRLAR.findIndex((s) => s.startsWith('const ISO2768='));
  const AQLS = SATIRLAR.findIndex((s) => s.startsWith('const AQLS='));
  const AQL_HUCRE = SATIRLAR.findIndex((s) => s.startsWith('function aqlCell('));
  const kod = [
    'const window={};', kalibrasyonKuraliBetigi(),
    sabit('const pad='), sabit('const isoOf='), sabit('const parse='), sabit('const TODAY='), sabit('const num='), sabit('const msVal='),
    sabit('const f2='), sabit('const fv='),
    islev('addMonths'), islev('daysUntil'), islev('charRes'), islev('msStatus'), islev('msWorst'), islev('devStatus'), islev('supGrade'),
    islev('spcStats'), islev('spcAdvice'), islev('partStatus'),
    SATIRLAR.slice(ISO, ISO + 2).join('\n'), islev('genTol'), islev('devToTol'),
    sabit('const LEVELS='), sabit('const LOTS='), sabit('const LETTERS='), sabit('const NS='),
    SATIRLAR.slice(AQLS, AQL_HUCRE).join('\n'),
    islev('aqlCell'), islev('codeLetter'), islev('aqlPlan'), islev('pAcc'), islev('c0n'),
    'return {charRes,msStatus,msWorst,genTol,devToTol,spcStats,spcAdvice,codeLetter,aqlPlan,pAcc,c0n,devStatus,supGrade,partStatus};',
  ].join('\n');
  return new Function(kod)() as Hesaplar;
}

let h: Hesaplar;
beforeAll(() => {
  h = kur();
});

describe('1. charRes: ölçüm tolerans değerlendirmesi', () => {
  const t = { nominal: '20', alt: '0.02', ust: '0.02' };
  it.each([
    [{ ...t, olcum: '20.01' }, 'OK'],
    [{ ...t, olcum: '20.02' }, 'OK'],
    [{ ...t, olcum: '20,021' }, 'NOK'],
    [{ nominal: '12', alt: '0', ust: '0.018', olcum: '12.031' }, 'NOK'],
    [{ nominal: '12', alt: '-0.01', ust: '0.018', olcum: '11.99' }, 'OK'],
    [{ tip: 'Nitel', olcum: 'Uygun' }, 'OK'],
    [{ tip: 'Nitel', olcum: 'Uygun değil' }, 'NOK'],
    [{ ...t, olcum: '' }, ''],
  ] as [Karakteristik, string][])('%j -> %j', (c, sonuc) => {
    expect(h.charRes(c)).toBe(sonuc);
  });
});

describe('2. msStatus ve msWorst', () => {
  const t = { nominal: '20', alt: '0.02', ust: '0.02' };
  it('sınıra yakın OK ölçüm SINIR olur, uzak olan OK, tolerans 0 ise OK', () => {
    expect(h.msStatus(t, '20.017')).toBe('SINIR');
    expect(h.msStatus(t, '20.015')).toBe('OK');
    expect(h.msStatus({ nominal: '20', alt: '0', ust: '0' }, '20')).toBe('OK');
  });
  it('NOK ve boş ölçüm', () => {
    expect(h.msStatus(t, '20.03')).toBe('NOK');
    expect(h.msStatus(t, '')).toBe('');
  });
  it('en kötü ölçüm NOK > SINIR > OK; eşitte nominalden en uzak olan', () => {
    expect(h.msWorst({ ...t, olcumler: ['20.0', '20.017', '20.03'] })).toEqual({ v: '20.03', s: 'NOK' });
    expect(h.msWorst({ ...t, olcumler: ['20.0', '20.017', '20.001'] })).toEqual({ v: '20.017', s: 'SINIR' });
    expect(h.msWorst({ ...t, olcumler: ['20.001', '19.995', '20.003'] })).toEqual({ v: '19.995', s: 'OK' });
    expect(h.msWorst({ ...t, olcumler: [] })).toEqual({ v: '', s: '' });
  });
});

describe('3. genTol: ISO 2768', () => {
  it.each([
    ['20', 'ISO 2768-m', 0.2],
    ['5', 'ISO 2768-f', 0.05],
    ['150', 'ISO 2768-c', 1.2],
    ['0.3', 'ISO 2768-m', null],
    ['2', 'ISO 2768-v', null],
    ['20', 'Yok (elle)', null],
  ] as [string, string, number | null][])('%s mm %s -> %j', (nom, sinif, beklenen) => {
    expect(h.genTol(nom, sinif)).toBe(beklenen);
  });
});

describe('4. devToTol: sapmadan toleransa', () => {
  it.each([
    [20, 0.05, 0.01, { nominal: '20,01', alt: '0', ust: '0,04' }],
    [20, -0.01, -0.05, { nominal: '19,99', alt: '0,04', ust: '0' }],
    [20, 0.02, -0.02, { nominal: '20', alt: '0,02', ust: '0,02' }],
  ])('(%s, %s, %s)', (n, us, ls, beklenen) => {
    expect(h.devToTol(String(n), us, ls)).toEqual(beklenen);
  });
});

describe('5. spcStats ve spcAdvice', () => {
  const seri = (vs: number[]): Seri => ({ pts: vs.map((v) => ({ v })), lo: 19.98, hi: 20.02 });
  const yuvarla = (v: number | null, k: number) => (v == null ? v : +v.toFixed(k));
  it('merkezde dar seri: Yetenekli', () => {
    const r = h.spcStats(seri([20.001, 19.999, 20.002, 20.0, 19.998, 20.001, 20.0, 19.999, 20.002, 20.0]));
    expect(r.n).toBe(10);
    expect(yuvarla(r.mean, 4)).toBe(20.0002);
    expect(yuvarla(r.cp, 3)).toBe(3.562);
    expect(yuvarla(r.cpk, 3)).toBe(3.526);
    expect(r.status.t).toBe('Yetenekli');
  });
  it('kaymış seri: Cpk düşer, Cp yüksek kalır', () => {
    const r = h.spcStats(seri([20.01, 20.012, 20.011, 20.013, 20.01, 20.012, 20.011, 20.013, 20.012, 20.011]));
    expect(yuvarla(r.mean, 4)).toBe(20.0115);
    expect(yuvarla(r.cp, 3)).toBe(4.512);
    expect(yuvarla(r.cpk, 3)).toBe(1.918);
    expect(r.status.t).toBe('Yetenekli');
  });
  it('üç nokta: Veri az; boş seri: Veri yok', () => {
    const r = h.spcStats(seri([20.0, 20.01, 19.99]));
    expect(r.n).toBe(3);
    expect(yuvarla(r.cp, 3)).toBe(0.501);
    expect(yuvarla(r.cpk, 3)).toBe(0.501);
    expect(r.status.t).toBe('Veri az');
    const bos = h.spcStats(seri([]));
    expect(bos.n).toBe(0);
    expect(bos.status.t).toBe('Veri yok');
  });
  it('8 ardışık nokta ortalamanın aynı tarafında: kural 2, Kontrol dışı', () => {
    const r = h.spcStats(seri([19.99, 20.01, 20.01, 20.01, 20.01, 20.01, 20.01, 20.01, 20.01, 20.01]));
    expect(r.r2.length).toBeGreaterThan(0);
    expect(r.status.t).toBe('Kontrol dışı');
  });
  it('spcAdvice: az ölçümde 25 uyarısı, yetenekli seride sıklık azaltma', () => {
    const s = seri([20.001, 19.999, 20.002, 20.0, 19.998, 20.001, 20.0, 19.999, 20.002, 20.0]);
    const oneri = h.spcAdvice({ ...h.spcStats(s), lo: s.lo, hi: s.hi });
    expect(oneri[0]).toContain('en az 25, tercihen 30');
    expect(oneri.some((o) => o.startsWith('Süreç yetenekli'))).toBe(true);
  });
});

describe('6. AQL numune planı', () => {
  const ozet = (o: AqlSonuc | null) => o && { kod: o.kod, kodK: o.kodK, n: o.n, ac: o.ac, re: o.re, yuzde100: o.yuzde100 ?? false, not: o.not };
  it('kod harfi: lot büyüklüğü ve seviye; 2 altı lot yok', () => {
    expect(h.codeLetter(500, 'II')).toBe('H');
    expect(h.codeLetter(50, 'II')).toBe('D');
    expect(h.codeLetter(1, 'II')).toBeNull();
  });
  it('plan satırları', () => {
    expect(ozet(h.aqlPlan(500, 'II', '1.0', 'Normal'))).toEqual({ kod: 'H', kodK: 'H', n: 50, ac: 1, re: 2, yuzde100: false, not: '' });
    expect(ozet(h.aqlPlan(50, 'II', '2.5', 'Normal'))).toEqual({ kod: 'D', kodK: 'C', n: 5, ac: 0, re: 1, yuzde100: false, not: 'Ok kuralı: D → C' });
    expect(ozet(h.aqlPlan(10, 'II', '%100', 'Normal'))).toEqual({ kod: '—', kodK: '—', n: 10, ac: 0, re: 1, yuzde100: true, not: '%100 muayene, sıfır kabul' });
    const kucuk = ozet(h.aqlPlan(5, 'II', '0.010', 'Normal'));
    expect(kucuk).toMatchObject({ kod: 'A', kodK: 'Q', n: 5, ac: 0, re: 1, yuzde100: true });
    expect(kucuk?.not).toContain('Ok kuralı: A → Q');
    expect(kucuk?.not).toContain('numune ≥ parti, %100 muayene');
    expect(h.aqlPlan(1, 'II', '1.0', 'Normal')).toBeNull();
  });
  it('pAcc ve c0n', () => {
    expect(+h.pAcc(80, 2, 0.01).toFixed(4)).toBe(0.9534);
    expect(h.c0n(1000, 5, 90)).toBe(44);
    expect(h.c0n(0, 5, 90)).toBe(45);
  });
});

describe('7. devStatus: cihaz kalibrasyon durumu', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it.each([
    [{ sonKal: '2025-10-15', periyot: 12 }, 'Yaklaşıyor', '2026-10-15', 0],
    [{ sonKal: '2025-11-14', periyot: 12 }, 'Yaklaşıyor', '2026-11-14', 30],
    [{ sonKal: '2025-11-15', periyot: 12 }, 'Geçerli', '2026-11-15', 31],
    [{ sonKal: '2025-11-16', periyot: 12 }, 'Geçerli', '2026-11-16', 32],
    [{ sonKal: '2025-10-14', periyot: 12 }, 'Süresi doldu', '2026-10-14', -1],
    [{ sonKal: '2026-03-31', periyot: 6 }, 'Süresi doldu', '2026-09-30', -15],
  ] as const)('%j', (d, durum, sonraki, k) => {
    const r = h.devStatus(d);
    expect([r.t, r.next, r.k]).toEqual([durum, sonraki, k]);
  });
  it('kayıt yok, kullanım dışı, periyot varsayılanı 12 ay', () => {
    expect(h.devStatus({ periyot: 12 }).t).toBe('Kayıt yok');
    expect(h.devStatus({ kullanimDisi: true, sonKal: '2026-01-01' }).t).toBe('Kullanım dışı');
    expect(h.devStatus({ sonKal: '2025-11-16' }).next).toBe('2026-11-16');
  });
});

describe('8. supGrade: tedarikçi notu', () => {
  it.each([
    [{ kaliteSkor: 90, teslimatSkor: 80 }, 'A', 86],
    [{ kaliteSkor: 80, teslimatSkor: 55 }, 'B', 70],
    [{ kaliteSkor: 60, teslimatSkor: 70 }, 'C', 64],
    [{}, 'C', 0],
  ] as const)('%j', (s, harf, not) => {
    const r = h.supGrade(s);
    expect(r.t).toBe(harf);
    expect(r.g).toBeCloseTo(not, 9);
  });
});

describe('10. partStatus: parça durumu', () => {
  it('sıra: Kritik NCR > Açık NCR > Ölçüm sürüyor > son muayene > Muayene yok', () => {
    expect(h.partStatus({ acikNcr: [{ ciddiyet: 'Kritik' }, { ciddiyet: 'Minör' }], yarim: [1], sonMuayene: { s: 'Kabul' } }).t).toBe('Kritik NCR');
    expect(h.partStatus({ acikNcr: [{ ciddiyet: 'Minör' }], yarim: [1], sonMuayene: { s: 'Kabul' } }).t).toBe('Açık NCR');
    expect(h.partStatus({ acikNcr: [], yarim: [1], sonMuayene: { s: 'Kabul' } }).t).toBe('Ölçüm sürüyor');
    expect(h.partStatus({ acikNcr: [], yarim: [], sonMuayene: { s: 'Kabul' } })).toEqual({ t: 'Kabul', c: 'ok' });
    expect(h.partStatus({ acikNcr: [], yarim: [], sonMuayene: { s: 'Ret' } })).toEqual({ t: 'Ret', c: 'bad' });
    expect(h.partStatus({ acikNcr: [], yarim: [], sonMuayene: null })).toEqual({ t: 'Muayene yok', c: '' });
  });
});
