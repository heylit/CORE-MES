import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

export const ISTASYON_TIPLERI = ['talasli', 'kalite', 'depo', 'markalama', 'boya', 'montaj'] as const;
export const BAGLANTI_TURLERI = ['focas', 'opcua', 'mtconnect', 'modbus', 'dijital_giris'] as const;
// Kapasiteyi neyin belirlediği: makinenin çalışma saati ya da istasyondaki kişilerin saat toplamı (IK4).
export const KAPASITE_KAYNAKLARI = ['makine', 'insan'] as const;
// Kod büyük harfe çevrilir; harf ya da rakamla başlar, en çok 24 karakter (nokta, alt çizgi, tire serbest).
export const KOD_DESENI = /^[A-Z0-9][A-Z0-9._-]{0,23}$/;
const KOD_ILETISI = 'Kod harf ya da rakamla başlamalı; en çok 24 karakter, yalnız harf, rakam, nokta, alt çizgi ve tire.';

export const kodSemasi = z
  .string()
  .trim()
  .transform((k) => k.toUpperCase())
  .pipe(z.string().regex(KOD_DESENI, KOD_ILETISI));
const adSemasi = z.string().trim().min(1, 'Ad zorunlu.').max(120);
// Boş metin "yok" demektir; sıfır ya da boş dizgi saklanmaz.
const istegeBagliMetin = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((m) => (m === undefined || m === null || m === '' ? null : m));
const kimlik = z.number().int().positive();

export const istasyonTipi = z.enum(ISTASYON_TIPLERI);
export const baglantiTuru = z.enum(BAGLANTI_TURLERI);
export const kapasiteKaynagi = z.enum(KAPASITE_KAYNAKLARI);

export const kimlikParametresi = z.object({ id: z.coerce.number().int().positive() });
export const kisiParametresi = z.object({ kisiId: z.coerce.number().int().positive() });
const mantiksal = z.enum(['true', 'false']).optional().transform((d) => d === 'true');
export const pasifSorgusu = z.object({ pasifler: mantiksal });
export const makineSorgusu = z.object({
  pasifler: mantiksal,
  istasyonId: z.coerce.number().int().positive().optional(),
});

// Yazma uçlarının gövdesi tüm kaydı taşır: güncelleme de tam kayıttır (pasife alma `aktif` ile).
export const isMerkeziGovdesi = z.object({
  kod: kodSemasi,
  ad: adSemasi,
  aciklama: istegeBagliMetin,
  aktif: z.boolean().default(true),
});

export const istasyonGovdesi = z.object({
  kod: kodSemasi,
  ad: adSemasi,
  isMerkeziId: kimlik,
  tip: istasyonTipi.default('talasli'),
  // Sorumlu bilgi alanıdır, yetki vermez. Kapasite kaynağını bugün ekran zorunlu tutar; sunucu boşu kabul eder (E2z, borçta).
  sorumluKisiId: kimlik.nullish().transform((k) => k ?? null),
  kapasiteKaynagi: kapasiteKaynagi.nullish().transform((k) => k ?? null),
  // Stok üretim alanı konumunu yalnız işaretli istasyona bağlar (SH5 b).
  uretimAlani: z.boolean().default(false),
  aktif: z.boolean().default(true),
});

const makineAlanlari = z.object({
  kod: kodSemasi,
  ad: adSemasi,
  tur: istegeBagliMetin,
  markaModel: istegeBagliMetin,
  seriNo: istegeBagliMetin,
  istasyonId: kimlik.nullish().transform((k) => k ?? null),
  baglantiTuru: baglantiTuru.nullish().transform((t) => t ?? null),
  baglantiAdresi: istegeBagliMetin,
  aktif: z.boolean().default(true),
});
const adresTurIster = {
  kosul: (m: { baglantiAdresi: string | null; baglantiTuru: string | null }) => m.baglantiAdresi === null || m.baglantiTuru !== null,
  ileti: { message: 'Bağlantı adresi yalnız bağlantı türü seçiliyken girilir.', path: ['baglantiAdresi'] },
};
export const makineGovdesi = makineAlanlari.refine(adresTurIster.kosul, adresTurIster.ileti);

