import {
  SATIN_ALMA_ANALIZI_GUVENLIK_EN_AZ, SATIN_ALMA_ANALIZI_SURE_EN_AZ, SATIN_ALMA_ANALIZI_TAHMIN_EN_AZ_AY,
  type SatinAlmaAnaliziCevabi, type SatinAlmaTuketimMalzemesi,
} from '#paylasilan/sozlesme/satin-alma-analiz.ts';

// 2151: Satın alma analizinin saf hesapları. Bilinmeyen değer null döner; eşik altında istatistik verilmez.
const GUN = 86_400_000;
const bir = (x: number): number => Math.round(x * 10) / 10;
const iki = (x: number): number => Math.round(x * 100) / 100;
const sayi = (d: string | null | undefined): number | null => (d === null || d === undefined || d === '' ? null : Number(d));

export const gunFarki = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / GUN);

// En yakın sıra yöntemi (karnedeki %80 ile aynı): sıralı listede ceil(p x n). sıra.
export function yuzdelik(sirali: readonly number[], p: number): number | null {
  if (sirali.length === 0) return null;
  return sirali[Math.max(0, Math.ceil(p * sirali.length) - 1)]!;
}
export function ortanca(sirali: readonly number[]): number | null {
  const n = sirali.length;
  if (n === 0) return null;
  return n % 2 === 1 ? sirali[(n - 1) / 2]! : (sirali[n / 2 - 1]! + sirali[n / 2]!) / 2;
}
const sirala = (l: readonly number[]): number[] => [...l].sort((a, b) => a - b);

function ortalamaSapma(l: readonly number[]): { ort: number; sd: number } {
  const ort = l.reduce((t, v) => t + v, 0) / l.length;
  const sd = l.length < 2 ? 0 : Math.sqrt(l.reduce((t, v) => t + (v - ort) ** 2, 0) / (l.length - 1));
  return { ort, sd };
}

// ---- Bayes zamanında teslim: önsel Beta(1,1), sonsal Beta(1 + z, 1 + n - z). Alt sınır sonsal dağılımın %10 değeridir.
function lnGamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const k of c) s += k / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
function betaKesri(a: number, b: number, x: number): number {
  const KUCUK = 1e-30;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < KUCUK) d = KUCUK;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < KUCUK) d = KUCUK;
    c = 1 + aa / c; if (Math.abs(c) < KUCUK) c = KUCUK;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d; if (Math.abs(d) < KUCUK) d = KUCUK;
    c = 1 + aa / c; if (Math.abs(c) < KUCUK) c = KUCUK;
    d = 1 / d;
    const fark = d * c;
    h *= fark;
    if (Math.abs(fark - 1) < 1e-12) break;
  }
  return h;
}
// Düzenlenmiş tamamlanmamış beta I_x(a, b): Beta(a, b) dağılımının x'teki birikimli olasılığı.
export function betaBirikimli(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const on = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (on * betaKesri(a, b, x)) / a : 1 - (on * betaKesri(b, a, 1 - x)) / b;
}
export function betaYuzdeligi(a: number, b: number, p: number): number {
  let alt = 0, ust = 1;
  for (let i = 0; i < 60; i += 1) {
    const orta = (alt + ust) / 2;
    if (betaBirikimli(a, b, orta) < p) alt = orta; else ust = orta;
  }
  return (alt + ust) / 2;
}
export function zamanindaBayes(toplam: number, zamaninda: number): { ortalama: number; alt90: number } | null {
  if (!(toplam > 0) || zamaninda < 0 || zamaninda > toplam) return null;
  const a = 1 + zamaninda, b = 1 + toplam - zamaninda;
  return { ortalama: bir((a / (a + b)) * 100), alt90: bir(betaYuzdeligi(a, b, 0.1) * 100) };
}

// ---- Sipariş satırı hesapları.
export interface AnalizSatiri {
  siparisTarihi: string; firmaId: number | null; paraBirimi: string; kur: string | null; genelIskonto: string; birimFiyat: string | null;
  satirIskonto: string | null; terminGun: number | null; miktar: string; birim: string; katalogId: string | null; ad: string;
  malzemeNo: number | null; teslimMiktari: string | null; sonTeslimGunu: string | null;
}

