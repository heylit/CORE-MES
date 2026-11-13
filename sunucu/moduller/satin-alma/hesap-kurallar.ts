// Teklif karşılaştırma hesabı: saf fonksiyonlar; veritabanı ve saat yok. Ekranın karar destek hesabının (merkez/calc.ts) sunucudaki
// karşılığıdır (1094 b): onaya, siparişe ve rapora giden sayı tek yerde hesaplanır. Kalem ayrıntısı 1099 a ile gelir.
import { vadeIndirimCarpani } from '#paylasilan/sozlesme/finans.ts';
import type { Teklif } from '#paylasilan/sozlesme/satin-alma.ts';

export type Kriter = 'maliyet' | 'termin' | 'tedarikci' | 'garanti';
export type Agirliklar = Readonly<Record<Kriter, number>>;

export interface HesapKalemi { id: string; miktar: string | null }
export type HesapTeklifi = Pick<Teklif, 'id' | 'firmaId' | 'paraBirimi' | 'kur' | 'iskontoYuzdesi' | 'nakliye' | 'digerMasraf' | 'nakliyeDahil'
  | 'terminGun' | 'vadeGun' | 'avansYuzdesi' | 'garantiAy' | 'teknikUygun' | 'fiyatlar'>;

export interface HesapOrtami {
  // Teklifin hesapta kullanılacak kuru (TRY için 1); bilinmiyorsa boş ve teklif karşılaştırmaya girmez (kur uydurulmaz).
  kur: (q: HesapTeklifi) => number | null;
  // Para biriminin aylık faiz yüzdesi; finansta yoksa boş: vade hesaba katılmaz ve bu söylenir.
  aylikFaiz: (paraBirimi: string) => number | null;
  agirliklar: Agirliklar;
  ihtiyacTarihi: string | null;
  // Gecikmenin sayıldığı gün: sipariş verildiyse sipariş günü, değilse bugün.
  bazTarih: string;
  // Tedarikçi başarımı 0-100; bilinmiyorsa null (orta puan uydurulmaz, 2157).
  tedarikciPuani: (firmaId: number | null) => number | null;
}

// Ekranla aynı eşikler: ihtiyaç tarihinden her gecikme günü 100/15 puan, ihtiyaç tarihi yoksa en kısa termine göre her fazla gün
// 100/30 puan düşer; garanti 12 aya kadar orantılıdır. Kalem bölme 12 teklife kadar tam arar.
export const GECIKME_SIFIR_GUN = 15;
export const YAYILMA_SIFIR_GUN = 30;
export const GARANTI_TAVANI_AY = 12;
export const BOLME_HAVUZU = 12;
export const NOTR_TEDARIKCI_PUANI = 60;

const sayi = (d: string | null | undefined): number | null => (d === null || d === undefined || d === '' ? null : Number(d));
const kirp = (x: number, alt: number, ust: number): number => Math.min(ust, Math.max(alt, x));
const GUN_MS = 86_400_000;
const gunFarki = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / GUN_MS);
const gunEkle = (t: string, g: number): string => new Date(Date.parse(`${t}T00:00:00Z`) + g * GUN_MS).toISOString().slice(0, 10);

export interface SatirHesabi {
  kalemId: string;
  birimFiyat: number;
  // En az miktar kalem miktarından büyükse alınacak miktar odur.
  alinanMiktar: number;
  // Teklif para biriminde, satır ve genel iskonto sonrası.
  tutar: number;
  // TL, iskonto, kur ve vade sonrası (bugünkü değer).
  bugunkuDegerTl: number;
  termin: number | null;
}
export interface TeklifHesabi {
  teklifId: string;
  kur: number | null;
  araToplam: number;
  net: number;
  nakliye: number;
  digerMasraf: number;
  toplam: number;
  tlToplam: number | null;
  carpan: number;
  bugunkuDeger: number | null;
  vadeKazanci: number | null;
  // Vadeli teklifte para biriminin faizi finansta yoksa vade hesaba katılmamıştır.
  vadeHesabaKatilmadi: boolean;
  kapsanan: number;
  satirlar: SatirHesabi[];
  // Kapsanan satırların en geç termini; hiç termin yoksa boş.
  termin: number | null;
}

