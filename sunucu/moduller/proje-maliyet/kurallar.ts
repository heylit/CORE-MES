// Proje maliyet kuralları (197 a, 194 a). Saf: veritabanı ve saat yok. Tutarlar TRY, KDV hariç; tarihler tesis günü (YYYY-AA-GG).
import { MALIYET_KALEMLERI } from '#paylasilan/sozlesme/proje-maliyet.ts';
import type { EksikVeri, KalemSatiri, MaliyetKalemi, SapanIsEmri } from '#paylasilan/sozlesme/proje-maliyet.ts';

export const SAPAN_IS_EMRI_SAYISI = 5;

// Anahtarı olmayan kalem o kayıtta yoktur (sıfır); null bilinmiyor demektir ve toplamı bozar.
export type KalemTutarlari = Partial<Record<MaliyetKalemi, number | null>>;

// Hesapta kullanılan ücretler: defter satırında saklanır (199 a), ücret sonradan değişse de dondurulan hesap açıklanabilir kalır.
export interface Ucretler {
  istasyonSaat?: number | null;
  kisiSaat?: { kisiId: number; saatMaliyeti: number | null }[];
  fason?: { tutar: string; paraBirimi: string }[];
  malzeme?: { malzemeId: number; birimMaliyet: number | null }[];
  genelGider?: { saatBasi: number; amortismanDahil: boolean } | null;
}

export interface MaliyetKaydi {
  // Üretim emri düzeyindeki kayıt (malzeme) iş emrine bağlı değildir; sapan iş emirleri tablosuna girmez ve dondurulmaz.
  isEmri: { isEmriId: number; emirNo: string; opNo: number; istasyonAd: string | null; bitisZamani: string | null } | null;
  ucretler: Ucretler;
  bitti: boolean;
  adet: number;
  saglam: number | null;
  // Planın düştüğü gün (plan bitişi); yoksa haftalık eğriye girmez.
  planTarihi: string | null;
  // Gerçekleşenin düştüğü gün: bitiş ya da açık işte bugün.
  gercekTarihi: string | null;
  plan: KalemTutarlari;
  gercek: KalemTutarlari;
}

// PM-01: süre x saat maliyeti. Süre ya da maliyet bilinmiyorsa null.
export function saatTutari(dakika: number | null, saatMaliyeti: number | null): number | null {
  return dakika === null || saatMaliyeti === null ? null : (dakika / 60) * saatMaliyeti;
}

// PM-01: kişi başına katılım dakikası x o kişinin saat maliyeti; birinin maliyeti bilinmiyorsa toplam da bilinmez.
// Katılımı olmayan iş emrinde işçilik yoktur (sıfır, bilinmiyor değil).
export function iscilikTutari(katilimlar: readonly { dakika: number; saatMaliyeti: number | null }[]): number | null {
  let toplam = 0;
  for (const k of katilimlar) {
    const t = saatTutari(k.dakika, k.saatMaliyeti);
    if (t === null) return null;
    toplam += t;
  }
  return toplam;
}

// PM-02: tamamlanma oranı. Bitmiş iş 1; açık işte sağlam / adet (0..1); sayımı yoksa 0.
export function tamamlanmaOrani(k: Pick<MaliyetKaydi, 'bitti' | 'adet' | 'saglam'>): number {
  if (k.bitti) return 1;
  if (k.saglam === null || !(k.adet > 0)) return 0;
  return Math.min(1, Math.max(0, k.saglam / k.adet));
}

const kalemDegeri = (t: KalemTutarlari, kalem: MaliyetKalemi): number | null => (kalem in t ? t[kalem] ?? null : 0);

// PM-03: bir kayıtta planı ya da gerçekleşeni bilinmeyen kalem toplamlara girmez; iki taraf aynı kalemlerle karşılaştırılır.
export function eksikKalemler(kayitlar: readonly MaliyetKaydi[]): MaliyetKalemi[] {
  return MALIYET_KALEMLERI.filter((kalem) => kayitlar.some((k) => kalemDegeri(k.plan, kalem) === null || kalemDegeri(k.gercek, kalem) === null));
}

