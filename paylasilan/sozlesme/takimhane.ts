import { z } from 'zod';

// Takım stoğunun bakiyesi Stok'tadır (tek defter); bu sözleşme takıma özgü özelliği ve takımhane görünümünü taşır (kart 3613).
export const TAKIM_SINIFLARI = ['kesici-uc', 'freze', 'matkap', 'rayba', 'tutucu', 'olcu-ucu', 'diger'] as const;
// ISO 513 iş parçası malzeme grupları: çelik, paslanmaz, dökme demir, demir dışı, süper alaşım/titanyum, sertleştirilmiş.
export const MALZEME_GRUPLARI = ['P', 'M', 'K', 'N', 'S', 'H'] as const;
export const TAKIM_KONUMLARI = ['raf', 'tezgah', 'kisi', 'bileme', 'ara', 'hurda'] as const;
export const IADE_DURUMLARI = ['saglam', 'asinmis', 'kirik'] as const;
export const LISTE_DURUMLARI = ['rafta', 'ayrildi', 'tezgahta', 'eksik'] as const;
export const IZLEME_TURLERI = ['adet', 'tekil'] as const;

// Konuma göre adet. Veri yoksa null: sıfır uydurulmaz.
export const konumDagilimiSemasi = z.object({
  raf: z.number().int().nullable(),
  tezgah: z.number().int().nullable(),
  kisi: z.number().int().nullable(),
  bileme: z.number().int().nullable(),
  ara: z.number().int().nullable(),
});

export type KonumDagilimi = z.infer<typeof konumDagilimiSemasi>;

export const takimSatiriSemasi = z.object({
  kartKimlik: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  kategori: z.string(),
  sinif: z.enum(TAKIM_SINIFLARI),
  capMm: z.string().nullable(),
  kesiciSayisi: z.number().int().nullable(),
  isoKodu: z.string().nullable(),
  malzemeGruplari: z.array(z.enum(MALZEME_GRUPLARI)),
  yenidenBilenir: z.boolean(),
  izleme: z.enum(IZLEME_TURLERI),
  rafKodu: z.string().nullable(),
  konumlar: konumDagilimiSemasi,
  toplam: z.number().int(),
  kritikSeviye: z.number().int().nullable(),
  // 3762: kartın bağlı olduğu CNC kütüphane kalemi (yoksa eski TKM kartı, kütüphaneye bağlanmamış).
  kutuphaneKimligi: z.string().nullable(),
  kartDurumu: z.enum(['taslak', 'onayda', 'aktif', 'pasif']),
  // Takımın dolu raf gözleri, en doludan başlayarak.
  gozler: z.array(z.object({ konumKimligi: z.number().int(), kod: z.string(), adet: z.number().int() })),
  // Tezgâhlara yüklü bu kalemin en az kalan ömrü (yüzde, CNC Takım Ömrü'nden); hedefi olan yük yoksa null.
  omurYuzde: z.number().int().min(0).max(100).nullable(),
});
export type TakimSatiri = z.infer<typeof takimSatiriSemasi>;

export const kategoriOzetiSemasi = z.object({
  kategori: z.string(),
  kalem: z.number().int(),
  adet: z.number().int(),
  kritik: z.number().int(),
});
export type KategoriOzeti = z.infer<typeof kategoriOzetiSemasi>;

export const takimhaneOzetiSemasi = z.object({
  kalem: z.number().int(),
  adet: z.number().int(),
  kritik: z.number().int(),
  sifir: z.number().int(),
  // Sipariş noktası girilmemiş kalem: kritik sayılmaz, ayrıca gösterilir.
  esiksiz: z.number().int(),
  konumlar: konumDagilimiSemasi,
  bekleyenIade: z.number().int(),
  kategoriler: z.array(kategoriOzetiSemasi),
});
export type TakimhaneOzeti = z.infer<typeof takimhaneOzetiSemasi>;

export const takimlarCevabi = z.object({ takimlar: z.array(takimSatiriSemasi) });
export type TakimlarCevabi = z.infer<typeof takimlarCevabi>;