// Kademeli fiyat (2975): alınan miktarın düştüğü en yüksek basamağın fiyatı; basamak yoksa ya da miktar ilk üst basamağın altındaysa
// taban fiyat. Veritabanındaki satin_alma_etkin_birim_fiyat ile aynı seçimdir: onay basamağını belirleyen tutar siparişin tutarıdır.
export function etkinBirimFiyat(f: Pick<HesapTeklifi['fiyatlar'][number], 'birimFiyat' | 'basamaklar'>, alinanMiktar: number): number {
  let esik = -Infinity;
  let fiyat = Number(f.birimFiyat);
  for (const b of f.basamaklar ?? []) {
    const e = Number(b.esik);
    if (e <= alinanMiktar && e > esik) { esik = e; fiyat = Number(b.birimFiyat); }
  }
  return fiyat;
}

// SAT-13 ile aynı formül (satin_alma_teklif_toplami): satır iskontosu genel iskontodan önce; nakliye fiyata dahil değilse eklenir.
export function teklifHesabi(q: HesapTeklifi, kalemler: readonly HesapKalemi[], o: Pick<HesapOrtami, 'kur' | 'aylikFaiz'>): TeklifHesabi {
  const kur = q.paraBirimi === 'TRY' ? 1 : o.kur(q);
  const genel = kirp((sayi(q.iskontoYuzdesi) ?? 0) / 100, 0, 1);
  const faiz = o.aylikFaiz(q.paraBirimi);
  const avans = kirp((sayi(q.avansYuzdesi) ?? 0) / 100, 0, 1);
  const vadeli = q.vadeGun > 0 && avans < 1;
  // 1383 a: vadeli kısım basit faizle, 365 günlük yılla indirgenir (finansmanın tek tanımı).
  const carpan = avans + (1 - avans) * vadeIndirimCarpani(faiz ?? 0, q.vadeGun);
  const fiyat = new Map(q.fiyatlar.map((f) => [f.kalemId, f]));
  const ham: { kalemId: string; birimFiyat: number; alinanMiktar: number; satirTutari: number; termin: number | null }[] = [];
  for (const k of kalemler) {
    const f = fiyat.get(k.id);
    if (f === undefined) continue;
    const alinanMiktar = Math.max(sayi(k.miktar) ?? 0, sayi(f.enAzMiktar) ?? 0);
    const birimFiyat = etkinBirimFiyat(f, alinanMiktar);
    const satir = kirp((sayi(f.iskontoYuzdesi) ?? 0) / 100, 0, 1);
    ham.push({ kalemId: k.id, birimFiyat, alinanMiktar, satirTutari: birimFiyat * alinanMiktar * (1 - satir), termin: f.terminGun ?? q.terminGun });
  }
  const araToplam = ham.reduce((t, x) => t + x.satirTutari, 0);
  const net = araToplam * (1 - genel);
  const nakliye = q.nakliyeDahil ? 0 : Number(q.nakliye);
  const digerMasraf = Number(q.digerMasraf);
  const toplam = net + nakliye + digerMasraf;
  const tlToplam = kur === null ? null : toplam * kur;
  const bugunkuDeger = tlToplam === null ? null : tlToplam * carpan;
  const terminler = ham.flatMap((x) => (x.termin === null ? [] : [x.termin]));
  return {
    teklifId: q.id, kur, araToplam, net, nakliye, digerMasraf, toplam, tlToplam, carpan, bugunkuDeger,
    vadeKazanci: tlToplam === null || bugunkuDeger === null ? null : tlToplam - bugunkuDeger,
    vadeHesabaKatilmadi: vadeli && faiz === null,
    kapsanan: ham.length,
    satirlar: ham.map((x) => ({
      kalemId: x.kalemId, birimFiyat: x.birimFiyat, alinanMiktar: x.alinanMiktar, tutar: x.satirTutari * (1 - genel),
      bugunkuDegerTl: kur === null ? Number.NaN : x.satirTutari * (1 - genel) * kur * carpan, termin: x.termin,
    })),
    termin: terminler.length > 0 ? Math.max(...terminler) : null,
  };
}