export interface KayitToplami { plan: number; gerceklesen: number; bugunePlan: number; kalanPlan: number }

// PM-04: kaydın dahil kalemlerdeki toplamı. Bugüne kadarki plan = plan x tamamlanma; kalan = plan - bugüne kadarki.
export function kayitToplami(k: MaliyetKaydi, dahil: readonly MaliyetKalemi[]): KayitToplami {
  const oran = tamamlanmaOrani(k);
  let plan = 0;
  let gerceklesen = 0;
  for (const kalem of dahil) {
    plan += kalemDegeri(k.plan, kalem) ?? 0;
    gerceklesen += kalemDegeri(k.gercek, kalem) ?? 0;
  }
  return { plan, gerceklesen, bugunePlan: plan * oran, kalanPlan: plan * (1 - oran) };
}

const bolum = (pay: number, payda: number): number | null => (payda > 0 ? pay / payda : null);

// PM-05: kalem kırılımı. Kalemin planı ya da gerçekleşeni bir kayıtta bilinmiyorsa o taraf null; sapma oranı bugüne kadarki plana göre.
// Kayıt yoksa bütün kalemler bilinmez (sıfır uydurulmaz).
export function kalemKirilimi(kayitlar: readonly MaliyetKaydi[]): KalemSatiri[] {
  if (kayitlar.length === 0) return MALIYET_KALEMLERI.map((kalem) => ({ kalem, plan: null, gerceklesen: null, sapmaOrani: null }));
  return MALIYET_KALEMLERI.map((kalem) => {
    let plan: number | null = 0;
    let bugune: number | null = 0;
    let gerceklesen: number | null = 0;
    for (const k of kayitlar) {
      const p = kalemDegeri(k.plan, kalem);
      const g = kalemDegeri(k.gercek, kalem);
      plan = plan === null || p === null ? null : plan + p;
      bugune = bugune === null || p === null ? null : bugune + p * tamamlanmaOrani(k);
      gerceklesen = gerceklesen === null || g === null ? null : gerceklesen + g;
    }
    const sapmaOrani = bugune === null || gerceklesen === null ? null : bolum(gerceklesen - bugune, bugune);
    return { kalem, plan, gerceklesen, sapmaOrani };
  });
}

const GUN_MS = 86_400_000;
const gunSayisi = (tarih: string): number => Date.parse(`${tarih}T00:00:00Z`) / GUN_MS;
const gundenTarih = (gun: number): string => new Date(gun * GUN_MS).toISOString().slice(0, 10);

// Haftanın pazartesisi (ISO hafta).
export function haftaBasi(tarih: string): string {
  const gun = gunSayisi(tarih);
  // 1970-01-01 perşembedir: pazartesiye uzaklık (gun + 3) mod 7.
  return gundenTarih(gun - (((gun + 3) % 7) + 7) % 7);
}

