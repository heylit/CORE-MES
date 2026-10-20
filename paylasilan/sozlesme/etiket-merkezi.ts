import { z } from 'zod';

// Etiket yazıcısının dili sunucuda üretilir; istemci yalnız önizlemeyi çizer ve komut dosyasını indirir.
export const YAZICI_DILLERI = ['zpl', 'pplb'] as const;
export type YaziciDili = (typeof YAZICI_DILLERI)[number];
export const YAZICI_DILI_ADLARI: Record<YaziciDili, string> = { zpl: 'Zebra (ZPL)', pplb: 'Argox (PPLB)' };
export const DOSYA_UZANTILARI: Record<YaziciDili, string> = { zpl: 'zpl', pplb: 'prn' };

export const COZUNURLUKLER = [203, 300] as const;
export type Cozunurluk = (typeof COZUNURLUKLER)[number];

export const SABLON_TURLERI = ['konum', 'malzeme', 'lot', 'refakat', 'istasyon', 'deneme'] as const;
export type SablonTuru = (typeof SABLON_TURLERI)[number];
export const SABLON_TURU_ADLARI: Record<SablonTuru, string> = {
  konum: 'Konum ve harita kutusu', malzeme: 'Malzeme kartı', lot: 'Lot', refakat: 'Refakat kartı', istasyon: 'İstasyon', deneme: 'Yazıcı denemesi',
};

export const EN_COK_ADET = 500;

// Gerçek kayıttan basılan etiketin kaynağı. Stok ekranı seçili konumları adresle gönderir: /etiket-merkezi?tur=konum&id=1,2,3
// "mal-kabul" o kabulden açılan bütün lotları lot şablonuyla basar.
export const KAYIT_TURLERI = ['konum', 'lot', 'istasyon', 'refakat', 'malzeme', 'mal-kabul'] as const;
export type KayitTuru = (typeof KAYIT_TURLERI)[number];
export const EN_COK_KAYIT = 200;
const kayitId = z.number().int().positive().max(2147483647);
export const kayitSecimiSemasi = z.object({
  tur: z.enum(KAYIT_TURLERI),
  idler: z.array(kayitId).min(1, 'En az bir kayıt seçilir.').max(EN_COK_KAYIT, `En çok ${EN_COK_KAYIT} kayıt seçilir.`),
});
export type KayitSecimi = z.infer<typeof kayitSecimiSemasi>;

// Yerleşimin iki tarafta aynı olması gereken ölçüleri: satır aralığı yazı yüksekliğine oran, QR kenar boşluğu modül sayısı.
export const SATIR_ARALIGI = 1.2 as const;
export const QR_KENAR_MODUL = 2 as const;

// Ölçüler milimetredir; yazıcı noktasına sunucu çevirir.
const mm = z.number().nonnegative();
const metinOgesi = z.object({
  tur: z.literal('metin'), x: mm, y: mm, genislik: mm, yukseklik: mm,
  yaziMm: z.number().positive(), kalin: z.boolean(), alan: z.string(),
});
const qrOgesi = z.object({ tur: z.literal('qr'), x: mm, y: mm, boyut: mm, alan: z.string() });
const kutuOgesi = z.object({ tur: z.literal('kutu'), x: mm, y: mm, genislik: mm, yukseklik: mm, kalinlik: mm });
export const sablonOgesiSemasi = z.discriminatedUnion('tur', [metinOgesi, qrOgesi, kutuOgesi]);
export type SablonOgesi = z.infer<typeof sablonOgesiSemasi>;

export const sablonSemasi = z.object({
  anahtar: z.string(),
  ad: z.string(),
  tur: z.enum(SABLON_TURLERI),
  genislik: mm,
  yukseklik: mm,
  ogeler: z.array(sablonOgesiSemasi),
});
export type Sablon = z.infer<typeof sablonSemasi>;