export interface DegerlendirmeSatiri {
  hesap: TeklifHesabi;
  firmaId: number | null;
  // Karşılaştırmaya girmeyen teklifin nedeni; giren teklifte boş.
  disarida: 'teknik' | 'kursuz' | 'fiyatsiz' | null;
  // Eksik kalemler en pahalı teklifin bedeliyle doldurulur: eksik teklif ucuz görünmesin.
  dolgu: number;
  puanDegeri: number;
  // Tedarikçi başarımı ve termin bilinmeyebilir; maliyet ve garanti her zaman hesaplanır.
  kriterPuani: Record<Exclude<Kriter, 'tedarikci' | 'termin'>, number> & { tedarikci: number | null; termin: number | null };
  pay: Record<Kriter, number>;
  puan: number;
  gecikme: number | null;
  tumKalemler: boolean;
}
export interface BolmePlani {
  atama: { kalemId: string; teklifId: string }[];
  mal: number;
  masraf: number;
  toplam: number;
}
export interface Degerlendirme {
  satirlar: DegerlendirmeSatiri[];
  // Karşılaştırmaya girenler; bütün kalemlere teklif verenler önce, sonra puan.
  sira: string[];
  oneri: string | null;
  bolme: { plan: BolmePlani; tekToplam: number | null; kazanc: number | null; onerilir: boolean } | null;
}

const sifir = (): Record<Kriter, number> => ({ maliyet: 0, termin: 0, tedarikci: 0, garanti: 0 });

export function gecikmeGunuHesabi(termin: number | null, ihtiyacTarihi: string | null, bazTarih: string): number | null {
  if (ihtiyacTarihi === null || termin === null) return null;
  const g = gunFarki(ihtiyacTarihi, gunEkle(bazTarih, termin));
  return g > 0 ? g : null;
}

// Termini girilmemiş teklifte ölçüt bilinmez (null): en kötü termin sayılmaz, ağırlığı bilinen ölçütlere dağılır (tedarikçi puanı gibi).
export function terminPuani(termin: number | null, enKisa: number, o: Pick<HesapOrtami, 'ihtiyacTarihi' | 'bazTarih'>): number | null {
  if (termin === null) return null;
  if (o.ihtiyacTarihi !== null) return kirp(100 - ((gecikmeGunuHesabi(termin, o.ihtiyacTarihi, o.bazTarih) ?? 0) * 100) / GECIKME_SIFIR_GUN, 0, 100);
  return kirp(100 - ((termin - enKisa) * 100) / YAYILMA_SIFIR_GUN, 0, 100);
}

// Kalem bazlı dağılım: kalem kümedeki en ucuz teklife atanır; kullanılan her teklifin nakliye ve masrafı bir kez, tam eklenir.
// Nakliye yüzünden "her kalemde en ucuz" yanıltabildiği için tedarikçi alt kümeleri tam aranır.
function masrafBugunkuDegeri(h: TeklifHesabi): number {
  return h.kur === null ? Number.POSITIVE_INFINITY : (h.nakliye + h.digerMasraf) * h.kur * h.carpan;
}
export function planMaliyeti(kalemler: readonly HesapKalemi[], hesaplar: readonly TeklifHesabi[], atama: ReadonlyMap<string, string>): BolmePlani | null {
  let mal = 0;
  const kullanilan = new Set<string>();
  for (const k of kalemler) {
    const h = hesaplar.find((x) => x.teklifId === atama.get(k.id));
    const s = h?.satirlar.find((x) => x.kalemId === k.id);
    if (h === undefined || s === undefined || Number.isNaN(s.bugunkuDegerTl)) return null;
    mal += s.bugunkuDegerTl;
    kullanilan.add(h.teklifId);
  }
  const masraf = hesaplar.filter((h) => kullanilan.has(h.teklifId)).reduce((t, h) => t + masrafBugunkuDegeri(h), 0);
  return { atama: kalemler.map((k) => ({ kalemId: k.id, teklifId: atama.get(k.id)! })), mal, masraf, toplam: mal + masraf };
}
export function enIyiBolme(kalemler: readonly HesapKalemi[], hesaplar: readonly TeklifHesabi[]): BolmePlani | null {
  const havuz = hesaplar.length <= BOLME_HAVUZU ? [...hesaplar]
    : [...hesaplar].sort((a, b) => b.kapsanan - a.kapsanan || (a.bugunkuDeger ?? Infinity) - (b.bugunkuDeger ?? Infinity)).slice(0, BOLME_HAVUZU);
  let enIyi: BolmePlani | null = null;
  for (let maske = 1; maske < 1 << havuz.length; maske++) {
    const kume = havuz.filter((_, i) => maske & (1 << i));
    const atama = new Map<string, string>();
    let tam = true;
    for (const k of kalemler) {
      let secilen: string | null = null;
      let enAz = Number.POSITIVE_INFINITY;
      for (const h of kume) {
        const s = h.satirlar.find((x) => x.kalemId === k.id);
        if (s !== undefined && s.bugunkuDegerTl < enAz) { enAz = s.bugunkuDegerTl; secilen = h.teklifId; }
      }
      if (secilen === null) { tam = false; break; }
      atama.set(k.id, secilen);
    }
    if (!tam) continue;
    const p = planMaliyeti(kalemler, hesaplar, atama);
    if (p !== null && (enIyi === null || p.toplam < enIyi.toplam - 1e-9)) enIyi = p;
  }
  return enIyi;
}

