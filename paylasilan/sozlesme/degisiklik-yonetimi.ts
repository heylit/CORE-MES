import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import {
  ACILIYETLER, CEVAPLAR, EMIR_DURUMLARI, FAI_DURUMLARI, FAI_TURLERI, GECMIS_OLAYLARI, GOREV_ISLEMLERI, GOREV_KAPSAMLARI, HAT_ASAMALARI, IPLIK_HALLERI, IPLIK_KATMANLARI, KAPANIS_KOSULLARI,
  KARAR_HEDEFLERI, KARAR_KODLARI, KARAR_MODLARI, KOSUL_HALLERI, LISTE_KAPSAMLARI, OLAY_ILGILILERI, OLAY_TURLERI, PARCA_HALLERI, SERI_DURUMLARI,
  SINIFLAR, STOK_HALLERI, TALEP_DURUMLARI, TASARIM_OTORITELERI, UYUM_HALLERI,
} from './degisiklik-yonetimi-sabitleri.ts';

export * from './degisiklik-yonetimi-sabitleri.ts';

// Değişiklik yönetimi (1120 a): talep (ECR), değişiklik emri (ECO), geçerlilik, karar (disposition), ilk parça şartı ve geçmiş bu modülündür.
// Parça, çizim revizyonu, rota revizyonu, emir, stok ve seri sahibi modüllerde kalır; burada yalnız kimlikleriyle bağlanır (1121 a).
// Kararın sahadaki uygulaması (karantina, emir yenileme, hurda, rework, NCR) Aşama 2'de sahibi modülün ucuyla yapılır (1123 a).
//
// Uçlar (P1 yazar). Yetki sütunu `degisiklik-yonetimi.<ad>` işlemidir (1126 a); okuma `biri` ile bu işlemlerden herhangi biri ister:
//   GET  /degisiklik-yonetimi/gorevlerim                       gorevlerimSorgusu -> gorevlerimCevabi
//   GET  /degisiklik-yonetimi/talepler                         taleplerSorgusu -> talepListeCevabi
//   GET  /degisiklik-yonetimi/talepler/:id                     talepCevabi
//   GET  /degisiklik-yonetimi/parca-adaylari                   talep-ac         parcaAdaylariSorgusu -> parcaAdaylariCevabi
//   POST /degisiklik-yonetimi/talepler/ac                      talep-ac         talepAcGovdesi
//   POST /degisiklik-yonetimi/talepler/:id/siniflandir         siniflandir      siniflandirGovdesi
//   POST /degisiklik-yonetimi/talepler/:id/etki-analizi        siniflandir      surumGovdesi
//   POST /degisiklik-yonetimi/talepler/:id/ccb                 ccb-karar        ccbGovdesi
//   POST /degisiklik-yonetimi/talepler/:id/musteri-onayi       musteri-onayi    musteriOnayiGovdesi
//   POST /degisiklik-yonetimi/talepler/:id/emir-ac             emir-ac          surumGovdesi -> emirCevabi
//   GET  /degisiklik-yonetimi/emirler                          emirlerSorgusu -> emirListeCevabi
//   GET  /degisiklik-yonetimi/emirler/:id                      emirCevabi
//   POST /degisiklik-yonetimi/emirler/:id/taslak-ac            revizyon-hazirla surumGovdesi
//   POST /degisiklik-yonetimi/emirler/:id/kalem-kaydet         revizyon-hazirla kalemKaydetGovdesi
//   POST /degisiklik-yonetimi/emirler/:id/yayina-gonder        revizyon-hazirla surumGovdesi
//   POST /degisiklik-yonetimi/emirler/:id/geri-gonder          yayinla          geriGonderGovdesi
//   POST /degisiklik-yonetimi/emirler/:id/yayinla              yayinla          yayinlaGovdesi
//   POST /degisiklik-yonetimi/emirler/:id/karar                karar-ver        kararGovdesi (MRB kararı değilse)
//   POST /degisiklik-yonetimi/emirler/:id/toplu-karar          karar-ver        surumGovdesi (yalnız MRB olmayan öneriler)
//   POST /degisiklik-yonetimi/emirler/:id/mrb-karar            mrb-karar        kararGovdesi (mrbKarariMi doğruysa)
//   POST /degisiklik-yonetimi/emirler/:id/fai-onayla           fai-onayla       faiOnayGovdesi
//   POST /degisiklik-yonetimi/emirler/:id/kapat                kapat            kapatGovdesi
//   GET  /degisiklik-yonetimi/son-urunler                      sonUrunlerCevabi
//   GET  /degisiklik-yonetimi/konfigurasyon/:malzemeId         konfigurasyonCevabi
//   GET  /degisiklik-yonetimi/seriler                          serilerSorgusu -> seriListeCevabi
//   GET  /degisiklik-yonetimi/izlenebilirlik                   izlenebilirlikSorgusu -> izlenebilirlikCevabi
//   GET  /degisiklik-yonetimi/raporlar                         raporSorgusu -> raporCevabi
//   GET  /degisiklik-yonetimi/olaylar                          olaylarSorgusu -> olayListeCevabi
// Her komut kaydın sürümünü ister; kişi ve zaman sunucudan. Talebi açan kendi talebine CCB kararı veremez (sunucuda denetlenir).