// Güncelleme, istemcinin okuduğu sürümü taşır; arada başkası yazdıysa komut 409 alır, üstüne yazmaz (IS9).
export const isMerkeziGuncellemeGovdesi = isMerkeziGovdesi.extend(beklenenSurum);
// İşareti bilmeyen çağıran (rota Kaynaklar ekranı, test kurulumları) güncellerken işareti silmesin: gönderilmeyen işaret değişmez.
export const istasyonGuncellemeGovdesi = istasyonGovdesi.extend({ ...beklenenSurum, uretimAlani: z.boolean().optional() });
export const makineGuncellemeGovdesi = makineAlanlari.extend(beklenenSurum).refine(adresTurIster.kosul, adresTurIster.ileti);

export const kisiIsMerkezleriGovdesi = z.object({ isMerkeziIdleri: z.array(kimlik).max(500) });

// Kişi atamaları (IK1-IK3): yüzde iki ondalıklı metindir, sayıya çevrilip taşınmaz; tarih geçerlilik başlangıcıdır.
export const idKisiParametresi = z.object({
  id: z.coerce.number().int().positive(),
  kisiId: z.coerce.number().int().positive(),
});
export const yuzdeMetni = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, 'Yüzde en çok iki ondalıklı bir sayı olmalı.')
  .refine((m) => Number(m) > 0 && Number(m) <= 100, "Yüzde 0'dan büyük, en çok 100 olmalı.");
// YYYY-AA-GG; takvimde olmayan gün (31 Şubat) reddedilir.
export const tarihMetni = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı.')
  .refine((t) => !Number.isNaN(Date.parse(t)) && new Date(t).toISOString().startsWith(t), 'Geçerli bir tarih girin.');
// Başlangıç verilmezse bugündür.
export const atamaGovdesi = z.object({ kisiId: kimlik, yuzde: yuzdeMetni, baslangic: tarihMetni.optional() });
export const atamaKaldirGovdesi = z.object({ baslangic: tarihMetni.optional() }).default({});
// Ekip silinmez; pasife alma `aktif` ile (IK7).
export const ATAMA_TURLERI = ['istasyon', 'makine', 'ekip'] as const;
export const iptalOnizlemeSorgusu = z.object({
  tur: z.enum(ATAMA_TURLERI),
  hedefId: z.coerce.number().int().positive(),
  kisiId: z.coerce.number().int().positive(),
  baslangic: tarihMetni.optional(),
});
export const ekipGovdesi = z.object({
  kod: kodSemasi,
  ad: adSemasi,
  istasyonId: kimlik.nullish().transform((k) => k ?? null),
  aktif: z.boolean().default(true),
});
export const ekipGuncellemeGovdesi = ekipGovdesi.extend(beklenenSurum);
export const ekipUyeSorgusu = z.object({ ekipId: z.coerce.number().int().positive().optional(), tarih: tarihMetni.optional() });
export const istasyonKisiSorgusu = z.object({ istasyonId: z.coerce.number().int().positive().optional(), tarih: tarihMetni.optional() });
export const makineKisiSorgusu = z.object({ makineId: z.coerce.number().int().positive().optional(), tarih: tarihMetni.optional() });

export const isMerkeziSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  aciklama: z.string().nullable(),
  aktif: z.boolean(),
});

export const istasyonSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  isMerkeziId: z.number().int(),
  tip: istasyonTipi,
  aktif: z.boolean(),
});

export const makineSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  tur: z.string().nullable(),
  markaModel: z.string().nullable(),
  seriNo: z.string().nullable(),
  istasyonId: z.number().int().nullable(),
  baglantiTuru: baglantiTuru.nullable(),
  baglantiAdresi: z.string().nullable(),
  aktif: z.boolean(),
});