// Çıkış: takımhane -> kişi ya da istasyon; iade: kişi/istasyon -> takımhane (stok_teslim, 3613 Dilim 2). `istekKimligi` çift basışı tek kayda indirir.
export const cikisGovdesi = z.object({
  kartKimlik: z.number().int().positive(),
  adet: z.number().int().positive().max(1000),
  kisiId: z.number().int().positive().nullable(),
  istasyonId: z.number().int().positive().nullable(),
  uretimEmriId: z.number().int().positive().nullable(),
  // 3762: takımın çıkacağı raf gözü; verilmezse en dolu göz.
  konumKimligi: z.number().int().positive().nullable().prefault(null),
  istekKimligi: z.string().trim().min(3).max(80),
}).refine((g) => (g.kisiId === null) !== (g.istasyonId === null), { message: 'Alan olarak kişi ya da istasyondan biri seçilir.', path: ['kisiId'] });
export type CikisGovdesi = z.infer<typeof cikisGovdesi>;
export const iadeGovdesi = z.object({
  kartKimlik: z.number().int().positive(),
  konumKimligi: z.number().int().positive(),
  adet: z.number().int().positive().max(1000),
  durum: z.enum(IADE_DURUMLARI),
  neden: z.string().trim().max(200).nullable().prefault(null),
  istekKimligi: z.string().trim().min(3).max(80),
}).refine((g) => g.durum !== 'kirik' || (g.neden !== null && g.neden !== ''), { message: 'Kırık iade için neden yazılır.', path: ['neden'] });

export type IadeGovdesi = z.infer<typeof iadeGovdesi>;

// Teslimdekiler: kişide ya da istasyonda duran takım bakiyesi (kaynak: Stok'taki kişi ve istasyon konumları).
export const acikTeslimSemasi = z.object({
  konumKimligi: z.number().int(),
  kartKimlik: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  adet: z.number().int(),
  alan: z.string(),
  alanTuru: z.enum(['kisi', 'istasyon']),
  verildi: z.string().nullable(),
});
export type AcikTeslim = z.infer<typeof acikTeslimSemasi>;
export const acikTeslimlerCevabi = z.object({ teslimler: z.array(acikTeslimSemasi) });

// Takım özelliği (sınıf, çap, ISO kodu...). Takım kartı katalogdadır; burada yalnız takıma özgü alan durur.
export const ozellikGovdesi = z.object({
  sinif: z.enum(TAKIM_SINIFLARI),
  capMm: z.number().positive().max(9999).nullable(),
  kesiciSayisi: z.number().int().positive().max(100).nullable(),
  isoKodu: z.string().trim().min(1).max(40).nullable(),
  malzemeGruplari: z.array(z.enum(MALZEME_GRUPLARI)).max(6),
  yenidenBilenir: z.boolean(),
  izleme: z.enum(IZLEME_TURLERI),
});
export type OzellikGovdesi = z.infer<typeof ozellikGovdesi>;
export const kartParametresi = z.object({ kart: z.coerce.number<number>().int().positive() });
export const emirParametresi = z.object({ id: z.coerce.number<number>().int().positive() });
export const takimSorgusu = z.object({ q: z.string().trim().max(80).optional() });

// Emrin takım listesi: rota adımı başına satır (CNC kurulum üretir, takımhane okur).
export const emirTakimSatiriSemasi = z.object({
  cep: z.string(),
  kod: z.string(),
  ad: z.string(),
  adet: z.number().int(),
  durum: z.enum(LISTE_DURUMLARI),
  eksik: z.number().int(),
});
export type EmirTakimSatiri = z.infer<typeof emirTakimSatiriSemasi>;
export const emirTakimListesiSemasi = z.object({
  emirNo: z.string(),
  parca: z.string(),
  istasyon: z.string(),
  hazir: z.boolean(),
  satirlar: z.array(emirTakimSatiriSemasi),
});
export type EmirTakimListesi = z.infer<typeof emirTakimListesiSemasi>;



