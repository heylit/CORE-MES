import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari, sayfaSorguAlanlari } from '../liste.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

const mantiksal = z.enum(['true', 'false']).optional().transform((d) => (d === undefined ? undefined : d === 'true'));

export const kimlikParametresi = z.object({ id: z.coerce.number().int().positive() });


// =====================================================================
// Finans para kayıtları (ikinci teslim). Para ve kur cevapta metindir (numeric); istekte sayıdır.
// =====================================================================

export const GELIR_KATEGORILERI = ['urun_satisi', 'hizmet_geliri', 'diger_gelir', 'kur_farki_geliri', 'alis_iadesi'] as const;
export const GIDER_KATEGORILERI = ['mal_alimi', 'personel', 'sgk_stopaj', 'kira', 'enerji', 'lojistik', 'pazarlama', 'faiz', 'diger_gider', 'kdv_vergi', 'kredi_anapara', 'kur_farki_gideri', 'satis_iadesi'] as const;
// 260 a: iade faturası asıl faturanın ters yönündedir; satış iadesi gider, alış iadesi gelir kategorisidir ve yalnız iade türünde kullanılır.
export const IADE_KATEGORILERI = ['satis_iadesi', 'alis_iadesi'] as const;
export const FATURASIZ_KATEGORILER = ['personel', 'sgk_stopaj', 'kdv_vergi', 'faiz', 'kredi_anapara'] as const;
export const KATEGORILER = [...GELIR_KATEGORILERI, ...GIDER_KATEGORILERI] as const;
export const YONLER = ['gelir', 'gider'] as const;
export const BELGE_TURLERI = ['fatura', 'faturasiz', 'acilis', 'iade'] as const;
export const BELGE_DURUMLARI = ['acik', 'kapandi', 'iptal'] as const;
export const NAKIT_YONTEMLERI = ['nakit', 'banka', 'kredi_karti'] as const;
export const ODEME_YONTEMLERI = ['nakit', 'banka', 'kredi_karti', 'cek', 'senet', 'ciro'] as const;
export const HESAP_TURLERI = ['kasa', 'banka', 'kredi_karti'] as const;
export const CEK_TURLERI = ['cek', 'senet'] as const;
export const CEK_YONLERI = ['alinan', 'verilen'] as const;
export const CEK_DURUMLARI = ['portfoy', 'tahsilde', 'tahsil', 'ciro', 'karsiliksiz', 'bekliyor', 'odendi', 'iptal'] as const;
export const SEKTORLER = ['genel', 'uretim', 'ticaret', 'hizmet', 'insaat'] as const;
export const BUTCE_KALEMLERI = ['mal_alimi', 'personel', 'sgk_stopaj', 'kira', 'enerji', 'lojistik', 'pazarlama', 'faiz', 'diger_gider', 'kur_farki_gideri', 'satis_hedefi'] as const;
export const KAYNAKLAR = ['elle', 'logo'] as const;
export const LOGO_ESLEME_DURUMLARI = ['eslesmedi', 'eslesti', 'farkli'] as const;
export const TOPLU_AKTARIM_SINIRI = 1000;

const ondalik = (basamak: number, ileti: string) => (v: number) => Math.abs(v * 10 ** basamak - Math.round(v * 10 ** basamak)) < 1e-6 || ileti;
// Para iki ondalık, kur altı ondalık; veritabanına metin olarak gider (kayan nokta yuvarlaması saklanmaz).
export const tutarSemasi = z.number().positive('Tutar sıfırdan büyük olmalı.').max(1e13, 'Tutar çok büyük.')
  .refine((v) => ondalik(2, '')(v) === true, 'Tutar en çok iki ondalık olabilir.').transform((v) => v.toFixed(2));
export const isaretliTutarSemasi = z.number().min(-1e13).max(1e13)
  .refine((v) => ondalik(2, '')(v) === true, 'Tutar en çok iki ondalık olabilir.').transform((v) => v.toFixed(2));
export const negatifOlmayanTutar = z.number().min(0).max(1e13)
  .refine((v) => ondalik(2, '')(v) === true, 'Tutar en çok iki ondalık olabilir.').transform((v) => v.toFixed(2));
export const kurSemasi = z.number().positive('Kur sıfırdan büyük olmalı.').max(1e7)
  .refine((v) => ondalik(6, '')(v) === true, 'Kur en çok altı ondalık olabilir.').transform((v) => v.toFixed(6));
export const caprazKurSemasi = z.number().positive('Kur sıfırdan büyük olmalı.').max(1e7)
  .refine((v) => ondalik(8, '')(v) === true, 'Kur en çok sekiz ondalık olabilir.').transform((v) => v.toFixed(8));
export const oranSemasi = z.number().min(0, 'KDV oranı 0 ile 100 arasındadır.').max(100, 'KDV oranı 0 ile 100 arasındadır.')
  .refine((v) => ondalik(2, '')(v) === true, 'Oran en çok iki ondalık olabilir.').transform((v) => v.toFixed(2));
export const paraBirimiSemasi = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Para birimi üç harfli koddur (TRY gibi).');
const kimlikSayisi = z.number().int().positive();
const metin = (azami: number) => z.string().trim().max(azami, `En çok ${azami} karakter.`).nullish()
  .transform((m) => (m === undefined || m === null || m === '' ? null : m));
const numerik = z.string();
const iptalGovdesi = z.object({ ...beklenenSurum, neden: metin(300) });
export { iptalGovdesi };