// PM-06: haftalık birikimli eğri. Plan plan tarihinin haftasına, gerçekleşen gerçek tarihinin haftasına düşer; tarihi olmayan
// taraf eğriye girmez. İlk haftadan son haftaya boşluksuz.
export function haftalikBirikim(kayitlar: readonly MaliyetKaydi[], dahil: readonly MaliyetKalemi[]): { hafta: string; planBirikimli: number; gerceklesenBirikimli: number }[] {
  const plan = new Map<string, number>();
  const gercek = new Map<string, number>();
  for (const k of kayitlar) {
    const t = kayitToplami(k, dahil);
    if (k.planTarihi !== null) plan.set(haftaBasi(k.planTarihi), (plan.get(haftaBasi(k.planTarihi)) ?? 0) + t.plan);
    if (k.gercekTarihi !== null) gercek.set(haftaBasi(k.gercekTarihi), (gercek.get(haftaBasi(k.gercekTarihi)) ?? 0) + t.gerceklesen);
  }
  const haftalar = [...plan.keys(), ...gercek.keys()].sort();
  const ilk = haftalar[0];
  const son = haftalar.at(-1);
  if (ilk === undefined || son === undefined) return [];
  const sonuc: { hafta: string; planBirikimli: number; gerceklesenBirikimli: number }[] = [];
  let p = 0;
  let g = 0;
  for (let gun = gunSayisi(ilk); gun <= gunSayisi(son); gun += 7) {
    const hafta = gundenTarih(gun);
    p += plan.get(hafta) ?? 0;
    g += gercek.get(hafta) ?? 0;
    sonuc.push({ hafta, planBirikimli: p, gerceklesenBirikimli: g });
  }
  return sonuc;
}

// PM-07: tahmini bitiş. Açık iş varsa açık işlerin en geç plan tarihi ile bugünün büyüğü; hepsi bittiyse en geç gerçek tarih.
// Kayıt yoksa ya da açık işin plan tarihi hiç yoksa bilinmez.
export function tahminiBitis(kayitlar: readonly MaliyetKaydi[], bugun: string): string | null {
  if (kayitlar.length === 0) return null;
  const aciklar = kayitlar.filter((k) => !k.bitti);
  if (aciklar.length > 0) {
    const planlar = aciklar.flatMap((k) => (k.planTarihi === null ? [] : [k.planTarihi])).sort();
    const enGec = planlar.at(-1);
    if (enGec === undefined) return null;
    return enGec > bugun ? enGec : bugun;
  }
  return kayitlar.flatMap((k) => (k.gercekTarihi === null ? [] : [k.gercekTarihi])).sort().at(-1) ?? null;
}

// PM-08: gecikme günü = tahmini bitiş - termin, en az 0.
export function gecikmeGunu(bitis: string | null, termin: string | null): number | null {
  return bitis === null || termin === null ? null : Math.max(0, Math.round(gunSayisi(bitis) - gunSayisi(termin)));
}

// PM-09 (194 a): kâr riski = katkı payı x günlük oran x gecikme günü. Zarardaki işin kâr riski sıfırdır (kaybedecek kâr yok).
export function karRiski(katkiPayi: number | null, gunlukOranYuzde: number, gecikme: number | null): number | null {
  return katkiPayi === null || gecikme === null ? null : Math.max(0, katkiPayi) * (gunlukOranYuzde / 100) * gecikme;
}

// PM-10: gecikme cezası = gelir x günlük ceza yüzdesi x gün; tavan varsa gelirin tavan yüzdesini aşmaz. Oran yoksa bilinmez.
export function gecikmeCezasi(gelir: number | null, cezaOraniGun: number | null, tavanOrani: number | null, gecikme: number | null): number | null {
  if (gelir === null || cezaOraniGun === null || gecikme === null) return null;
  const ceza = gelir * (cezaOraniGun / 100) * gecikme;
  return tavanOrani === null ? ceza : Math.min(ceza, gelir * (tavanOrani / 100));
}

// PM-11: en çok sapan iş emirleri: sapma = gerçekleşen - bugüne kadarki plan (dahil kalemlerde), yalnız artı sapma, büyükten
// küçüğe. Neden, kayıttaki en büyük artı sapmalı kalemdir.
export function sapanIsEmirleri(kayitlar: readonly MaliyetKaydi[], dahil: readonly MaliyetKalemi[], sinir = SAPAN_IS_EMRI_SAYISI): SapanIsEmri[] {
  const sonuc: SapanIsEmri[] = [];
  for (const k of kayitlar) {
    if (k.isEmri === null) continue;
    const t = kayitToplami(k, dahil);
    const sapma = t.gerceklesen - t.bugunePlan;
    if (!(sapma > 0)) continue;
    const oran = tamamlanmaOrani(k);
    let neden: MaliyetKalemi | null = null;
    let enBuyuk = 0;
    for (const kalem of dahil) {
      const s = (kalemDegeri(k.gercek, kalem) ?? 0) - (kalemDegeri(k.plan, kalem) ?? 0) * oran;
      if (s > enBuyuk) { enBuyuk = s; neden = kalem; }
    }
    if (neden === null) continue;
    sonuc.push({ ...k.isEmri, plan: t.bugunePlan, gerceklesen: t.gerceklesen, sapma, neden });
  }
  return sonuc.sort((a, b) => b.sapma - a.sapma || a.isEmriId - b.isEmriId).slice(0, sinir);
}