// TRY için 1; yabancı para biriminde teklifte girilmiş kur, yoksa null (kur uydurulmaz).
export function satirKuru(s: Pick<AnalizSatiri, 'paraBirimi' | 'kur'>): number | null {
  if (s.paraBirimi === 'TRY') return 1;
  const k = sayi(s.kur);
  return k !== null && k > 0 ? k : null;
}
// Teklif para biriminde net birim fiyat: satır iskontosu, sonra genel iskonto (teklif hesabıyla aynı sıra).
export function netBirimFiyat(s: Pick<AnalizSatiri, 'birimFiyat' | 'satirIskonto' | 'genelIskonto'>): number | null {
  const f = sayi(s.birimFiyat);
  if (f === null) return null;
  const kirp = (x: number | null) => Math.min(1, Math.max(0, (x ?? 0) / 100));
  return f * (1 - kirp(sayi(s.satirIskonto))) * (1 - kirp(sayi(s.genelIskonto)));
}
// Tam teslim edilen satırın gerçek tedarik süresi (gün); eksik teslimin sonucu belli olmadığından null.
export function gercekSure(s: Pick<AnalizSatiri, 'siparisTarihi' | 'miktar' | 'teslimMiktari' | 'sonTeslimGunu'>): number | null {
  const teslim = sayi(s.teslimMiktari);
  if (teslim === null || s.sonTeslimGunu === null || teslim < Number(s.miktar)) return null;
  return Math.max(0, gunFarki(s.siparisTarihi, s.sonTeslimGunu));
}

export function tedarikSuresi(satirlar: readonly AnalizSatiri[], enAz = SATIN_ALMA_ANALIZI_SURE_EN_AZ): SatinAlmaAnaliziCevabi['tedarikciler'][number]['tedarikSuresi'] {
  const tam = satirlar.map((s) => ({ s, gun: gercekSure(s) })).filter((x): x is { s: AnalizSatiri; gun: number } => x.gun !== null);
  const yeterli = tam.length >= enAz;
  const gunler = sirala(tam.map((x) => x.gun));
  const terminler = sirala(tam.map((x) => x.s.terminGun).filter((t): t is number => t !== null));
  return {
    ornek: tam.length,
    ortancaGun: yeterli ? ortanca(gunler) : null,
    yuzde80Gun: yeterli ? yuzdelik(gunler, 0.8) : null,
    teklifOrtancaGun: yeterli ? ortanca(terminler) : null,
  };
}

// Harcama ABC: tutar sırasıyla, kendinden önceki birikimli payı %80'in altında olan A, %95'in altında olan B, kalan C (%80'i aşan
// kalem A'dır). Kalem katalogla, katalogsuz satır adıyla gruplanır.
export function harcamaAbc(satirlar: readonly AnalizSatiri[], basTarih: string, bitTarih: string, ilk = 30): Omit<SatinAlmaAnaliziCevabi['harcama'], 'basTarih' | 'bitTarih'> {
  const gruplar = new Map<string, { ad: string; tutar: number }>();
  let kursuz = 0;
  for (const s of satirlar) {
    if (s.siparisTarihi < basTarih || s.siparisTarihi > bitTarih) continue;
    const kur = satirKuru(s), fiyat = netBirimFiyat(s);
    if (fiyat === null) continue;
    if (kur === null) { kursuz += 1; continue; }
    const anahtar = s.katalogId ?? `ad:${s.ad.trim().toLocaleLowerCase('tr')}`;
    const g = gruplar.get(anahtar) ?? { ad: s.ad, tutar: 0 };
    g.tutar += Number(s.miktar) * fiyat * kur;
    gruplar.set(anahtar, g);
  }
  const sirali = [...gruplar].sort((a, b) => b[1].tutar - a[1].tutar);
  const toplam = sirali.reduce((t, [, g]) => t + g.tutar, 0);
  const siniflar = { A: 0, B: 0, C: 0 };
  let birikim = 0;
  const kalemler = sirali.map(([anahtar, g]) => {
    const once = toplam > 0 ? (birikim / toplam) * 100 : 0;
    birikim += g.tutar;
    const sinif: 'A' | 'B' | 'C' = once < 80 ? 'A' : once < 95 ? 'B' : 'C';
    siniflar[sinif] += 1;
    return { anahtar, ad: g.ad, tutarTl: iki(g.tutar), pay: toplam > 0 ? bir((g.tutar / toplam) * 100) : 0, sinif };
  });
  return { toplamTl: sirali.length === 0 ? null : iki(toplam), kalemSayisi: sirali.length, siniflar, kalemler: kalemler.slice(0, ilk), kursuzSatir: kursuz };
}