// ---- Belge ----
const tevkifat = { tevkifatPay: z.number().int().min(1).max(100).nullish().transform((v) => v ?? null), tevkifatPayda: z.number().int().min(1).max(100).nullish().transform((v) => v ?? null) };
export const belgeAlanlari = z.object({
  yon: z.enum(YONLER),
  tur: z.enum(BELGE_TURLERI).default('fatura'),
  kategori: z.enum(KATEGORILER),
  firmaId: kimlikSayisi.nullish().transform((v) => v ?? null),
  belgeNo: metin(16),
  aciklama: metin(500),
  belgeTarihi: tarihSemasi,
  vade: tarihSemasi,
  paraBirimi: paraBirimiSemasi.default('TRY'),
  kur: kurSemasi.default(1),
  tutar: tutarSemasi,
  kdvOrani: oranSemasi,
  ...tevkifat,
});
export const pesinOdemeSemasi = z.object({ yontem: z.enum(NAKIT_YONTEMLERI), hesapId: kimlikSayisi, tarih: tarihSemasi });
export const cekBilgisiSemasi = z.object({ tur: z.enum(CEK_TURLERI), banka: metin(100), seriNo: metin(40), vade: tarihSemasi });
export const belgeEkleGovdesi = belgeAlanlari.extend({
  duzenliOdemeId: kimlikSayisi.nullish().transform((v) => v ?? null),
  // 260 a: satış faturasının siparişi ve sevki; iade faturasının asıl faturası (iade siparişi ve sevki asıldan alır).
  siparisId: kimlikSayisi.nullish().transform((v) => v ?? null),
  sevkiyatIsiId: kimlikSayisi.nullish().transform((v) => v ?? null),
  iadeBelgeId: kimlikSayisi.nullish().transform((v) => v ?? null),
  pesin: pesinOdemeSemasi.nullish().transform((v) => v ?? null),
  cek: cekBilgisiSemasi.nullish().transform((v) => v ?? null),
});
export type BelgeEkleGovdesi = z.input<typeof belgeEkleGovdesi>;
export const belgeDuzeltGovdesi = belgeAlanlari.omit({ yon: true, tur: true }).extend(beklenenSurum);
export type BelgeDuzeltGovdesi = z.input<typeof belgeDuzeltGovdesi>;

export const belgeSemasi = z.object({
  id: z.number().int(), yon: z.enum(YONLER), tur: z.enum(BELGE_TURLERI), kategori: z.enum(KATEGORILER), firmaId: z.number().int().nullable(),
  belgeNo: z.string().nullable(), aciklama: z.string().nullable(), belgeTarihi: tarihSemasi, vade: tarihSemasi,
  paraBirimi: z.string(), kur: numerik, tutar: numerik, kdvOrani: numerik, tevkifatPay: z.number().int().nullable(), tevkifatPayda: z.number().int().nullable(),
  kdvTutari: numerik, tevkifatTutari: numerik, toplam: numerik, toplamTl: numerik, kapanan: numerik, kalan: numerik,
  durum: z.enum(BELGE_DURUMLARI), kaynak: z.enum(KAYNAKLAR), logoKayitNo: z.number().int().nullable(), logoEsleme: z.enum(LOGO_ESLEME_DURUMLARI).nullable(),
  duzenliOdemeId: z.number().int().nullable(), iptalNedeni: z.string().nullable(),
  siparisId: z.number().int().nullable(), sevkiyatIsiId: z.number().int().nullable(), iadeBelgeId: z.number().int().nullable(),
  satinAlmaSiparisi: z.object({ talepId: z.string(), teklifId: z.string() }).nullable(), olusturma: zamanSemasi, surum: surumSemasi,
});
export type Belge = z.output<typeof belgeSemasi>;
export const belgeCevabi = z.object({ belge: belgeSemasi });
export type BelgeCevabi = z.output<typeof belgeCevabi>;

// ---- Ödeme ve dağıtım ----
export const dagitimSatiri = z.object({ belgeId: kimlikSayisi, belgeTutari: tutarSemasi, caprazKur: caprazKurSemasi.nullish().transform((v) => v ?? null) });
export const dagitimlarSemasi = z.array(dagitimSatiri).max(200, 'Tek seferde en çok 200 belgeye dağıtılır.').default([]);
export const odemeEkleGovdesi = z.object({
  yon: z.enum(YONLER), firmaId: kimlikSayisi.nullish().transform((v) => v ?? null), tarih: tarihSemasi,
  yontem: z.enum(NAKIT_YONTEMLERI), hesapId: kimlikSayisi, paraBirimi: paraBirimiSemasi.default('TRY'), kur: kurSemasi.default(1),
  tutar: tutarSemasi, aciklama: metin(500), dagitimlar: dagitimlarSemasi,
});
export type OdemeEkleGovdesi = z.input<typeof odemeEkleGovdesi>;
export const dagitGovdesi = z.object({ tarih: tarihSemasi, dagitimlar: z.array(dagitimSatiri).min(1).max(200) });
export const odemeSemasi = z.object({
  id: z.number().int(), yon: z.enum(YONLER), firmaId: z.number().int().nullable(), tarih: tarihSemasi, yontem: z.enum(ODEME_YONTEMLERI),
  hesapId: z.number().int().nullable(), cekId: z.number().int().nullable(), paraBirimi: z.string(), kur: numerik, tutar: numerik, tutarTl: numerik,
  dagitilan: numerik, kalan: numerik, aciklama: z.string().nullable(), kaynak: z.enum(KAYNAKLAR), iptal: z.boolean(), iptalNedeni: z.string().nullable(),
  olusturma: zamanSemasi, surum: surumSemasi,
});
export type Odeme = z.output<typeof odemeSemasi>;
export const odemeCevabi = z.object({ odeme: odemeSemasi });
export const dagilimSemasi = z.object({
  id: z.number().int(), odemeId: z.number().int(), belgeId: z.number().int(), belgeTutari: numerik, odemeTutari: numerik,
  caprazKur: numerik, kurFarkiTl: numerik, tarih: tarihSemasi, iptal: z.boolean(),
});

