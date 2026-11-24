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

// Başlangıç stoğu ön izlemesi: temizlik kararları satır satır görünür (V7: gerçek veri yalnız canlıda girer).
export const TEMIZLIK_BULGULARI = ['yinelenen-kod', 'bosluk', 'bos-kategori', 'malzeme-cinsi-birlesti'] as const;
export const aktarimSatiriSemasi = z.object({
  satir: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  kategori: z.string().nullable(),
  adet: z.number().int(),
  rafKodu: z.string().nullable(),
  bulgu: z.enum(TEMIZLIK_BULGULARI).nullable(),
  karar: z.string().nullable(),
});
export type AktarimSatiri = z.infer<typeof aktarimSatiriSemasi>;

// Emrin takım listesini yazar: cep başına takım ve adet (CNC kurulumdan otomatik doldurma sonraki iş).
export const emirTakimiGovdesi = z.object({
  satirlar: z.array(z.object({ cep: z.string().trim().min(1).max(12), kartKimlik: z.number().int().positive(), adet: z.number().int().positive().max(1000) })).max(200),
});
export type EmirTakimiGovdesi = z.infer<typeof emirTakimiGovdesi>;
export const aktarimOnizlemeGovdesi = z.object({
  satirlar: z.array(z.object({ kod: z.string().max(60), ad: z.string().max(200), kategori: z.string().max(80).nullable(), adet: z.number().int().min(0).max(1000000), rafKodu: z.string().max(40).nullable() })).max(5000),
});
export const aktarimOnizlemeCevabi = z.object({ satirlar: z.array(aktarimSatiriSemasi), uygun: z.boolean() });

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
