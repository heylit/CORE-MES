// Filo planı: teslimat, alım ve al-bırak işlerini araçlara paylaştırır ve sıralar. Kapasite (kg, palet), zaman
// penceresi, araç müsaitlik aralığı, sefer sınırı ve "aynı seferde önce al, sonra bırak" sağlanır.
// Yöntem: zamana bağlı süre matrisi, pişmanlık (regret-2) ekleme, büyük komşuluk araması (LNS) ve sefer başına kesin sıra.
// Saf ve belirlenimci: süre yerine yineleme sınırı, rastgelelik tohumlu.
import {
  ARAC_BEDELI_DAKIKA, ARAC_BEDELI_KILOMETRE, ARAC_HIZ_KATSAYISI, BEKLEME_AGIRLIGI, BOSALTMA_DAKIKA, EN_COK_SEFER, RAMPA_HIZI, SEFER_BEDELI_DAKIKA,
  SEFER_BEDELI_KILOMETRE, SERBEST_HIZ, VARSAYILAN_MALIYET, YUKLEME_DAKIKA,
} from './kurallar.ts';
import type { Amac, AracTuru, GunTipi, IsTuru, MaliyetOranlari } from './kurallar.ts';
import { enYakinDugum, saatMetni, sokakBaglantisiDakika, yogunluk } from './yol-agi.ts';
import type { KenarAdimi, YolAgi } from './yol-agi.ts';

export interface CozucuNoktasi { anahtar: string; ad: string; boylam: number; enlem: number; durakSuresiDakika: number }

export interface CozucuIsi {
  anahtar: string; tur: IsTuru;
  // Alım ve al-bırakta yükün alındığı nokta; teslimatta null (fabrika).
  alisNoktasi: string | null;
  // Teslimat ve al-bırakta yükün bırakıldığı nokta; alımda null (fabrika).
  birakisNoktasi: string | null;
  kilogram: number; palet: number;
  // Noktada yükleme/boşaltma süresi; null ise noktanın kendi süresi.
  durakSuresiDakika: number | null;
  // Gün içi dakika aralıkları.
  alisPenceresi: [number, number] | null; birakisPenceresi: [number, number] | null;
  sabitArac: string | null;
}

export interface CozucuAraci {
  anahtar: string; ad: string; tur: AracTuru; kapasiteKilogram: number; kapasitePalet: number;
  musaitBaslangic: number; musaitBitis: number;
  oranlar: Partial<MaliyetOranlari>;
}

export type RotaOgesi = { is: string; alis: boolean } | { araDonus: true };
export interface AracRotasi { arac: string; ogeler: RotaOgesi[] }

export type CozumKipi = 'dagit' | 'yerlestir' | 'degerlendir';

export interface FiloSecenegi {
  gun: GunTipi; amac: Amac; kip: CozumKipi;
  // Elle dizilmiş rotalar; 'dagit' yalnız kilitli araçların rotasını korur.
  baslangic?: readonly AracRotasi[];
  kilitliAraclar?: readonly string[];
  yinelemeSiniri?: number; tohum?: number;
}

export const VARSAYILAN_YINELEME = 3000;

export interface FiloDuragi {
  // null: fabrikaya ara dönüş (boşaltma ve yeniden yükleme)
  is: string | null; alis: boolean; nokta: string;
  varis: number; bekleme: number; baslama: number; ayrilis: number;
  // Ayrılırken araçtaki yük.
  yukKilogram: number; yukPalet: number;
  uyarilar: string[];
}
// baslangic: yüklemenin başı; cikis: fabrikadan ayrılış; noktalar: ardışık aynı nokta birleşik, durakSureleri onlarla hizalı.
export interface Sefer { baslangic: number; cikis: number; bitis: number; noktalar: string[]; durakSureleri: number[]; yukKilogram: number; yukPalet: number }
export interface FiloRotasi {
  arac: string; cikis: number; donus: number; yuklemeDakika: number; bosaltmaDakika: number;
  enCokKilogram: number; enCokPalet: number;
  duraklar: FiloDuragi[]; surusDakika: number; beklemeDakika: number; kilometre: number;
  ayaklar: { kenarlar: KenarAdimi[]; metre: number }[];
  seferler: Sefer[];
  // Rota geneli uyarılar (müsaitlik, sefer sayısı, sefer başı kapasite); duraklardakilerle birlikte boşsa kurallara uygun.
  uyarilar: string[]; kurallaraUygun: boolean;
  // Durak sırası her seferde bütün olasılıklar denenerek bulundu.
  kesin: boolean;
  maliyet: number; oranlar: MaliyetOranlari;
}
export interface FiloPlani {
  rotalar: FiloRotasi[]; atanamayan: { is: string; neden: string }[];
  toplamDakika: number; surusDakika: number; kilometre: number; kullanilanArac: number; maliyet: number;
  gun: GunTipi; amac: Amac; yineleme: number;
}

// ---------- süre matrisi ----------
const ILK_DAKIKA = 300, ARALIK = 30, ORNEK_SAYISI = 37; // 05:00 ile 23:00 arası, 30 dakikada bir
const KAYNAK_SAATLER = [480, 690, 1080]; // yol seçenekleri: sabah zirvesi, öğle, akşam zirvesi
const KISA = KAYNAK_SAATLER.length; // en kısa mesafe yolunun sırası
const UCUZ = KISA + 1; // en ucuz yolun sırası (kamyonet örnek oranlarıyla, öğle hızlarında)

export interface Matris {
  noktalar: CozucuNoktasi[]; sira: Map<string, number>; noktaSayisi: number; secenekSayisi: number;
  enHizli: Float32Array; secilen: Uint8Array; enKisaSure: Float32Array; enUcuzSure: Float32Array;
  yollar: (Int32Array | null)[]; metre: Float32Array; gun: GunTipi;
}
// Yol seçimi: false en hızlı, true en kısa mesafe, 'ucuz' en düşük TL.
type YolTuru = boolean | 'ucuz';

function sureFonksiyonu(ag: YolAgi, gun: GunTipi) {
  const genel = new Float32Array(1440), giris = new Float32Array(1440), cikis = new Float32Array(1440);
  for (let d = 0; d < 1440; d++) { const y = yogunluk(gun, d); genel[d] = y.genel; giris[d] = y.giris; cikis[d] = y.cikis; }
  const m = ag.kenarA.length, serbest = new Float32Array(m);
  for (let e = 0; e < m; e++) serbest[e] = ag.rampa[e] ? RAMPA_HIZI : SERBEST_HIZ[ag.siniflar[ag.kenarSinifi[e]!]!];
  // Kenar süresi (dakika, binek).
  return (e: number, yon: number, dakika: number) => {
    const d = ((Math.floor(dakika) % 1440) + 1440) % 1440, yonCarpimi = ag.merkezYonu[e]! * yon;
    const seviye = Math.max(0, genel[d]! + (yonCarpimi > 0 ? giris[d]! : yonCarpimi < 0 ? cikis[d]! : 0));
    const oran = Math.max(0.16, 1 - 0.7 * Math.min(1.15, ag.hassasiyet[e]! * seviye));
    return (ag.kenarMetre[e]! / 1000 / (serbest[e]! * oran)) * 60 + (ag.kenarSinifi[e]! >= 3 ? 0.05 : 0.02);
  };
}