// ---- Mahsup ----
export const mahsupEkleGovdesi = z.object({
  firmaId: kimlikSayisi, satisBelgeId: kimlikSayisi, alisBelgeId: kimlikSayisi, satisTutari: tutarSemasi,
  alisTutari: tutarSemasi.nullish().transform((v) => v ?? null), tarih: tarihSemasi,
});
export const mahsupSemasi = z.object({
  id: z.number().int(), firmaId: z.number().int(), satisBelgeId: z.number().int(), alisBelgeId: z.number().int(),
  satisTutari: numerik, alisTutari: numerik, caprazKur: numerik.nullable(), tarih: tarihSemasi, iptal: z.boolean(), surum: surumSemasi,
});
export const mahsupCevabi = z.object({ mahsup: mahsupSemasi });

// ---- Çek ve senet ----
export const cekEkleGovdesi = z.object({
  yon: z.enum(CEK_YONLERI), tur: z.enum(CEK_TURLERI), firmaId: kimlikSayisi, banka: metin(100), seriNo: metin(40),
  duzenlemeTarihi: tarihSemasi, vade: tarihSemasi, paraBirimi: paraBirimiSemasi.default('TRY'), kur: kurSemasi.default(1), tutar: tutarSemasi,
  dagitimlar: dagitimlarSemasi,
});
export type CekEkleGovdesi = z.input<typeof cekEkleGovdesi>;
export const cekDuzeltGovdesi = z.object({ ...beklenenSurum, banka: metin(100), seriNo: metin(40), vade: tarihSemasi });
export const cekSonucGovdesi = z.object({ ...beklenenSurum, hesapId: kimlikSayisi, tarih: tarihSemasi });
export const cekTarihGovdesi = z.object({ ...beklenenSurum, tarih: tarihSemasi });
export const ciroGovdesi = z.object({ ...beklenenSurum, firmaId: kimlikSayisi, tarih: tarihSemasi, dagitimlar: dagitimlarSemasi });
export const cekSemasi = z.object({
  id: z.number().int(), yon: z.enum(CEK_YONLERI), tur: z.enum(CEK_TURLERI), firmaId: z.number().int(), banka: z.string().nullable(), seriNo: z.string().nullable(),
  duzenlemeTarihi: tarihSemasi, vade: tarihSemasi, paraBirimi: z.string(), kur: numerik, tutar: numerik, tutarTl: numerik,
  durum: z.enum(CEK_DURUMLARI), sonucTarihi: tarihSemasi.nullable(), sonucHesapId: z.number().int().nullable(),
  odemeId: z.number().int().nullable(), ciroOdemeId: z.number().int().nullable(), surum: surumSemasi,
});
export type Cek = z.output<typeof cekSemasi>;
export const cekCevabi = z.object({ cek: cekSemasi });

// ---- Hesap, virman, eşitleme ----
export const hesapEkleGovdesi = z.object({
  ad: z.string().trim().min(1, 'Hesap adı boş olamaz.').max(100), tur: z.enum(HESAP_TURLERI), paraBirimi: paraBirimiSemasi.default('TRY'),
  acilisBakiyesi: isaretliTutarSemasi.default(0), acilisTarihi: tarihSemasi, bankaAdi: metin(100), logoKodu: metin(40),
});
export const hesapGuncelleGovdesi = hesapEkleGovdesi.extend(beklenenSurum);
export const hesapSemasi = z.object({
  id: z.number().int(), ad: z.string(), tur: z.enum(HESAP_TURLERI), paraBirimi: z.string(), acilisBakiyesi: numerik, acilisTarihi: tarihSemasi,
  bankaAdi: z.string().nullable(), logoKodu: z.string().nullable(), aktif: z.boolean(), bakiye: numerik, surum: surumSemasi,
});
export const hesapCevabi = z.object({ hesap: hesapSemasi });
export const esitleGovdesi = z.object({ tarih: tarihSemasi, gercekBakiye: isaretliTutarSemasi });
export const esitlemeSemasi = z.object({ id: z.number().int(), hesapId: z.number().int(), tarih: tarihSemasi, gercekBakiye: numerik, fark: numerik, olusturma: zamanSemasi });
export const virmanEkleGovdesi = z.object({ kaynakHesapId: kimlikSayisi, hedefHesapId: kimlikSayisi, tarih: tarihSemasi, tutar: tutarSemasi, aciklama: metin(300) });
export const virmanSemasi = z.object({
  id: z.number().int(), kaynakHesapId: z.number().int(), hedefHesapId: z.number().int(), tarih: tarihSemasi, tutar: numerik,
  aciklama: z.string().nullable(), iptal: z.boolean(), surum: surumSemasi,
});