export const sablonlarCevabi = z.object({
  sablonlar: z.array(sablonSemasi),
  // Tür başına etikete basılabilen alanlar ve adları (tasarım ve önizleme aynı listeyi kullanır).
  alanlar: z.record(z.enum(SABLON_TURLERI), z.array(z.object({ anahtar: z.string(), ad: z.string() }))),
  // Seçim listeleri sunucudan gelir: istemci sözleşmeden yalnız tip alır.
  secenekler: z.object({
    diller: z.array(z.object({ deger: z.enum(YAZICI_DILLERI), ad: z.string() })),
    cozunurlukler: z.array(z.number().int()),
    enCokAdet: z.number().int(),
    turAdlari: z.record(z.enum(SABLON_TURLERI), z.string()),
  }),
});
export type SablonlarCevabi = z.infer<typeof sablonlarCevabi>;

export const sablonParametresi = z.object({ anahtar: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Şablon anahtarı geçersiz.') });

export const ciktiSorgusu = z.object({
  dil: z.enum(YAZICI_DILLERI),
  dpi: z.coerce.number().pipe(z.union([z.literal(203), z.literal(300)])),
  adet: z.coerce.number().int().min(1, 'Adet en az 1 olur.').max(EN_COK_ADET, `Adet en çok ${EN_COK_ADET} olur.`).default(1),
  sade: z.enum(['true', 'false']).optional().transform((d) => d === 'true'),
});
export type CiktiSecenekleri = z.output<typeof ciktiSorgusu>;

// Kimlikler adreste virgülle ayrılır; yinelenen kimlik bir kez basılır.
export const kayitCiktiSorgusu = ciktiSorgusu.extend({
  tur: z.enum(KAYIT_TURLERI),
  id: z.string().max(4000).transform((d, c) => {
    const parcalar = d.split(',').map((p) => p.trim()).filter((p) => p !== '');
    const idler = [...new Set(parcalar.map(Number))];
    const sonuc = kayitSecimiSemasi.shape.idler.safeParse(idler);
    if (!sonuc.success || parcalar.some((p) => !/^[0-9]+$/.test(p))) {
      c.addIssue({ code: z.ZodIssueCode.custom, message: 'Kayıt kimlikleri virgülle ayrılmış sayılar olmalı (en çok 200).' });
      return z.NEVER;
    }
    return sonuc.data;
  }),
});
export type KayitCiktiSecenekleri = z.output<typeof kayitCiktiSorgusu>;

// Önizleme, yazıcıya gidenle aynı yerleşimden çıkar: metin satırlara bölünmüş, QR kare matrisiyle gelir.
export const onizlemeOgesiSemasi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('metin'), x: mm, y: mm, genislik: mm, yaziMm: z.number(), kalin: z.boolean(), satirlar: z.array(z.string()) }),
  z.object({ tur: z.literal('qr'), x: mm, y: mm, boyut: mm, veri: z.string(), kareler: z.array(z.array(z.boolean())) }),
  z.object({ tur: z.literal('kutu'), x: mm, y: mm, genislik: mm, yukseklik: mm, kalinlik: mm }),
]);
export type OnizlemeOgesi = z.infer<typeof onizlemeOgesiSemasi>;

export const ciktiCevabi = z.object({
  sablon: z.object({ anahtar: z.string(), ad: z.string(), genislik: mm, yukseklik: mm }),
  dil: z.enum(YAZICI_DILLERI),
  dpi: z.number().int(),
  adet: z.number().int(),
  dosyaAdi: z.string(),
  komut: z.string(),
  onizleme: z.array(onizlemeOgesiSemasi),
});
export type CiktiCevabi = z.infer<typeof ciktiCevabi>;

// Komut bulunan her kayıt için bir etiket (her biri `adet` kez) taşır; önizleme ilk kayıttır. Bulunamayan kimlik basılmaz, `eksikler`de döner.
export const kayitCiktiCevabi = ciktiCevabi.extend({
  kayitlar: z.array(z.object({ id: z.number().int(), baslik: z.string() })),
  eksikler: z.array(z.number().int()),
});
export type KayitCiktiCevabi = z.infer<typeof kayitCiktiCevabi>;