// Tek saatteki ağırlıklarla en kısa ağaç.
function agac(ag: YolAgi, s: number, kenarBedeli: (e: number, yon: number, d: number) => number, dakika: number) {
  const n = ag.dugumSayisi, bedel = new Float64Array(n).fill(Infinity), onceki = new Int32Array(n).fill(-1), onceYon = new Int8Array(n);
  let yiginDegerleri = new Int32Array(1024), yiginAnahtarlari = new Float64Array(1024), yiginBoyu = 0;
  const ekle = (v: number, k: number) => {
    if (yiginBoyu === yiginDegerleri.length) { const a = new Int32Array(yiginBoyu * 2); a.set(yiginDegerleri); yiginDegerleri = a; const b = new Float64Array(yiginBoyu * 2); b.set(yiginAnahtarlari); yiginAnahtarlari = b; }
    let i = yiginBoyu++; while (i > 0) { const p = (i - 1) >> 1; if (yiginAnahtarlari[p]! <= k) break; yiginDegerleri[i] = yiginDegerleri[p]!; yiginAnahtarlari[i] = yiginAnahtarlari[p]!; i = p; } yiginDegerleri[i] = v; yiginAnahtarlari[i] = k;
  };
  const cikar = () => {
    const v = yiginDegerleri[0]!; yiginBoyu--;
    if (yiginBoyu > 0) { const sonDeger = yiginDegerleri[yiginBoyu]!, sonAnahtar = yiginAnahtarlari[yiginBoyu]!; let i = 0; for (;;) { let cocuk = 2 * i + 1; if (cocuk >= yiginBoyu) break; if (cocuk + 1 < yiginBoyu && yiginAnahtarlari[cocuk + 1]! < yiginAnahtarlari[cocuk]!) cocuk++; if (yiginAnahtarlari[cocuk]! >= sonAnahtar) break; yiginDegerleri[i] = yiginDegerleri[cocuk]!; yiginAnahtarlari[i] = yiginAnahtarlari[cocuk]!; i = cocuk; } yiginDegerleri[i] = sonDeger; yiginAnahtarlari[i] = sonAnahtar; }
    return v;
  };
  bedel[s] = 0; ekle(s, 0);
  const bitti = new Uint8Array(n);
  while (yiginBoyu) {
    const u = cikar(); if (bitti[u]) continue; bitti[u] = 1; const dugumBedeli = bedel[u]!;
    for (let p = ag.komsuBaslangici[u]! * 3; p < ag.komsuBaslangici[u + 1]! * 3; p += 3) {
      const v = ag.komsular[p]!; if (bitti[v]) continue;
      const komsuBedeli = dugumBedeli + kenarBedeli(ag.komsular[p + 1]!, ag.komsular[p + 2]!, dakika);
      if (komsuBedeli < bedel[v]!) { bedel[v] = komsuBedeli; onceki[v] = ag.komsular[p + 1]!; onceYon[v] = ag.komsular[p + 2]!; ekle(v, komsuBedeli); }
    }
  }
  return { onceki, onceYon };
}

export function matrisKur(ag: YolAgi, noktalar: CozucuNoktasi[], gun: GunTipi): Matris {
  const n = noktalar.length, yolSecenegiSayisi = KAYNAK_SAATLER.length + 2, kenarSuresi = sureFonksiyonu(ag, gun), kenarMesafesi = (e: number) => ag.kenarMetre[e]! / 1000;
  const oran = VARSAYILAN_MALIYET.kamyonet, kenarTlBedeli = (e: number, yon: number) => (ag.kenarMetre[e]! / 1000) * oran.kilometre + (kenarSuresi(e, yon, 690) / 60) * oran.saat;
  const yakin = noktalar.map((s) => enYakinDugum(ag, [s.boylam, s.enlem]));
  const dugum = Int32Array.from(yakin.map((x) => x.dugum)), sokak = Float32Array.from(yakin.map((x) => sokakBaglantisiDakika(x.metre)));
  const ornekSayisi = ORNEK_SAYISI;
  const enHizli = new Float32Array(n * n * ornekSayisi), enKisaSure = new Float32Array(n * n * ornekSayisi), enUcuzSure = new Float32Array(n * n * ornekSayisi), secilen = new Uint8Array(n * n * ornekSayisi);
  const yollar: (Int32Array | null)[] = new Array(n * n * yolSecenegiSayisi).fill(null), metre = new Float32Array(n * n * yolSecenegiSayisi);
  for (let i = 0; i < n; i++) {
    const agaclar = [...KAYNAK_SAATLER.map((d) => agac(ag, dugum[i]!, kenarSuresi, d)), agac(ag, dugum[i]!, kenarMesafesi, 0), agac(ag, dugum[i]!, kenarTlBedeli, 0)];
    for (let j = 0; j < n; j++) {
      const matrisBasi = (i * n + j) * ornekSayisi;
      if (i === j || dugum[i] === dugum[j]) { // aynı düğüm: yalnız sokak bağlantısı
        for (let k = 0; k < ornekSayisi; k++) enUcuzSure[matrisBasi + k] = enKisaSure[matrisBasi + k] = enHizli[matrisBasi + k] = i === j ? 0 : sokak[i]! + sokak[j]!;
        continue;
      }
      const gorulen: string[] = [];
      for (let v = 0; v < yolSecenegiSayisi; v++) {
        const { onceki, onceYon } = agaclar[v]!; if (onceki[dugum[j]!]! < 0) continue;
        const liste: number[] = []; let x = dugum[j]!, yolMetresi = 0;
        while (x !== dugum[i]) { const e = onceki[x]!, y = onceYon[x]!; liste.push(e * 2 + (y === 1 ? 0 : 1)); yolMetresi += ag.kenarMetre[e]!; x = y === 1 ? ag.kenarA[e]! : ag.kenarB[e]!; }
        liste.reverse(); const imza = liste.length + ':' + Math.round(yolMetresi);
        if (v < KISA) { if (gorulen.includes(imza)) continue; gorulen.push(imza); } // en kısa ve en ucuz yol her zaman saklanır
        yollar[(i * n + j) * yolSecenegiSayisi + v] = Int32Array.from(liste); metre[(i * n + j) * yolSecenegiSayisi + v] = yolMetresi;
      }
      for (let k = 0; k < ornekSayisi; k++) {
        let enIyi = Infinity, enIyiYol = 0;
        for (let v = 0; v < yolSecenegiSayisi; v++) {
          const yolDizisi = yollar[(i * n + j) * yolSecenegiSayisi + v]; if (!yolDizisi) continue;
          let t = ILK_DAKIKA + k * ARALIK + sokak[i]!;
          for (let q = 0; q < yolDizisi.length; q++) { const c = yolDizisi[q]!; t += kenarSuresi(c >> 1, c & 1 ? -1 : 1, t); if (v < KISA && t - ILK_DAKIKA - k * ARALIK > enIyi) break; }
          const d = t - (ILK_DAKIKA + k * ARALIK);
          if (v === KISA) enKisaSure[matrisBasi + k] = d + sokak[j]!;
          if (v === UCUZ) enUcuzSure[matrisBasi + k] = d + sokak[j]!;
          if (d < enIyi) { enIyi = d; enIyiYol = v; }
        }
        enHizli[matrisBasi + k] = enIyi + sokak[j]!; secilen[matrisBasi + k] = enIyiYol;
        if (!yollar[(i * n + j) * yolSecenegiSayisi + KISA]) enKisaSure[matrisBasi + k] = enHizli[matrisBasi + k]!;
        if (!yollar[(i * n + j) * yolSecenegiSayisi + UCUZ]) enUcuzSure[matrisBasi + k] = enHizli[matrisBasi + k]!;
      }
    }
  }
  return { noktalar, sira: new Map(noktalar.map((s, i) => [s.anahtar, i])), noktaSayisi: n, secenekSayisi: yolSecenegiSayisi, enHizli, secilen, enKisaSure, enUcuzSure, yollar, metre, gun };
}