// Veritabanı tam sayısının üst sınırı; iş kuralı değildir.
const TAM_SAYI_UST = 2147483647;
const KIMLIK = z.number().int().positive().max(TAM_SAYI_UST);
const yolKimligi = z.coerce.number().pipe(KIMLIK);
const metin = (azami: number, bosIleti: string) => z.string().trim().min(1, bosIleti).max(azami);
// Boş açıklama null olur.
const aciklama = z.string().trim().max(1000, 'Açıklama en çok 1000 karakter.').nullish().transform((d) => (d ? d : null));
const aramaMetni = z.string().trim().max(60).optional().transform((m) => (m === '' ? undefined : m));
const cevap = z.enum(CEVAPLAR);

export const sinif = z.enum(SINIFLAR);
export const aciliyet = z.enum(ACILIYETLER);
export const talepDurumu = z.enum(TALEP_DURUMLARI);
export const emirDurumu = z.enum(EMIR_DURUMLARI);
export const kararKodu = z.enum(KARAR_KODLARI);
export const kararModu = z.enum(KARAR_MODLARI);

export const idParametresi = z.object({ id: yolKimligi });
const listeKapsami = z.enum(LISTE_KAPSAMLARI).default('acik');
export const malzemeParametresi = z.object({ malzemeId: yolKimligi });