// Ekranın düzenlediği kayıt sürümüyle gelir; başka modüllere verilen tipler (`disari.ts`) sürüm taşımaz.
const surumlu = { surum: surumSemasi };
export const isMerkeziKaydiSemasi = isMerkeziSemasi.extend(surumlu);
// Ekran kaydı sorumluyu (adıyla) ve kapasite kaynağını da taşır; ad kisiler modülünden gelir.
export const istasyonKaydiSemasi = istasyonSemasi.extend({
  ...surumlu,
  sorumluKisiId: z.number().int().nullable(),
  sorumluAd: z.string().nullable(),
  kapasiteKaynagi: kapasiteKaynagi.nullable(),
  uretimAlani: z.boolean(),
});
export const makineKaydiSemasi = makineSemasi.extend(surumlu);

// Operasyon tipi kataloğu (IS11, IS13); başka modüller `disari.ts` ile okur, ekran uçlarla yazar.
// Gruplar malzemeler kataloğundaki kodlarla aynıdır (kullanıcı kararı İ2); sıra ekrandaki sıradır.
export const OPERASYON_GRUP_KODLARI = ['KES', 'SKL', 'TAL', 'KYN', 'ISL', 'YZY', 'KAP', 'BOY', 'MRK', 'MON', 'KAL', 'PAK', 'FAS'] as const;
export type OperasyonGrubu = (typeof OPERASYON_GRUP_KODLARI)[number];
export const OPERASYON_GRUP_ADLARI: Readonly<Record<OperasyonGrubu, string>> = {
  KES: 'Kesim', SKL: 'Şekillendirme', TAL: 'Talaşlı imalat', KYN: 'Kaynak', ISL: 'Isıl işlem', YZY: 'Yüzey hazırlık', KAP: 'Kaplama',
  BOY: 'Boya', MRK: 'Markalama', MON: 'Montaj', KAL: 'Kalite kontrol', PAK: 'Paketleme ve sevk', FAS: 'Fason',
};

// Varsayılanlar rota adımına öneridir (RT2 a); boş "bilinmiyor" demektir. Süreler dakika, ondalık metin.
export const operasyonTipiSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  grup: z.enum(OPERASYON_GRUP_KODLARI),
  aktif: z.boolean(),
  kisaltma: z.string().nullable(),
  varsayilanAyarDk: ondalikMetinSemasi.nullable(),
  varsayilanBirimDk: ondalikMetinSemasi.nullable(),
  varsayilanIstasyonId: z.number().int().nullable(),
});

export const operasyonTipiKaydiSemasi = operasyonTipiSemasi.extend(surumlu);
export const operasyonGrubu = z.enum(OPERASYON_GRUP_KODLARI);
// Kod yalnız kullanılmamış tipte değişir (#544): rotada ya da iş emrinde kullanılmış tipin kodu 409 alır. Silme yok; kullanımdan pasife alarak çıkar.
const bosIseNull = (m: string | null | undefined) => (m === undefined || m === null || m.trim() === '' ? null : m.trim());
const sureMetni = (ondalik: number) => z
  .string()
  .nullish()
  .transform(bosIseNull)
  .pipe(z.string().regex(new RegExp(`^\\d{1,6}(\\.\\d{1,${ondalik}})?$`), `Süre en çok ${ondalik} ondalıklı, sıfır ya da pozitif dakika olmalı.`).nullable());
export const operasyonTipiGovdesi = z.object({
  kod: kodSemasi,
  ad: adSemasi,
  grup: operasyonGrubu,
  aktif: z.boolean().default(true),
  // Büyük harfe çevrilir; en çok 6 harf ya da rakam.
  kisaltma: z
    .string()
    .nullish()
    .transform((m) => bosIseNull(m)?.toLocaleUpperCase('tr-TR') ?? null)
    .pipe(z.string().regex(/^[A-ZÇĞİÖŞÜ0-9]{1,6}$/, 'Kısaltma en çok 6 harf ya da rakam olmalı.').nullable()),
  varsayilanAyarDk: sureMetni(2),
  varsayilanBirimDk: sureMetni(4),
  varsayilanIstasyonId: kimlik.nullish().transform((k) => k ?? null),
});
// Varsayılanları bilmeyen çağıran girilmiş değeri silmesin diye gönderilmeyen alan değişmez; boşaltmak için açıkça null gönderilir.
export const operasyonTipiGuncellemeGovdesi = operasyonTipiGovdesi.extend({
  ...beklenenSurum,
  kod: kodSemasi.optional(),
  kisaltma: operasyonTipiGovdesi.shape.kisaltma.optional(),
  varsayilanAyarDk: operasyonTipiGovdesi.shape.varsayilanAyarDk.optional(),
  varsayilanBirimDk: operasyonTipiGovdesi.shape.varsayilanBirimDk.optional(),
  varsayilanIstasyonId: operasyonTipiGovdesi.shape.varsayilanIstasyonId.optional(),
});
export const operasyonTipleriCevabi = z.object({ operasyonTipleri: z.array(operasyonTipiKaydiSemasi) });