// Bir vadeli teklifin para biriminde faiz yoksa o teklif indirgenemez; ötekiler indirgenirse vade yalnız onlara avantaj olur.
// Karşılaştırma eşit tabanda kalsın diye o durumda hiçbir teklif indirgenmez (her biri vadeHesabaKatilmadi ile söylenir).
export function esitVadeOrtami<T extends Pick<HesapOrtami, 'aylikFaiz'>>(teklifler: readonly Pick<HesapTeklifi, 'paraBirimi' | 'vadeGun' | 'avansYuzdesi'>[], o: T): T {
  const eksik = teklifler.some((q) => q.vadeGun > 0 && (sayi(q.avansYuzdesi) ?? 0) < 100 && o.aylikFaiz(q.paraBirimi) === null);
  return eksik ? { ...o, aylikFaiz: () => null } : o;
}

export function degerlendir(kalemler: readonly HesapKalemi[], teklifler: readonly HesapTeklifi[], o: HesapOrtami): Degerlendirme {
  const satirlar: DegerlendirmeSatiri[] = teklifler.map((q) => {
    const hesap = teklifHesabi(q, kalemler, o);
    const disarida = !q.teknikUygun ? 'teknik' : hesap.kur === null ? 'kursuz' : hesap.kapsanan === 0 ? 'fiyatsiz' : null;
    return { hesap, firmaId: q.firmaId, disarida, dolgu: 0, puanDegeri: 0, kriterPuani: sifir(), pay: sifir(), puan: 0, gecikme: null, tumKalemler: hesap.kapsanan === kalemler.length };
  });
  const uygun = satirlar.filter((x) => x.disarida === null);
  const enPahali = new Map<string, number>();
  for (const k of kalemler) for (const x of uygun) {
    const s = x.hesap.satirlar.find((y) => y.kalemId === k.id);
    if (s !== undefined && (enPahali.get(k.id) ?? -Infinity) < s.bugunkuDegerTl) enPahali.set(k.id, s.bugunkuDegerTl);
  }
  for (const x of uygun) {
    x.dolgu = kalemler.reduce((t, k) => t + (x.hesap.satirlar.some((s) => s.kalemId === k.id) ? 0 : enPahali.get(k.id) ?? 0), 0);
    x.puanDegeri = (x.hesap.bugunkuDeger ?? 0) + x.dolgu;
  }
  const enAzDeger = uygun.length > 0 ? Math.min(...uygun.map((x) => x.puanDegeri)) : 0;
  const terminler = uygun.flatMap((x) => (x.hesap.termin === null ? [] : [x.hesap.termin]));
  const enKisa = terminler.length > 0 ? Math.min(...terminler) : 0;
  const garantiler = new Map(teklifler.map((q) => [q.id, q.garantiAy ?? 0]));
  const enUzunGaranti = Math.max(0, ...uygun.map((x) => garantiler.get(x.hesap.teklifId) ?? 0));
  const w = o.agirliklar;
  for (const x of uygun) {
    const garanti = garantiler.get(x.hesap.teklifId) ?? 0;
    x.kriterPuani = {
      maliyet: x.puanDegeri > 0 ? (enAzDeger / x.puanDegeri) * 100 : 100,
      termin: terminPuani(x.hesap.termin, enKisa, o),
      tedarikci: o.tedarikciPuani(x.firmaId),
      garanti: enUzunGaranti > 0 ? (Math.min(garanti, GARANTI_TAVANI_AY) / Math.min(enUzunGaranti, GARANTI_TAVANI_AY)) * 100 : 100,
    };
    // Bilinmeyen ölçüt hesaba katılmaz; ağırlığı bu teklifte bilinen ölçütlere dağılır (ekranla aynı).
    const kriterler = ['maliyet', 'termin', 'tedarikci', 'garanti'] as const;
    const toplamAgirlik = kriterler.reduce((t, k) => t + (x.kriterPuani[k] === null ? 0 : w[k]), 0) || 1;
    for (const k of kriterler) { const v = x.kriterPuani[k]; x.pay[k] = v === null ? 0 : (v * w[k]) / toplamAgirlik; }
    x.puan = x.pay.maliyet + x.pay.termin + x.pay.tedarikci + x.pay.garanti;
    x.gecikme = gecikmeGunuHesabi(x.hesap.termin, o.ihtiyacTarihi, o.bazTarih);
  }
  // Eksik kalemli teklif tek başına seçilemez: bütün kalemlere teklif verenler önce gelir.
  const sirali = [...uygun].sort((a, b) => Number(b.tumKalemler) - Number(a.tumKalemler) || b.puan - a.puan);
  let bolme: Degerlendirme['bolme'] = null;
  if (uygun.length >= 2 && kalemler.length >= 2) {
    const plan = enIyiBolme(kalemler, uygun.map((x) => x.hesap));
    if (plan !== null) {
      const tamlar = uygun.filter((x) => x.tumKalemler).map((x) => x.hesap.bugunkuDeger ?? Infinity);
      const tekToplam = tamlar.length > 0 ? Math.min(...tamlar) : null;
      const kazanc = tekToplam === null ? null : tekToplam - plan.toplam;
      const tedarikciSayisi = new Set(plan.atama.map((a) => a.teklifId)).size;
      bolme = { plan, tekToplam, kazanc, onerilir: tedarikciSayisi >= 2 && (kazanc === null || kazanc > 0.5) };
    }
  }
  return { satirlar, sira: sirali.map((x) => x.hesap.teklifId), oneri: sirali.find((x) => x.tumKalemler)?.hesap.teklifId ?? null, bolme };
}