export interface Gostergeler {
  plan: number | null;
  gerceklesen: number | null;
  bugunePlan: number | null;
  kalanPlan: number | null;
  hedef: number | null;
  sapma: number | null;
  katkiPayi: number | null;
  katkiOrani: number | null;
  planlananKatkiOrani: number | null;
}

// PM-12: göstergeler. Hedef = bütçe, yoksa plan. Katkı payı = gelir - (gerçekleşen + kalan plan); oranlar gelire bölünür.
// Kayıt yoksa maliyet bilinmez (sıfır proje maliyeti uydurulmaz). Maliyet tam değilse (bir kalem bilinmiyor) katkı bilinmez: eksik
// maliyetle katkı gelirin tamamına yaklaşır ve yanıltır (#10).
export function gostergeler(
  kayitlar: readonly MaliyetKaydi[], dahil: readonly MaliyetKalemi[], gelir: number | null, butce: number | null, tam: boolean,
): Gostergeler {
  if (kayitlar.length === 0) {
    const katkiYok = { plan: null, gerceklesen: null, bugunePlan: null, kalanPlan: null, sapma: null, katkiPayi: null, katkiOrani: null };
    const planlanan = gelir !== null && butce !== null ? bolum(gelir - butce, gelir) : null;
    return { ...katkiYok, hedef: butce, planlananKatkiOrani: planlanan };
  }
  const t = kayitlar.map((k) => kayitToplami(k, dahil)).reduce(
    (a, b) => ({ plan: a.plan + b.plan, gerceklesen: a.gerceklesen + b.gerceklesen, bugunePlan: a.bugunePlan + b.bugunePlan, kalanPlan: a.kalanPlan + b.kalanPlan }),
    { plan: 0, gerceklesen: 0, bugunePlan: 0, kalanPlan: 0 },
  );
  const hedef = butce ?? t.plan;
  const katkiPayi = gelir === null || !tam ? null : gelir - (t.gerceklesen + t.kalanPlan);
  return {
    ...t,
    hedef,
    sapma: t.gerceklesen - t.bugunePlan,
    katkiPayi,
    katkiOrani: gelir === null || katkiPayi === null ? null : bolum(katkiPayi, gelir),
    planlananKatkiOrani: gelir === null || (!tam && butce === null) ? null : bolum(gelir - hedef, gelir),
  };
}

export interface GelirPayi { adet: number; birimFiyat: number | null; kur: number | null; iptal: boolean }

// PM-36 (226 a, 225): proje geliri = emir adedi x bağlı sipariş satırının birim fiyatı x bugünün kuru; aynı siparişin projeleri yalnız
// kendi emirlerinin payını alır (#9). İptal siparişin satırı gelir değildir (#38). Satıra bağlı emir yoksa, bir payın fiyatı ya da
// kuru bilinmiyorsa gelir bilinmez.
export function projeGeliri(paylar: readonly GelirPayi[]): number | null {
  if (paylar.length === 0) return null;
  let toplam = 0;
  for (const p of paylar) {
    if (p.iptal) continue;
    if (p.birimFiyat === null || p.kur === null) return null;
    toplam += p.adet * p.birimFiyat * p.kur;
  }
  return toplam;
}