// Emrin takım listesini yazar: cep başına takım ve adet (CNC kurulumdan otomatik doldurma sonraki iş).
export const emirTakimiGovdesi = z.object({
  satirlar: z.array(z.object({ cep: z.string().trim().min(1).max(12), kartKimlik: z.number().int().positive(), adet: z.number().int().positive().max(1000) })).max(200),
});
export type EmirTakimiGovdesi = z.infer<typeof emirTakimiGovdesi>;
// ---- 3762: tek kütüphane, raf gözü, açılış ve kör sayım ---------------------------------------------------------------------------
// CNC kütüphanesinin atölyede eklenen kalemleri (hazır katalog istemcidedir). Alanlar CNC kaydından olduğu gibi gelir; bilinmeyen alan düşer.
export const kutuphaneKalemiSemasi = z.object({
  id: z.string(), name: z.string(), code: z.string().optional(), kind: z.string().optional(), shelf: z.string().optional(), grp: z.string().optional(),
  isTool: z.boolean().optional(), lib: z.enum(['mill', 'lathe']).optional(), cat: z.string().optional(), d: z.number().optional(), z: z.number().optional(),
});
export type KutuphaneKalemi = z.infer<typeof kutuphaneKalemiSemasi>;
export const kutuphaneCevabi = z.object({ ozelKalemler: z.array(kutuphaneKalemiSemasi) });
export type KutuphaneCevabi = z.infer<typeof kutuphaneCevabi>;

export const rafGozuSorgusu = z.object({ q: z.string().trim().max(40).optional(), kart: z.coerce.number<number>().int().positive().optional() });
export const rafGozuSemasi = z.object({ konumKimligi: z.number().int(), kod: z.string(), ad: z.string().nullable(), dolu: z.boolean() });
export const rafGozleriCevabi = z.object({ gozler: z.array(rafGozuSemasi) });
export type RafGozleriCevabi = z.infer<typeof rafGozleriCevabi>;

// Gözüne göre açılış (boş göz) ya da kör sayım (dolu göz). Sayımda beklenen adet gönderilmez.
export const GIRIS_TURLERI = ['acilis', 'sayim'] as const;
export const girisGovdesi = z.object({
  kartKimlik: z.number().int().positive(),
  konumKimligi: z.number().int().positive(),
  adet: z.number().int().min(0).max(100000),
  istekKimligi: z.string().trim().min(3).max(80),
});
export type GirisGovdesi = z.infer<typeof girisGovdesi>;
export const girisCevabi = z.object({
  tur: z.enum(GIRIS_TURLERI),
  // Açılışta başlangıç belgesinin numarası; sayımda onaya düşen fark sayısı.
  belgeNo: z.string().nullable(),
  onayaGiden: z.number().int(),
});
export type GirisCevabi = z.infer<typeof girisCevabi>;

export const topluGirisGovdesi = z.object({
  satirlar: z.array(z.object({ sira: z.number().int().min(1).max(1_000_000), kartKimlik: z.number().int().positive(), gozKodu: z.string().trim().min(1).max(60), adet: z.number().int().min(0).max(100000) })).min(1).max(2000),
  dosyaOzeti: z.string().regex(/^[0-9a-f]{64}$/),
  dosyaAdi: z.string().trim().min(1).max(120),
});
export type TopluGirisGovdesi = z.infer<typeof topluGirisGovdesi>;
export const topluGirisCevabi = z.object({
  satirlar: z.array(z.object({ sira: z.number().int(), tur: z.enum(GIRIS_TURLERI).nullable(), hata: z.string().nullable() })),
  yazildi: z.boolean(),
  belgeNo: z.string().nullable(),
  sayim: z.number().int(),
});
export type TopluGirisCevabi = z.infer<typeof topluGirisCevabi>;

// Eski TKM kartını bir kütüphane kalemine bağlar (kart verisidir; Malzemeler yazma yetkisi ister).
export const kutuphaneBagGovdesi = z.object({ kimlik: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/) });

// 3762 (fark 1 a): kütüphane kaleminden kesici takım kartı açılır; kart onay akışına uyar (akış açıksa onayda açılır, açılış onaydan sonra).
// Takım türü Malzemeler'in kesici takım kategorisindeki "Takım türü" alanıdır; Malzemeler bu alanı serbest metin olarak saklar.
export const kartAcGovdesi = z.object({
  kimlik: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  ad: z.string().trim().min(1).max(120),
  takimTuru: z.string().trim().min(1).max(60),
  isoKodu: z.string().trim().max(60).nullable(),
  // Kartı aynı türdeki öteki kartlardan ayıran ölçü: Malzemeler kart kimliğini tür ve özelliklerden kurar.
  capMm: z.number().positive().max(2000).nullable(),
});
export type KartAcGovdesi = z.infer<typeof kartAcGovdesi>;
export const kartAcCevabi = z.object({ kartKimlik: z.number().int(), stokKodu: z.string(), onayDurumu: z.enum(['onayda', 'aktif']) });
export type KartAcCevabi = z.infer<typeof kartAcCevabi>;