// Komutlar.
export const surumGovdesi = z.object({ surum: surumSemasi }).strict();
export const talepAcGovdesi = z.object({
  baslik: metin(160, 'Başlık yazın.'),
  // Açanın tahmini; sınıfı proses mühendisi verir.
  onSinif: sinif.nullish().transform((s) => s ?? null),
  aciliyet,
  malzemeIdleri: z.array(KIMLIK).min(1, 'En az bir parça seçin.').max(50).refine((d) => new Set(d).size === d.length, 'Parça iki kez seçilmiş.'),
  aciklama,
}).strict();
export const siniflandirmaCevaplari = z.object({
  cizim: cevap.nullable(), fff: cevap.nullable(), proses: cevap.nullable(), sure: cevap.nullable(),
}).strict();
export const siniflandirGovdesi = z.object({ sinif, aciliyet, cevaplar: siniflandirmaCevaplari, not: aciklama, surum: surumSemasi }).strict();
export const ccbGovdesi = z.object({ karar: z.enum(['onay', 'ret']), aciklama, surum: surumSemasi }).strict();
export const musteriOnayiGovdesi = z.object({ referans: metin(80, 'Müşteri onay numarasını yazın.'), aciklama, surum: surumSemasi }).strict();
// Kalem: talepteki her parça için eski ve yeni revizyon bağı. Yeni çizim ve rota revizyonu sahibi modülde taslak olarak açılır,
// burada kimliğiyle bağlanır (1121 a). Değiştirilebilirlik iki yönde de evet değilse yeni parça numarası gerekir (D sınıfında).
export const kalemKaydetGovdesi = z.object({
  kalemId: KIMLIK,
  yeniCizimRevizyonuId: KIMLIK.nullable(),
  yeniRotaRevizyonuId: KIMLIK.nullable(),
  eskiYeniyeUyar: cevap.nullable(),
  yeniEskiyeUyar: cevap.nullable(),
  yeniParcaNo: z.string().trim().max(60).nullish().transform((d) => (d ? d : null)),
  yeniParcaAdi: z.string().trim().max(160).nullish().transform((d) => (d ? d : null)),
  ozet: z.string().trim().max(1000).default(''),
  surum: surumSemasi,
}).strict();
export const geriGonderGovdesi = z.object({ aciklama: metin(1000, 'Geri gönderme gerekçesini yazın.'), surum: surumSemasi }).strict();
export const gecerlilikSemasi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('seri'), sonUrunMalzemeId: KIMLIK, ilkSeri: z.number().int().positive().max(TAM_SAYI_UST) }).strict(),
  z.object({ tur: z.literal('tarih'), tarih: tarihSemasi }).strict(),
  z.object({ tur: z.literal('tum') }).strict(),
]);
export const yayinlaGovdesi = z.object({ gecerlilik: gecerlilikSemasi, aciklama, surum: surumSemasi }).strict();
// Sürüm emrin sürümüdür. Sapmada müşteri ya da iç onay referansı zorunludur.
export const kararGovdesi = z.object({
  kararId: KIMLIK, kod: kararKodu,
  sapmaReferansi: z.string().trim().max(80).nullish().transform((d) => (d ? d : null)),
  aciklama, surum: surumSemasi,
}).strict().refine((g) => g.kod !== 'eskiyle_tamamla_sapma' || g.sapmaReferansi !== null, {
  message: 'Sapma için müşteri veya iç onay referansını yazın.', path: ['sapmaReferansi'],
});
export const faiOnayGovdesi = z.object({ faiId: KIMLIK, aciklama, surum: surumSemasi }).strict();
export const kapatGovdesi = z.object({ aciklama, surum: surumSemasi }).strict();

// Cevaplar. Başka modülden gelen ad ve kod alanları bağlı değilse null'dır (Aşama 1).
const kisiZamani = z.object({ kisiId: KIMLIK, kisiAdi: z.string().nullable(), zaman: zamanSemasi });
const malzemeOzeti = z.object({ malzemeId: KIMLIK, kod: z.string().nullable(), ad: z.string().nullable() });
export const gecmisSatiri = kisiZamani.extend({
  olay: z.enum(GECMIS_OLAYLARI),
  // İmzalı olayda IMZA_ANLAMLARI'ndaki metin; değilse null.
  imzaAnlami: z.string().nullable(),
  aciklama: z.string().nullable(),
  // Olayın tek satırlık özeti (ör. "Disposition: emir -> Rework emri aç").
  ozet: z.string(),
});

