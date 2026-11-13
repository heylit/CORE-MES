import { z } from 'zod';
import { TOPLU_EN_COK_SATIR } from '../toplu.ts';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

export const ISTASYON_TIPLERI = ['talasli', 'kalite', 'depo', 'markalama', 'boya', 'montaj', 'tesviye'] as const;
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

export const kimlikParametresi = z.object({ id: z.coerce.number<number>().int().positive() });
export const kisiParametresi = z.object({ kisiId: z.coerce.number<number>().int().positive() });
const mantiksal = z.enum(['true', 'false']).optional().transform((d) => d === 'true');
export const pasifSorgusu = z.object({ pasifler: mantiksal });
export const makineSorgusu = z.object({
  pasifler: mantiksal,
  istasyonId: z.coerce.number<number>().int().positive().optional(),
});

// Yazma uçlarının gövdesi tüm kaydı taşır: güncelleme de tam kayıttır (pasife alma `aktif` ile).
export const isMerkeziGovdesi = z.object({
  kod: kodSemasi,
  ad: adSemasi,
  aciklama: istegeBagliMetin,
  aktif: z.boolean().prefault(true),
});

export const istasyonGovdesi = z.object({
  kod: kodSemasi,
  ad: adSemasi,
  isMerkeziId: kimlik,
  tip: istasyonTipi.prefault('talasli'),
  // Sorumlu bilgi alanıdır, yetki vermez. Kapasite kaynağını bugün ekran zorunlu tutar; sunucu boşu kabul eder (E2z, borçta).
  sorumluKisiId: kimlik.nullish().transform((k) => k ?? null),
  kapasiteKaynagi: kapasiteKaynagi.nullish().transform((k) => k ?? null),
  // Stok üretim alanı konumunu yalnız işaretli istasyona bağlar (SH5 b).
  uretimAlani: z.boolean().prefault(false),
  aktif: z.boolean().prefault(true),
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
  aktif: z.boolean().prefault(true),
});
const adresTurIster = {
  kosul: (m: { baglantiAdresi: string | null; baglantiTuru: string | null }) => m.baglantiAdresi === null || m.baglantiTuru !== null,
  ileti: { message: 'Bağlantı adresi yalnız bağlantı türü seçiliyken girilir.', path: ['baglantiAdresi'] },
};
// 2902 (madde 6): istasyon seçilmeyen yeni makine için, verilen iş merkezinde makinenin kodu ve adıyla istasyon açılır (kapasite kaynağı
// makine) ve makine ona bağlanır; ikisi tek işlemde. Boşsa makine bugünkü gibi istasyonsuz kalır. Yalnız eklemede.
const yeniIstasyonIleti = { message: 'İstasyon seçiliyken yeni istasyon açılmaz.', path: ['yeniIstasyonIsMerkeziId'] };
export const makineGovdesi = makineAlanlari.extend({ yeniIstasyonIsMerkeziId: kimlik.nullish() })
  .refine(adresTurIster.kosul, adresTurIster.ileti)
  .refine((m) => m.istasyonId === null || m.yeniIstasyonIsMerkeziId == null, yeniIstasyonIleti);

// Güncelleme, istemcinin okuduğu sürümü taşır; arada başkası yazdıysa komut 409 alır, üstüne yazmaz (IS9).
export const isMerkeziGuncellemeGovdesi = isMerkeziGovdesi.extend(beklenenSurum);
// İşareti bilmeyen çağıran (rota Kaynaklar ekranı, test kurulumları) güncellerken işareti silmesin: gönderilmeyen işaret değişmez.
export const istasyonGuncellemeGovdesi = istasyonGovdesi.extend({ ...beklenenSurum, uretimAlani: z.boolean().optional() });
export const makineGuncellemeGovdesi = makineAlanlari.extend(beklenenSurum).refine(adresTurIster.kosul, adresTurIster.ileti);

export const kisiIsMerkezleriGovdesi = z.object({ isMerkeziIdleri: z.array(kimlik).max(500) });