// ---- Kur, KDV oranı, düzenli ödeme, bütçe ----
export const kurGovdesi = z.object({ paraBirimi: paraBirimiSemasi.refine((p) => p !== 'TRY', 'TRY için kur girilmez.'), tarih: tarihSemasi, kur: kurSemasi });
export const kurGuncelleGovdesi = kurGovdesi.extend(beklenenSurum);
export const kurSatiri = z.object({ paraBirimi: z.string(), tarih: tarihSemasi, kur: numerik, surum: surumSemasi });
export const kdvOraniEkleGovdesi = z.object({ oran: oranSemasi, gecerlilikBaslangic: tarihSemasi });
// Faiz para birimi başına aylık yüzdedir; yeni oran başlangıç gününden sonrasını etkiler, eskisi silinmez ve değişmez.
const aylikFaizSemasi = z.number().min(0, 'Faiz 0 ile 100 arasındadır.').max(100, 'Faiz 0 ile 100 arasındadır.')
  .refine((v) => ondalik(4, '')(v) === true, 'Faiz en çok dört ondalık olabilir.').transform((v) => v.toFixed(4));
export const faizEkleGovdesi = z.object({ paraBirimi: paraBirimiSemasi, gecerlilikBaslangic: tarihSemasi, aylikYuzde: aylikFaizSemasi });
export const faizSatiri = z.object({ id: z.number().int(), paraBirimi: z.string(), gecerlilikBaslangic: tarihSemasi, aylikYuzde: numerik, olusturma: zamanSemasi });
// Genel gider yük oranı (206 a, 211 a): aylık genel gider TL ve aylık makine saati; saat başı oran sunucuda hesaplanır. Yalnız eklenir.
export const genelGiderOraniEkleGovdesi = z.object({
  gecerlilikBaslangic: tarihSemasi,
  aylikGenelGider: z.number().min(0, 'Genel gider eksi olamaz.').max(1e13, 'Tutar çok büyük.')
    .refine((v) => ondalik(2, '')(v) === true, 'Tutar en çok iki ondalık olabilir.').transform((v) => v.toFixed(2)),
  aylikMakineSaati: z.number().positive('Makine saati sıfırdan büyük olmalı.').max(1e7, 'Makine saati çok büyük.')
    .refine((v) => ondalik(2, '')(v) === true, 'Makine saati en çok iki ondalık olabilir.').transform((v) => v.toFixed(2)),
  amortismanDahil: z.boolean(),
  aciklama: metin(500),
});
export const genelGiderOraniSatiri = z.object({
  id: z.number().int(), gecerlilikBaslangic: tarihSemasi, aylikGenelGider: numerik, aylikMakineSaati: numerik, saatBasi: numerik,
  amortismanDahil: z.boolean(), aciklama: z.string().nullable(), olusturma: zamanSemasi,
});
// Sabit kıymet yönetim amaçlıdır (Logo'ya gitmez). Kur boşsa sunucu alış gününün kurunu alır; devir tarihi ve birikmiş amortisman birlikte girilir.
export const AMORTISMAN_YONTEMLERI = ['normal', 'azalan'] as const;
export const sabitKiymetEkleGovdesi = z.object({
  ad: z.string().trim().min(1, 'Ad boş olamaz.').max(200, 'En çok 200 karakter.'),
  makineKodu: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,23}$/, 'Makine kodu harf, rakam, nokta, alt çizgi ve tireden oluşur (en çok 24).')
    .nullish().or(z.literal('')).transform((v) => (v === undefined || v === null || v === '' ? null : v)),
  paraBirimi: paraBirimiSemasi.default('TRY'), bedel: tutarSemasi, kur: kurSemasi.nullish().transform((v) => v ?? null),
  alisTarihi: tarihSemasi, omurAy: z.number().int().min(1, 'Faydalı ömür 1 ile 600 ay arasındadır.').max(600, 'Faydalı ömür 1 ile 600 ay arasındadır.'),
  yontem: z.enum(AMORTISMAN_YONTEMLERI).default('normal'), kalintiDegeri: negatifOlmayanTutar.default(0),
  devirTarihi: tarihSemasi.nullish().transform((v) => v ?? null), devirBirikmisTl: negatifOlmayanTutar.nullish().transform((v) => v ?? null),
  aciklama: metin(500),
}).refine((g) => (g.devirTarihi === null) === (g.devirBirikmisTl === null), { message: 'Devir tarihi ve birikmiş amortisman birlikte girilir.', path: ['devirBirikmisTl'] });
export const sabitKiymetPasifGovdesi = z.object({ pasifTarihi: tarihSemasi, ...beklenenSurum });
// Hesaplanan alanlar (TL) bugünün ayına göredir: buAyTl bu ayın amortismanı, birikmisTl ay sonu dahil birikmiş, netTl bedel eksi birikmiş.
export const sabitKiymetSatiri = z.object({
  id: z.number().int(), ad: z.string(), makineKodu: z.string().nullable(), paraBirimi: z.string(), bedel: numerik, kur: numerik,
  alisTarihi: tarihSemasi, omurAy: z.number().int(), yontem: z.enum(AMORTISMAN_YONTEMLERI), kalintiDegeri: numerik,
  devirTarihi: tarihSemasi.nullable(), devirBirikmisTl: numerik.nullable(), pasifTarihi: tarihSemasi.nullable(), aciklama: z.string().nullable(),
  surum: surumSemasi, olusturma: zamanSemasi,
  bedelTl: numerik, buAyTl: numerik, birikmisTl: numerik, netTl: numerik,
});
export type SabitKiymetSatiri = z.output<typeof sabitKiymetSatiri>;
export const sabitKiymetCevabi = z.object({ sabitKiymet: sabitKiymetSatiri });
export const sabitKiymetListesiCevabi = listeCevapSemasi(sabitKiymetSatiri);
// Aylık toplam amortisman (TL), eskiden yeniye; gelir tablosunda nakit dışı gider satırıdır.
export const amortismanCevabi = z.object({ aylar: z.array(z.object({ ay: z.string().regex(/^\d{4}-\d{2}$/), tutarTl: numerik })) });
// Kur ve faiz şeridi: bugüne kadar geçerli son kur ve faiz, kimin ne zaman girdiğiyle; sonGiris ileri tarihli giriş dahil en son yazılandır.
// Ortak kur ve faiz şeridi (939, 952 a): giriş yapan herkes okur. Kur satırının sürümü aynı günün düzeltmesi içindir; geçmiş son girişlerdir
// (düzeltme de giriş sayılır), en yeni başta.
export const KUR_FAIZ_GECMISI_BOYU = 8;
export const kurFaizOzetiCevabi = z.object({
  bugun: tarihSemasi,
  kurlar: z.array(z.object({ paraBirimi: z.string(), tarih: tarihSemasi, kur: numerik, girenAd: z.string().nullable(), giris: zamanSemasi, surum: surumSemasi })),
  faizler: z.array(z.object({ paraBirimi: z.string(), gecerlilikBaslangic: tarihSemasi, aylikYuzde: numerik, girenAd: z.string().nullable(), giris: zamanSemasi })),
  sonGiris: z.object({ tur: z.enum(['kur', 'faiz']), giris: zamanSemasi, girenAd: z.string().nullable() }).nullable(),
  gecmis: z.array(z.object({
    tur: z.enum(['kur', 'faiz']), paraBirimi: z.string(), deger: numerik, tarih: tarihSemasi, duzeltme: z.boolean(), girenAd: z.string().nullable(), giris: zamanSemasi,
  })).max(KUR_FAIZ_GECMISI_BOYU),
});
export type KurFaizOzeti = z.output<typeof kurFaizOzetiCevabi>;
// Kur ve faiz toplu yükleme (1083-1087): şablondan okunan satırlar birlikte yazılır ya da hiçbiri. Kayıtlı güne farklı değer
// atlanır, düzeltme tek tek yapılır (1085 a). Kur ileri tarihli olamaz, faiz olabilir (1086 a); bugün sunucuda bilinir.
export const KUR_FAIZ_TOPLU_SINIRI = 400;
export const kurFaizTopluSatiri = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('kur'), paraBirimi: paraBirimiSemasi.refine((p) => p !== 'TRY', 'TRY için kur girilmez.'), tarih: tarihSemasi, deger: kurSemasi }),
  z.object({ tur: z.literal('faiz'), paraBirimi: paraBirimiSemasi, tarih: tarihSemasi, deger: aylikFaizSemasi }),
]);
export const kurFaizTopluGovdesi = z.object({
  satirlar: z.array(kurFaizTopluSatiri).min(1, 'Dosyada satır yok.').max(KUR_FAIZ_TOPLU_SINIRI, `Tek seferde en çok ${KUR_FAIZ_TOPLU_SINIRI} satır.`),
}).superRefine((g, c) => {
  const gorulen = new Set<string>();
  g.satirlar.forEach((s, i) => {
    const anahtar = `${s.tur}|${s.paraBirimi}|${s.tarih}`;
    if (gorulen.has(anahtar)) c.addIssue({ code: 'custom', path: ['satirlar', i], message: `${i + 1}. satır aynı tür, para birimi ve tarihle ikinci kez var.` });
    gorulen.add(anahtar);
  });
});
export const kurFaizTopluCevabi = z.object({ eklenen: z.number().int(), ayni: z.number().int(), farkli: z.number().int() });
// Toplu yüklemenin önizlemesi ve şeridin kur grafiği (1089 a) aralıktaki kur ve faizi okur; şerit gibi giriş yapan herkes okur (952 a).
// Faizde aralıktan önce başlamış son oran da gelir: grafik aralığın başındaki oranı bilsin.
export const KUR_FAIZ_ARALIGI_GUN = 1830;
const gunFarki = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
export const kurFaizAraligiSorgusu = z.object({ baslangic: tarihSemasi, bitis: tarihSemasi })
  .refine((s) => s.baslangic <= s.bitis, 'Başlangıç bitişten sonra olamaz.')
  .refine((s) => gunFarki(s.baslangic, s.bitis) <= KUR_FAIZ_ARALIGI_GUN, `Aralık en çok ${KUR_FAIZ_ARALIGI_GUN} gün olabilir.`);