// PM-16 (199 a): dondurulacak kayıtlar: bitmiş, iş emrine bağlı, bitiş zamanı bilinen ve defterde olmayan.
export function dondurulacaklar(kayitlar: readonly MaliyetKaydi[], defterde: ReadonlySet<number>): MaliyetKaydi[] {
  return kayitlar.filter((k) => k.bitti && k.isEmri !== null && k.isEmri.bitisZamani !== null && !defterde.has(k.isEmri.isEmriId));
}

export interface DefterSatiri { isEmriId: number; plan: KalemTutarlari; gercek: KalemTutarlari }

// PM-17 (199 a): defterdeki iş emrinin planı ve gerçekleşeni güncel hesap yerine defterden okunur; açık iş emri güncel hesapla kalır.
export function defteriUygula(kayitlar: readonly MaliyetKaydi[], defter: ReadonlyMap<number, DefterSatiri>): MaliyetKaydi[] {
  return kayitlar.map((k) => {
    const d = k.isEmri === null || !k.bitti ? undefined : defter.get(k.isEmri.isEmriId);
    return d === undefined ? k : { ...k, plan: d.plan, gercek: d.gercek };
  });
}

// H8 (K-D6): genel gider kuralı tek yerdedir; proje maliyeti ve teklif maliyeti (Siparişler, kablolamayla) aynı işlevleri kullanır.
export type AdimKaynagi = 'makine' | 'kisi' | 'fason' | null;
export interface GenelGiderOraniGirdisi { saatBasi: number; amortismanDahil: boolean }
export type GenelGiderEksigi = Extract<EksikVeri, 'genel_gider_orani_yok' | 'amortisman_dahil_degil'>;

// PM-21 (206 a): oran makine saatine bölündüğü için yükü makine ya da makinesi atanmamış adım alır (o da istasyon saatiyle hesaplanır);
// kişi ve fason adımı almaz.
export function genelGiderYukAlir(kaynak: AdimKaynagi): boolean {
  return kaynak !== 'fason' && kaynak !== 'kisi';
}

// PM-21: yük = (işleme + ayar) dakikası x saat başı oran. Oran ya da süre bilinmiyorsa null.
export function genelGiderTutari(dakika: number | null, oran: GenelGiderOraniGirdisi | null): number | null {
  return saatTutari(dakika, oran?.saatBasi ?? null);
}

// PM-22, PM-32 (211 a, E-9): yük alan adım varken oran yoksa kalem bilinmez; oran amortismanı içermiyorsa amortisman hiçbir kalemde yoktur
// ve bu bildirilir. Yük alan adım yoksa oranın yokluğu eksik sayılmaz.
export function genelGiderEksikleri(kaynaklar: readonly AdimKaynagi[], oran: GenelGiderOraniGirdisi | null): GenelGiderEksigi[] {
  if (oran === null) return kaynaklar.some(genelGiderYukAlir) ? ['genel_gider_orani_yok'] : [];
  return oran.amortismanDahil ? [] : ['amortisman_dahil_degil'];
}

export interface IsEmriGirdisi {
  isEmri: { isEmriId: number; emirNo: string; opNo: number; istasyonAd: string | null; bitisZamani: string | null };
  kaynakTur: AdimKaynagi;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  adet: number;
  saglam: number | null;
  birimSureDk: number | null;
  ayarSureDk: number | null;
  sure: { islemeSn: number; ayarSn: number | null; katilim: readonly { kisiId: number; saniye: number }[] } | null;
  // TRY'ye çevrilmiş ücretler; null girilmemiş ya da kuru yok.
  istasyonSaat: number | null;
  // Finansın genel gider yük oranı (206 a); null girilmemiş.
  genelGider: GenelGiderOraniGirdisi | null;
  kisiSaat: ReadonlyMap<number, number | null>;
  // Bağlı fason satırları ve TRY toplamı (satır yoksa boş liste; kuru olmayan satır varsa toplam null).
  fason: { satirlar: { tutar: string; paraBirimi: string }[]; toplam: number | null };
  planBitisGunu: string | null;
  bitisGunu: string | null;
}