// Etki analizi: her bölüm sahibi modülden okunur; bağlı değilse null (bilinmiyor), boş dizi "etkilenen yok" demektir.
export const etkiEmri = z.object({
  uretimEmriId: KIMLIK, emirNo: z.string(), malzeme: malzemeOzeti, revizyon: z.string().nullable(), durum: z.string(),
  donmus: z.boolean().nullable(), seriAraligi: z.string().nullable(), adet: z.number().int().positive(),
  onerilenKod: kararKodu, mod: kararModu, gerekce: z.string(),
});
export const etkiAnalizi = z.object({
  zaman: zamanSemasi,
  ustParcalar: z.array(malzemeOzeti).nullable(),
  emirler: z.array(etkiEmri).nullable(),
  stok: z.array(z.object({ malzeme: malzemeOzeti, revizyon: z.string().nullable(), miktar: ondalikMetinSemasi, yer: z.string().nullable() })).nullable(),
  sahada: z.array(z.object({ malzeme: malzemeOzeti, revizyon: z.string().nullable(), adet: z.number().int().nonnegative() })).nullable(),
  ncProgramlari: z.array(z.string()).nullable(),
  fai: z.enum(['tam_ve_kismi', 'kismi', 'gerekmez']),
  musteriOnayiGerekir: z.boolean().nullable(),
  // Bitmiş ve stokta duran seri sayısı.
  stoktakiSeri: z.number().int().nonnegative().nullable(),
  mrbAdayi: z.number().int().nonnegative().nullable(),
});
// Yeni talepte parça seçimi; kod ve ad malzemelerden (bağlı değilse null).
export const parcaAdaylariSorgusu = z.object({ ara: aramaMetni });
export const parcaAdaylariCevabi = z.object({ parcalar: z.array(malzemeOzeti) });
// Talepteki parça: yürürlükteki çizim revizyonu, tasarım otoritesi ve kullanım yeri sahibi modülden (bağlı değilse null).
export const talepMalzemesi = malzemeOzeti.extend({
  cizimRevizyonu: z.string().nullable(), tasarimOtoritesi: z.enum(TASARIM_OTORITELERI).nullable(),
  sozlesmeKonfigurasyonu: z.boolean().nullable(), kullanimYeri: z.array(malzemeOzeti).nullable(),
});
export const talepCevabi = z.object({
  id: KIMLIK, no: z.string(), baslik: z.string(), aciklama: z.string().nullable(),
  onSinif: sinif.nullable(), sinif: sinif.nullable(), aciliyet,
  durum: talepDurumu,
  malzemeler: z.array(talepMalzemesi),
  cevaplar: siniflandirmaCevaplari.nullable(),
  etki: etkiAnalizi.nullable(),
  musteriReferansi: z.string().nullable(),
  acan: kisiZamani,
  emirId: KIMLIK.nullable(),
  gecmis: z.array(gecmisSatiri),
  surum: surumSemasi,
});
export const taleplerSorgusu = z.object({
  ...sayfaSorguAlanlari, kapsam: listeKapsami, durum: talepDurumu.optional(), sinif: sinif.optional(), ara: aramaMetni,
});
export const talepListeSatiri = z.object({
  id: KIMLIK, no: z.string(), baslik: z.string(), sinif: sinif.nullable(), aciliyet, durum: talepDurumu,
  malzemeler: z.array(malzemeOzeti),
  acilis: zamanSemasi, acanAdi: z.string().nullable(), emirNo: z.string().nullable(),
});
export const talepListeCevabi = listeCevapSemasi(talepListeSatiri);