export const kurFaizAraligiCevabi = z.object({
  kurlar: z.array(z.object({ paraBirimi: z.string(), tarih: tarihSemasi, kur: numerik })),
  faizler: z.array(z.object({ paraBirimi: z.string(), gecerlilikBaslangic: tarihSemasi, aylikYuzde: numerik })),
});
export type KurFaizAraligi = z.output<typeof kurFaizAraligiCevabi>;
export const kdvOraniKapatGovdesi = z.object({ oran: oranSemasi, gecerlilikBaslangic: tarihSemasi, gecerlilikBitis: tarihSemasi, ...beklenenSurum });
export const kdvOraniSatiri = z.object({ oran: numerik, gecerlilikBaslangic: tarihSemasi, gecerlilikBitis: tarihSemasi.nullable(), surum: surumSemasi });
export const duzenliOdemeGovdesi = z.object({
  ad: z.string().trim().min(1, 'Ad boş olamaz.').max(100), kategori: z.enum(GIDER_KATEGORILERI).refine((k) => k !== 'kur_farki_gideri', 'Bu kategori düzenli ödeme olamaz.'),
  firmaId: kimlikSayisi.nullish().transform((v) => v ?? null), hesapId: kimlikSayisi.nullish().transform((v) => v ?? null),
  paraBirimi: paraBirimiSemasi.default('TRY'), tutar: tutarSemasi, kdvOrani: oranSemasi.default(0), ayinGunu: z.number().int().min(1).max(31), aktif: z.boolean().default(true),
});
export const duzenliOdemeGuncelleGovdesi = duzenliOdemeGovdesi.extend(beklenenSurum);
export const duzenliOdemeSemasi = z.object({
  id: z.number().int(), ad: z.string(), kategori: z.enum(GIDER_KATEGORILERI), firmaId: z.number().int().nullable(), hesapId: z.number().int().nullable(),
  paraBirimi: z.string(), tutar: numerik, kdvOrani: numerik, ayinGunu: z.number().int(), aktif: z.boolean(), surum: surumSemasi,
});
export const duzenliOdendiGovdesi = z.object({ tarih: tarihSemasi, hesapId: kimlikSayisi, yontem: z.enum(NAKIT_YONTEMLERI) });
export const butceGovdesi = z.object({ kategori: z.enum(BUTCE_KALEMLERI), baslangicAyi: tarihSemasi.refine((t) => t.endsWith('-01'), 'Dönem ayın ilk günüdür.'), aylikTutar: negatifOlmayanTutar });
export const butceSatiri = z.object({ kategori: z.enum(BUTCE_KALEMLERI), baslangicAyi: tarihSemasi, aylikTutar: numerik, surum: surumSemasi });