// Kararın tutarı (onaya ve rapora giden sayı): tek kararda teklifin toplamı; kalem bazlı kararda her tedarikçinin payı ve masrafı.
export interface KararTutari { tlToplam: number; bugunkuDeger: number }
export function kararTutari(
  k: { mod: 'tek' | 'bolunmus'; teklifId: string | null; bolunme: readonly { kalemId: string; teklifId: string }[] },
  kalemler: readonly HesapKalemi[], hesaplar: readonly TeklifHesabi[],
): KararTutari | null {
  if (k.mod === 'tek') {
    const h = hesaplar.find((x) => x.teklifId === k.teklifId);
    return h === undefined || h.tlToplam === null || h.bugunkuDeger === null ? null : { tlToplam: h.tlToplam, bugunkuDeger: h.bugunkuDeger };
  }
  const atama = new Map(k.bolunme.map((b) => [b.kalemId, b.teklifId]));
  const atanan = kalemler.filter((x) => atama.has(x.id));
  const plan = planMaliyeti(atanan, hesaplar, atama);
  if (plan === null) return null;
  let tlToplam = 0;
  for (const teklifId of new Set(plan.atama.map((a) => a.teklifId))) {
    const h = hesaplar.find((x) => x.teklifId === teklifId)!;
    const mal = h.satirlar.filter((s) => atama.get(s.kalemId) === teklifId).reduce((t, s) => t + s.tutar, 0);
    tlToplam += (mal + h.nakliye + h.digerMasraf) * h.kur!;
  }
  return { tlToplam, bugunkuDeger: plan.toplam };
}

// Onay limiti tablosunda tutarın düştüğü basamak (1095 b: yalnız bilgi; onayı `satin-alma.onayla` verir).
export function gerekenBasamak(tutar: number, limitler: readonly { azamiTutar: string | null; seviye: string }[]): string | null {
  const sirali = [...limitler].sort((a, b) => (sayi(a.azamiTutar) ?? Infinity) - (sayi(b.azamiTutar) ?? Infinity));
  return (sirali.find((l) => l.azamiTutar === null || tutar <= Number(l.azamiTutar)) ?? sirali.at(-1))?.seviye ?? null;
}