// Son iki siparişin TL birim fiyat farkı = fiyat etkisi (yeni kurla) + kur etkisi (eski fiyatla). Para birimi ya da birim değişmişse
// kıyas yapılmaz; değişimi en büyük olanlar önce.
export function fiyatDegisimleri(satirlar: readonly AnalizSatiri[], ilk = 20): SatinAlmaAnaliziCevabi['fiyatDegisimleri'] {
  const gruplar = new Map<string, AnalizSatiri[]>();
  for (const s of satirlar) {
    if (s.katalogId === null || netBirimFiyat(s) === null || satirKuru(s) === null) continue;
    gruplar.set(s.katalogId, [...(gruplar.get(s.katalogId) ?? []), s]);
  }
  const sonuc: SatinAlmaAnaliziCevabi['fiyatDegisimleri'] = [];
  for (const [katalogId, l] of gruplar) {
    if (l.length < 2) continue;
    const [o, s] = [...l].sort((a, b) => (a.siparisTarihi < b.siparisTarihi ? -1 : a.siparisTarihi > b.siparisTarihi ? 1 : 0)).slice(-2) as [AnalizSatiri, AnalizSatiri];
    if (o.paraBirimi !== s.paraBirimi || o.birim !== s.birim) continue;
    const p1 = netBirimFiyat(o)!, p2 = netBirimFiyat(s)!, k1 = satirKuru(o)!, k2 = satirKuru(s)!;
    sonuc.push({
      katalogId, ad: s.ad, paraBirimi: s.paraBirimi, birim: s.birim,
      onceki: { tarih: o.siparisTarihi, birimFiyat: iki(p1), kur: k1 },
      son: { tarih: s.siparisTarihi, birimFiyat: iki(p2), kur: k2 },
      degisimTl: iki(p2 * k2 - p1 * k1), fiyatEtkisiTl: iki((p2 - p1) * k2), kurEtkisiTl: iki(p1 * (k2 - k1)),
      degisimYuzde: p1 * k1 > 0 ? bir(((p2 * k2 - p1 * k1) / (p1 * k1)) * 100) : null,
    });
  }
  return sonuc.sort((a, b) => Math.abs(b.degisimYuzde ?? 0) - Math.abs(a.degisimYuzde ?? 0)).slice(0, ilk);
}

// ---- Tüketim: TSB (Teunter-Syntetos-Babai) aralıklı talep tahmini. Olasılık her ay, büyüklük yalnız tüketim olan ayda güncellenir;
// tahmin olasılık x büyüklüktür. Başlangıç: geçmişteki tüketimli ay oranı ve tüketimli ayların ortalaması.
export const TSB_ALFA = 0.1;
export const TSB_BETA = 0.1;
export function tsbTahmini(seri: readonly number[], alfa = TSB_ALFA, beta = TSB_BETA): number | null {
  if (seri.length === 0) return null;
  const dolu = seri.filter((d) => d > 0);
  if (dolu.length === 0) return 0;
  let p = dolu.length / seri.length;
  let z = dolu.reduce((t, v) => t + v, 0) / dolu.length;
  for (const d of seri) {
    if (d > 0) { p += beta * (1 - p); z += alfa * (d - z); }
    else p += beta * (0 - p);
  }
  return p * z;
}

// Son `adet` tam ay (bu ay hariç), eskiden yeniye.
export function tamAylar(buAy: string, adet: number): string[] {
  const [y, a] = buAy.split('-').map(Number) as [number, number];
  return Array.from({ length: adet }, (_, i) => {
    const d = new Date(Date.UTC(y, a - 1 - adet + i, 1));
    return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export const GUVENLIK_Z = 1.645;
export function tuketimMalzemesi(g: {
  malzemeNo: number; ad: string; aylar: readonly string[]; miktarlar: ReadonlyMap<string, number>; ilkHareketAyi: string | null;
  tedarikSureleri: readonly number[];
}, enAzAy = SATIN_ALMA_ANALIZI_TAHMIN_EN_AZ_AY, guvenlikEnAz = SATIN_ALMA_ANALIZI_GUVENLIK_EN_AZ): SatinAlmaTuketimMalzemesi {
  const seri = g.aylar.map((a) => (g.ilkHareketAyi === null || a < g.ilkHareketAyi ? null : Math.max(0, g.miktarlar.get(a) ?? 0)));
  const gecmis = seri.filter((x): x is number => x !== null);
  const yeterli = gecmis.length >= enAzAy;
  const { ort, sd } = gecmis.length > 0 ? ortalamaSapma(gecmis) : { ort: 0, sd: 0 };
  const degiskenlik = yeterli && ort > 0 ? iki(sd / ort) : null;
  const tahmin = yeterli ? tsbTahmini(gecmis) : null;
  const sure = g.tedarikSureleri.length >= guvenlikEnAz ? ortanca(sirala(g.tedarikSureleri)) : null;
  return {
    malzemeNo: g.malzemeNo, ad: g.ad, gecmisAy: gecmis.length, seri: seri.map((x) => (x === null ? null : iki(x))),
    degiskenlik, xyz: degiskenlik === null ? null : degiskenlik < 0.5 ? 'X' : degiskenlik < 1 ? 'Y' : 'Z',
    tahminAylik: tahmin === null ? null : iki(tahmin),
    tedarikSuresiGun: sure,
    guvenlikStogu: tahmin === null || sure === null ? null : iki(GUVENLIK_Z * sd * Math.sqrt(sure / 30)),
  };
}