const revizyonBagi = z.object({ id: KIMLIK, etiket: z.string().nullable() }).nullable();
export const emirKalemi = z.object({
  id: KIMLIK, malzeme: malzemeOzeti,
  eskiCizimRevizyonu: revizyonBagi, yeniCizimRevizyonu: revizyonBagi,
  eskiRotaRevizyonu: revizyonBagi, yeniRotaRevizyonu: revizyonBagi,
  eskiYeniyeUyar: cevap.nullable(), yeniEskiyeUyar: cevap.nullable(),
  // Kurallar.ts değiştirilebilirlikten hesaplar; yeni parça kartını malzemeler açar (Aşama 2).
  yeniParcaNoGerekir: z.boolean().nullable(),
  yeniParcaNo: z.string().nullable(), yeniParcaAdi: z.string().nullable(),
  ozet: z.string(),
});
export const gecerlilikCevabi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('seri'), sonUrun: malzemeOzeti, ilkSeri: z.number().int().positive() }),
  z.object({ tur: z.literal('tarih'), tarih: tarihSemasi }),
  z.object({ tur: z.literal('tum') }),
]);
export const kararSatiri = z.object({
  id: KIMLIK, hedef: z.enum(KARAR_HEDEFLERI),
  // Hedef emir ise üretim emri, stok ise stok kaydı kimliği; etiket sahibi modülden (bağlı değilse null).
  hedefId: KIMLIK, hedefEtiketi: z.string().nullable(),
  onerilenKod: kararKodu, mod: kararModu, gerekce: z.string(),
  // Uygulanabilir kodlar kurallar.ts'ten; verilen kod bu listede olmalı.
  izinliKodlar: z.array(kararKodu),
  verilenKod: kararKodu.nullable(), veren: kisiZamani.nullable(),
  sapmaReferansi: z.string().nullable(), not: z.string().nullable(),
});
export const faiSarti = z.object({
  id: KIMLIK, kalemId: KIMLIK, tur: z.enum(FAI_TURLERI), durum: z.enum(FAI_DURUMLARI),
  // Yeni rotayla en az bir adım bitti mi; rota ve üretim emirleri bağlı değilse null.
  kanitVar: z.boolean().nullable(),
  onaylayan: kisiZamani.nullable(),
});
export const kapanisKosulu = z.object({ kosul: z.enum(KAPANIS_KOSULLARI), durum: z.enum(KOSUL_HALLERI), ayrinti: z.string().nullable() });
export const emirCevabi = z.object({
  id: KIMLIK, no: z.string(), baslik: z.string(), sinif, durum: emirDurumu,
  talep: z.object({ id: KIMLIK, no: z.string() }).nullable(),
  musteriReferansi: z.string().nullable(),
  kalemler: z.array(emirKalemi),
  gecerlilik: gecerlilikCevabi.nullable(),
  kararlar: z.array(kararSatiri),
  fai: z.array(faiSarti),
  kapanisKosullari: z.array(kapanisKosulu),
  // Maliyet sahibi modülden (stok, finans); bağlı değilse null.
  hurdaMaliyeti: ondalikMetinSemasi.nullable(),
  reworkMaliyeti: ondalikMetinSemasi.nullable(),
  koordinator: kisiZamani,
  kapanis: tarihSemasi.nullable(),
  gecmis: z.array(gecmisSatiri),
  surum: surumSemasi,
});
export const emirlerSorgusu = z.object({
  ...sayfaSorguAlanlari, kapsam: listeKapsami, durum: emirDurumu.optional(), sinif: sinif.optional(), ara: aramaMetni,
});
export const emirListeSatiri = z.object({
  id: KIMLIK, no: z.string(), baslik: z.string(), sinif, durum: emirDurumu, acilis: tarihSemasi, kapanis: tarihSemasi.nullable(),
  // Yayından önce null.
  gecerlilik: gecerlilikCevabi.nullable(),
  bekleyenKarar: z.number().int().nonnegative(), bekleyenFai: z.number().int().nonnegative(),
});
export const emirListeCevabi = listeCevapSemasi(emirListeSatiri);

// Görevlerim: oturumdaki kişinin işlemlerine göre bekleyen işler, en çok geciken önce.
export const gorevSatiri = z.object({
  tur: z.enum(['talep', 'emir']), id: KIMLIK, no: z.string(), baslik: z.string(), sinif: sinif.nullable(), aciliyet,
  adim: z.string(), islem: z.enum(GOREV_ISLEMLERI),
  yasIsGunu: z.number().int().nonnegative(), hedefIsGunu: z.number().int().positive(), gecikti: z.boolean(),
});
export const gorevlerimSorgusu = z.object({ kapsam: z.enum(GOREV_KAPSAMLARI).default('benim') });
export const gorevlerimCevabi = z.object({
  gorevler: z.array(gorevSatiri),
  // Düğme etiketleri için iki kapsamın sayısı; seçili kapsamdan bağımsız.
  benimSayisi: z.number().int().nonnegative(),
  ekipSayisi: z.number().int().nonnegative(),
  hat: z.array(z.object({ asama: z.enum(HAT_ASAMALARI), adet: z.number().int().nonnegative() })),
  // Son 90 tesis gününde kapanan değişiklik emri sayısı (1149 b).
  kapanan90Gun: z.number().int().nonnegative(),
  sonKayitlar: z.array(gecmisSatiri.extend({ tur: z.enum(['talep', 'emir']), id: KIMLIK, kayitNo: z.string() })),
});