// PM-18: iş emrinin maliyet kaydı. Plan: işleme = birim süre x adet x istasyon saat maliyeti, ayar = rota ayar süresi x aynı maliyet;
// işçiliğin planı yoktur (null, toplamdan çıkar). Gerçek: makine kullanımı ve ayar süresi x istasyon maliyeti, katılım x kişi maliyeti.
// Başlamamış işin gerçeği sıfırdır; başlamış işte ayar olayı yoksa ayar bilinmez. Fasonun planı da gerçeği de bağlı fason siparişidir;
// fason adımında sipariş yoksa plan bilinmez, gerçek sıfırdır.
// Genel gider PM-21 işlevleriyle yüklenir.
export function isEmriKaydi(g: IsEmriGirdisi, bugun: string): MaliyetKaydi {
  const basladi = g.durum !== 'bekliyor';
  const plan: KalemTutarlari = {};
  const gercek: KalemTutarlari = {};
  if (g.kaynakTur !== 'fason') {
    plan.isleme = g.birimSureDk === null ? null : saatTutari(g.birimSureDk * g.adet, g.istasyonSaat);
    plan.ayar = g.ayarSureDk === null ? null : saatTutari(g.ayarSureDk, g.istasyonSaat);
    plan.iscilik = null;
    gercek.isleme = basladi ? saatTutari((g.sure?.islemeSn ?? 0) / 60, g.istasyonSaat) : 0;
    const ayarSn = g.sure?.ayarSn ?? null;
    gercek.ayar = !basladi ? 0 : ayarSn === null ? null : saatTutari(ayarSn / 60, g.istasyonSaat);
    gercek.iscilik = iscilikTutari((g.sure?.katilim ?? []).map((k) => ({ dakika: k.saniye / 60, saatMaliyeti: g.kisiSaat.get(k.kisiId) ?? null })));
  }
  const yukAlir = genelGiderYukAlir(g.kaynakTur);
  if (yukAlir) {
    const planDk = g.birimSureDk === null || g.ayarSureDk === null ? null : g.birimSureDk * g.adet + g.ayarSureDk;
    plan.genel_gider = genelGiderTutari(planDk, g.genelGider);
    const ayarSn = g.sure?.ayarSn ?? null;
    gercek.genel_gider = !basladi ? 0 : ayarSn === null ? null : genelGiderTutari(((g.sure?.islemeSn ?? 0) + ayarSn) / 60, g.genelGider);
  }
  if (g.fason.satirlar.length > 0) {
    plan.fason = g.fason.toplam;
    gercek.fason = g.fason.toplam;
  } else if (g.kaynakTur === 'fason') {
    plan.fason = null;
    gercek.fason = 0;
  }
  const kisiSaat = (g.sure?.katilim ?? []).map((k) => ({ kisiId: k.kisiId, saatMaliyeti: g.kisiSaat.get(k.kisiId) ?? null }));
  return {
    isEmri: g.isEmri,
    ucretler: {
      ...(g.kaynakTur === 'fason' ? {} : { istasyonSaat: g.istasyonSaat }),
      ...(yukAlir ? { genelGider: g.genelGider } : {}),
      ...(kisiSaat.length > 0 ? { kisiSaat } : {}),
      ...(g.fason.satirlar.length > 0 ? { fason: g.fason.satirlar } : {}),
    },
    bitti: g.durum === 'tamam',
    adet: g.adet,
    saglam: g.saglam,
    planTarihi: g.planBitisGunu,
    gercekTarihi: g.durum === 'tamam' ? g.bitisGunu : basladi ? bugun : null,
    plan,
    gercek,
  };
}