// Tedarikçi başarımı: satın almanın 1-5 puanı (prototipteki "puanınız"); teslim ve kalite oranı bilindiğinde onlarla ağırlıklanır.
// Hiçbiri bilinmiyorsa null: puanlanmamış tedarikçiye orta puan uydurulmaz (2157).
export function tedarikciBasarimi(puan: number | null, zamanindaOrani: number | null, kaliteOrani: number | null): number | null {
  const parca: [number, number][] = puan === null ? [] : [[(puan / 5) * 100, 1]];
  if (zamanindaOrani !== null) parca.push([zamanindaOrani, 1.5]);
  if (kaliteOrani !== null) parca.push([kaliteOrani, 1]);
  return parca.length === 0 ? null : parca.reduce((t, [d, a]) => t + d * a, 0) / parca.reduce((t, [, a]) => t + a, 0);
}

// 2454: kararın kalem başına nominal TL tutarı (bütçe kullanımı). Tanım kararTutari ile aynıdır: seçilen satırların iskontolu tutarı,
// teklifin nakliye (hariçse) ve diğer masrafı seçilen satırlara tutarlarıyla, mal tutarı sıfırsa eşit dağılır (V5); kur teklifin kuru.
// Kararın seçmediği ya da fiyatı olmayan kalem harcama değildir, listede yoktur. Kuru olmayan teklifin kalemleri null döner (hesaplanamaz).
// T2: tutarlar kuruşa yuvarlanır, kuruş farkı son kaleme yazılır; toplam yuvarlanmış kararTutari.tlToplam'a eşittir.
// masraf: tl'nin içindeki nakliye ve diğer masraf payı (kuruş); kalanı maldır.
export interface KalemHarcamasi { kalemId: string; teklifId: string; tl: number | null; masraf: number | null }
const kurusa = (x: number): number => Math.round(x * 100) / 100;
export function kalemHarcamalari(
  k: { mod: 'tek' | 'bolunmus'; teklifId: string | null; bolunme: readonly { kalemId: string; teklifId: string }[] },
  kalemler: readonly HesapKalemi[], hesaplar: readonly TeklifHesabi[],
): KalemHarcamasi[] {
  const atama = new Map(k.bolunme.map((b) => [b.kalemId, b.teklifId]));
  const gruplar = new Map<string, { h: TeklifHesabi; satirlar: SatirHesabi[] }>();
  for (const x of kalemler) {
    const teklifId = k.mod === 'tek' ? k.teklifId : atama.get(x.id) ?? null;
    const h = teklifId === null ? undefined : hesaplar.find((q) => q.teklifId === teklifId);
    const s = h?.satirlar.find((r) => r.kalemId === x.id);
    if (h === undefined || s === undefined) continue;
    const g = gruplar.get(h.teklifId) ?? { h, satirlar: [] };
    g.satirlar.push(s);
    gruplar.set(h.teklifId, g);
  }
  const ham: { kalemId: string; teklifId: string; tl: number | null; masraf: number | null }[] = [];
  for (const { h, satirlar } of gruplar.values()) {
    const mal = satirlar.reduce((t, s) => t + s.tutar, 0);
    const masraf = h.nakliye + h.digerMasraf;
    for (const s of satirlar) {
      const pay = mal > 0 ? (masraf * s.tutar) / mal : masraf / satirlar.length;
      ham.push({ kalemId: s.kalemId, teklifId: h.teklifId, tl: h.kur === null ? null : (s.tutar + pay) * h.kur, masraf: h.kur === null ? null : pay * h.kur });
    }
  }
  const sayilan = ham.filter((x) => x.tl !== null);
  const hedef = kurusa(sayilan.reduce((t, x) => t + x.tl!, 0));
  const sonuc = ham.map((x) => ({ ...x, tl: x.tl === null ? null : kurusa(x.tl), masraf: x.masraf === null ? null : kurusa(x.masraf) }));
  const son = [...sonuc].reverse().find((x) => x.tl !== null);
  if (son !== undefined) son.tl = kurusa(son.tl! + hedef - sonuc.reduce((t, x) => t + (x.tl ?? 0), 0));
  return sonuc;
}