// Yazıcı tanımı. "ag": sunucu yazıcının kurum içi adresine (TCP 9100) doğrudan gönderir; "dosya": komut dosyası indirilir.
export const BAGLANTI_TURLERI = ['ag', 'dosya'] as const;
export type BaglantiTuru = (typeof BAGLANTI_TURLERI)[number];
export const YAZICI_KAPISI = 9100;

export const yaziciSemasi = z.object({
  id: z.number().int(),
  ad: z.string(),
  dil: z.enum(YAZICI_DILLERI),
  dpi: z.number().int(),
  baglanti: z.enum(BAGLANTI_TURLERI),
  adres: z.string().nullable(),
  sade: z.boolean(),
  aktif: z.boolean(),
  surum: z.number().int(),
});
export type Yazici = z.infer<typeof yaziciSemasi>;

// Doğrudan baskının açık olup olmadığı ve kapalıysa nedeni (adres ya da değer taşımaz).
export const dogrudanBaskiSemasi = z.object({ acik: z.boolean(), neden: z.string().nullable() });
export type DogrudanBaski = z.infer<typeof dogrudanBaskiSemasi>;

export const yazicilarCevabi = z.object({ yazicilar: z.array(yaziciSemasi), dogrudanBaski: dogrudanBaskiSemasi });
export type YazicilarCevabi = z.infer<typeof yazicilarCevabi>;

const yaziciAlanlari = z.object({
  ad: z.string().trim().min(1, 'Ad zorunlu.').max(80, 'Ad en çok 80 karakter olur.'),
  dil: z.enum(YAZICI_DILLERI),
  dpi: z.union([z.literal(203), z.literal(300)]),
  baglanti: z.enum(BAGLANTI_TURLERI),
  adres: z.string().trim().max(45).nullable().default(null),
  sade: z.boolean().default(false),
});
export const yaziciAcGovdesi = yaziciAlanlari;
export type YaziciAcGovdesi = z.output<typeof yaziciAcGovdesi>;
export const yaziciGuncelleGovdesi = yaziciAlanlari.extend({ aktif: z.boolean(), surum: z.number().int().min(1).max(2147483647) });
export type YaziciGuncelleGovdesi = z.output<typeof yaziciGuncelleGovdesi>;
export const yaziciParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });

export const basGovdesi = z.object({
  yaziciId: z.number().int().positive().max(2147483647),
  adet: z.number().int().min(1, 'Adet en az 1 olur.').max(EN_COK_ADET, `Adet en çok ${EN_COK_ADET} olur.`),
  // Verilmezse örnek değerli deneme etiketi basılır.
  kayit: kayitSecimiSemasi.optional(),
});
export type BasGovdesi = z.output<typeof basGovdesi>;
export const basCevabi = z.object({ baskiId: z.number().int(), sonuc: z.enum(['gonderildi', 'hata']), ileti: z.string().nullable() });
export type BasCevabi = z.infer<typeof basCevabi>;

// Dosya yazıcısına (USB ya da Windows yazıcısı) komut dosyası iner; indirme de baskı defterine "indirildi" diye yazılır.
export const indirGovdesi = basGovdesi;
export const indirCevabi = z.object({ baskiId: z.number().int(), dosyaAdi: z.string(), komut: z.string() });
export type IndirCevabi = z.infer<typeof indirCevabi>;

export const BASKI_SONUCLARI = ['gonderildi', 'hata', 'indirildi'] as const;
export type BaskiSonucu = (typeof BASKI_SONUCLARI)[number];

export const baskiSemasi = z.object({
  id: z.number().int(),
  zaman: z.string(),
  yazici: z.string(),
  sablonAnahtar: z.string(),
  adet: z.number().int(),
  kisi: z.string().nullable(),
  sonuc: z.enum(BASKI_SONUCLARI),
  hata: z.string().nullable(),
  // Deneme etiketinde 0; gerçek kayıttan basılan etikette kayıt sayısı.
  kayitSayisi: z.number().int(),
});
export const baskilarCevabi = z.object({ baskilar: z.array(baskiSemasi) });
export type BaskilarCevabi = z.infer<typeof baskilarCevabi>;