// i'den j'ye binek süresi (dakika), t anında çıkış.
function gecis(matris: Matris, i: number, j: number, t: number, tur: YolTuru = false): number {
  if (i === j) return 0;
  const ornekSayisi = ORNEK_SAYISI, kesirliSira = Math.min(ornekSayisi - 1, Math.max(0, (t - ILK_DAKIKA) / ARALIK)), altSira = Math.floor(kesirliSira), ustSira = Math.min(ornekSayisi - 1, altSira + 1), kesir = kesirliSira - altSira, matrisBasi = (i * matris.noktaSayisi + j) * ornekSayisi;
  const sureDizisi = tur === 'ucuz' ? matris.enUcuzSure : tur ? matris.enKisaSure : matris.enHizli;
  return sureDizisi[matrisBasi + altSira]! * (1 - kesir) + sureDizisi[matrisBasi + ustSira]! * kesir;
}
const enKisaKm = (matris: Matris, i: number, j: number) => (i === j ? 0 : matris.metre[(i * matris.noktaSayisi + j) * matris.secenekSayisi + KISA]! / 1000);
const enUcuzKm = (matris: Matris, i: number, j: number) => (i === j ? 0 : (matris.yollar[(i * matris.noktaSayisi + j) * matris.secenekSayisi + UCUZ] ? matris.metre[(i * matris.noktaSayisi + j) * matris.secenekSayisi + UCUZ]! : matris.metre[(i * matris.noktaSayisi + j) * matris.secenekSayisi + KISA]!) / 1000);
function enHizliKm(matris: Matris, i: number, j: number, t: number): number {
  if (i === j) return 0;
  const ornekSayisi = ORNEK_SAYISI, k = Math.min(ornekSayisi - 1, Math.max(0, Math.round((t - ILK_DAKIKA) / ARALIK))), matrisBasi = i * matris.noktaSayisi + j;
  return matris.metre[matrisBasi * matris.secenekSayisi + matris.secilen[matrisBasi * ornekSayisi + k]!]! / 1000;
}
function yolKenarlari(matris: Matris, i: number, j: number, t: number, tur: YolTuru): { kenarlar: KenarAdimi[]; metre: number } | null {
  if (i === j) return null;
  const ornekSayisi = ORNEK_SAYISI, k = Math.min(ornekSayisi - 1, Math.max(0, Math.round((t - ILK_DAKIKA) / ARALIK)));
  const v = tur === 'ucuz' ? UCUZ : tur ? KISA : matris.secilen[(i * matris.noktaSayisi + j) * ornekSayisi + k]!;
  const yolDizisi = matris.yollar[(i * matris.noktaSayisi + j) * matris.secenekSayisi + v] ?? (tur === 'ucuz' ? matris.yollar[(i * matris.noktaSayisi + j) * matris.secenekSayisi + KISA] : null);
  if (!yolDizisi) return null;
  return { kenarlar: Array.from(yolDizisi, (c) => ({ kenar: c >> 1, yon: (c & 1 ? -1 : 1) as 1 | -1 })), metre: matris.metre[(i * matris.noktaSayisi + j) * matris.secenekSayisi + v]! };
}

// Aracın maliyet oranları: girilmeyenler araç türünün varsayılanından.
export function aracOranlari(arac: Pick<CozucuAraci, 'tur' | 'oranlar'>): MaliyetOranlari {
  const v = VARSAYILAN_MALIYET[arac.tur];
  return { kilometre: arac.oranlar.kilometre ?? v.kilometre, saat: arac.oranlar.saat ?? v.saat, gunluk: arac.oranlar.gunluk ?? v.gunluk };
}
// Rota maliyeti (TL): km x TL/km + süre x TL/saat + günlük sabit.
export const rotaMaliyeti = (o: MaliyetOranlari, kilometre: number, dakika: number) => kilometre * o.kilometre + (dakika / 60) * o.saat + o.gunluk;