export const isMerkezleriCevabi = z.object({ isMerkezleri: z.array(isMerkeziKaydiSemasi) });
export const istasyonlarCevabi = z.object({ istasyonlar: z.array(istasyonKaydiSemasi) });
export const makinelerCevabi = z.object({ makineler: z.array(makineKaydiSemasi) });

// Seçim listesi iş merkezine göre gruplu gelir; kişi kısıtlıysa yalnız kendi iş merkezlerinin grupları.
export const secimGrubuSemasi = z.object({
  isMerkeziId: z.number().int(),
  isMerkeziKod: z.string(),
  isMerkeziAd: z.string(),
  istasyonlar: z.array(istasyonSemasi),
});
export const istasyonSecimiCevabi = z.object({ gruplar: z.array(secimGrubuSemasi) });

// Atama satırı o tarihte geçerli olan satırdır; baslangic o satırın başlangıç tarihidir. baslayacak ise o tarihte geçerli
// ataması olmayan kişinin ileri tarihli ilk atamasıdır.
const atamaOrtak = {
  kisiId: z.number().int(), kisiAd: z.string(), yuzde: ondalikMetinSemasi, baslangic: z.string(), baslayacak: z.boolean(),
};
export const istasyonKisiSemasi = z.object({ istasyonId: z.number().int(), ...atamaOrtak });
export const istasyonKisileriCevabi = z.object({ kisiler: z.array(istasyonKisiSemasi) });
export const makineKisiSemasi = z.object({ makineId: z.number().int(), ...atamaOrtak });
export const makineKisileriCevabi = z.object({ kisiler: z.array(makineKisiSemasi) });
export const ekipSemasi = z.object({
  id: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  istasyonId: z.number().int().nullable(),
  aktif: z.boolean(),
});
// Üye sayısı bugün geçerli üyeliklerdir.
export const ekipKaydiSemasi = ekipSemasi.extend({ ...surumlu, uyeSayisi: z.number().int() });
export const ekiplerCevabi = z.object({ ekipler: z.array(ekipKaydiSemasi) });
export const ekipUyeSemasi = z.object({ ekipId: z.number().int(), ...atamaOrtak });
export const ekipUyeleriCevabi = z.object({ kisiler: z.array(ekipUyeSemasi) });
// Çıkarma bu satırları iptal eder; yuzde boşsa satır planlı bir çıkarmadır.
export const iptalOnizlemesiCevabi = z.object({
  satirlar: z.array(z.object({ baslangic: z.string(), yuzde: ondalikMetinSemasi.nullable() })),
});
export const kisiSecenegiSemasi = z.object({ id: z.number().int(), ad: z.string(), aktif: z.boolean() });
export const kisiSecenekleriCevabi = z.object({ kisiler: z.array(kisiSecenegiSemasi) });

export const kisiIsMerkezleriCevabi = z.object({ isMerkeziIdleri: z.array(z.number().int()) });
// Gövdesiz cevap (204).
export const bosCevap = z.undefined();

// Plan girdileri (T2, #409): istasyon plan ayarı ve makine durumu. Satırı olmayan istasyon verim %100 ve operatör 1, satırı olmayan makine
// çalışır sayılır. Gövdedeki sürüm okunan satırın sürümüdür (satır yoksa 0); verilmezse denetlenmez (Rota ekranı bağlamada gönderecek).
export const MAKINE_DURUMLARI = ['calisir', 'ariza', 'bakim'] as const;
const okunanSurum = z.number().int().min(0).max(2147483647).optional();
const degistiren = z.object({ id: z.number().int(), ad: z.string().nullable() });