// Kişi atamaları (IK1-IK3): yüzde iki ondalıklı metindir, sayıya çevrilip taşınmaz; tarih geçerlilik başlangıcıdır.
export const idKisiParametresi = z.object({
  id: z.coerce.number<number>().int().positive(),
  kisiId: z.coerce.number<number>().int().positive(),
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
export const atamaKaldirGovdesi = z.object({ baslangic: tarihMetni.optional() }).prefault({});
// Ekip silinmez; pasife alma `aktif` ile (IK7).
export const ATAMA_TURLERI = ['istasyon', 'makine', 'ekip'] as const;
export const iptalOnizlemeSorgusu = z.object({
  tur: z.enum(ATAMA_TURLERI),
  hedefId: z.coerce.number<number>().int().positive(),
  kisiId: z.coerce.number<number>().int().positive(),
  baslangic: tarihMetni.optional(),
});
export const ekipGovdesi = z.object({
  kod: kodSemasi,
  ad: adSemasi,
  istasyonId: kimlik.nullish().transform((k) => k ?? null),
  aktif: z.boolean().prefault(true),
});
export const ekipGuncellemeGovdesi = ekipGovdesi.extend(beklenenSurum);
export const ekipUyeSorgusu = z.object({ ekipId: z.coerce.number<number>().int().positive().optional(), tarih: tarihMetni.optional() });
export const istasyonKisiSorgusu = z.object({ istasyonId: z.coerce.number<number>().int().positive().optional(), tarih: tarihMetni.optional() });
export const makineKisiSorgusu = z.object({ makineId: z.coerce.number<number>().int().positive().optional(), tarih: tarihMetni.optional() });

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
  aktif: z.boolean().prefault(true),
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
  degisiklikler: z.array(z.object({ kisiId: kimlik, istasyonId: kimlik, yetkin: z.boolean() })).max(2000).prefault([]),
  makineler: z.array(z.object({ kisiId: kimlik, makineId: kimlik, yetkin: z.boolean() })).max(2000).prefault([]),
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
// 1303 a: ayar yetkinliği (kişi x makine), çalışma yetkinliğinden ayrı; geçerlilik ve dayanakla.
export const ayarYetkinligiAyrintisiSemasi = yetkinlikAyrintisiSemasi.omit({ istasyonId: true, verenKisiId: true, verilme: true })
  .extend({ makineId: z.number().int(), verenKisiId: z.number().int(), verilme: zamanSemasi });
const kisiYetkinligiAlanlari = {
  istasyonIdleri: z.array(z.number().int()),
  ayrintilar: z.array(yetkinlikAyrintisiSemasi),
  makineIdleri: z.array(z.number().int()),
  enCok: z.number().int().nullable(),
  ayar: z.array(ayarYetkinligiAyrintisiSemasi),
};
export const kisiYetkinligiSemasi = z.object({ kisiId: z.number().int(), ...kisiYetkinligiAlanlari });
export const yetkinliklerCevabi = z.object({ yetkinlikler: z.array(kisiYetkinligiSemasi) });
export const kisiYetkinligiCevabi = z.object(kisiYetkinligiAlanlari);
export const yetkinlikParametresi = z.object({ kisiId: z.coerce.number<number>().int().positive(), istasyonId: z.coerce.number<number>().int().positive() });
export const ayarYetkinligiParametresi = z.object({ kisiId: z.coerce.number<number>().int().positive(), makineId: z.coerce.number<number>().int().positive() });
// Liste tümden yazılır: seçilen makineler ve seçilen istasyonların bütün aktif makineleri (1303 a).
export const ayarYetkinligiBelirleGovdesi = z.object({
  makineIdleri: z.array(kimlik).max(500).prefault([]),
  istasyonIdleri: z.array(kimlik).max(200).prefault([]),
});
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
  ayarGecmis: z.array(z.object({
    makineId: z.number().int(),
    makineKod: z.string(),
    islem: z.enum(['ver', 'degistir', 'kaldir']),
    gecerlilikBitis: tarihSemasi.nullable(),
    dayanak: z.string().nullable(),
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
export const makineCokluEkleGovdesi = z.object({ kayitlar: cokluKayitlar, tur: istegeBagliMetin, istasyonId: kimlik.nullable(), yeniIstasyonIsMerkeziId: kimlik.nullish() })
  .refine((g) => g.istasyonId === null || g.yeniIstasyonIsMerkeziId == null, yeniIstasyonIleti);
export const istasyonCokluEkleGovdesi = z.object({
  kayitlar: cokluKayitlar,
  isMerkeziId: kimlik,
  tip: istasyonTipi.prefault('talasli'),
  kapasiteKaynagi: kapasiteKaynagi,
});

// Toplu kaydet (2627; 1/2 b "tek hata varsa hiçbiri", 2/2 c "her sayfada güncelle"): Excel gibi toplu girişin satırları tek komutla,
// tek transaction'da yazılır. Satır kodla gelirse yeni kayıttır, id ve sürümle gelirse güncellemedir. Yeni satır tek kayıt gövdesinin
// kendisidir; yalnız üst kayda kodla bağlanır (aynı istekte açılan iş merkezine istasyon bağlanabilsin, sunucu kodu çözer).
// Güncellemede alanlar isteğe bağlıdır ve boş olamaz: gönderilmeyen alan değişmez, alan toplu girişle boşaltılmaz.
// Bilinmeyen anahtar reddedilir (rol, bayrak gibi alan sızmasın).
export const TOPLU_KAYDET_EN_COK = TOPLU_EN_COK_SATIR;
const topluSatirNo = z.number().int().min(1).max(1_048_576);
const doluMetin = z.string().trim().min(1).max(200);
// Kayıt türü `kayit` alanındadır (`tur` makinenin kendi alanıdır).
const topluSatir = <K extends string, I extends 'ekle' | 'guncelle', T extends z.ZodRawShape>(kayit: K, islem: I, alanlar: T) =>
  z.object({ kayit: z.literal(kayit), islem: z.literal(islem), satir: topluSatirNo, ...alanlar }).strict();
const topluGuncelleme = { id: kimlik, ...beklenenSurum };
const isMerkeziTopluSatiri = z.discriminatedUnion('islem', [
  topluSatir('is-merkezi', 'ekle', isMerkeziGovdesi.shape),
  topluSatir('is-merkezi', 'guncelle', {
    ...topluGuncelleme, kod: kodSemasi.optional(), ad: adSemasi.optional(), aciklama: doluMetin.optional(), aktif: z.boolean().optional(),
  }),
]);
const { isMerkeziId: _isMerkeziId, ...istasyonYeniAlanlari } = istasyonGovdesi.shape;
const istasyonTopluSatiri = z.discriminatedUnion('islem', [
  topluSatir('istasyon', 'ekle', { ...istasyonYeniAlanlari, isMerkeziKodu: kodSemasi }),
  topluSatir('istasyon', 'guncelle', {
    ...topluGuncelleme, kod: kodSemasi.optional(), ad: adSemasi.optional(), isMerkeziKodu: kodSemasi.optional(), tip: istasyonTipi.optional(),
    sorumluKisiId: kimlik.optional(), kapasiteKaynagi: kapasiteKaynagi.optional(), uretimAlani: z.boolean().optional(), aktif: z.boolean().optional(),
  }),
]);
const { istasyonId: _istasyonId, ...makineYeniAlanlari } = makineAlanlari.shape;
const makineTopluSatiri = z.discriminatedUnion('islem', [
  topluSatir('makine', 'ekle', { ...makineYeniAlanlari, istasyonKodu: kodSemasi.nullish().transform((k) => k ?? null), yeniIstasyonIsMerkeziKodu: kodSemasi.nullish() }),
  topluSatir('makine', 'guncelle', {
    ...topluGuncelleme, kod: kodSemasi.optional(), ad: adSemasi.optional(), tur: doluMetin.optional(), markaModel: doluMetin.optional(), seriNo: doluMetin.optional(),
    istasyonKodu: kodSemasi.optional(), baglantiTuru: baglantiTuru.optional(), baglantiAdresi: doluMetin.optional(), aktif: z.boolean().optional(),
  }),
]);
const tesisTopluSatiri = z.discriminatedUnion('kayit', [isMerkeziTopluSatiri, istasyonTopluSatiri, makineTopluSatiri]);
const ayniAnahtarYok = (satirlar: readonly { kayit: string; islem: string; kod?: string; id?: number }[]): boolean => {
  const anahtarlar = satirlar.map((s) => (s.islem === 'ekle' ? `${s.kayit}:kod:${s.kod ?? ''}` : `${s.kayit}:id:${String(s.id)}`));
  return new Set(anahtarlar).size === anahtarlar.length;
};
export const istasyonTopluKaydetGovdesi = z.object({
  satirlar: z.array(tesisTopluSatiri).min(1).max(TOPLU_KAYDET_EN_COK)
    .refine(ayniAnahtarYok, 'Aynı kayıt dosyada iki kez var.')
    .refine((s) => new Set(s.map((x) => x.satir)).size === s.length, 'Satır numarası iki kez var.')
    .superRefine((s, b) => s.forEach((x, i) => {
      if (x.kayit === 'makine' && x.islem === 'ekle' && !adresTurIster.kosul(x)) {
        // `adresTurIster.ileti` zod'a verildiğinde iletisi nesneden alınır; metin burada sabit yazılır.
        b.addIssue({ code: 'custom', message: 'Bağlantı adresi yalnız bağlantı türü seçiliyken girilir.', path: [i, 'baglantiAdresi'] });
      }
    })),
}).strict();
export const topluKaydetCevabi = z.object({ eklenen: z.number().int().min(0), guncellenen: z.number().int().min(0) });

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
export type AyarYetkinligiAyrintisi = z.output<typeof ayarYetkinligiAyrintisiSemasi>;
export type AyarYetkinligiBelirleGovdesi = z.input<typeof ayarYetkinligiBelirleGovdesi>;
export type MakineTopluTasiGovdesi = z.input<typeof makineTopluTasiGovdesi>;
export type IstasyonTopluTasiGovdesi = z.input<typeof istasyonTopluTasiGovdesi>;
export type TopluAktiflikGovdesi = z.input<typeof topluAktiflikGovdesi>;
export type MakineTopluDurumGovdesi = z.input<typeof makineTopluDurumGovdesi>;
export type MakineCokluEkleGovdesi = z.input<typeof makineCokluEkleGovdesi>;
export type IstasyonCokluEkleGovdesi = z.input<typeof istasyonCokluEkleGovdesi>;
export type IstasyonTopluKaydetGovdesi = z.input<typeof istasyonTopluKaydetGovdesi>;
export type IstasyonTopluKaydetGirdisi = z.output<typeof istasyonTopluKaydetGovdesi>;
export type TesisTopluSatiri = IstasyonTopluKaydetGirdisi['satirlar'][number];
export type TopluKaydetCevabi = z.output<typeof topluKaydetCevabi>;

// Ortak seçicinin (IstasyonSecici, MakineSecici) arama ucu (kart #1318): kod ya da ad içinde arar, sayfa başına SECIM_SAYFA_BOYU
// kayıt; `ust` makinede istasyon, istasyonda iş merkezidir (seçici gruplar). Varsayılan yalnız aktifler.
export const SECIM_SAYFA_BOYU = 30;
export const tesisSecimSorgusu = z.object({
  tur: z.enum(['istasyon', 'makine']),
  q: z.string().trim().max(80).prefault(''),
  istasyonId: z.coerce.number<number>().int().positive().optional(),
  pasifler: mantiksal,
  sayfa: z.coerce.number<number>().int().min(1).max(1000).prefault(1),
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

// 2112 (2099-1 a): aparatın plan kapasitesi, yani planın aynı anda kullanabileceği adet. Kart Malzemeler'de, adet ve yer Stok'ta.
// `aparatKartiId` malzemelerin kart kimliğidir; bu modül malzemeleri okumaz (ADR 0006 yönü), kartın adını çağıran modül ekler.
// İstasyon boşsa aparat istasyonlar arasında ortaktır. Kart değişmez: başka karta geçmek silip yeniden eklemektir.
export const APARAT_ADET_TAVANI = 10000;
const aparatAdedi = z.number().int().min(1, 'Adet en az 1.').max(APARAT_ADET_TAVANI);
// Sütun `int`: aşan kimlik sorguya varırsa 400 yerine 500 döner.
const intKimlik = kimlik.max(2147483647);
// 3199 (A + D): satır planın ikincil kaynağıdır. Tür aparat ya da özel takım; kısıt "sert" plan bekletir, "izle" yalnız aşımı uyarır.
// Ömür yalnız özel takımda, dakika (kesme) ya da adet birimiyle (V15); boşsa sayılmaz. Değişim süresi ömür bitince işe eklenen dakikadır.
// Kesinti takvimi satırla birlikte yazılır (gönderilen liste satırdakinin yerine geçer); aralıkta adet o kadar düşer.
export const IKINCIL_KAYNAK_TURLERI = ['aparat', 'ozel_takim'] as const;
export const IKINCIL_KAYNAK_KISITLARI = ['sert', 'izle'] as const;
export const OMUR_BIRIMLERI = ['dk', 'adet'] as const;
export const KESINTI_NEDENLERI = ['bakim', 'kalibrasyon', 'odunc'] as const;
export const KESINTI_EN_COK = 50;
export const DEGISIM_DK_TAVANI = 1440;
export const OMUR_TAVANI = 1000000;
const kesintiGovdesi = z.object({
  neden: z.enum(KESINTI_NEDENLERI),
  baslangic: zamanSemasi,
  bitis: zamanSemasi,
  adet: aparatAdedi,
  aciklama: z.string().trim().min(1).max(200).nullable().default(null),
}).refine((k) => Date.parse(k.bitis) > Date.parse(k.baslangic), { message: 'Kesintinin bitişi başlangıcından sonra olmalı.', path: ['bitis'] });
const ikincilKaynakAlanlari = {
  tur: z.enum(IKINCIL_KAYNAK_TURLERI).default('aparat'),
  kisit: z.enum(IKINCIL_KAYNAK_KISITLARI).default('sert'),
  omur: z.number().positive('Ömür sıfırdan büyük olmalı.').max(OMUR_TAVANI).multipleOf(0.01).nullable().default(null),
  omurBirimi: z.enum(OMUR_BIRIMLERI).nullable().default(null),
  degisimDk: z.number().int().min(0).max(DEGISIM_DK_TAVANI).nullable().default(null),
  kesintiler: z.array(kesintiGovdesi).max(KESINTI_EN_COK).default([]),
};
const omurTutarli = (g: { tur: string; omur: number | null; omurBirimi: string | null }): boolean =>
  (g.omur === null) === (g.omurBirimi === null) && (g.omur === null || g.tur === 'ozel_takim');
const OMUR_TUTARSIZ = { message: 'Ömür yalnız özel takımda ve birimiyle (dakika ya da adet) girilir.', path: ['omur'] };
export const aparatKapasitesiGovdesi = z.object({ aparatKartiId: intKimlik, istasyonId: intKimlik.nullable(), adet: aparatAdedi, ...ikincilKaynakAlanlari })
  .refine(omurTutarli, OMUR_TUTARSIZ);
export const aparatKapasitesiGuncellemeGovdesi = z.object({ ...beklenenSurum, istasyonId: intKimlik.nullable(), adet: aparatAdedi, ...ikincilKaynakAlanlari })
  .refine(omurTutarli, OMUR_TUTARSIZ);
export const aparatKapasitesiSilmeGovdesi = z.object({ ...beklenenSurum });
export const aparatKapasitesi = z.object({
  id: z.number().int(),
  aparatKartiId: z.number().int(),
  istasyonId: z.number().int().nullable(),
  adet: z.number().int(),
  tur: z.enum(IKINCIL_KAYNAK_TURLERI),
  kisit: z.enum(IKINCIL_KAYNAK_KISITLARI),
  omur: z.number().nullable(),
  omurBirimi: z.enum(OMUR_BIRIMLERI).nullable(),
  degisimDk: z.number().int().nullable(),
  kesintiler: z.array(z.object({
    id: z.number().int(), neden: z.enum(KESINTI_NEDENLERI), baslangic: zamanSemasi, bitis: zamanSemasi, adet: z.number().int(), aciklama: z.string().nullable(),
  })),
  degistiren,
  degisme: zamanSemasi,
  surum: surumSemasi,
});
export const aparatKapasiteleriCevabi = z.object({ kapasiteler: z.array(aparatKapasitesi) });
export type AparatKapasitesiGovdesi = z.input<typeof aparatKapasitesiGovdesi>;
export type AparatKapasitesiGuncellemeGovdesi = z.input<typeof aparatKapasitesiGuncellemeGovdesi>;
export type AparatKapasitesiSilmeGovdesi = z.input<typeof aparatKapasitesiSilmeGovdesi>;
export type AparatKapasitesi = z.output<typeof aparatKapasitesi>;
export type AparatKapasiteleriCevabi = z.output<typeof aparatKapasiteleriCevabi>;
export type AparatKesintisi = AparatKapasitesi['kesintiler'][number];

// Tesis şablonu (2166-1 a): atölyenin hazır iş merkezi ve istasyon listesi. "Şablonu uygula" eksik olanı kodla açar, var olan koda
// dokunmaz; sonra liste serbestçe büyür ya da pasife alınır. Talaşlı merkezde istasyon yoktur: tezgâh parkı tesise özgüdür.
// Kalite bir iş merkezidir (kullanıcı isteği, kart 2166); istasyonları KAL grubundaki operasyonların yapıldığı yerlerdir.
export interface SablonIstasyonu { kod: string; ad: string; tip: IstasyonTipi; kapasiteKaynagi: KapasiteKaynagi }
export interface SablonMerkezi { kod: string; ad: string; aciklama: string; istasyonlar: readonly SablonIstasyonu[] }
const insanli = (kod: string, ad: string, tip: IstasyonTipi): SablonIstasyonu => ({ kod, ad, tip, kapasiteKaynagi: 'insan' });
export const TESIS_SABLONU: readonly SablonMerkezi[] = [
  { kod: 'TALASLI', ad: 'Talaşlı imalat', aciklama: 'Torna, freze, işleme merkezi', istasyonlar: [] },
  {
    kod: 'KALITE', ad: 'Kalite', aciklama: 'Giriş, ara ve son kontrol, ölçüm', istasyonlar: [
      insanli('KAL-GKK', 'Giriş kalite kontrol', 'kalite'),
      insanli('KAL-ARA', 'Ara kontrol', 'kalite'),
      insanli('KAL-SON', 'Son kontrol', 'kalite'),
      insanli('KAL-CMM', 'Koordinat ölçüm (CMM)', 'kalite'),
    ],
  },
  { kod: 'MARKALAMA', ad: 'Markalama', aciklama: 'Seri no, lazer, damga', istasyonlar: [insanli('MRK-01', 'Markalama', 'markalama')] },
  { kod: 'TESVIYE', ad: 'Tesviye', aciklama: 'Çapak, kenar, el işi', istasyonlar: [insanli('TSV-01', 'Tesviye', 'tesviye')] },
  { kod: 'MONTAJ', ad: 'Montaj', aciklama: 'Montaj ve fonksiyon testi', istasyonlar: [insanli('MON-01', 'Montaj', 'montaj')] },
  { kod: 'BOYA', ad: 'Boya ve kaplama', aciklama: 'Boya, kaplama, kürleme', istasyonlar: [insanli('BOY-01', 'Boya', 'boya')] },
  { kod: 'DEPO', ad: 'Depo', aciklama: 'Mal kabul, toplama, sevk hazırlığı', istasyonlar: [insanli('DEPO-01', 'Depo', 'depo')] },
];

// Şablon uygulamasının sonucu: açılanlar ve atlananlar koduyla; atlanan kayıt değişmemiştir.
export const SABLON_ATLAMA_NEDENLERI = ['var', 'merkez-pasif'] as const;
export const tesisSablonuSonucu = z.object({
  acilanMerkezler: z.array(z.string()),
  acilanIstasyonlar: z.array(z.string()),
  atlananlar: z.array(z.object({ kod: z.string(), neden: z.enum(SABLON_ATLAMA_NEDENLERI) })),
});
export type TesisSablonuSonucu = z.output<typeof tesisSablonuSonucu>;