// Çıkış formunun alan ve emir seçenekleri (kişi, aktif istasyon, açık emir).
export const seceneklerCevabi = z.object({
  kisiler: z.array(z.object({ id: z.number().int(), ad: z.string() })),
  istasyonlar: z.array(z.object({ id: z.number().int(), ad: z.string() })),
  emirler: z.array(z.object({ id: z.number().int(), emirNo: z.string(), parca: z.string() })),
});
export type SeceneklerCevabi = z.infer<typeof seceneklerCevabi>;

// Aparat (3651): aparat da Stok'taki tek defterde adetle izlenir; ayırma yazılmaz, canlı plan penceresi ile rotadaki aparat isteğinden
// türetilir. Pencere ayırma kümesine dahildir: farklı zamanlarda aynı aparatı kullanan iki emir birbirini eksik göstermez.
export const APARAT_DURUMLARI = ['plan-bekliyor', 'ayrildi', 'yolda', 'tezgahta', 'kisi', 'eksik'] as const;
export const APARAT_ASAMALARI = ['ayar_isleme', 'isleme'] as const;
export const APARAT_UYUM_DURUMLARI = ['uyumlu', 'plan-fazla', 'bakimda'] as const;

export const aparatSatiriSemasi = z.object({
  kartKimlik: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  konumlar: konumDagilimiSemasi,
  toplam: z.number().int(),
  // Planın penceresi olan ve henüz çıkmamış istekler toplamı; serbest = raf - ayrılan (eksi olmaz).
  ayrilan: z.number().int(),
  serbest: z.number().int(),
  // Kişide ve kapanmış emre ait tezgâhta duran aparat: iadesi beklenir.
  bekleyenIade: z.number().int(),
  rafKodu: z.string().nullable(),
});
export type AparatSatiri = z.infer<typeof aparatSatiriSemasi>;

export const aparatKarsilastirmaSemasi = z.object({
  kartKimlik: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  istasyonKimligi: z.number().int().nullable(),
  istasyon: z.string().nullable(),
  planKapasitesi: z.number().int(),
  // Kartın bütün kapasite satırlarının toplamı: uyum durumu satıra değil kartın toplamına bakar (iki satır 2+2, stok 3 ise ikisi de plan fazla).
  kartPlanToplami: z.number().int(),
  // Stokta = raf + tezgâh + kişi (kullanılabilir fiziksel adet); bakımda ayrı sayılır.
  stokta: z.number().int(),
  bakimda: z.number().int(),
  durum: z.enum(APARAT_UYUM_DURUMLARI),
});
export type AparatKarsilastirma = z.infer<typeof aparatKarsilastirmaSemasi>;

export const aparatCevabi = z.object({
  konumlar: konumDagilimiSemasi,
  bekleyenIade: z.number().int(),
  satirlar: z.array(aparatSatiriSemasi),
  karsilastirma: z.array(aparatKarsilastirmaSemasi),
});
export type AparatCevabi = z.infer<typeof aparatCevabi>;

export const emirAparatSatiriSemasi = z.object({
  kartKimlik: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  adet: z.number().int(),
  asama: z.enum(APARAT_ASAMALARI),
  durum: z.enum(APARAT_DURUMLARI),
  eksik: z.number().int(),
  // Tezgâhta ya da kişide duran adet ve yeri; çıkmamışsa konum raf kodudur (yoksa null).
  disarida: z.number().int(),
  konum: z.string().nullable(),
  baslangic: z.string().nullable(),
  bitis: z.string().nullable(),
  // Aparat plan saatinden çok önce çıkmış: plan sonradan kaymış olabilir (kayıt tutulmaz, çıkış zamanından türetilir).
  planKaydi: z.boolean(),
});
export type EmirAparatSatiri = z.infer<typeof emirAparatSatiriSemasi>;
export const emirAparatCevabi = z.object({
  emirNo: z.string(),
  parca: z.string(),
  hazir: z.boolean(),
  satirlar: z.array(emirAparatSatiriSemasi),
  // Ölçü aleti stok konusu değil: yalnız emrin istediği tür ve Kalibrasyon'daki geçerli alet durumu (null: o türde alet kaydı yok).
  olcuAletleri: z.array(z.object({ turKimlik: z.number().int(), ad: z.string(), gecerli: z.boolean().nullable() })),
});
export type EmirAparatCevabi = z.infer<typeof emirAparatCevabi>;