export const planAyariGovdesi = z.object({
  verimYuzde: z.number().positive().max(200),
  operatorIhtiyaci: z.number().min(0).max(10),
  surum: okunanSurum,
});
export const istasyonPlanAyari = z.object({
  istasyonId: z.number().int(),
  verimYuzde: ondalikMetinSemasi,
  operatorIhtiyaci: ondalikMetinSemasi,
  degistiren,
  degisme: zamanSemasi,
  surum: surumSemasi,
});
export const planAyarlariCevabi = z.object({ ayarlar: z.array(istasyonPlanAyari) });

export const makineDurumuGovdesi = z.object({
  durum: z.enum(MAKINE_DURUMLARI),
  aciklama: z.string().trim().max(200).nullish().transform((m) => (m ? m : null)),
  surum: okunanSurum,
});
export const makineDurumuSemasi = z.object({
  makineId: z.number().int(),
  durum: z.enum(MAKINE_DURUMLARI),
  aciklama: z.string().nullable(),
  degistiren,
  degisme: zamanSemasi,
  surum: surumSemasi,
});
export const makineDurumlariCevabi = z.object({ durumlar: z.array(makineDurumuSemasi) });

// Ana sayfa kartları (#483): yalnız sayı döner, kayıt dökmez; bu yüzden terminal, vardiya ve personel sayfası olan da okur.
const sayi = z.number().int().min(0);
export const panoOzetiCevabi = z.object({
  makine: z.object({ toplam: sayi, calisir: sayi, ariza: sayi, bakim: sayi }),
  personel: z.object({ kisi: sayi, isMerkezi: sayi }),
});

// Yetkinlik: kişinin çalışabildiği istasyonlar. Liste tümden yazılır (kişi iş merkezi kısıtıyla aynı kalıp).
// Karar 146 a: her yetkinlik kimin ne zaman verdiğini, geçerlilik bitişini ve dayanağını taşır; süresi dolan yetkinlik (`gecerli: false`)
// listede kalır ama iş başlatmaz. Veren ve verilme karardan önceki satırlarda boştur.
export const yetkinlikGovdesi = z.object({ istasyonIdleri: z.array(kimlik).max(500) });
// 565 a: yetkinlik matrisinde toplu aç ve kapat (satır ya da sütun); her kişinin listesi tek uçtaki gibi fark olarak yazılır, hepsi ya da hiçbiri.
// 563 c: makine sütunları da aynı uçtan gider; istasyon değişiklikleri önce uygulanır (istasyonu ve makinesi birlikte açılabilsin).
export const yetkinlikTopluGovdesi = z.object({
  degisiklikler: z.array(z.object({ kisiId: kimlik, istasyonId: kimlik, yetkin: z.boolean() })).max(2000).default([]),
  makineler: z.array(z.object({ kisiId: kimlik, makineId: kimlik, yetkin: z.boolean() })).max(2000).default([]),
}).refine((g) => g.degisiklikler.length + g.makineler.length > 0, 'En az bir değişiklik gerekli.');
// 563 c: kişinin bakabildiği makineler; yalnız yetkin olduğu istasyonun makineleri. Liste tümden yazılır, fark deftere girer.
export const makineYetkinlikGovdesi = z.object({ makineIdleri: z.array(kimlik).max(500) });
// 563 2 a: aynı anda en çok kaç tezgâh; boş sınırsızdır (yalnız tezgâh oranlarının toplamı 1'i geçmez).
export const TEZGAH_SINIRI_EN_COK = 20;
export const tezgahSiniriGovdesi = z.object({ enCok: z.number().int().min(1).max(TEZGAH_SINIRI_EN_COK).nullable() });
export const yetkinlikAyrintisiSemasi = z.object({
  istasyonId: z.number().int(),
  verenKisiId: z.number().int().nullable(),
  verilme: zamanSemasi.nullable(),
  gecerlilikBitis: tarihSemasi.nullable(),
  dayanak: z.string().nullable(),
  gecerli: z.boolean(),
  surum: surumSemasi,
});
const kisiYetkinligiAlanlari = {
  istasyonIdleri: z.array(z.number().int()),
  ayrintilar: z.array(yetkinlikAyrintisiSemasi),
  makineIdleri: z.array(z.number().int()),
  enCok: z.number().int().nullable(),
};
export const kisiYetkinligiSemasi = z.object({ kisiId: z.number().int(), ...kisiYetkinligiAlanlari });
export const yetkinliklerCevabi = z.object({ yetkinlikler: z.array(kisiYetkinligiSemasi) });
export const kisiYetkinligiCevabi = z.object(kisiYetkinligiAlanlari);
export const yetkinlikParametresi = z.object({ kisiId: z.coerce.number().int().positive(), istasyonId: z.coerce.number().int().positive() });
export const yetkinlikAyrintiGovdesi = z.object({
  ...beklenenSurum,
  gecerlilikBitis: tarihSemasi.nullable(),
  dayanak: z.string().trim().max(300).nullish().transform((m) => (m ? m : null)),
});
export const yetkinlikGecmisiCevabi = z.object({
  gecmis: z.array(z.object({
    istasyonId: z.number().int(),
    istasyonKod: z.string(),
    islem: z.enum(['ver', 'degistir', 'kaldir']),
    gecerlilikBitis: tarihSemasi.nullable(),
    dayanak: z.string().nullable(),
    degistirenKisiId: z.number().int(),
    zaman: zamanSemasi,
  })),
  makineGecmis: z.array(z.object({
    makineId: z.number().int(),
    makineKod: z.string(),
    islem: z.enum(['ver', 'kaldir']),
    neden: z.enum(['elle', 'istasyon_yetkinligi_kalkti']),
    degistirenKisiId: z.number().int(),
    zaman: zamanSemasi,
  })),
});