// PM-23: plan motorunun tahmini maliyeti = işleme + ayar + fason planı (Üretim emirleriyle anlaşılan sözleşme). İşçiliğin planı yok;
// genel gider katılsaydı oran girilmeden bütün plan bedelleri boşalırdı. Bu kalemlerden biri bilinmiyorsa null.
const TAHMINI_KALEMLER = ['isleme', 'ayar', 'fason'] as const;
export function tahminiIsEmriMaliyeti(plan: KalemTutarlari): number | null {
  let toplam = 0;
  for (const kalem of TAHMINI_KALEMLER) {
    const t = kalemDegeri(plan, kalem);
    if (t === null) return null;
    toplam += t;
  }
  return toplam;
}

export interface MalzemeBileseni {
  malzemeNo: number;
  // Brüt ihtiyaç, stok biriminde (fire dahil).
  brut: number;
  // Stok birimi başına TRY fiyat (kg fiyatından); null girilmemiş.
  tryBirimFiyati: number | null;
  // Kalitesi olan hammadde (kütük, çubuk): talaş yalnız bunlardan çıkar.
  hammadde: boolean;
  // Stok birimi başına kg; null bilinmiyor.
  kgBasina: number | null;
  tryTalasKgFiyati: number | null;
}

// PM-25 (208 a, 214 a): emrin planlanan malzemesi = Σ brüt x birim fiyat - talaş değeri. Birinin fiyatı yoksa malzeme bilinmez.
// Talaş kg = hammaddelerin kütük kg toplamı - adet x parça net kg (en az 0); değeri kütük kg'ı ağırlıklı talaş kg fiyatıyla. Kütük ağırlığı,
// parça net ağırlığı ya da talaş fiyatı bilinmiyorsa talaş düşülmez ve bildirilir (malzeme bilinmez sayılmaz; brüt tutar kalır).
// Gerçekte (PM-31) kütüğün yalnız işlenen payı talaşa döner: talaş kg = kütük kg x işlenen / adet - parça x net kg.
export function malzemePlani(
  bilesenler: readonly MalzemeBileseni[], adet: number, parcaNetKg: number | null, kullanim: TalasAdedi = { islenen: adet, parca: adet },
): { tutar: number | null; talas: number | null } {
  let brut = 0;
  for (const b of bilesenler) {
    if (b.tryBirimFiyati === null) return { tutar: null, talas: null };
    brut += b.brut * b.tryBirimFiyati;
  }
  const hammaddeler = bilesenler.filter((b) => b.hammadde);
  if (hammaddeler.length === 0) return { tutar: brut, talas: 0 };
  if (parcaNetKg === null || hammaddeler.some((b) => b.kgBasina === null || b.tryTalasKgFiyati === null)) return { tutar: brut, talas: null };
  let kutukKg = 0;
  let talasDegerKg = 0;
  for (const b of hammaddeler) {
    const kg = b.brut * (b.kgBasina ?? 0);
    kutukKg += kg;
    talasDegerKg += kg * (b.tryTalasKgFiyati ?? 0);
  }
  if (!(kutukKg > 0)) return { tutar: brut, talas: 0 };
  const islenenPay = adet > 0 ? Math.min(1, Math.max(0, kullanim.islenen / adet)) : 1;
  const talasKg = Math.max(0, kutukKg * islenenPay - kullanim.parca * parcaNetKg);
  const talas = talasKg * (talasDegerKg / kutukKg);
  return { tutar: brut - talas, talas };
}


// Bekleme finansmanının tabanı: bağlanan para. Genel gider, işten bağımsız ödenen yük olduğu için tabana girmez.
export const FINANSMAN_TABANI = ['malzeme', 'isleme', 'ayar', 'fason', 'iscilik'] as const satisfies readonly MaliyetKalemi[];