function tohumluRastgele(tohum: number) {
  let a = tohum >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- çözücü ----------
interface Ziyaret { is: number; alis: boolean; nokta: number } // is = -1: fabrikaya ara dönüş (yeni sefer)
interface Degerlendirme { uygun: boolean; bedel: number; bitis: number; neden?: 'kapasite' | 'zaman' | 'musaitlik' }
interface Cozum { rotalar: Ziyaret[][]; bedeller: number[]; atanamayan: number[]; toplam: number }
const cozumKopyasi = (s: Cozum): Cozum => ({ ...s, rotalar: s.rotalar.map((r) => r.slice()), bedeller: s.bedeller.slice(), atanamayan: s.atanamayan.slice() });

export function filoPlani(ag: YolAgi, fabrika: CozucuNoktasi, noktalar: readonly CozucuNoktasi[], isler: readonly CozucuIsi[], araclar: readonly CozucuAraci[], secenek: FiloSecenegi, oncekiMatris?: Matris): FiloPlani & { matris: Matris } {
  const amac = secenek.amac, kisa = amac === 'mesafe', ucuz = amac === 'maliyet';
  const yinelemeSiniri = secenek.yinelemeSiniri ?? VARSAYILAN_YINELEME;
  const oranBellegi = new Map<CozucuAraci, MaliyetOranlari>();
  const oranOf = (a: CozucuAraci) => { let o = oranBellegi.get(a); if (!o) { o = aracOranlari(a); oranBellegi.set(a, o); } return o; };

  const noktaBul = new Map(noktalar.map((p) => [p.anahtar, p])); noktaBul.set(fabrika.anahtar, fabrika);
  const kullanilan = new Set<string>([fabrika.anahtar]);
  const noktasiz: { is: string; neden: string }[] = [];
  const gecerli: CozucuIsi[] = [];
  for (const is of isler) {
    const gereken = is.tur === 'teslimat' ? [is.birakisNoktasi] : is.tur === 'alim' ? [is.alisNoktasi] : [is.alisNoktasi, is.birakisNoktasi];
    if (gereken.some((x) => !x || !noktaBul.has(x))) { noktasiz.push({ is: is.anahtar, neden: 'Nokta seçilmemiş ya da pasif' }); continue; }
    gereken.forEach((x) => kullanilan.add(x!)); gecerli.push(is);
  }
  const siteler = [...kullanilan].map((a) => noktaBul.get(a)!);
  const matris = oncekiMatris && oncekiMatris.gun === secenek.gun && siteler.every((s) => {
    const i = oncekiMatris.sira.get(s.anahtar); return i !== undefined && oncekiMatris.noktalar[i]!.boylam === s.boylam && oncekiMatris.noktalar[i]!.enlem === s.enlem;
  }) ? oncekiMatris : matrisKur(ag, siteler, secenek.gun);
  const siraNo = (a: string) => matris.sira.get(a)!, fabrikaSirasi = siraNo(fabrika.anahtar);
  const isListesi = gecerli, aracListesi = araclar.slice();
  const ziyaretler: Ziyaret[][] = isListesi.map((is, j) => (is.tur === 'teslimat' ? [{ is: j, alis: false, nokta: siraNo(is.birakisNoktasi!) }]
    : is.tur === 'alim' ? [{ is: j, alis: true, nokta: siraNo(is.alisNoktasi!) }]
    : [{ is: j, alis: true, nokta: siraNo(is.alisNoktasi!) }, { is: j, alis: false, nokta: siraNo(is.birakisNoktasi!) }]));
  // Noktanın süresi güncel girdiden okunur (önbellekteki matris yalnız konum için kullanılır).
  const durakSuresi = (v: Ziyaret) => isListesi[v.is]!.durakSuresiDakika ?? noktaBul.get(matris.noktalar[v.nokta]!.anahtar)!.durakSuresiDakika;
  const pencere = (v: Ziyaret) => (v.alis ? isListesi[v.is]!.alisPenceresi : isListesi[v.is]!.birakisPenceresi) ?? null;
  const araDonusu = (): Ziyaret => ({ is: -1, alis: false, nokta: fabrikaSirasi });
  // Ardışık, baştaki ve sondaki ara dönüşleri temizler.
  const temizle = (ziyaretDizisi: Ziyaret[]) => {
    const temiz: Ziyaret[] = [];
    for (const v of ziyaretDizisi) { if (v.is < 0 && (!temiz.length || temiz[temiz.length - 1]!.is < 0)) continue; temiz.push(v); }
    if (temiz.length && temiz[temiz.length - 1]!.is < 0) temiz.pop();
    return temiz;
  };

  // Bir ayak (araç hızıyla): AS süre, AK km, AY yol türü. Maliyet amacında üç yoldan TL olarak ucuzu seçilir.
  let ayakDakikasi = 0, ayakKilometresi = 0, ayakYolTuru: YolTuru = false;
  const ayak = (a: CozucuAraci, i: number, j: number, t: number) => {
    if (i === j) { ayakDakikasi = 0; ayakKilometresi = 0; ayakYolTuru = false; return; }
    const hizKatsayisi = ARAC_HIZ_KATSAYISI[a.tur];
    if (!ucuz) { ayakDakikasi = gecis(matris, i, j, t, kisa) / hizKatsayisi; ayakKilometresi = kisa ? enKisaKm(matris, i, j) : enHizliKm(matris, i, j, t); ayakYolTuru = kisa; return; }
    const aracOrani = oranOf(a);
    const hizliDakika = gecis(matris, i, j, t) / hizKatsayisi, hizliKilometre = enHizliKm(matris, i, j, t), kisaDakika = gecis(matris, i, j, t, true) / hizKatsayisi, kisaKilometre = enKisaKm(matris, i, j), ucuzDakika = gecis(matris, i, j, t, 'ucuz') / hizKatsayisi, ucuzKilometre = enUcuzKm(matris, i, j);
    const hizliTl = hizliKilometre * aracOrani.kilometre + (hizliDakika / 60) * aracOrani.saat, kisaTl = kisaKilometre * aracOrani.kilometre + (kisaDakika / 60) * aracOrani.saat, ucuzTl = ucuzKilometre * aracOrani.kilometre + (ucuzDakika / 60) * aracOrani.saat;
    if (hizliTl <= kisaTl && hizliTl <= ucuzTl) { ayakDakikasi = hizliDakika; ayakKilometresi = hizliKilometre; ayakYolTuru = false; } else if (kisaTl <= ucuzTl) { ayakDakikasi = kisaDakika; ayakKilometresi = kisaKilometre; ayakYolTuru = true; } else { ayakDakikasi = ucuzDakika; ayakKilometresi = ucuzKilometre; ayakYolTuru = 'ucuz'; }
  };

  // Kurallara bakan değerlendirme: ihlalde uygun değil.
  const degerlendir = (a: CozucuAraci, ziyaretDizisi: Ziyaret[], cikis: number): Degerlendirme => {
    if (!ziyaretDizisi.length) return { uygun: true, bedel: 0, bitis: cikis };
    let t = cikis, bulunulanNokta = fabrikaSirasi, i = 0, seferSayisi = 0, toplamKilometre = 0, surus = 0, bekleme = 0, ertelemePayi = Infinity; // pay: çıkış en çok ne kadar ertelenebilir
    while (i < ziyaretDizisi.length) {
      let seferSonu = i; while (seferSonu < ziyaretDizisi.length && ziyaretDizisi[seferSonu]!.is >= 0) seferSonu++; // [i, e) bir sefer
      if (++seferSayisi > EN_COK_SEFER) return { uygun: false, bedel: Infinity, bitis: 0, neden: 'musaitlik' };
      let yukKilogrami = 0, yukPaleti = 0, teslimatVar = false, alimVar = false, acikAktarma = 0;
      for (let q = i; q < seferSonu; q++) { const is = isListesi[ziyaretDizisi[q]!.is]!; if (is.tur === 'teslimat') { yukKilogrami += is.kilogram; yukPaleti += is.palet; teslimatVar = true; } else if (is.tur === 'alim') alimVar = true; }
      if (yukKilogrami > a.kapasiteKilogram + 1e-6 || yukPaleti > a.kapasitePalet + 1e-6) return { uygun: false, bedel: Infinity, bitis: 0, neden: 'kapasite' };
      if (teslimatVar) t += YUKLEME_DAKIKA;
      for (let q = i; q < seferSonu; q++) {
        const v = ziyaretDizisi[q]!, is = isListesi[v.is]!;
        ayak(a, bulunulanNokta, v.nokta, t); t += ayakDakikasi; surus += ayakDakikasi; toplamKilometre += ayakKilometresi;
        const zamanPenceresi = pencere(v);
        if (zamanPenceresi) {
          if (t < zamanPenceresi[0]) { bekleme += zamanPenceresi[0] - t; t = zamanPenceresi[0]; }
          if (t > zamanPenceresi[1] + 0.01) return { uygun: false, bedel: Infinity, bitis: 0, neden: 'zaman' };
          ertelemePayi = Math.min(ertelemePayi, bekleme + zamanPenceresi[1] - t);
        }
        t += durakSuresi(v);
        if (v.alis) { yukKilogrami += is.kilogram; yukPaleti += is.palet; if (is.tur === 'aktarma') acikAktarma++; }
        else if (is.tur !== 'alim') { yukKilogrami -= is.kilogram; yukPaleti -= is.palet; if (is.tur === 'aktarma') acikAktarma--; }
        if (yukKilogrami > a.kapasiteKilogram + 1e-6 || yukPaleti > a.kapasitePalet + 1e-6) return { uygun: false, bedel: Infinity, bitis: 0, neden: 'kapasite' };
        bulunulanNokta = v.nokta;
      }
      if (acikAktarma) return { uygun: false, bedel: Infinity, bitis: 0, neden: 'kapasite' }; // al-bırak aynı seferde kapanmalı
      ayak(a, bulunulanNokta, fabrikaSirasi, t); t += ayakDakikasi; surus += ayakDakikasi; toplamKilometre += ayakKilometresi; bulunulanNokta = fabrikaSirasi;
      if (alimVar) t += BOSALTMA_DAKIKA;
      i = seferSonu + 1;
    }
    if (t > a.musaitBitis + 0.01) return { uygun: false, bedel: Infinity, bitis: t, neden: 'musaitlik' };
    // Maliyette bekleme için de sürücü ödenir; çıkış ertelenince kalkacak kısmı (pencere sonlarının izin verdiği kadar) düşülür.
    if (ucuz) return { uygun: true, bedel: rotaMaliyeti(oranOf(a), toplamKilometre, t - cikis - Math.max(0, Math.min(bekleme, ertelemePayi))) + 0.001 * surus, bitis: t };
    return {
      uygun: true,
      bedel: kisa ? toplamKilometre + ARAC_BEDELI_KILOMETRE + (seferSayisi - 1) * SEFER_BEDELI_KILOMETRE + 0.01 * surus : surus + BEKLEME_AGIRLIGI * bekleme + ARAC_BEDELI_DAKIKA + (seferSayisi - 1) * SEFER_BEDELI_DAKIKA,
      bitis: t,
    };
  };
  const bedel = (r: number, ziyaretDizisi: Ziyaret[]) => degerlendir(aracListesi[r]!, ziyaretDizisi, aracListesi[r]!.musaitBaslangic).bedel;

  // Bir işi bir rotaya en iyi ekleme: mevcut seferlerin içine ya da yeni sefer olarak sona.
  const enIyiEkleme = (r: number, ziyaretDizisi: Ziyaret[], taban: number, j: number) => {
    const isZiyaretleri = ziyaretler[j]!; let enIyi = Infinity, enIyiDizi: Ziyaret[] | null = null;
    const dene = (yeniDizi: Ziyaret[]) => { const c = bedel(r, yeniDizi); if (c < enIyi) { enIyi = c; enIyiDizi = yeniDizi; } };
    if (isZiyaretleri.length === 1) {
      for (let i = 0; i <= ziyaretDizisi.length; i++) dene([...ziyaretDizisi.slice(0, i), isZiyaretleri[0]!, ...ziyaretDizisi.slice(i)]);
    } else {
      for (let i = 0; i <= ziyaretDizisi.length; i++) for (let k = i; k <= ziyaretDizisi.length; k++) {
        if (ziyaretDizisi.slice(i, k).some((v) => v.is < 0)) break; // alış ve bırakış aynı seferde
        dene([...ziyaretDizisi.slice(0, i), isZiyaretleri[0]!, ...ziyaretDizisi.slice(i, k), isZiyaretleri[1]!, ...ziyaretDizisi.slice(k)]);
      }
    }
    if (ziyaretDizisi.length) dene([...ziyaretDizisi, araDonusu(), ...isZiyaretleri]);
    return { fark: enIyi - taban, dizi: enIyiDizi as Ziyaret[] | null };
  };

  // İhlalde durmayan değerlendirme: elle dizilmiş rotanın çizelgesi ve uyarıları.
  const ayrintili = (a: CozucuAraci, ziyaretDizisi: Ziyaret[], cikis: number) => {
    const duraklar: FiloDuragi[] = [], seferler: Sefer[] = [], uyarilar: string[] = [];
    let t = cikis, bulunulanNokta = fabrikaSirasi, i = 0, seferSayisi = 0;
    while (i < ziyaretDizisi.length) {
      let seferSonu = i; while (seferSonu < ziyaretDizisi.length && ziyaretDizisi[seferSonu]!.is >= 0) seferSonu++;
      seferSayisi++;
      let yukKilogrami = 0, yukPaleti = 0, teslimatVar = false, alimVar = false;
      for (let q = i; q < seferSonu; q++) { const is = isListesi[ziyaretDizisi[q]!.is]!; if (is.tur === 'teslimat') { yukKilogrami += is.kilogram; yukPaleti += is.palet; teslimatVar = true; } else if (is.tur === 'alim') alimVar = true; }
      if (yukKilogrami > a.kapasiteKilogram + 1e-6 || yukPaleti > a.kapasitePalet + 1e-6) uyarilar.push(`${seferSayisi}. sefer yüklemesi kapasiteyi aşıyor: ${yukKilogrami}/${a.kapasiteKilogram} kg, ${yukPaleti}/${a.kapasitePalet} palet`);
      if (teslimatVar) { t += YUKLEME_DAKIKA; if (i > 0 && duraklar.length) { const r = duraklar[duraklar.length - 1]!; r.ayrilis = t; r.yukKilogram = yukKilogrami; r.yukPalet = yukPaleti; } }
      const seferBasi = t - (teslimatVar ? YUKLEME_DAKIKA : 0), ilkKg = yukKilogrami, ilkPalet = yukPaleti, sira: string[] = [], sureler: number[] = [];
      const alinan = new Set<number>();
      for (let q = i; q < seferSonu; q++) {
        const v = ziyaretDizisi[q]!, is = isListesi[v.is]!, uyari: string[] = [];
        ayak(a, bulunulanNokta, v.nokta, t); t += ayakDakikasi; const varis = t;
        const zamanPenceresi = pencere(v); let beklemeDakikasi = 0;
        if (zamanPenceresi) { if (t < zamanPenceresi[0]) { beklemeDakikasi = zamanPenceresi[0] - t; t = zamanPenceresi[0]; } else if (t > zamanPenceresi[1] + 0.01) uyari.push(`Geç kalıyor: ${saatMetni(t)} (pencere ${saatMetni(zamanPenceresi[0])}-${saatMetni(zamanPenceresi[1])})`); }
        const baslama = t; t += durakSuresi(v);
        if (v.alis) { yukKilogrami += is.kilogram; yukPaleti += is.palet; alinan.add(v.is); }
        else if (is.tur !== 'alim') { yukKilogrami -= is.kilogram; yukPaleti -= is.palet; if (is.tur === 'aktarma' && !alinan.has(v.is)) uyari.push('Önce alınmalı: aynı seferde alış bırakıştan önce gelmeli'); }
        if (v.alis && is.tur === 'aktarma' && !ziyaretDizisi.slice(q + 1, seferSonu).some((x) => x.is === v.is && !x.alis)) uyari.push('Bırakış aynı seferde değil');
        if (yukKilogrami > a.kapasiteKilogram + 1e-6 || yukPaleti > a.kapasitePalet + 1e-6) uyari.push(`Kapasite aşılıyor: araçta ${yukKilogrami}/${a.kapasiteKilogram} kg, ${yukPaleti}/${a.kapasitePalet} palet`);
        duraklar.push({ is: is.anahtar, alis: v.alis, nokta: matris.noktalar[v.nokta]!.anahtar, varis, bekleme: beklemeDakikasi, baslama, ayrilis: t, yukKilogram: yukKilogrami, yukPalet: yukPaleti, uyarilar: uyari });
        const noktaAnahtari = matris.noktalar[v.nokta]!.anahtar;
        if (sira[sira.length - 1] !== noktaAnahtari) { sira.push(noktaAnahtari); sureler.push(durakSuresi(v)); } else sureler[sureler.length - 1]! += durakSuresi(v);
        bulunulanNokta = v.nokta;
      }
      ayak(a, bulunulanNokta, fabrikaSirasi, t); t += ayakDakikasi; bulunulanNokta = fabrikaSirasi; const donus = t;
      if (alimVar) t += BOSALTMA_DAKIKA;
      seferler.push({ baslangic: seferBasi, cikis: seferBasi + (teslimatVar ? YUKLEME_DAKIKA : 0), bitis: t, noktalar: sira, durakSureleri: sureler, yukKilogram: ilkKg, yukPalet: ilkPalet });
      if (seferSonu < ziyaretDizisi.length) duraklar.push({ is: null, alis: false, nokta: fabrika.anahtar, varis: donus, bekleme: 0, baslama: donus, ayrilis: t, yukKilogram: 0, yukPalet: 0, uyarilar: [] });
      i = seferSonu + 1;
    }
    if (seferSayisi > EN_COK_SEFER) uyarilar.push(`En çok ${EN_COK_SEFER} sefer yapılabilir (${seferSayisi})`);
    if (t > a.musaitBitis + 0.01) uyarilar.push(`Müsaitlik aşılıyor: dönüş ${saatMetni(t)}, araç ${saatMetni(a.musaitBitis)} saatine kadar müsait`);
    return { duraklar, seferler, bitis: t, uyarilar };
  };

  const CEZA = 100000;
  const toplamBedel = (s: Cozum) => s.bedeller.reduce((x, y) => x + (Number.isFinite(y) ? y : 1e7), 0) + s.atanamayan.length * CEZA;
  const rastgele = tohumluRastgele(secenek.tohum ?? 7);
  const kip = secenek.kip, kilitli = new Set(secenek.kilitliAraclar ?? []);
  const kabulEder = (r: number) => kip !== 'degerlendir' && !kilitli.has(aracListesi[r]!.anahtar);

  const hepsiniEkle = (s: Cozum, havuz: number[], gurultu: number) => {
    const kalan = havuz.slice();
    while (kalan.length) {
      let secilenSira = -1, secPuan = -Infinity, secilenRota = -1, secilenDizi: Ziyaret[] | null = null;
      for (let kalanSirasi = 0; kalanSirasi < kalan.length; kalanSirasi++) {
        const j = kalan[kalanSirasi]!; let enIyiFark = Infinity, ikinciFark = Infinity, enIyiRota = -1, enIyiDizi: Ziyaret[] | null = null;
        const sabit = isListesi[j]!.sabitArac;
        for (let r = 0; r < aracListesi.length; r++) {
          if (sabit && aracListesi[r]!.anahtar !== sabit) continue;
          if (!kabulEder(r) || !Number.isFinite(s.bedeller[r]!)) continue;
          const x = enIyiEkleme(r, s.rotalar[r]!, s.bedeller[r]!, j); if (!x.dizi) continue;
          const d = x.fark * (1 + gurultu * (rastgele() - 0.5));
          if (d < enIyiFark) { ikinciFark = enIyiFark; enIyiFark = d; enIyiRota = r; enIyiDizi = x.dizi; } else if (d < ikinciFark) ikinciFark = d;
        }
        if (enIyiRota < 0) { s.atanamayan.push(j); kalan.splice(kalanSirasi, 1); kalanSirasi--; continue; }
        const puan = (ikinciFark === Infinity ? 1e6 : ikinciFark - enIyiFark) - enIyiFark * 0.001;
        if (puan > secPuan) { secPuan = puan; secilenSira = kalanSirasi; secilenRota = enIyiRota; secilenDizi = enIyiDizi; }
      }
      if (secilenSira < 0) break;
      s.rotalar[secilenRota] = secilenDizi!; s.bedeller[secilenRota] = bedel(secilenRota, secilenDizi!); kalan.splice(secilenSira, 1);
    }
    s.toplam = toplamBedel(s);
  };

  // Başlangıç: elle dizilmiş rotalar (kipe göre korunan ya da baştan dağıtılan).
  const isSirasi = new Map(isListesi.map((is, j) => [is.anahtar, j]));
  const sabitlenen = new Set<number>(), yerlesen = new Set<number>(), gorulen = new Set<string>();
  let mevcutCozum: Cozum = { rotalar: aracListesi.map(() => []), bedeller: aracListesi.map(() => 0), atanamayan: [], toplam: 0 };
  for (const rota of secenek.baslangic ?? []) {
    const r = aracListesi.findIndex((t) => t.anahtar === rota.arac); if (r < 0) continue;
    if (kip === 'dagit' && !kilitli.has(rota.arac)) continue;
    const vs: Ziyaret[] = [];
    for (const o of rota.ogeler) {
      if ('araDonus' in o) { vs.push(araDonusu()); continue; }
      const j = isSirasi.get(o.is); if (j === undefined) continue;
      const v = ziyaretler[j]!.find((x) => x.alis === o.alis) ?? ziyaretler[j]![0]!, anahtar = j + ':' + v.alis;
      if (gorulen.has(anahtar)) continue;
      gorulen.add(anahtar); vs.push(v); yerlesen.add(j); sabitlenen.add(j);
    }
    // Al-bırak işinin rotada olmayan ucu eklenir: alış önce, bırakış sonra.
    for (const j of new Set(vs.filter((v) => v.is >= 0).map((v) => v.is))) for (const v of ziyaretler[j]!) {
      const anahtar = j + ':' + v.alis; if (gorulen.has(anahtar)) continue; gorulen.add(anahtar);
      if (v.alis) vs.splice(vs.findIndex((x) => x.is === j), 0, v); else vs.push(v);
    }
    mevcutCozum.rotalar[r] = temizle(vs); mevcutCozum.bedeller[r] = bedel(r, mevcutCozum.rotalar[r]!);
  }
  const tasinabilir = (j: number) => !sabitlenen.has(j);
  // Zor işler önce: ağır, dar pencereli, al-bırak.
  const sira = isListesi.map((_, j) => j).filter((j) => !yerlesen.has(j)).sort((a, b) => isZorlugu(isListesi[b]!) - isZorlugu(isListesi[a]!));
  const ilk = cozumKopyasi(mevcutCozum);
  if (kip !== 'degerlendir') hepsiniEkle(mevcutCozum, sira, 0); else mevcutCozum.toplam = toplamBedel(mevcutCozum);
  let enIyi = cozumKopyasi(mevcutCozum), yineleme = 0;
  const konumu = (j: number) => { const s = matris.noktalar[ziyaretler[j]![ziyaretler[j]!.length - 1]!.nokta]!; return [s.boylam, s.enlem] as const; };
  const ilkSicaklik = ucuz ? 40 : 8; let sicaklik = ilkSicaklik, durgun = 0, yenidenBaslama = 0;
  const tasinabilirVar = isListesi.some((_, j) => tasinabilir(j));
  while (kip !== 'degerlendir' && tasinabilirVar && isListesi.length > 1 && aracListesi.length && yineleme < yinelemeSiniri) {
    yineleme++;
    const aday = cozumKopyasi(mevcutCozum);
    const atanan = isListesi.map((_, j) => j).filter((j) => !aday.atanamayan.includes(j) && tasinabilir(j));
    const k = Math.max(1, Math.min(atanan.length, 1 + Math.floor(rastgele() * Math.min(8, Math.ceil(isListesi.length / 2)))));
    let cikan: number[] = [];
    const secim = rastgele();
    if (secim < 0.15 && aday.rotalar.some((r) => r.some((v) => v.is >= 0 && tasinabilir(v.is)))) { // bir aracın bütün işleri: araç sayısını azaltır
      const dolu = aday.rotalar.map((r, i) => [r.filter((v) => v.is >= 0 && tasinabilir(v.is)).length, i] as const).filter(([isSayisi]) => isSayisi > 0);
      const [, rotaSirasi] = dolu[Math.floor(rastgele() * dolu.length)]!;
      cikan = [...new Set(aday.rotalar[rotaSirasi]!.filter((v) => v.is >= 0 && tasinabilir(v.is)).map((v) => v.is))];
    } else if (secim < 0.6 && atanan.length) { // ilişkili: yakın noktalar
      const tohum = atanan[Math.floor(rastgele() * atanan.length)]!, [tohumBoylami, tohumEnlemi] = konumu(tohum);
      cikan = atanan.slice().sort((a, b) => { const [ilkBoylam, ilkEnlem] = konumu(a), [ikinciBoylam, ikinciEnlem] = konumu(b); return Math.hypot(ilkBoylam - tohumBoylami, ilkEnlem - tohumEnlemi) - Math.hypot(ikinciBoylam - tohumBoylami, ikinciEnlem - tohumEnlemi); }).slice(0, k);
    } else { const havuz = atanan.slice(); while (cikan.length < k && havuz.length) cikan.push(havuz.splice(Math.floor(rastgele() * havuz.length), 1)[0]!); }
    cikan.push(...aday.atanamayan); aday.atanamayan = [];
    for (let r = 0; r < aday.rotalar.length; r++) { const once = aday.rotalar[r]!.length; aday.rotalar[r] = temizle(aday.rotalar[r]!.filter((v) => !cikan.includes(v.is))); if (aday.rotalar[r]!.length !== once) aday.bedeller[r] = bedel(r, aday.rotalar[r]!); }
    for (let i = cikan.length - 1; i > 0; i--) { const q = Math.floor(rastgele() * (i + 1)); [cikan[i], cikan[q]] = [cikan[q]!, cikan[i]!]; }
    hepsiniEkle(aday, cikan, 0.3);
    if (aday.toplam < mevcutCozum.toplam - 1e-6 || rastgele() < Math.exp(-(aday.toplam - mevcutCozum.toplam) / Math.max(0.01, sicaklik))) mevcutCozum = aday;
    if (mevcutCozum.toplam < enIyi.toplam - 1e-6) { enIyi = cozumKopyasi(mevcutCozum); durgun = 0; } else durgun++;
    sicaklik *= 0.995;
    if (durgun > 250) { // takıldı: bir kez en iyiden yeniden ısıt, bir kez rastgele sırayla sıfırdan kur
      yenidenBaslama++; durgun = 0; sicaklik = ilkSicaklik * 1.5;
      if (yenidenBaslama % 2) mevcutCozum = cozumKopyasi(enIyi);
      else {
        const yeniCozum = cozumKopyasi(ilk), o = sira.slice();
        for (let q = o.length - 1; q > 0; q--) { const x = Math.floor(rastgele() * (q + 1)); [o[q], o[x]] = [o[x]!, o[q]!]; }
        hepsiniEkle(yeniCozum, o, 0.6); mevcutCozum = yeniCozum; if (mevcutCozum.toplam < enIyi.toplam - 1e-6) enIyi = cozumKopyasi(mevcutCozum);
      }
    }
  }

  // Son rötuş: her seferde durak sırası; 8 durağa kadar bütün sıralar, üstünde taşıma araması.
  const kesin: boolean[] = aracListesi.map(() => false);
  if (kip === 'dagit') aracListesi.forEach((a, r) => {
    if (kilitli.has(a.anahtar) || !enIyi.rotalar[r]!.length || !Number.isFinite(enIyi.bedeller[r]!)) return;
    const seferler: Ziyaret[][] = [[]]; for (const v of enIyi.rotalar[r]!) { if (v.is < 0) seferler.push([]); else seferler[seferler.length - 1]!.push(v); }
    const birlestir = (seferListesi: Ziyaret[][]) => seferListesi.flatMap((x, k) => (k ? [araDonusu(), ...x] : x));
    let enIyiBedel = enIyi.bedeller[r]!;
    seferler.forEach((sefer, seferSirasi) => {
      if (sefer.length < 2) return;
      const ileBirlikte = (x: Ziyaret[]) => birlestir(seferler.map((y, k) => (k === seferSirasi ? x : y)));
      let enIyiSefer = sefer;
      if (sefer.length <= 8) {
        const yol: Ziyaret[] = [], kullanildi = new Array<boolean>(sefer.length).fill(false);
        const ara = () => {
          if (yol.length === sefer.length) { const c = bedel(r, ileBirlikte(yol)); if (c < enIyiBedel - 1e-6) { enIyiBedel = c; enIyiSefer = yol.slice(); } return; }
          for (let q = 0; q < sefer.length; q++) {
            if (kullanildi[q]) continue; const v = sefer[q]!;
            if (!v.alis && isListesi[v.is]!.tur === 'aktarma' && !yol.some((x) => x.is === v.is && x.alis)) continue; // önce al
            kullanildi[q] = true; yol.push(v); ara(); yol.pop(); kullanildi[q] = false;
          }
        };
        ara();
      } else {
        for (let iyilesti = true; iyilesti;) {
          iyilesti = false;
          for (let kaldirilan = 0; kaldirilan < enIyiSefer.length; kaldirilan++) for (let eklenecekYer = 0; eklenecekYer < enIyiSefer.length; eklenecekYer++) {
            if (kaldirilan === eklenecekYer) continue; const denenenSefer = enIyiSefer.slice(); const [x] = denenenSefer.splice(kaldirilan, 1); denenenSefer.splice(eklenecekYer, 0, x!);
            const c = bedel(r, ileBirlikte(denenenSefer)); if (c < enIyiBedel - 1e-6) { enIyiBedel = c; enIyiSefer = denenenSefer; iyilesti = true; }
          }
        }
      }
      seferler[seferSirasi] = enIyiSefer;
    });
    enIyi.rotalar[r] = birlestir(seferler); enIyi.bedeller[r] = bedel(r, enIyi.rotalar[r]!);
    kesin[r] = seferler.every((x) => x.length <= 8);
  });

  // Sonuç: çıkış saati müsaitlik içinde 15 dk adımlarla kaydırılır (bekleme ve trafik azalır); ayrıntı.
  const rotalar: FiloRotasi[] = [];
  enIyi.rotalar.forEach((vs, r) => {
    if (!vs.length) return;
    const a = aracListesi[r]!, ilkDeger = degerlendir(a, vs, a.musaitBaslangic);
    let cikis = a.musaitBaslangic, sure = ilkDeger.bitis - a.musaitBaslangic;
    if (ilkDeger.uygun) {
      for (let s = a.musaitBaslangic + 15; s <= a.musaitBitis; s += 15) { const d = degerlendir(a, vs, s); if (!d.uygun) continue; if (d.bitis - s < sure - 0.5) { sure = d.bitis - s; cikis = s; } }
    }
    const { duraklar, seferler, bitis, uyarilar } = ayrintili(a, vs, cikis);
    let t = seferler[0]!.baslangic + (seferler[0]!.yukKilogram + seferler[0]!.yukPalet > 0 ? YUKLEME_DAKIKA : 0), oncekiNokta = fabrikaSirasi, surus = 0, toplamKilometre = 0;
    const ayaklar: FiloRotasi['ayaklar'] = [];
    [...vs.map((v) => v.nokta), fabrikaSirasi].forEach((nokta, i) => {
      ayak(a, oncekiNokta, nokta, t); const d = ayakDakikasi, tur = ayakYolTuru; surus += d;
      const y = yolKenarlari(matris, oncekiNokta, nokta, t, tur); if (y) { ayaklar.push(y); toplamKilometre += y.metre / 1000; }
      t = i < duraklar.length ? duraklar[i]!.ayrilis : t + d; oncekiNokta = nokta;
    });
    const icindekiler = vs.filter((v) => v.is >= 0).map((v) => isListesi[v.is]!);
    rotalar.push({
      arac: a.anahtar, cikis, donus: bitis,
      yuklemeDakika: icindekiler.some((x) => x.tur === 'teslimat') ? YUKLEME_DAKIKA : 0, bosaltmaDakika: icindekiler.some((x) => x.tur === 'alim') ? BOSALTMA_DAKIKA : 0,
      enCokKilogram: Math.max(...seferler.map((x) => x.yukKilogram), ...duraklar.map((d) => d.yukKilogram)),
      enCokPalet: Math.max(...seferler.map((x) => x.yukPalet), ...duraklar.map((d) => d.yukPalet)),
      duraklar, surusDakika: surus, beklemeDakika: duraklar.reduce((x, d) => x + d.bekleme, 0), kilometre: toplamKilometre, ayaklar, seferler,
      uyarilar, kurallaraUygun: !uyarilar.length && duraklar.every((d) => !d.uyarilar.length), kesin: kesin[r]!,
      maliyet: rotaMaliyeti(oranOf(a), toplamKilometre, bitis - cikis), oranlar: oranOf(a),
    });
  });
  // Atanamayan işler ve nedeni.
  const atanamayan = [...noktasiz];
  for (const j of kip === 'degerlendir' ? [] : enIyi.atanamayan) {
    const is = isListesi[j]!, adaylar = is.sabitArac ? aracListesi.filter((t) => t.anahtar === is.sabitArac) : aracListesi;
    const nedenler = adaylar.map((a) => degerlendir(a, ziyaretler[j]!, a.musaitBaslangic).neden);
    const sigar = adaylar.some((a) => is.kilogram <= a.kapasiteKilogram && is.palet <= a.kapasitePalet);
    const neden = is.sabitArac && !adaylar.length ? 'Sabitlendiği araç pasif ya da yok'
      : !aracListesi.length ? 'Aktif araç yok'
      : !sigar ? (is.sabitArac ? 'Sabitlendiği aracın kapasitesi yetmiyor' : 'Hiçbir aracın kapasitesi yetmiyor')
      : nedenler.every((x) => x === 'zaman' || x === 'kapasite') ? 'Zaman penceresine yetişilemiyor'
      : nedenler.some((x) => !x) ? 'Araçlar dolu ya da müsaitlik süresi yetmiyor' : 'Müsaitlik süresi yetmiyor';
    atanamayan.push({ is: is.anahtar, neden });
  }
  return {
    rotalar, atanamayan,
    toplamDakika: rotalar.reduce((x, r) => x + (r.donus - r.cikis), 0), surusDakika: rotalar.reduce((x, r) => x + r.surusDakika, 0),
    kilometre: rotalar.reduce((x, r) => x + r.kilometre, 0), kullanilanArac: rotalar.length, maliyet: rotalar.reduce((x, r) => x + r.maliyet, 0),
    gun: secenek.gun, amac, yineleme, matris: matris,
  };
}

function isZorlugu(is: CozucuIsi): number {
  const pencereDarligi = (x: [number, number] | null) => (x ? 600 - Math.min(600, x[1] - x[0]) : 0);
  return is.kilogram / 50 + is.palet * 20 + pencereDarligi(is.alisPenceresi) + pencereDarligi(is.birakisPenceresi) + (is.tur === 'aktarma' ? 150 : 0);
}