// Toplu işlem (kart #1296, kullanıcı kararı "hepsi ya da hiçbiri"): seçilen kayıtlar tek komutla, her biri okunan sürümüyle gider.
// Biri reddedilirse hiçbiri yazılmaz; hata iletisi o kaydın kodunu taşır, ayrıntıda `kayitId` vardır.
export const TOPLU_EN_COK = 500;
const topluKayitlar = z.array(z.object({ id: kimlik, surum: surumSemasi })).min(1).max(TOPLU_EN_COK)
  .refine((k) => new Set(k.map((x) => x.id)).size === k.length, 'Aynı kayıt iki kez seçilemez.');
export const makineTopluTasiGovdesi = z.object({ kayitlar: topluKayitlar, istasyonId: kimlik.nullable() });
export const istasyonTopluTasiGovdesi = z.object({ kayitlar: topluKayitlar, isMerkeziId: kimlik });
export const topluAktiflikGovdesi = z.object({ kayitlar: topluKayitlar, aktif: z.boolean() });
// Durumun sürümü durum satırınındır (satır yoksa 0), makine kaydının değil.
export const makineTopluDurumGovdesi = z.object({
  kayitlar: z.array(z.object({ id: kimlik, surum: z.number().int().min(0).max(2147483647) })).min(1).max(TOPLU_EN_COK)
    .refine((k) => new Set(k.map((x) => x.id)).size === k.length, 'Aynı kayıt iki kez seçilemez.'),
  durum: z.enum(MAKINE_DURUMLARI),
  aciklama: z.string().trim().max(200).nullish().transform((m) => (m ? m : null)),
});

// Çoklu ekle (kart #1296, kullanıcı kararı): kodları ekran desenden üretir (CNC-01..CNC-20); ortak alanlar bir kez gelir.
export const COKLU_EN_COK = 200;
const cokluKayitlar = z.array(z.object({ kod: kodSemasi, ad: adSemasi })).min(1).max(COKLU_EN_COK)
  .refine((k) => new Set(k.map((x) => x.kod)).size === k.length, 'Aynı kod listede iki kez var.');