// PM-28: aylık faiz yüzdesinden günlük oran (yüzde / 100 x 12 / 365). Faiz yoksa null.
export function gunlukFaizOrani(aylikYuzde: number | null): number | null {
  return aylikYuzde === null ? null : (aylikYuzde / 100) * 12 / 365;
}

// PM-29 (212 a, 213 a, ödeme vadesi üretim bitişinden): bekleme finansmanı = kaydın taban tutarı x günlük faiz x kaydın gününden tahsilata
// gün. Plan tahsilatı en geç plan tarihi + vade; gerçekte bütün işler bittiyse en geç gerçek tarih + vade, bugünle sınırlı; açık projede bugün.
// Taban yalnız toplamlara giren (dahil) kalemlerdir; tarihi olmayan kayıt, haftalık eğride olduğu gibi, sayılmaz. Faiz ya da hiç plan tarihi yoksa
// o taraf bilinmez.
// Proje düzeyinde tek kayıttır: iş emrine bağlı değildir, dondurulmaz, tahmini bitişe girmez.
export function beklemeFinansmani(
  kayitlar: readonly MaliyetKaydi[], dahil: readonly MaliyetKalemi[], gunlukOran: number | null, vadeGun: number, bugun: string,
): MaliyetKaydi | null {
  if (kayitlar.length === 0) return null;
  const taban = FINANSMAN_TABANI.filter((k) => dahil.includes(k));
  const toplam = (t: KalemTutarlari): number => taban.reduce((s, k) => s + (kalemDegeri(t, k) ?? 0), 0);
  const bitti = kayitlar.every((k) => k.bitti);
  const enGec = (tarihler: (string | null)[]): string | null => tarihler.filter((t): t is string => t !== null).sort().at(-1) ?? null;
  const ekle = (tarih: string, gun: number): string => gundenTarih(gunSayisi(tarih) + gun);
  const planSonu = enGec(kayitlar.map((k) => k.planTarihi));
  const planTahsilat = planSonu === null ? null : ekle(planSonu, vadeGun);
  const gercekSonu = bitti ? enGec(kayitlar.map((k) => k.gercekTarihi)) : null;
  const gercekTahsilat = gercekSonu === null ? null : ekle(gercekSonu, vadeGun);
  const gercekBitis = gercekTahsilat !== null && gercekTahsilat < bugun ? gercekTahsilat : bugun;
  const finansman = (kendi: (k: MaliyetKaydi) => [string | null, KalemTutarlari], son: string | null): number | null => {
    if (gunlukOran === null || son === null) return null;
    let tutar = 0;
    for (const k of kayitlar) {
      const [tarih, t] = kendi(k);
      if (tarih === null) continue;
      tutar += toplam(t) * gunlukOran * Math.max(0, gunSayisi(son) - gunSayisi(tarih));
    }
    return tutar;
  };
  return {
    isEmri: null, ucretler: {}, bitti, adet: 1, saglam: null,
    planTarihi: planTahsilat, gercekTarihi: gercekBitis,
    plan: { finansman: finansman((k) => [k.planTarihi, k.plan], planTahsilat) },
    gercek: { finansman: finansman((k) => [k.gercekTarihi, k.gercek], gercekBitis) },
  };
}

// PM-31 (E-5): gerçek talaşın adetleri. Açık emirde işlenen ve parçada kalan, ilk adımı geçen adettir: sarf edilip henüz işlenmemiş kütük
// talaş sayılmaz. Bitmiş emirde bütün kütük işlenmiştir, parçada kalan son adımın sağlamıdır: hurda parçanın metali talaş gibi değerlenir.
// Sayım yoksa 0.
export interface TalasAdedi { islenen: number; parca: number }
export function gercekTalasAdedi(bitti: boolean, adet: number, ilkSaglam: number | null, sonSaglam: number | null): TalasAdedi {
  if (bitti) return { islenen: adet, parca: sonSaglam ?? 0 };
  const baslanan = ilkSaglam ?? 0;
  return { islenen: baslanan, parca: baslanan };
}