// 2454 bütçe satırı: kalemin birimi kaynağın birimi, yoksa talebin birimi (V4 a); yıl siparişin tarihinden, yoksa karar tarihinden (T3).
// 2462 a (V2), 2472-1 a: kalanı kapatılmış siparişte kullanım gerçekleşen teslim değeridir: malın payı teslim alınan / sipariş miktarı
// oranıyla iner (fazla teslim de sayılır), masraf payı tam kalır; siparişe hiç teslim gelmediyse masraf da sıfırdır (Maliyet M1).
// Açık siparişte sipariş tutarıdır. İptal edilen talep buraya gelmez (V3).
// 2462 a, 2472-1 a, 2472-2 a: kalanı kapatılmış siparişte bir satırın (ya da kalemin) gerçekleşen değeri; bütçe kullanımı ve ödeme planı
// (2472) aynı tanımı kullanır. Malın payı teslim oranıyla iner (fazla teslim de sayılır), masraf payı tam kalır; siparişe hiç teslim
// gelmediyse sıfırdır.
export function gerceklesenPay(mal: number, masraf: number, teslimOrani: number, siparisteTeslimVar: boolean): number {
  return siparisteTeslimVar ? mal * teslimOrani + masraf : 0;
}
// Siparişin bütün satırları için: satır başına mal payı ve teslim oranı, siparişin masrafı tek seferde.
export function gerceklesenSiparisDegeri(satirlar: readonly { mal: number; miktar: number; teslim: number }[], masraf: number): number {
  const teslimVar = satirlar.some((s) => s.teslim > 0);
  return satirlar.reduce((t, s) => t + gerceklesenPay(s.mal, 0, s.miktar > 0 ? s.teslim / s.miktar : 0, teslimVar), 0) + gerceklesenPay(0, masraf, 0, teslimVar);
}
export interface ButceSatiri { birim: string | null; yil: number; tl: number | null }
export function butceSatirlari(g: {
  harcamalar: readonly KalemHarcamasi[];
  kalemBirimi: (kalemId: string) => string | null;
  kararTarihi: string | null;
  siparisler: readonly { teklifId: string; siparisTarihi: string | null; kapali: boolean; satirlar: readonly { kalemId: string; miktar: string; teslimAlinan: string | null }[] }[];
  bugun: string;
}): ButceSatiri[] {
  return g.harcamalar.map((x) => {
    const p = g.siparisler.find((s) => s.teklifId === x.teklifId);
    const tarih = p?.siparisTarihi ?? g.kararTarihi ?? g.bugun;
    let tl = x.tl;
    if (tl !== null && p !== undefined && p.kapali) {
      const r = p.satirlar.find((s) => s.kalemId === x.kalemId);
      const miktar = r === undefined ? 0 : Number(r.miktar);
      const teslimVar = p.satirlar.some((s) => Number(s.teslimAlinan ?? '0') > 0);
      const masraf = x.masraf ?? 0;
      if (r !== undefined && miktar > 0) tl = kurusa(gerceklesenPay(tl - masraf, masraf, Number(r.teslimAlinan ?? '0') / miktar, teslimVar));
    }
    return { birim: g.kalemBirimi(x.kalemId), yil: Number(tarih.slice(0, 4)), tl };
  });
}
// Birim başına toplam; hesaplanamayan satır toplama girmez, sayılır. Bütçesi tanımlı her birim satırda; kullanımı olmayanın kullanımı 0.
export function butceKullanimi(satirlar: readonly ButceSatiri[], yil: number, butceler: readonly { ad: string; yillikButce: string }[]):
  { birim: string | null; butce: string | null; kullanilan: string; hesaplanamayanKalem: number }[] {
  const m = new Map<string | null, { tl: number; eksik: number }>();
  for (const b of butceler) m.set(b.ad, { tl: 0, eksik: 0 });
  for (const s of satirlar) {
    if (s.yil !== yil) continue;
    const x = m.get(s.birim) ?? { tl: 0, eksik: 0 };
    if (s.tl === null) x.eksik += 1; else x.tl += s.tl;
    m.set(s.birim, x);
  }
  const butce = new Map(butceler.map((b) => [b.ad, b.yillikButce]));
  return [...m].map(([birim, x]) => ({ birim, butce: birim === null ? null : butce.get(birim) ?? null, kullanilan: kurusa(x.tl).toFixed(2), hesaplanamayanKalem: x.eksik }))
    .sort((a, b) => (a.birim === null ? 1 : b.birim === null ? -1 : a.birim.localeCompare(b.birim, 'tr')));
}