export const makineCokluEkleGovdesi = z.object({ kayitlar: cokluKayitlar, tur: istegeBagliMetin, istasyonId: kimlik.nullable() });
export const istasyonCokluEkleGovdesi = z.object({
  kayitlar: cokluKayitlar,
  isMerkeziId: kimlik,
  tip: istasyonTipi.default('talasli'),
  kapasiteKaynagi: kapasiteKaynagi,
});

export type IsMerkezi = z.output<typeof isMerkeziSemasi>;
export type Istasyon = z.output<typeof istasyonSemasi>;
export type Makine = z.output<typeof makineSemasi>;
export type OperasyonTipi = z.output<typeof operasyonTipiSemasi>;
export type SurumluOperasyonTipi = z.output<typeof operasyonTipiKaydiSemasi>;
export type OperasyonTipiKaydi = z.output<typeof operasyonTipiGovdesi>;
export type OperasyonTipiGuncellemesi = z.output<typeof operasyonTipiGuncellemeGovdesi>;
export type OperasyonTipiGovdesi = z.input<typeof operasyonTipiGovdesi>;
export type OperasyonTipiGuncellemeGovdesi = z.input<typeof operasyonTipiGuncellemeGovdesi>;
export type OperasyonTipleriCevabi = z.output<typeof operasyonTipleriCevabi>;
export type SurumluIsMerkezi = z.output<typeof isMerkeziKaydiSemasi>;
export type SurumluIstasyon = z.output<typeof istasyonKaydiSemasi>;
export type SurumluMakine = z.output<typeof makineKaydiSemasi>;
export type IstasyonTipi = z.output<typeof istasyonTipi>;
export type BaglantiTuru = z.output<typeof baglantiTuru>;
export type KapasiteKaynagi = z.output<typeof kapasiteKaynagi>;
export type SecimGrubu = z.output<typeof secimGrubuSemasi>;
export type IsMerkeziKaydi = z.output<typeof isMerkeziGovdesi>;
export type IstasyonKaydi = z.output<typeof istasyonGovdesi>;
export type MakineKaydi = z.output<typeof makineGovdesi>;
export type IsMerkeziGuncellemesi = z.output<typeof isMerkeziGuncellemeGovdesi>;
export type IstasyonGuncellemesi = z.output<typeof istasyonGuncellemeGovdesi>;
export type MakineGuncellemesi = z.output<typeof makineGuncellemeGovdesi>;
export type IsMerkeziGovdesi = z.input<typeof isMerkeziGovdesi>;
export type IstasyonGovdesi = z.input<typeof istasyonGovdesi>;
export type MakineGovdesi = z.input<typeof makineGovdesi>;
export type KisiIsMerkezleriGovdesi = z.input<typeof kisiIsMerkezleriGovdesi>;
export type IsMerkezleriCevabi = z.output<typeof isMerkezleriCevabi>;
export type IstasyonlarCevabi = z.output<typeof istasyonlarCevabi>;
export type MakinelerCevabi = z.output<typeof makinelerCevabi>;
export type IstasyonSecimiCevabi = z.output<typeof istasyonSecimiCevabi>;
export type KisiIsMerkezleriCevabi = z.output<typeof kisiIsMerkezleriCevabi>;
export type IstasyonKisi = z.output<typeof istasyonKisiSemasi>;
export type IstasyonKisileriCevabi = z.output<typeof istasyonKisileriCevabi>;
export type MakineKisi = z.output<typeof makineKisiSemasi>;
export type MakineKisileriCevabi = z.output<typeof makineKisileriCevabi>;
export type AtamaGovdesi = z.input<typeof atamaGovdesi>;
export type AtamaKaldirGovdesi = z.input<typeof atamaKaldirGovdesi>;
export type Ekip = z.output<typeof ekipSemasi>;
export type SurumluEkip = z.output<typeof ekipKaydiSemasi>;
export type EkipKaydi = z.output<typeof ekipGovdesi>;
export type EkipGuncellemesi = z.output<typeof ekipGuncellemeGovdesi>;
export type EkipGovdesi = z.input<typeof ekipGovdesi>;
export type EkipGuncellemeGovdesi = z.input<typeof ekipGuncellemeGovdesi>;
export type EkiplerCevabi = z.output<typeof ekiplerCevabi>;
export type EkipUyesi = z.output<typeof ekipUyeSemasi>;
export type EkipUyeleriCevabi = z.output<typeof ekipUyeleriCevabi>;
export type AtamaTuru = (typeof ATAMA_TURLERI)[number];
export type IptalOnizlemesiCevabi = z.output<typeof iptalOnizlemesiCevabi>;
export type KisiSecenegi = z.output<typeof kisiSecenegiSemasi>;
export type KisiSecenekleriCevabi = z.output<typeof kisiSecenekleriCevabi>;
export type MakineDurumuDegeri = (typeof MAKINE_DURUMLARI)[number];
export type PlanAyariGovdesi = z.input<typeof planAyariGovdesi>;
export type IstasyonPlanAyari = z.output<typeof istasyonPlanAyari>;
export type PlanAyarlariCevabi = z.output<typeof planAyarlariCevabi>;
export type MakineDurumuGovdesi = z.input<typeof makineDurumuGovdesi>;
export type MakineDurumu = z.output<typeof makineDurumuSemasi>;
export type MakineDurumlariCevabi = z.output<typeof makineDurumlariCevabi>;
export type PanoOzetiCevabi = z.output<typeof panoOzetiCevabi>;
export type YetkinlikGovdesi = z.input<typeof yetkinlikGovdesi>;
export type YetkinlikTopluGovdesi = z.input<typeof yetkinlikTopluGovdesi>;
export type MakineYetkinlikGovdesi = z.input<typeof makineYetkinlikGovdesi>;
export type TezgahSiniriGovdesi = z.input<typeof tezgahSiniriGovdesi>;
export type YetkinliklerCevabi = z.output<typeof yetkinliklerCevabi>;
export type YetkinlikAyrintisi = z.output<typeof yetkinlikAyrintisiSemasi>;
export type YetkinlikAyrintiGovdesi = z.input<typeof yetkinlikAyrintiGovdesi>;
export type YetkinlikGecmisiCevabi = z.output<typeof yetkinlikGecmisiCevabi>;
export type MakineTopluTasiGovdesi = z.input<typeof makineTopluTasiGovdesi>;
export type IstasyonTopluTasiGovdesi = z.input<typeof istasyonTopluTasiGovdesi>;
export type TopluAktiflikGovdesi = z.input<typeof topluAktiflikGovdesi>;
export type MakineTopluDurumGovdesi = z.input<typeof makineTopluDurumGovdesi>;
export type MakineCokluEkleGovdesi = z.input<typeof makineCokluEkleGovdesi>;
export type IstasyonCokluEkleGovdesi = z.input<typeof istasyonCokluEkleGovdesi>;

// Ortak seçicinin (IstasyonSecici, MakineSecici) arama ucu (kart #1318): kod ya da ad içinde arar, sayfa başına SECIM_SAYFA_BOYU
// kayıt; `ust` makinede istasyon, istasyonda iş merkezidir (seçici gruplar). Varsayılan yalnız aktifler.
export const SECIM_SAYFA_BOYU = 30;
export const tesisSecimSorgusu = z.object({
  tur: z.enum(['istasyon', 'makine']),
  q: z.string().trim().max(80).default(''),
  istasyonId: z.coerce.number().int().positive().optional(),
  pasifler: mantiksal,
  sayfa: z.coerce.number().int().min(1).max(1000).default(1),
});
export const tesisSecimCevabi = z.object({
  sonuclar: z.array(z.object({
    id: z.number().int(),
    kod: z.string(),
    ad: z.string(),
    aktif: z.boolean(),
    ust: z.object({ id: z.number().int(), kod: z.string(), ad: z.string() }).nullable(),
  })),
  dahaVar: z.boolean(),
});
export type TesisSecimSorgusu = z.input<typeof tesisSecimSorgusu>;
export type TesisSecimCevabi = z.output<typeof tesisSecimCevabi>;