// Konfigürasyon: son ürünün serileri hangi revizyonla yapıldı. Seri markalama modülünden, durum stok ve sevkiyattan (Aşama 2).
export const konfigurasyonSerisi = z.object({
  seriNo: z.string(), revizyon: z.string().nullable(),
  // Ürünün mod seviyesi (parça revizyonunun modu); bağlı değilse null (1143 a).
  mod: z.number().int().positive().nullable(),
  durum: z.enum(SERI_DURUMLARI).nullable(), uyum: z.enum(UYUM_HALLERI),
  emirNo: z.string().nullable(), sapmaReferansi: z.string().nullable(),
  // Emir karantinadaysa true; bağlı değilse null.
  karantinada: z.boolean().nullable(),
});
// Bütün ürünlerin serileri tek, aranabilir liste (1144 a); son üretilen üstte. Arama seri no ya da ürün kodunda.
export const serilerSorgusu = z.object({ ...sayfaSorguAlanlari, ara: aramaMetni, uyum: z.enum(UYUM_HALLERI).optional() });
export const seriListeSatiri = konfigurasyonSerisi.extend({ sonUrun: malzemeOzeti });
export const seriListeCevabi = listeCevapSemasi(seriListeSatiri);
// Son ürün seçicisi. Aşama 1'de kalem ve geçerliliklerde geçen malzemeler; seri izlenip izlenmediği malzemelerden (bağlı değilse null).
export const sonUrunlerCevabi = z.object({ sonUrunler: z.array(malzemeOzeti.extend({ seriIzlenir: z.boolean().nullable() })) });
// Yürürlükteki konfigürasyon: parça başına yayımlı çizim ve rota revizyonu, NC programları; sahibi modül bağlı değilse null.
export const baselineSatiri = z.object({
  malzeme: malzemeOzeti, cizimRevizyonu: z.string().nullable(), rotaRevizyonu: z.string().nullable(),
  ncProgramlari: z.array(z.string()).nullable(), tasarimOtoritesi: z.enum(TASARIM_OTORITELERI).nullable(), durum: z.enum(PARCA_HALLERI).nullable(),
});
export const acikDegisiklik = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('talep'), id: KIMLIK, no: z.string(), baslik: z.string(), sinif: sinif.nullable(), durum: talepDurumu }),
  z.object({ tur: z.literal('emir'), id: KIMLIK, no: z.string(), baslik: z.string(), sinif, durum: emirDurumu }),
]);
export const revizyonStokSatiri = z.object({
  malzeme: malzemeOzeti, revizyon: z.string().nullable(), miktar: ondalikMetinSemasi, yer: z.string().nullable(), durum: z.enum(STOK_HALLERI).nullable(),
});
// Aile ipliği grafiği (1142 a): parça, rota, emir ve seri düğümleri, aralarındaki bağlar. Anahtar cevap içinde tekildir (ör. 'rev:12').
export const aileDugumu = z.object({
  anahtar: z.string(), katman: z.enum(IPLIK_KATMANLARI),
  // Üst satır: parça, rota, emir ya da seri aralığı; alt satır: durum, mod, değişiklik no.
  etiket: z.string(), ayrinti: z.string(), hal: z.enum(IPLIK_HALLERI),
  hedef: z.discriminatedUnion('tur', [
    z.object({ tur: z.literal('malzeme'), id: KIMLIK }),
    z.object({ tur: z.literal('uretim-emri'), id: KIMLIK }),
    z.object({ tur: z.literal('seri'), seriNo: z.string() }),
  ]).nullable(),
});
// Kesikli: karma rota ya da sistem öncesi kayıt.
export const aileBagi = z.object({ kaynak: z.string(), hedef: z.string(), kesikli: z.boolean() });
export const aileIpligi = z.object({ dugumler: z.array(aileDugumu), baglar: z.array(aileBagi) });
export const konfigurasyonCevabi = z.object({
  sonUrun: malzemeOzeti,
  baseline: z.array(baselineSatiri).nullable(),
  // Son ürünü ya da altındaki parçaları etkileyen, kapanmamış talep ve emirler (yalnız bu modülün verisi).
  acikDegisiklikler: z.array(acikDegisiklik),
  // Markalama bağlı değilse null.
  seriler: z.array(konfigurasyonSerisi).nullable(),
  // Stok bağlı değilse null.
  revizyonStogu: z.array(revizyonStokSatiri).nullable(),
  gecerlilikler: z.array(z.object({ emirId: KIMLIK, emirNo: z.string(), ilkSeri: z.number().int().positive(), durum: emirDurumu })),
  // Rota, üretim emirleri ya da markalama bağlı değilse null.
  aileIpligi: aileIpligi.nullable(),
});
export const izlenebilirlikSorgusu = z.object({ sonUrunMalzemeId: z.coerce.number().pipe(KIMLIK), seriNo: metin(60, 'Seri numarasını yazın.') });
export const iplikDugumu = z.object({
  katman: z.enum(IPLIK_KATMANLARI), etiket: z.string(), revizyon: z.string().nullable(), degisiklikNo: z.string().nullable(),
});
// Soy ağacı (1145 a): bileşenler ve operasyonlar; null bağlı değil, boş dizi kayıt yok (geçiş öncesi).
export const soyOperasyonu = z.object({
  adimKodu: z.string(), aciklama: z.string().nullable(), isMerkezi: z.string().nullable(), ncProgrami: z.string().nullable(),
  ncOzeti: z.string().nullable(), kisiAdi: z.string().nullable(), zaman: zamanSemasi.nullable(),
});
export const sapmaSatiri = z.object({
  referans: z.string(), degisiklikNo: z.string(), kapsam: z.string().nullable(), kalem: malzemeOzeti.nullable(),
  revizyon: z.string().nullable(), emirNo: z.string().nullable(), bitis: tarihSemasi.nullable(),
});
export const izlenebilirlikCevabi = z.object({
  sonUrun: malzemeOzeti, seriNo: z.string(), uyum: z.enum(UYUM_HALLERI),
  modSeviyesi: z.number().int().positive().nullable(),
  emirRevizyonu: z.number().int().positive().nullable(),
  not: z.string().nullable(),
  iplik: z.array(iplikDugumu).nullable(),
  soyAgaci: z.object({ bilesenler: z.array(z.string()).nullable(), operasyonlar: z.array(soyOperasyonu).nullable() }),
  sapmalar: z.array(sapmaSatiri),
});