// ---- Ayar ----
const istegeBagliTutar = negatifOlmayanTutar.nullish().transform((v) => v ?? null);
const istegeBagliIsaretli = isaretliTutarSemasi.nullish().transform((v) => v ?? null);
export const ayarAlanlari = z.object({
  sirketAdi: z.string().trim().min(1).max(200), sektor: z.enum(SEKTORLER), nakitEsigi: negatifOlmayanTutar,
  beklenenAylikSatis: istegeBagliTutar, beklenenTahsilGunu: z.number().int().min(0).max(365).nullish().transform((v) => v ?? null),
  riskToleransi: z.number().int().min(1).max(50), simulasyonSayisi: z.number().int().min(200).max(5000),
  cekKarsiliksizOlasiligi: z.number().min(0).max(50), batikGunu: z.number().int().min(30).max(730), anomaliEsigi: z.number().min(2).max(10),
  agirlikLikidite: z.number().int().min(0).max(100), agirlikNakit: z.number().int().min(0).max(100), agirlikKarlilik: z.number().int().min(0).max(100),
  agirlikVerimlilik: z.number().int().min(0).max(100), agirlikBorcluluk: z.number().int().min(0).max(100),
  bilancoDonen: istegeBagliIsaretli, bilancoStok: istegeBagliIsaretli, bilancoKvb: istegeBagliIsaretli, bilancoToplamBorc: istegeBagliIsaretli,
  bilancoOzkaynak: istegeBagliIsaretli, bilancoBirikmisKar: istegeBagliIsaretli, kurulumTamam: z.boolean(),
  // Gönderilmezse kayıtlı pay korunur: prototipin ayar gövdesi bu alanı taşımaz. Okunan ayar geri gönderilebilsin diye sayı metni de kabul edilir.
  caprazKurPayi: z.union([z.number(), z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Sayı bekleniyor.').transform(Number)])
    .pipe(z.number().gt(0, 'Pay sıfırdan büyük olmalı.').max(100, 'Pay en çok %100 olur.')).nullish().transform((v) => v ?? null),
});
export const ayarGuncelleGovdesi = ayarAlanlari.extend(beklenenSurum);
export const ayarSemasi = z.object({
  sirketAdi: z.string(), sektor: z.enum(SEKTORLER), nakitEsigi: numerik, beklenenAylikSatis: numerik.nullable(), beklenenTahsilGunu: z.number().int().nullable(),
  riskToleransi: z.number().int(), simulasyonSayisi: z.number().int(), cekKarsiliksizOlasiligi: numerik, batikGunu: z.number().int(), anomaliEsigi: numerik,
  agirlikLikidite: z.number().int(), agirlikNakit: z.number().int(), agirlikKarlilik: z.number().int(), agirlikVerimlilik: z.number().int(), agirlikBorcluluk: z.number().int(),
  bilancoDonen: numerik.nullable(), bilancoStok: numerik.nullable(), bilancoKvb: numerik.nullable(), bilancoToplamBorc: numerik.nullable(),
  bilancoOzkaynak: numerik.nullable(), bilancoBirikmisKar: numerik.nullable(), kurulumTamam: z.boolean(), caprazKurPayi: numerik, surum: surumSemasi,
});
export const ayarCevabi = z.object({ ayar: ayarSemasi });

// ---- Danışman ve süreç ----
export const oneriDurumuGovdesi = z.object({
  bulguKimligi: z.string().regex(/^[A-Za-z0-9._:-]{1,80}$/), durum: z.enum(['acik', 'uygulaniyor', 'ertelendi', 'kapatildi']),
  erteleBitis: tarihSemasi.nullish().transform((v) => v ?? null),
});
export const oneriDurumuSatiri = z.object({ bulguKimligi: z.string(), durum: z.enum(['uygulaniyor', 'ertelendi', 'kapatildi']), erteleBitis: tarihSemasi.nullable() });
export const kapanisGovdesi = z.object({ donem: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/), madde: z.string().regex(/^[a-z_]{1,30}$/), isaretli: z.boolean() });
export const kapanisSatiri = z.object({ donem: z.string(), madde: z.string(), isaretli: z.boolean() });
export const skorGovdesi = z.object({ gun: tarihSemasi, skor: z.number().int().min(0).max(100), nakit: isaretliTutarSemasi.nullish().transform((v) => v ?? null) });
export const skorSatiri = z.object({ gun: tarihSemasi, skor: z.number().int(), nakit: numerik.nullable() });

// ---- Toplu içe aktarma (yalnız açık belge; firma tam eşleşmeyle, FNS-50) ----
export const topluSatir = z.object({
  belgeTarihi: tarihSemasi, yon: z.enum(YONLER), kategori: z.enum(KATEGORILER), firma: z.string().trim().min(1, 'Firma boş olamaz.').max(200),
  belgeNo: metin(16), aciklama: metin(500), tutar: tutarSemasi, kdvOrani: oranSemasi, vade: tarihSemasi,
  paraBirimi: paraBirimiSemasi.default('TRY'), kur: kurSemasi.default(1),
});
export const topluAktarGovdesi = z.object({ satirlar: z.array(topluSatir).min(1).max(TOPLU_AKTARIM_SINIRI, `Tek seferde en çok ${TOPLU_AKTARIM_SINIRI} satır.`) });
export const topluAktarCevabi = z.object({ eklenen: z.number().int() });

// ---- Listeler ----
const sayfaliSorgu = z.object({ ...sayfaSorguAlanlari, iptalDahil: mantiksal });
export const finansListeSorgusu = sayfaliSorgu;
export const belgeListesiCevabi = listeCevapSemasi(belgeSemasi);
export const odemeListesiCevabi = listeCevapSemasi(odemeSemasi);
export const dagilimListesiCevabi = listeCevapSemasi(dagilimSemasi);
export const mahsupListesiCevabi = listeCevapSemasi(mahsupSemasi);
export const cekListesiCevabi = listeCevapSemasi(cekSemasi);
export const hesapListesiCevabi = listeCevapSemasi(hesapSemasi);
export const virmanListesiCevabi = listeCevapSemasi(virmanSemasi);
export const kurListesiCevabi = listeCevapSemasi(kurSatiri);
// Ana sayfa panosu: her dövizin bugüne kadar girilmiş son kuru (TRY yok). Kur hiç girilmemiş döviz listede yoktur.
// Rakamlar TL karşılığıdır (belge kendi kuruyla, hesap bakiyesi son kurla). Nakit, kuru girilmemiş dövizli aktif hesap varsa
// ya da hiç aktif hesap yoksa null'dır: eksik kurla toplam uydurulmaz.
const sayiVeTutar = z.object({ sayi: z.number().int(), tutarTl: numerik });
export const finansOzetiCevabi = z.object({
  kurlar: z.array(z.object({ paraBirimi: z.string(), kur: numerik, tarih: tarihSemasi })),
  gecikenTahsilat: sayiVeTutar,
  yaklasanOdeme: sayiVeTutar,
  // Kart #162: faturası gelmemiş siparişlerin aynı penceredeki ödemeleri; yaklasanOdeme'ye eklenmez, ayrı gösterilir. Kuru eksik kalem varsa tutar null.
  yaklasanSiparis: z.object({ sayi: z.number().int(), tutarTl: numerik.nullable() }),
  portfoyCek: sayiVeTutar,
  nakitTl: numerik.nullable(),
  // Yönetici şirket özeti: finans ana sayfasındaki Alacağım, Borcum ve Aylık ortalama kâr ile aynı tanım (TL).
  alacakTl: numerik, borcTl: numerik, aylikKarTl: numerik,
});
export type FinansOzetiCevabi = z.output<typeof finansOzetiCevabi>;
// Yönetici paneli grafiği: son 6-12 ay (içinde bulunulan ay dahil), eskiden yeniye; KDV hariç TL. İlk belgeden önceki ay null.
export const aylikSeriSorgusu = z.object({ ay: z.coerce.number().int().min(6).max(12).default(12) });
export const aylikSeriCevabi = z.object({
  aylar: z.array(z.object({ ay: z.string().regex(/^\d{4}-\d{2}$/), gelirTl: numerik.nullable(), giderTl: numerik.nullable() })),
});
export type AylikSeriCevabi = z.output<typeof aylikSeriCevabi>;
export const kdvOraniListesiCevabi = listeCevapSemasi(kdvOraniSatiri);
export const faizListesiCevabi = listeCevapSemasi(faizSatiri);
export const genelGiderOraniListesiCevabi = listeCevapSemasi(genelGiderOraniSatiri);
export const duzenliOdemeListesiCevabi = listeCevapSemasi(duzenliOdemeSemasi);
export const butceListesiCevabi = listeCevapSemasi(butceSatiri);
export const esitlemeListesiCevabi = listeCevapSemasi(esitlemeSemasi);
export const oneriListesiCevabi = listeCevapSemasi(oneriDurumuSatiri);
export const kapanisListesiCevabi = listeCevapSemasi(kapanisSatiri);
export const skorListesiCevabi = listeCevapSemasi(skorSatiri);

// ---- Siparişten beklenen ödemeler (kart #1124) ----
// Satın alma siparişe çevirirken ödeme planını yazar; faturası bağlanmamış siparişin planı finansın ödenecekleridir.
export const SIPARIS_ODEME_YONTEMLERI = ['nakit', 'banka', 'kredi_karti', 'cek', 'senet'] as const;
export type SiparisOdemeYontemi = (typeof SIPARIS_ODEME_YONTEMLERI)[number];
export const beklenenOdemelerCevabi = z.object({
  odemeler: z.array(z.object({
    id: z.number().int(), talepId: z.string(), teklifId: z.string(), siparisNo: z.string(), sira: z.number().int(), tur: z.enum(['avans', 'vade']), vade: tarihSemasi,
    yontem: z.enum(SIPARIS_ODEME_YONTEMLERI), firmaId: z.number().int(), firmaAdi: z.string(), paraBirimi: z.string(), tutar: numerik,
    // Kart #162: tahmini TL karşılığı (dövizde bugüne kadarki son kur); kur girilmemişse null.
    tutarTl: numerik.nullable(),
    // Borç B15: nakit tahminine giren tutar (ödenmiş avans düşülmüş TL; kur yoksa null). Vadesi geçen satır tahmine girmez, listede kalır.
    tahminTl: numerik.nullable(), avansDusulenTl: numerik, gecikmis: z.boolean(),
    // Aynı tedarikçinin siparişe bağlanmamış alış faturası var: tutar düşülmez, kullanıcı bağı kontrol eder.
    bagsizFatura: z.boolean(),
  })),
});
export type BeklenenOdemelerCevabi = z.output<typeof beklenenOdemelerCevabi>;

// ---- Birim maliyetleri (kart #1187): malzeme birim maliyeti, istasyon ve kişi saatlik maliyeti ----
// Satır yoksa maliyet bilinmiyordur. Tutar dört ondalıktır; cevapta metindir (numeric).
export const MALIYET_TURLERI = ['malzeme', 'istasyon', 'kisi'] as const;
export const maliyetTutariSemasi = z.number().min(0, 'Maliyet sıfırdan küçük olamaz.').max(1e9, 'Maliyet çok büyük.')
  .refine((v) => Math.abs(v * 1e4 - Math.round(v * 1e4)) < 1e-6, 'Maliyet en çok dört ondalık olabilir.').transform((v) => v.toFixed(4));
export const maliyetTuruParametresi = z.object({ tur: z.enum(MALIYET_TURLERI) });
// surum: kayıt ilk kez giriliyorsa null, düzeltmede okunan sürüm.
export const maliyetYazGovdesi = z.object({
  anahtar: kimlikSayisi, birimMaliyet: maliyetTutariSemasi, paraBirimi: paraBirimiSemasi.default('TRY'), surum: surumSemasi.nullable(),
});
export const maliyetSatiri = z.object({
  anahtar: z.number().int(), birimMaliyet: numerik, paraBirimi: z.string(), guncelleme: zamanSemasi, guncelleyenId: z.number().int(), surum: surumSemasi,
});
export type MaliyetSatiri = z.output<typeof maliyetSatiri>;
export const maliyetCevabi = z.object({ maliyet: maliyetSatiri });
export const maliyetListesiCevabi = listeCevapSemasi(maliyetSatiri);

// 260 a: satış faturasına bağlanabilecek siparişler (firmanın onaylı ve kapanmış siparişleri, yeniden eskiye).
export const satisSiparisleriSorgusu = z.object({ firmaId: z.coerce.number().int().positive().max(2147483647) });
export const satisSiparisiSemasi = z.object({ id: z.number().int(), no: z.string(), durum: z.enum(['onayli', 'kapandi']), siparisTarihi: tarihSemasi, musteriSiparisNo: z.string().nullable() });
export const satisSiparisleriCevabi = z.object({ siparisler: z.array(satisSiparisiSemasi) });
export type SatisSiparisi = z.output<typeof satisSiparisiSemasi>;
export type SatisSiparisleriCevabi = z.output<typeof satisSiparisleriCevabi>;
// 302 a: satış faturasına bağlanabilecek sevkler (siparişin iptal edilmemiş teslimat işleri; durum Sevkiyat'ın iş durumudur).
export const satisSevkleriSorgusu = z.object({ siparisId: z.coerce.number().int().positive().max(2147483647) });
export const satisSevkiSemasi = z.object({ id: z.number().int(), tarih: tarihSemasi, belgeNo: z.string().nullable(), durum: z.string() });
export const satisSevkleriCevabi = z.object({ sevkler: z.array(satisSevkiSemasi) });
export type SatisSevki = z.output<typeof satisSevkiSemasi>;
export type SatisSevkleriCevabi = z.output<typeof satisSevkleriCevabi>;
