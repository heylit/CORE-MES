import {
  SATIN_ALMA_ANALIZI_GUVENLIK_EN_AZ, SATIN_ALMA_ANALIZI_SURE_EN_AZ, SATIN_ALMA_ANALIZI_TAHMIN_EN_AZ_AY, SATIN_ALMA_ASAMALARI, SATIN_ALMA_SAPMA_ILK, SATIN_ALMA_TEK_KAYNAK_ILK,
  type SatinAlmaAnaliziCevabi, type SatinAlmaAsamaOzeti, type SatinAlmaAsamasi, type SatinAlmaKuralDisiDonemi, type SatinAlmaSapmaDonemi,
  type SatinAlmaHarcamaDagilimi, type SatinAlmaTedarikRiski, type SatinAlmaTuketimMalzemesi, type SatinAlmaTutarOlcusu,
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

// ---- 2471: süreç ve fiyat ölçüleri.

// Talebin aşama uçları (tesis günü, YYYY-AA-GG). Olmayan uç null.
export interface TalepAsamaSatiri {
  talepId: string; acilis: string; ilkIstek: string | null; sonTeklif: string | null; karar: string | null; sonOnay: string | null;
  siparis: string | null; ilkTeslim: string | null; tamTeslim: string | null; birim: string | null; kategoriler: readonly string[];
  kararVeren: number | null;
}
const ASAMA_UCU: Readonly<Record<SatinAlmaAsamasi, keyof TalepAsamaSatiri>> = {
  'teklif-istegi': 'ilkIstek', teklif: 'sonTeklif', karar: 'karar', onay: 'sonOnay', siparis: 'siparis', 'ilk-teslim': 'ilkTeslim', 'tam-teslim': 'tamTeslim',
};
const sureOzeti = (gunler: number[], enAz: number): { ornek: number; ortancaGun: number | null; yuzde80Gun: number | null } => {
  const l = sirala(gunler);
  const yeterli = l.length >= enAz;
  return { ornek: l.length, ortancaGun: yeterli ? ortanca(l) : null, yuzde80Gun: yeterli ? yuzdelik(l, 0.8) : null };
};

// SA-2471-1: Aşama süresi, bir önceki VAR OLAN uçtan bu aşamanın ucuna geçen gündür; atlanan aşama sayılmaz, süresi sonrakine yazılır.
// Eksi aralık veri hatasıdır, sayılmaz ve hataliAralik'ta görünür. Toplam açılıştan tam teslime ayrıca ölçülür. Darboğaz ortancası en
// uzun aşamadır (eşitlikte süreçte önce gelen).
export function asamaOzeti(satirlar: readonly TalepAsamaSatiri[], enAz = SATIN_ALMA_ANALIZI_SURE_EN_AZ): SatinAlmaAsamaOzeti {
  const gunler = new Map<SatinAlmaAsamasi, number[]>(SATIN_ALMA_ASAMALARI.map((a) => [a, []]));
  const toplam: number[] = [];
  let hatali = 0;
  for (const t of satirlar) {
    let onceki = t.acilis;
    for (const a of SATIN_ALMA_ASAMALARI) {
      const uc = t[ASAMA_UCU[a]] as string | null;
      if (uc === null) continue;
      const gun = gunFarki(onceki, uc);
      if (gun < 0) { hatali += 1; continue; }
      gunler.get(a)!.push(gun);
      onceki = uc;
    }
    if (t.tamTeslim !== null) {
      const gun = gunFarki(t.acilis, t.tamTeslim);
      if (gun >= 0) toplam.push(gun);
    }
  }
  const asamalar = SATIN_ALMA_ASAMALARI.map((asama) => ({ asama, ...sureOzeti(gunler.get(asama)!, enAz) }));
  let darbogaz: SatinAlmaAsamasi | null = null, enUzun = -1;
  for (const a of asamalar) if (a.ortancaGun !== null && a.ortancaGun > enUzun) { enUzun = a.ortancaGun; darbogaz = a.asama; }
  return { asamalar, toplam: sureOzeti(toplam, enAz), darbogaz, hataliAralik: hatali };
}

// SA-2471-2: Kırılım; talep her kalem kategorisinde bir kez sayılır. Boş kategori "Kategorisiz", birimsiz talep "Birimsiz"; kararı
// vermeyen (karar yok) talep alıcı kırılımına girmez. Örneği çok olan önce.
export function asamaKirilimlari(
  satirlar: readonly TalepAsamaSatiri[], kisiAdi: ReadonlyMap<number, string>, enAz = SATIN_ALMA_ANALIZI_SURE_EN_AZ, ilk = 40,
): { tur: 'kategori' | 'birim' | 'alici'; anahtar: string; ad: string; ozet: SatinAlmaAsamaOzeti }[] {
  const gruplar = new Map<string, { tur: 'kategori' | 'birim' | 'alici'; anahtar: string; ad: string; l: TalepAsamaSatiri[] }>();
  const ekle = (tur: 'kategori' | 'birim' | 'alici', anahtar: string, ad: string, t: TalepAsamaSatiri) => {
    const k = `${tur}:${anahtar}`;
    const g = gruplar.get(k) ?? { tur, anahtar, ad, l: [] };
    g.l.push(t);
    gruplar.set(k, g);
  };
  for (const t of satirlar) {
    for (const k of new Set(t.kategoriler.map((x) => x.trim()))) ekle('kategori', k, k === '' ? 'Kategorisiz' : k, t);
    ekle('birim', t.birim ?? '', t.birim ?? 'Birimsiz', t);
    if (t.kararVeren !== null) ekle('alici', String(t.kararVeren), kisiAdi.get(t.kararVeren) ?? '', t);
  }
  return [...gruplar.values()]
    .sort((a, b) => b.l.length - a.l.length || a.ad.localeCompare(b.ad, 'tr'))
    .slice(0, ilk)
    .map((g) => ({ tur: g.tur, anahtar: g.anahtar, ad: g.ad, ozet: asamaOzeti(g.l, enAz) }));
}

export type KimlikliSatir = AnalizSatiri & { id: number };
const tarihSirasi = (a: KimlikliSatir, b: KimlikliSatir): number =>
  (a.siparisTarihi < b.siparisTarihi ? -1 : a.siparisTarihi > b.siparisTarihi ? 1 : a.id - b.id);
const icinde = (s: { siparisTarihi: string }, bas: string, bit: string): boolean => s.siparisTarihi >= bas && s.siparisTarihi <= bit;

// Aynı katalog kaleminin aynı birimdeki bir önceki sipariş satırı (pencere içinde). Katalogsuz satırın öncesi yoktur.
export function oncekiAlislar(satirlar: readonly KimlikliSatir[]): Map<number, KimlikliSatir> {
  const son = new Map<string, KimlikliSatir>();
  const sonuc = new Map<number, KimlikliSatir>();
  for (const s of [...satirlar].sort(tarihSirasi)) {
    if (s.katalogId === null || netBirimFiyat(s) === null) continue;
    const anahtar = `${s.katalogId}|${s.birim}`;
    const o = son.get(anahtar);
    if (o) sonuc.set(s.id, o);
    son.set(anahtar, s);
  }
  return sonuc;
}

// SA-2471-3 (2468 a): son alışa göre fiyat farkı. Aynı dövizde (P1 - P0) x K1 x miktar: kurun etkisi P0 x (K1 - K0) x miktar olarak
// ayrı toplanır, tutara girmez (Maliyet ön bakışı K1). TL kalemde ya da para birimi değişmişse TL net birim farkı x miktar. Eksi gerçek
// azalmadır. Her iki satırın kuru bilinmeli; bilinmeyen kursuz sayılır.
export function fiyatFarki(satirlar: readonly KimlikliSatir[], onceki: ReadonlyMap<number, KimlikliSatir>, bas: string, bit: string): SatinAlmaTutarOlcusu {
  let tutar = 0, kurEtkisi = 0, ornek = 0, kursuz = 0;
  for (const s of satirlar) {
    const o = onceki.get(s.id);
    if (!o || !icinde(s, bas, bit)) continue;
    const k1 = satirKuru(s), k0 = satirKuru(o);
    if (k1 === null || k0 === null) { kursuz += 1; continue; }
    const m = Number(s.miktar), p1 = netBirimFiyat(s)!, p0 = netBirimFiyat(o)!;
    if (s.paraBirimi !== 'TRY' && s.paraBirimi === o.paraBirimi) {
      tutar += (p1 - p0) * k1 * m;
      kurEtkisi += p0 * (k1 - k0) * m;
    } else tutar += (p1 * k1 - p0 * k0) * m;
    ornek += 1;
  }
  return { tutarTl: ornek === 0 ? null : iki(tutar), ornek, kursuz, kurEtkisiTl: ornek === 0 ? null : iki(kurEtkisi) };
}

// Teklifteki bir kalemin fiyatı (teklif para biriminde, iskontosuz) ve kuru.
export interface TeklifFiyati {
  talepId: string; teklifId: string; kalemId: string; paraBirimi: string; kur: string | null; genelIskonto: string; birimFiyat: string;
  satirIskonto: string | null; teknikUygun: boolean;
}
export interface SiparisBagi { id: number; talepId: string; teklifId: string; kalemId: string; talepAcilis: string; teklifSayisi: number }

// SA-2471-4 (2468 a): kaçınılan maliyet = (aynı kalemde teknik uygun öteki tekliflerin en düşük TL net birimi - seçilen TL net birim)
// x miktar; nakliye ve vade hariç. Seçilenle aynı dövizdeki teklif seçilenin kuruyla çevrilir (iki kur farkı kazanç sayılmaz; Maliyet K2).
// Öteki teklif yoksa satır sayılmaz; seçilen en ucuz değilse sonuç eksidir ve öyle gösterilir. Kuru bilinmeyen teklif kursuzdur.
export function kacinilanMaliyet(
  satirlar: readonly KimlikliSatir[], baglar: ReadonlyMap<number, SiparisBagi>, teklifler: readonly TeklifFiyati[], bas: string, bit: string,
): SatinAlmaTutarOlcusu {
  const kalemTeklifleri = new Map<string, TeklifFiyati[]>();
  for (const t of teklifler) {
    if (!t.teknikUygun) continue;
    const k = `${t.talepId}|${t.kalemId}`;
    kalemTeklifleri.set(k, [...(kalemTeklifleri.get(k) ?? []), t]);
  }
  let tutar = 0, ornek = 0, kursuz = 0;
  for (const s of satirlar) {
    const b = baglar.get(s.id);
    if (!b || !icinde(s, bas, bit)) continue;
    const otekiler = (kalemTeklifleri.get(`${b.talepId}|${b.kalemId}`) ?? []).filter((t) => t.teklifId !== b.teklifId);
    if (otekiler.length === 0) continue;
    const secilenKur = satirKuru(s);
    const tl = otekiler.map((t) => { const k = t.paraBirimi === s.paraBirimi ? secilenKur : satirKuru(t); return k === null ? null : netBirimFiyat(t)! * k; });
    if (secilenKur === null || tl.some((x) => x === null)) { kursuz += 1; continue; }
    tutar += (Math.min(...(tl as number[])) - netBirimFiyat(s)! * secilenKur) * Number(s.miktar);
    ornek += 1;
  }
  return { tutarTl: ornek === 0 ? null : iki(tutar), ornek, kursuz, kurEtkisiTl: null };
}

// SA-2471-5: hedef fiyata göre sapma (2440 Maliyet tanımı). Döviz kalemde hedef = önceki alışın döviz net birimi x sipariş günü kuru; sapma (fiili - hedef) x kur x miktar ve önceki alışa göre TL değişimin kur payı ayrıdır. TL kalemde hedef enflasyon
// endeksi ister; endeks yokken hedef yoktur, satır endeksYok sayılır (nominal değişim hedef yerine konmaz). Para birimi değişmişse
// kıyas yoktur. Bant: fark yüzdesi eşikten büyükse üstünde, eksi eşikten küçükse altında (2440-6 a).
export interface SapmaSatiri {
  katalogId: string; ad: string; siparisTarihi: string; paraBirimi: string; birim: string; hedef: number; fiili: number;
  farkYuzde: number | null; sapmaTl: number; kurEtkisiTl: number; bant: 'icinde' | 'ustunde' | 'altinda';
}
export function hedefSapmalari(
  satirlar: readonly KimlikliSatir[], onceki: ReadonlyMap<number, KimlikliSatir>, esikYuzde: number, bas: string, bit: string,
): { donem: SatinAlmaSapmaDonemi; satirlar: SapmaSatiri[] } {
  const l: SapmaSatiri[] = [];
  let endeksYok = 0;
  for (const s of satirlar) {
    const o = onceki.get(s.id);
    if (!o || !icinde(s, bas, bit) || o.paraBirimi !== s.paraBirimi) continue;
    if (s.paraBirimi === 'TRY') { endeksYok += 1; continue; }
    const k1 = satirKuru(s), k0 = satirKuru(o), hedef = netBirimFiyat(o)!, fiili = netBirimFiyat(s)!;
    if (k1 === null || k0 === null || !(hedef > 0)) continue;
    const farkYuzde = bir((fiili / hedef - 1) * 100);
    const m = Number(s.miktar);
    l.push({
      katalogId: s.katalogId!, ad: s.ad, siparisTarihi: s.siparisTarihi, paraBirimi: s.paraBirimi, birim: s.birim,
      hedef: iki(hedef), fiili: iki(fiili), farkYuzde, sapmaTl: iki((fiili - hedef) * k1 * m), kurEtkisiTl: iki(hedef * (k1 - k0) * m),
      bant: farkYuzde > esikYuzde ? 'ustunde' : farkYuzde < -esikYuzde ? 'altinda' : 'icinde',
    });
  }
  return {
    donem: {
      satir: l.length, toplamTl: l.length === 0 ? null : iki(l.reduce((t, x) => t + x.sapmaTl, 0)),
      bantDisi: l.filter((x) => x.bant !== 'icinde').length, endeksYok,
    },
    satirlar: l,
  };
}
export const enCokSapanlar = (l: readonly SapmaSatiri[], ilk = SATIN_ALMA_SAPMA_ILK): SapmaSatiri[] =>
  [...l].sort((a, b) => Math.abs(b.sapmaTl) - Math.abs(a.sapmaTl) || (a.siparisTarihi < b.siparisTarihi ? 1 : -1)).slice(0, ilk);

// SA-2471-6: kural dışı alım vekili (gerçek ölçü 2331 ile gelir). Sipariş (talep, teklif) başına: talepteki teklif sayısı ayardaki en
// az teklifin altındaysa azTeklif; sipariş günü talebin açılış gününden önceyse talepOncesi. Tutar kuru bilinen satırların TL toplamıdır.
// Pay, iki durumdan en az birine giren siparişlerin tutarının dönem harcamasına oranıdır.
export function kuralDisiAlim(
  satirlar: readonly KimlikliSatir[], baglar: ReadonlyMap<number, SiparisBagi>, enAzTeklif: number, harcamaTl: number | null, bas: string, bit: string,
): SatinAlmaKuralDisiDonemi {
  const siparisler = new Map<string, { tutar: number; az: boolean; once: boolean }>();
  for (const s of satirlar) {
    const b = baglar.get(s.id);
    if (!b || !icinde(s, bas, bit)) continue;
    const k = satirKuru(s), f = netBirimFiyat(s);
    const anahtar = `${b.talepId}|${b.teklifId}`;
    const g = siparisler.get(anahtar) ?? { tutar: 0, az: b.teklifSayisi < enAzTeklif, once: s.siparisTarihi < b.talepAcilis };
    if (k !== null && f !== null) g.tutar += f * k * Number(s.miktar);
    siparisler.set(anahtar, g);
  }
  const l = [...siparisler.values()];
  const topla = (x: typeof l) => ({ siparis: x.length, tutarTl: iki(x.reduce((t, g) => t + g.tutar, 0)) });
  const ikisi = l.filter((g) => g.az || g.once).reduce((t, g) => t + g.tutar, 0);
  return {
    azTeklif: topla(l.filter((g) => g.az)), talepOncesi: topla(l.filter((g) => g.once)),
    payYuzde: harcamaTl === null || !(harcamaTl > 0) ? null : bir(Math.min(100, (ikisi / harcamaTl) * 100)),
  };
}

// ---- 2477: Raporlar'dan taşınan dağılımlar. Tutar KDV ve masraf hariç, iskonto dahil, sipariş günü kuruyla; kuru bilinmeyen satır girmez.
export interface DokumSatiri {
  siparisTarihi: string; talepId: string; kalemId: string; kategori: string; ad: string; katalogId: string | null; firmaId: number | null;
  tedarikciAdi: string; paraBirimi: string; kur: string | null; genelIskonto: string; birimFiyat: string | null; satirIskonto: string | null; miktar: string;
}
export function satirTutariTl(s: Pick<DokumSatiri, 'paraBirimi' | 'kur' | 'birimFiyat' | 'satirIskonto' | 'genelIskonto' | 'miktar'>): number | null {
  const k = satirKuru(s), f = netBirimFiyat(s);
  return k === null || f === null ? null : f * k * Number(s.miktar);
}
export const tedarikciAnahtari = (s: Pick<DokumSatiri, 'firmaId' | 'tedarikciAdi'>): string =>
  (s.firmaId !== null ? `f:${String(s.firmaId)}` : `ad:${s.tedarikciAdi.trim().toLocaleLowerCase('tr')}`);
const kalemAnahtari = (s: Pick<DokumSatiri, 'katalogId' | 'ad'>): string => s.katalogId ?? `ad:${s.ad.trim().toLocaleLowerCase('tr')}`;

// SA-2477-1: aylık harcama. Satırların ilk siparişinin ayından önceki ay null (veri yok); sonraki siparişsiz ay 0.
export function aylikHarcama(satirlar: readonly AnalizSatiri[], aylar: readonly string[]): SatinAlmaHarcamaDagilimi['aylar'] {
  const toplam = new Map<string, number>();
  let ilk: string | null = null;
  for (const s of satirlar) {
    const ay = s.siparisTarihi.slice(0, 7);
    if (ilk === null || ay < ilk) ilk = ay;
    const t = satirTutariTl(s);
    if (t !== null) toplam.set(ay, (toplam.get(ay) ?? 0) + t);
  }
  return aylar.map((ay) => ({ ay, tutarTl: ilk === null || ay < ilk ? null : iki(toplam.get(ay) ?? 0) }));
}

// SA-2477-2: dönemde anahtara göre harcama dağılımı, büyükten küçüğe; pay dönemin kuru bilinen toplamına göre.
export function harcamaDagilimi(
  satirlar: readonly DokumSatiri[], anahtar: (s: DokumSatiri) => string, ad: (s: DokumSatiri, anahtar: string) => string, bas: string, bit: string,
): SatinAlmaHarcamaDagilimi['kategoriler'] {
  const g = new Map<string, { ad: string; tutar: number }>();
  for (const s of satirlar) {
    if (!icinde(s, bas, bit)) continue;
    const t = satirTutariTl(s);
    if (t === null) continue;
    const a = anahtar(s);
    const x = g.get(a) ?? { ad: ad(s, a), tutar: 0 };
    x.tutar += t;
    g.set(a, x);
  }
  const toplam = [...g.values()].reduce((t, x) => t + x.tutar, 0);
  return [...g].map(([a, x]) => ({ anahtar: a, ad: x.ad, tutarTl: iki(x.tutar), pay: toplam > 0 ? bir((x.tutar / toplam) * 100) : 0 }))
    .sort((a, b) => b.tutarTl - a.tutarTl || a.ad.localeCompare(b.ad, 'tr'));
}

// SA-2477-3: en büyük bir ve üç tedarikçinin payı; harcama yoksa null.
export function yogunlasma(tedarikciler: readonly { tutarTl: number }[]): { ilkBirPay: number | null; ilkUcPay: number | null } {
  const toplam = tedarikciler.reduce((t, x) => t + x.tutarTl, 0);
  if (!(toplam > 0)) return { ilkBirPay: null, ilkUcPay: null };
  const sirali = tedarikciler.map((x) => x.tutarTl).sort((a, b) => b - a);
  const pay = (n: number) => bir(Math.min(100, (sirali.slice(0, n).reduce((t, x) => t + x, 0) / toplam) * 100));
  return { ilkBirPay: pay(1), ilkUcPay: pay(3) };
}

// SA-2477-4: dönemde siparişe dönen taleplerin teklif sayısı ortancası ve ayardaki en az teklifin altında kalan talep.
export function teklifOzeti(
  satirlar: readonly KimlikliSatir[], baglar: ReadonlyMap<number, SiparisBagi>, enAzTeklif: number, bas: string, bit: string,
): SatinAlmaTedarikRiski['teklif'] {
  const talepler = new Map<string, number>();
  for (const s of satirlar) {
    const b = baglar.get(s.id);
    if (b && icinde(s, bas, bit)) talepler.set(b.talepId, b.teklifSayisi);
  }
  const l = sirala([...talepler.values()]);
  return { talep: l.length, ortanca: ortanca(l), hedefAlti: l.filter((n) => n < enAzTeklif).length };
}

// SA-2477-5: tek kaynak riski. Dönemde alınan kalemin (katalog, katalogsuzsa ad) aldığı her talepte fiyat veren tedarikçiler birleşir;
// hepsi tek tedarikçiyse kalem tek kaynaktır. Fiyat veren kaydı yoksa siparişin tedarikçisi sayılır. Tutar kuru bilinen satırların toplamı.
export function tekKaynak(
  satirlar: readonly DokumSatiri[], verenler: readonly { talepId: string; kalemId: string; tedarikci: string }[], tedarikciAdi: (anahtar: string) => string,
  bas: string, bit: string, ilk = SATIN_ALMA_TEK_KAYNAK_ILK,
): SatinAlmaTedarikRiski['tekKaynak'] {
  const fiyatVeren = new Map<string, Set<string>>();
  for (const v of verenler) {
    const k = `${v.talepId}|${v.kalemId}`;
    fiyatVeren.set(k, (fiyatVeren.get(k) ?? new Set()).add(v.tedarikci));
  }
  const kalemler = new Map<string, { ad: string; tedarikciler: Set<string>; satir: number; tutar: number; kursuz: boolean }>();
  for (const s of satirlar) {
    if (!icinde(s, bas, bit)) continue;
    const a = kalemAnahtari(s);
    const x = kalemler.get(a) ?? { ad: s.ad, tedarikciler: new Set<string>(), satir: 0, tutar: 0, kursuz: false };
    for (const t of fiyatVeren.get(`${s.talepId}|${s.kalemId}`) ?? [tedarikciAnahtari(s)]) x.tedarikciler.add(t);
    x.satir += 1;
    const t = satirTutariTl(s);
    if (t === null) x.kursuz = true; else x.tutar += t;
    kalemler.set(a, x);
  }
  const tek = [...kalemler].filter(([, x]) => x.tedarikciler.size === 1).map(([anahtar, x]) => ({
    anahtar, ad: x.ad, tedarikci: tedarikciAdi([...x.tedarikciler][0]!), siparisSatiri: x.satir, tutarTl: x.kursuz && x.tutar === 0 ? null : iki(x.tutar),
  })).sort((a, b) => (b.tutarTl ?? -1) - (a.tutarTl ?? -1) || a.ad.localeCompare(b.ad, 'tr'));
  return { kalemSayisi: tek.length, kalemler: tek.slice(0, ilk) };
}