// Raporlar: tarih aralığı verilmezse son 12 ay.
export const raporSorgusu = z.object({ baslangic: tarihSemasi.optional(), bitis: tarihSemasi.optional() });
export const raporCevabi = z.object({
  cevrim: z.array(z.object({ emirNo: z.string(), sinif, acilis: tarihSemasi, kapanis: tarihSemasi, isGunu: z.number().int().nonnegative() })),
  // ECO başına; ekran yığılmış çubuk çizer.
  kararDagilimi: z.array(z.object({
    emirNo: z.string(), otomatik: z.number().int().nonnegative(), onayli: z.number().int().nonnegative(), mrb: z.number().int().nonnegative(),
  })),
  // Malzeme başına son 180 günde yayımlanan rota revizyonu sayısı (1176 a); rota bağlı değilse null.
  rotaOlgunlugu: z.array(z.object({ malzeme: malzemeOzeti, rotaRevizyonu: z.number().int().nonnegative() })).nullable(),
  // ECO başına maliyet; aşağıdaki iki alan toplamdır. Stok ve finans bağlı değilse null.
  maliyetler: z.array(z.object({ emirNo: z.string(), hurda: ondalikMetinSemasi.nullable(), rework: ondalikMetinSemasi.nullable() })),
  hurdaMaliyeti: ondalikMetinSemasi.nullable(),
  reworkMaliyeti: ondalikMetinSemasi.nullable(),
  // Onaysız NC programıyla başlatılmak istenip engellenen iş; NC doğrulama Aşama 2'de bağlanır, o zamana kadar null.
  engellenenNcDenemesi: z.number().int().nonnegative().nullable(),
});

// Arama kayıt no ve olay alanlarında (1175 a).
export const olaylarSorgusu = z.object({
  ...sayfaSorguAlanlari, ilgili: z.enum(OLAY_ILGILILERI).optional(), tur: z.enum(OLAY_TURLERI).optional(), ara: aramaMetni,
});
export const olaySatiri = z.object({
  id: KIMLIK, zaman: zamanSemasi, tur: z.enum(OLAY_TURLERI), ilgili: z.enum(OLAY_ILGILILERI).nullable(),
  kayitNo: z.string(),
  // Olay alanları ad -> değer; yalnız metin.
  alanlar: z.record(z.string(), z.string()),
});
export const olayListeCevabi = listeCevapSemasi(olaySatiri);

export type TalepAcGovdesi = z.input<typeof talepAcGovdesi>;
export type SiniflandirGovdesi = z.input<typeof siniflandirGovdesi>;
export type CcbGovdesi = z.input<typeof ccbGovdesi>;
export type MusteriOnayiGovdesi = z.input<typeof musteriOnayiGovdesi>;
export type KalemKaydetGovdesi = z.input<typeof kalemKaydetGovdesi>;
export type GeriGonderGovdesi = z.input<typeof geriGonderGovdesi>;
export type Gecerlilik = z.output<typeof gecerlilikSemasi>;
export type YayinlaGovdesi = z.input<typeof yayinlaGovdesi>;
export type KararGovdesi = z.input<typeof kararGovdesi>;
export type FaiOnayGovdesi = z.input<typeof faiOnayGovdesi>;
export type KapatGovdesi = z.input<typeof kapatGovdesi>;
export type GecmisSatiri = z.output<typeof gecmisSatiri>;
export type EtkiAnalizi = z.output<typeof etkiAnalizi>;
export type ParcaAdaylariSorgusu = z.output<typeof parcaAdaylariSorgusu>;
export type ParcaAdaylariCevabi = z.output<typeof parcaAdaylariCevabi>;
export type TalepMalzemesi = z.output<typeof talepMalzemesi>;
export type TalepCevabi = z.output<typeof talepCevabi>;
export type TaleplerSorgusu = z.output<typeof taleplerSorgusu>;
export type TalepListeSatiri = z.output<typeof talepListeSatiri>;
export type TalepListeCevabi = z.output<typeof talepListeCevabi>;
export type EmirKalemi = z.output<typeof emirKalemi>;
export type KararSatiri = z.output<typeof kararSatiri>;
export type FaiSarti = z.output<typeof faiSarti>;
export type EmirCevabi = z.output<typeof emirCevabi>;
export type EmirlerSorgusu = z.output<typeof emirlerSorgusu>;
export type EmirListeSatiri = z.output<typeof emirListeSatiri>;
export type EmirListeCevabi = z.output<typeof emirListeCevabi>;
export type GorevSatiri = z.output<typeof gorevSatiri>;
export type GorevlerimSorgusu = z.output<typeof gorevlerimSorgusu>;
export type GorevlerimCevabi = z.output<typeof gorevlerimCevabi>;
export type SonUrunlerCevabi = z.output<typeof sonUrunlerCevabi>;
export type BaselineSatiri = z.output<typeof baselineSatiri>;
export type AcikDegisiklik = z.output<typeof acikDegisiklik>;
export type RevizyonStokSatiri = z.output<typeof revizyonStokSatiri>;
export type AileDugumu = z.output<typeof aileDugumu>;
export type AileBagi = z.output<typeof aileBagi>;
export type AileIpligi = z.output<typeof aileIpligi>;
export type KonfigurasyonCevabi = z.output<typeof konfigurasyonCevabi>;
export type SerilerSorgusu = z.output<typeof serilerSorgusu>;
export type SeriListeSatiri = z.output<typeof seriListeSatiri>;
export type SeriListeCevabi = z.output<typeof seriListeCevabi>;
export type SoyOperasyonu = z.output<typeof soyOperasyonu>;
export type SapmaSatiri = z.output<typeof sapmaSatiri>;
export type IzlenebilirlikSorgusu = z.output<typeof izlenebilirlikSorgusu>;
export type IzlenebilirlikCevabi = z.output<typeof izlenebilirlikCevabi>;
export type RaporSorgusu = z.output<typeof raporSorgusu>;
export type RaporCevabi = z.output<typeof raporCevabi>;
export type OlaylarSorgusu = z.output<typeof olaylarSorgusu>;
export type OlaySatiri = z.output<typeof olaySatiri>;
export type OlayListeCevabi = z.output<typeof olayListeCevabi>;
