import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { OPERASYON_GRUP_KODLARI } from './istasyonlar.ts';
import { EMIR_TURLERI } from './uretim-emirleri.ts';

export const REVIZYON_DURUMLARI = ['taslak', 'onay_bekliyor', 'onayli', 'yururlukte', 'iptal'] as const;
export const BAGIMLILIKLAR = ['bagimsiz', 'bekleyen', 'akisli'] as const;
export const MAKINE_KULLANIMLARI = ['tek', 'paralel'] as const;
export const REVIZYON_KOMUTLARI = ['kaydet', 'onaya-gonder', 'iptal', 'geri-gonder', 'onayla', 'yururluge-al', 'kopyala'] as const;
export const TASLAK_KAYNAKLARI = ['revizyon', 'standart', 'bos'] as const;
// İlk parça onayı adım başına (744 a): Arkon'un ilk parça kapısı ve paket kuralının varsayılanı bu seçimdir.
export const ILK_PARCA_SECIMLERI = ['yok', 'her_kurulum'] as const;
export type IlkParcaSecimi = (typeof ILK_PARCA_SECIMLERI)[number];

// Gövde sınırları: "kaydet" bütün taslağı taşır ve denetim kaydına yazılır; dizi üst sınırları gövdeyi sınırlar.
export const AZAMI_ADIM = 60;
export const AZAMI_BILESEN = 30;
export const AZAMI_YAN_URUN = 10;
export const AZAMI_ADAY = 10;
export const AZAMI_TALIMAT = 4000;
// Ağaç açılırken derinlik sınırı: döngü onayda reddedilir, bu sınır yalnız bozuk veriye karşı korumadır.
export const AZAMI_AGAC_DERINLIGI = 12;

const TAM_SAYI_UST = 2147483647;
const KIMLIK = z.number().int().positive().max(TAM_SAYI_UST);
// Malzeme kimliği bigint'tir; JavaScript sayısı 2^53'e kadar tamdır.
const MALZEME_KIMLIGI = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const yolKimligi = z.coerce.number().pipe(KIMLIK);
const yolMalzemeKimligi = z.coerce.number().pipe(MALZEME_KIMLIGI);
const zaman = z.string();
const metin = (azami: number, bosIleti: string) => z.string().trim().min(1, bosIleti).max(azami);
// Ölçüler sayı olarak gelir; sütunun hassasiyetinden fazlası sunucuda yuvarlanır.
const sure = (azami: number) => z.number().nonnegative('Süre eksi olamaz.').max(azami);
// Çevrim (birim süre) işlem ve değişim olarak ayrılabilir; gelmeyen alan boş sayılır (ayrımı bilmeyen çağıran bozulmaz).
// İkisi gelirse birim süre sunucuda işlem + değişimdir.
const sureAyrimiGirdisi = {
  islemSuresiDk: z.number().positive('İşlem süresi sıfırdan büyük olmalı.').max(99_999).nullish(),
  degisimSuresiDk: sure(99_999).nullish(),
};

export const revizyonDurumu = z.enum(REVIZYON_DURUMLARI);
export const bagimlilik = z.enum(BAGIMLILIKLAR);
// Çok dallı rota (1248 a): dal tek büyük harftir (A-Z); boş dal ana hattır.
export const dalAdi = z.string().regex(/^[A-Z]$/, 'Dal A ile Z arasında tek harf olmalı.');
export const oncul = z.object({ opNo: z.number().int(), tur: z.enum(['bekleyen', 'akisli']), devirAdedi: z.number().int().nullable() });
export const makineKullanimi = z.enum(MAKINE_KULLANIMLARI);
export const revizyonKomutu = z.enum(REVIZYON_KOMUTLARI);

export const urunParametresi = z.object({ urunId: yolMalzemeKimligi });
export const revizyonParametresi = z.object({ id: yolKimligi });
export const talimatParametresi = z.object({ urunId: yolMalzemeKimligi, opNo: z.coerce.number().pipe(KIMLIK) });
export const agacSorgusu = z.object({ miktar: z.coerce.number().positive().max(1_000_000).default(1) });
// Ayrıntıda adım miktarları ve süreler bu ürün miktarı için hesaplanır (baz miktar 1).
export const ayrintiSorgusu = agacSorgusu;

/* ---------------- gövdeler ---------------- */

export const taslakAcGovdesi = z.object({
  kaynak: z.discriminatedUnion('tur', [
    z.object({ tur: z.literal('revizyon'), revizyonId: KIMLIK }),
    z.object({ tur: z.literal('standart') }),
    z.object({ tur: z.literal('bos') }),
    // Malzeme kartında girilen operasyonlardan; yalnız rotası olmayan üründe (#688).
    z.object({ tur: z.literal('kart') }),
    // Seçilen rota şablonundan (#698); "standart" varsayılan şablondur.
    z.object({ tur: z.literal('sablon'), sablonId: KIMLIK }),
  ]),
});

// Operasyonu yapan kaynak: bir makine, bir kişi ya da bir istasyon (makineyi planlayıcı seçer; Reçete ve Rota, #1184). Boş kaynak "henüz atanmadı" demektir.
export const KAYNAK_TURLERI = ['makine', 'kisi', 'istasyon'] as const;
export const kaynakGirdisi = z.object({ tur: z.enum(KAYNAK_TURLERI), id: KIMLIK });
// Adımın kaynağı ayrıca fason firma olabilir (finansın fason işaretli firması; kimlik firma kimliğidir). Aday kaynak fason olmaz (FS2 a).
export const ADIM_KAYNAK_TURLERI = ['makine', 'kisi', 'istasyon', 'fason'] as const;
export const adimKaynakGirdisi = z.object({ tur: z.enum(ADIM_KAYNAK_TURLERI), id: KIMLIK });
export const AZAMI_TERMIN_GUN = 365;

export const adayGirdisi = z.object({
  kaynak: kaynakGirdisi,
  ayarSuresiDk: sure(99_999).nullable(),
  birimSureDk: z.number().positive('Birim süre sıfırdan büyük olmalı.').max(99_999).nullable(),
  ...sureAyrimiGirdisi,
});

export const bilesenGirdisi = z.object({
  malzemeId: MALZEME_KIMLIGI,
  miktar: z.number().positive('Miktar sıfırdan büyük olmalı.').max(1_000_000),
  fireYuzde: z.number().min(0).max(100),
});

export const yanUrunGirdisi = z.object({
  malzemeId: MALZEME_KIMLIGI,
  miktar: z.number().positive('Miktar sıfırdan büyük olmalı.').max(1_000_000),
});

// OP numarasını sunucu verir: yeni adım null gelir; dolu gelen numara taslakta zaten olan adımındır.
export const adimGirdisi = z.object({
  opNo: KIMLIK.nullable(),
  operasyonTipiId: KIMLIK,
  ad: metin(80, 'Adım adı zorunlu.'),
  kaynak: adimKaynakGirdisi.nullable(),
  ayarSuresiDk: sure(99_999).nullable(),
  birimSureDk: z.number().positive('Birim süre sıfırdan büyük olmalı.').max(99_999).nullable(),
  ...sureAyrimiGirdisi,
  // Fason adımda süre yerine takvim günü (FS4 a); öteki adımda boş. Gelmeyen alan boş sayılır (fasonu bilmeyen çağıran bozulmaz).
  terminGun: z.number().int().min(1, 'Termin en az 1 gün.').max(AZAMI_TERMIN_GUN, `Termin en çok ${AZAMI_TERMIN_GUN} gün.`).nullish(),
  bagimlilik,
  devirAdedi: z.number().int().positive('Devir adedi sıfırdan büyük olmalı.').max(TAM_SAYI_UST).nullable(),
  firePayiYuzde: z.number().min(0).max(95, 'Fire payı en çok %95 olabilir.'),
  makineKullanimi,
  enKucukParca: z.number().int().positive().max(TAM_SAYI_UST).nullable(),
  yenidenAyar: z.boolean(),
  // Gelmeyen seçim (alanı bilmeyen eski görünüm) adımın kayıtlı seçimini korur; yeni adımda "her kurulumda".
  ilkParca: z.enum(ILK_PARCA_SECIMLERI).optional(),
  // Gelmeyen dal ve birleşen (alanı bilmeyen eski görünüm) adımın kayıtlı değerini korur; yeni adımda ana hat, birleştirme yok.
  dal: dalAdi.nullable().optional(),
  birlesen: z.array(dalAdi).max(26).optional(),
  // Dal çarpanı (1257 a): bir mamul için bu dal adımında kaç adet işlenir; boş ya da 1 aynıdır. Gelmeyen alan kayıtlı değeri korur.
  adetCarpani: z.number().int().min(1, 'Adet çarpanı en az 1.').max(1000, 'Adet çarpanı en çok 1000.').nullable().optional(),
  // Hazırlık bölümü (1310 a): ayarSuresiDk = hazırlık + ayar olarak sunucuda hesaplanır. Gelmeyen bölüm (eski görünüm) yalnız toplamı yollar;
  // ayar kapalıyken gelen ayar süresi yok sayılır.
  hazirlikDk: sure(99_999).nullable().optional(),
  ayar: z.boolean().optional(),
  ayarDk: sure(99_999).nullable().optional(),
  adaylar: z.array(adayGirdisi).max(AZAMI_ADAY),
  bilesenler: z.array(bilesenGirdisi).max(AZAMI_BILESEN),
  yanUrunler: z.array(yanUrunGirdisi).max(AZAMI_YAN_URUN),
});

export const kaydetGovdesi = z.object({
  surum: KIMLIK,
  aciklama: z.string().trim().max(300).nullable(),
  adimlar: z.array(adimGirdisi).max(AZAMI_ADIM),
});

export const surumGovdesi = z.object({ surum: KIMLIK });
export const onaylaGovdesi = z.object({ surum: KIMLIK, yururlugeAl: z.boolean() });
export const kopyalaGovdesi = z.object({ hedefUrunId: MALZEME_KIMLIGI });
// Yeni kartta seçilen ürünün yürürlükteki rotası (#500): kart kullanımdaysa hemen, değilse kart onaylanınca taslak olarak açılır.
export const kopyaIsteGovdesi = z.object({ kaynakUrunId: MALZEME_KIMLIGI });
// okunanSurum: yazarın gördüğü son talimat sürümü (hiç yoksa null); arada başkası yazdıysa reddedilir.
export const talimatYazGovdesi = z.object({ opNo: KIMLIK, metin: metin(AZAMI_TALIMAT, 'Talimat metni zorunlu.'), okunanSurum: KIMLIK.nullable() });

// Rota şablonu (#698): ad tekil, adımlar sırasıyla; kaydette sürüm denetlenir.
export const AZAMI_SABLON_ADI = 120;
export const sablonParametresi = z.object({ id: yolKimligi });
export const sablonYazGovdesi = z.object({
  ad: metin(AZAMI_SABLON_ADI, 'Şablon adı zorunlu.'),
  adimlar: z.array(z.object({ operasyonTipiId: KIMLIK, ad: metin(200, 'Adım adı zorunlu.') })).max(AZAMI_ADIM),
});
export const sablonKaydetGovdesi = sablonYazGovdesi.extend({ surum: KIMLIK });

/* ---------------- cevaplar ---------------- */

const adliKayit = z.object({ id: KIMLIK, ad: z.string().nullable() });
const istasyonOzeti = z.object({ id: KIMLIK, kod: z.string(), ad: z.string(), aktif: z.boolean() });
// Kaynağın görünen hâli: makinede kod ve ad, kişide ad; ikisinde de bağlı olduğu istasyon (yoksa null). İstasyon kaynağında istasyon kendisidir.
export const kaynakOzeti = z.object({
  tur: z.enum(KAYNAK_TURLERI), id: KIMLIK, kod: z.string().nullable(), ad: z.string(), aktif: z.boolean(), istasyon: istasyonOzeti.nullable(),
});
export const urunOzeti = z.object({
  id: MALZEME_KIMLIGI,
  stokKodu: z.string().nullable(),
  ad: z.string(),
  tur: z.string(),
  // Kartın birimi malzemelerin özetinden; kartta birim yoksa null.
  stokBirimi: z.string().nullable(),
  onayDurumu: z.string(),
});
// Fason firmada kod ve ad firmanın, aktif "kullanımda ve fason işaretli" demektir; istasyon yoktur.
export const adimKaynakOzeti = kaynakOzeti.extend({ tur: z.enum(ADIM_KAYNAK_TURLERI) });
const revizyonBaglantisi = z.object({ id: KIMLIK, harf: z.string() });

export const revizyonOzeti = z.object({
  id: KIMLIK,
  harf: z.string(),
  durum: revizyonDurumu,
  surum: KIMLIK,
  aciklama: z.string().nullable(),
  acilma: zaman,
  onaylama: zaman.nullable(),
  yururlugeAlma: zaman.nullable(),
});

// Akış sunucuda hesaplanır: ekran yalnız gösterir.
const akisSemasi = z.object({
  // Bu adımın başlamadan beklediği ve çıktısını tükettiği önceki adımlar (OP no).
  tuketir: z.array(z.number().int()),
  cikti: z.discriminatedUnion('tur', [
    z.object({ tur: z.literal('ara-hal'), opNo: z.number().int() }),
    z.object({ tur: z.literal('urun') }),
  ]),
});

export const adimSemasi = z.object({
  id: KIMLIK,
  opNo: z.number().int(),
  sira: z.number().int(),
  operasyonTipi: z.object({ id: KIMLIK, kod: z.string(), ad: z.string(), kisaltma: z.string(), aktif: z.boolean() }),
  ad: z.string(),
  kaynak: adimKaynakOzeti.nullable(),
  ayarSuresiDk: ondalikMetinSemasi.nullable(),
  birimSureDk: ondalikMetinSemasi.nullable(),
  // Teorik çevrimin ayrımı: ayrılmamış adımda işlem birim süredir, değişim boştur. Oran (%) değişim / işlem; değişim yoksa null.
  islemSuresiDk: ondalikMetinSemasi.nullable(),
  degisimSuresiDk: ondalikMetinSemasi.nullable(),
  degisimOraniYuzde: ondalikMetinSemasi.nullable(),
  terminGun: z.number().int().nullable(),
  bagimlilik,
  devirAdedi: z.number().int().nullable(),
  firePayiYuzde: ondalikMetinSemasi,
  makineKullanimi,
  enKucukParca: z.number().int().nullable(),
  yenidenAyar: z.boolean(),
  ilkParca: z.enum(ILK_PARCA_SECIMLERI),
  // ayarSuresiDk toplamdır: hazırlık + (ayar işaretliyse) ayar.
  hazirlikDk: ondalikMetinSemasi.nullable(),
  ayar: z.boolean(),
  ayarDk: ondalikMetinSemasi.nullable(),
  dal: dalAdi.nullable(),
  birlesen: z.array(dalAdi),
  // Boş: 1 (ana hat ve çarpansız dal adımı).
  adetCarpani: z.number().int().nullable(),
  // Türetilmiş öncüller: null tek hatlı rotadır (bağımlılık kuralı), boş dizi hiçbir adımı beklemez.
  onculler: z.array(oncul).nullable(),
  adaylar: z.array(z.object({
    kaynak: kaynakOzeti, ayarSuresiDk: ondalikMetinSemasi.nullable(), birimSureDk: ondalikMetinSemasi.nullable(),
    islemSuresiDk: ondalikMetinSemasi.nullable(), degisimSuresiDk: ondalikMetinSemasi.nullable(),
  })),
  // miktar bir adet içindir; toplamMiktar istenen ürün miktarı için (adım miktarı x miktar x (1 + fire)).
  bilesenler: z.array(z.object({ malzeme: urunOzeti, miktar: ondalikMetinSemasi, fireYuzde: ondalikMetinSemasi, toplamMiktar: ondalikMetinSemasi })),
  yanUrunler: z.array(z.object({ malzeme: urunOzeti, miktar: ondalikMetinSemasi })),
  akis: akisSemasi,
  // İstenen ürün miktarı için: fire payıyla büyümüş adım miktarı ve teorik süre (dk); süre eksikse ya da adım fasonsa null.
  adimMiktari: ondalikMetinSemasi,
  teorikSureDk: ondalikMetinSemasi.nullable(),
  talimat: z.object({ surum: z.number().int(), metin: z.string() }).nullable(),
});

export const revizyonAyrintisi = z.object({
  urun: urunOzeti,
  revizyon: revizyonOzeti.extend({
    kaynak: revizyonBaglantisi.nullable(),
    acan: adliKayit,
    gonderen: adliKayit.nullable(),
    gonderme: zaman.nullable(),
    onaylayan: adliKayit.nullable(),
    dortGozsuzOnay: z.boolean(),
    yururlugeAlan: adliKayit.nullable(),
    iptalEden: adliKayit.nullable(),
    iptalEtme: zaman.nullable(),
    duzenleyenler: z.array(adliKayit),
  }),
  adimlar: z.array(adimSemasi),
  miktar: ondalikMetinSemasi,
  // Toplam süre fason olmayan adımlarındır; biri süresizse null. Fason termin günleri ayrı toplanır: fason adım yoksa ya da
  // birinin termini boşsa null.
  ozet: z.object({
    toplamTeorikSureDk: ondalikMetinSemasi.nullable(), enUzunAdimOpNo: z.number().int().nullable(), adimSayisi: z.number().int(),
    fasonTerminGunu: z.number().int().nullable(),
  }),
  // Bu kullanıcının bu revizyonda şu an verebileceği komutlar.
  komutlar: z.array(revizyonKomutu),
});

export const rotaListesiCevabi = z.object({
  rotalar: z.array(z.object({
    urun: urunOzeti,
    yururlukte: revizyonBaglantisi.nullable(),
    acik: revizyonBaglantisi.extend({ durum: revizyonDurumu }).nullable(),
    revizyonSayisi: z.number().int(),
  })),
});

// Ana sayfa kartları: ürün listesini taşımadan açık revizyonu (taslak ya da onay bekliyor) olan ve açık revizyonu onay bekleyen ürün sayısı.
export const revizyonOzetiCevabi = z.object({ acikRevizyon: z.number().int(), onayBekleyen: z.number().int() });

export const urunRevizyonlariCevabi = z.object({
  urun: urunOzeti,
  revizyonlar: z.array(revizyonOzeti),
  // Açık revizyon yokken ve kullanıcı yazabiliyorsa yeni taslak açılabilir.
  taslakAcilabilir: z.boolean(),
  // Rotası olmayan üründe kartın operasyonları (#688): sayı ve tipi katalogda bulunmayan satırların adları; kartta operasyon yoksa
  // ya da ürünün rotası varsa null.
  kartOperasyonlari: z.object({ sayi: z.number().int().positive(), eslesmeyen: z.array(z.string()) }).nullable(),
});

export const sablonSemasi = z.object({
  id: KIMLIK, ad: z.string(), varsayilan: z.boolean(), surum: KIMLIK,
  adimlar: z.array(z.object({ sira: KIMLIK, operasyonTipi: z.object({ id: KIMLIK, kod: z.string(), ad: z.string(), aktif: z.boolean() }), ad: z.string() })),
});
export const sablonlarCevabi = z.object({ sablonlar: z.array(sablonSemasi) });
export const sablonCevabi = z.object({ sablon: sablonSemasi });

export const farkCevabi = z.object({ karsilastirilan: revizyonBaglantisi.nullable(), farklar: z.array(z.string()) });

export const agacCevabi = z.object({
  urun: urunOzeti,
  miktar: ondalikMetinSemasi,
  dugumler: z.array(z.object({
    // Kökün çocukları 1'den başlar; üst düğüm, listedeki sırası (null: köke bağlı).
    derinlik: z.number().int(),
    ust: z.number().int().nullable(),
    malzeme: urunOzeti,
    opNo: z.number().int(),
    birimMiktar: ondalikMetinSemasi,
    fireYuzde: ondalikMetinSemasi,
    toplamMiktar: ondalikMetinSemasi,
    // Mamul bileşenin açıldığı yürürlükteki revizyon; mamul değilse ya da rotası yoksa null.
    revizyon: revizyonBaglantisi.nullable(),
  })),
  // Malzeme başına toplam ihtiyaç (yalnız hammadde ve sarf; mamul ara ürün olarak açılır).
  toplamlar: z.array(z.object({ malzeme: urunOzeti, miktar: ondalikMetinSemasi })),
});

export const seceneklerCevabi = z.object({
  // Katalog: yeni adıma varsayılan süreler öneri olarak kopyalanır; kullanim, yürürlükteki ve açık revizyonlardaki adım sayısı.
  // grup ve grupAdi, adımdaki tip listesini bölümlemek içindir; ad sunucudan gelir, istemci listeyi kopyalamaz.
  operasyonTipleri: z.array(z.object({
    id: KIMLIK, kod: z.string(), ad: z.string(), kisaltma: z.string(), grup: z.enum(OPERASYON_GRUP_KODLARI), grupAdi: z.string(), aktif: z.boolean(),
    varsayilanAyarDk: ondalikMetinSemasi.nullable(), varsayilanBirimDk: ondalikMetinSemasi.nullable(), kullanim: z.number().int(),
  })),
  // Seçilebilir kaynaklar istasyonlarına göre: makineler ve kişiler. İstasyonu bilinmeyen kişiler ayrı listededir.
  istasyonlar: z.array(istasyonOzeti.extend({ makineler: z.array(kaynakOzeti), kisiler: z.array(kaynakOzeti) })),
  istasyonsuzKisiler: z.array(kaynakOzeti),
  // Adıma kaynak olarak seçilebilen fason firmalar (finansın kullanımdaki, fason işaretli firmaları).
  fasonFirmalar: z.array(adimKaynakOzeti),
});

/* ---------------- adım adım talimat (989 a, 993 a) ---------------- */

// Adımlı talimatın her adımı bir kontrol noktası taşıyabilir; zorunlu nokta geçilmeden terminal sonraki adıma geçirmez.
export const KONTROL_TURLERI = ['yok', 'onay', 'olcum', 'foto', 'secim'] as const;
// İş emri kontrol listesi en çok 30 maddedir; adım başlığı madde adı olur, sayılar bu yüzden ona eşit.
export const AZAMI_TALIMAT_ADIMI = 30;
export const AZAMI_ADIM_BASLIGI = 120;
export const AZAMI_ADIM_METNI = 2000;
export const AZAMI_KONTROL_SECENEGI = 10;
const kisaMetin = (azami: number) => z.string().trim().max(azami);
export const kontrolSemasi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('yok') }),
  z.object({ tur: z.literal('onay') }),
  // Sınırlar boş olabilir: şablonda değer üründen ürüne değişir, talimatı yazan doldurur.
  z.object({
    tur: z.literal('olcum'), ad: metin(60, 'Ölçümün adı zorunlu.'), alt: z.number().finite().nullable(), ust: z.number().finite().nullable(), birim: kisaMetin(12),
  }),
  z.object({ tur: z.literal('foto'), aciklama: kisaMetin(120).nullable() }),
  z.object({ tur: z.literal('secim'), secenekler: z.array(metin(60, 'Seçenek boş olamaz.')).min(2, 'Seçimde en az iki seçenek olur.').max(AZAMI_KONTROL_SECENEGI) }),
]);
// Medya (995 a): resim en çok 10 MB, video en çok 200 MB ve 3 dakika (süreyi istemci ölçer), ürünün bütün talimatlarında en çok 1 GB.
export const MEDYA_TURLERI = ['resim', 'video'] as const;
export const MEDYA_SINIRI = { resimBayt: 10 * 1024 ** 2, videoBayt: 200 * 1024 ** 2, videoSaniye: 180, urunBayt: 1024 ** 3 } as const;
export const AZAMI_ADIM_MEDYASI = 5;
export const medyaGirdisi = z.object({ ozet: z.string().regex(/^[0-9a-f]{64}$/, 'Geçersiz dosya özeti.'), ad: metin(120, 'Dosya adı zorunlu.') });
const medyaSemasi = z.object({ ozet: z.string(), ad: z.string(), tur: z.enum(MEDYA_TURLERI), boyut: z.number().int().positive() });
export const medyaParametresi = z.object({ ozet: z.string().regex(/^[0-9a-f]{64}$/) });
export const talimatAdimiGirdisi = z.object({
  baslik: metin(AZAMI_ADIM_BASLIGI, 'Adım başlığı zorunlu.'),
  metin: kisaMetin(AZAMI_ADIM_METNI).nullable().transform((x) => (x === '' ? null : x)),
  kontrol: kontrolSemasi,
  zorunlu: z.boolean(),
  medya: z.array(medyaGirdisi).max(AZAMI_ADIM_MEDYASI).default([]),
});
const talimatAdimlari = z.array(talimatAdimiGirdisi).min(1, 'En az bir adım gerekir.').max(AZAMI_TALIMAT_ADIMI);
// okunanSurum: talimatYazGovdesi'ndeki gibi; adımlı yazım da yeni bir talimat sürümüdür.
export const adimliTalimatYazGovdesi = z.object({ opNo: KIMLIK, okunanSurum: KIMLIK.nullable(), adimlar: talimatAdimlari });
export const talimatAdimiSemasi = z.object({
  sira: KIMLIK, baslik: z.string(), metin: z.string().nullable(), kontrol: kontrolSemasi, zorunlu: z.boolean(), medya: z.array(medyaSemasi),
});

// adimli false: düz metinle yazılmış eski sürüm; tek adım olarak okunur (993 a, göçle taşınmaz).
// taslak (1194 b): OP'nin yayınlanmamış taslağı; yoksa null. tabanSurum taslağın dayandığı son yayın sürümüdür.
export const talimatlarCevabi = z.object({
  surumler: z.array(z.object({
    surum: z.number().int(), metin: z.string(), yazan: adliKayit, yazma: zaman, adimli: z.boolean(), adimlar: z.array(talimatAdimiSemasi),
  })),
  taslak: z.object({
    surum: KIMLIK, tabanSurum: KIMLIK.nullable(), yazan: adliKayit, yazma: zaman, adimlar: z.array(talimatAdimiSemasi),
  }).nullable(),
});

// Taslak kaydı (1194 b): okunanSurum ekranın gördüğü son yayın sürümü, taslakSurum düzenlenen taslağın sürümü (yeni taslakta null).
export const talimatTaslakKaydetGovdesi = z.object({ opNo: KIMLIK, okunanSurum: KIMLIK.nullable(), taslakSurum: KIMLIK.nullable(), adimlar: talimatAdimlari });
export const talimatTaslakKomutGovdesi = z.object({ opNo: KIMLIK, taslakSurum: KIMLIK });

export const komutCevabi = z.object({ id: KIMLIK, durum: revizyonDurumu, surum: KIMLIK });
// Karttan kendiliğinden açılan ilk rota taslaklarının sayısı (#688).
export const karttanTaslaklarCevabi = z.object({ acilan: z.number().int().nonnegative() });
// acildi: taslak açıldı (revizyon dolu); bekliyor: kart henüz kullanımda değil, istek kaydedildi (revizyon null).
export const kopyaIstegiCevabi = z.object({ durum: z.enum(['acildi', 'bekliyor']), revizyon: komutCevabi.nullable() });

/* ---------------- süreler (teorik ve gerçekleşen) ---------------- */

export const GERCEKLESEN_TURLERI = ['hazirlik', 'islem', 'degisim'] as const;
// Defter (169 c, 171 a): elle ve terminal satırı ölçümdür, plan kullanmaz; kabul, ölçümün teorik süreye yazıldığı kaydıdır. "İşlem" ölçümü
// değişim dahil birim süredir (170 b).
export const GERCEKLESEN_KAYNAKLARI = ['elle', 'terminal', 'kabul'] as const;
export const gerceklesenTuru = z.enum(GERCEKLESEN_TURLERI);
export const adimParametresi = z.object({ id: yolKimligi });
export const surelerSorgusu = z.object({ makineId: z.coerce.number().pipe(KIMLIK).optional() });

// Elle ölçüm: süre boşsa o türün bekleyen ölçümü boşaltılır. okunanId, yazarın gördüğü son satırdır (tür ve makine için; hiç yoksa null):
// arada başkası yazdıysa reddedilir. Makine boşsa ölçüm operasyonun her kaynağı içindir.
export const gerceklesenSureGovdesi = z.object({
  tur: gerceklesenTuru,
  sureDk: sure(99_999).nullable(),
  makineId: KIMLIK.nullable(),
  okunanId: KIMLIK.nullable(),
});

// Ölçümün kabulü: değer ürünün açık taslağına (yoksa yürürlükteki revizyondan açılan taslağa) teorik süre olarak yazılır. Makine boşsa
// adımın kendi süresi, makine verilirse o makinenin (adımın kaynağı ya da adayı) süresi değişir; okunanId elle girişteki gibidir.
export const gerceklesenKabulGovdesi = z.object({
  tur: gerceklesenTuru,
  olcumId: KIMLIK,
  makineId: KIMLIK.nullable(),
  okunanId: KIMLIK.nullable(),
});

// Bekleyen ölçüm: bu görünümdeki son boşaltmadan (boş elle satırı) sonraki son elle ya da terminal satırı; kabul edilen ölçüm revizyon
// yürürlüğe girene kadar görünür. Terminal satırı ölçüldüğü iş emrini taşır.
const olcumKaydi = z.object({
  id: KIMLIK, sureDk: ondalikMetinSemasi, kaynak: z.enum(['elle', 'terminal']), isEmriId: KIMLIK.nullable(), makineId: KIMLIK.nullable(),
  yazan: adliKayit, zaman,
});
const turBasina = <T extends z.ZodTypeAny>(t: T) => z.object({ hazirlik: t, islem: t, degisim: t });

export const surelerCevabi = z.object({
  revizyon: revizyonBaglantisi.extend({ durum: revizyonDurumu, malzemeId: MALZEME_KIMLIGI }),
  // Ölçümler bu makine içindir (verilmediyse her makinenin ölçümü).
  makineId: KIMLIK.nullable(),
  adimlar: z.array(z.object({
    adimId: KIMLIK,
    opNo: z.number().int(),
    sira: z.number().int(),
    ad: z.string(),
    operasyonTipi: z.object({ id: KIMLIK, kod: z.string(), ad: z.string() }),
    kaynak: adimKaynakOzeti.nullable(),
    teorik: z.object({
      hazirlikDk: ondalikMetinSemasi.nullable(), islemDk: ondalikMetinSemasi.nullable(), degisimDk: ondalikMetinSemasi.nullable(),
      degisimOraniYuzde: ondalikMetinSemasi.nullable(),
    }),
    // Elle girişte ve kabulde okunanId olarak gönderilecek son satır (değeri ne olursa olsun); hiç yoksa null.
    sonKayit: turBasina(KIMLIK.nullable()),
    olcum: turBasina(olcumKaydi.nullable()),
    // Planın kullandığı süre: teorik (169 c).
    etkin: z.object({
      hazirlikDk: ondalikMetinSemasi.nullable(), birimSureDk: ondalikMetinSemasi.nullable(),
      islemDk: ondalikMetinSemasi.nullable(), degisimDk: ondalikMetinSemasi.nullable(), degisimOraniYuzde: ondalikMetinSemasi.nullable(),
    }),
    fason: z.boolean(),
  })),
});

// Kabulün yazdığı taslak ve onun süreleri; plan yeni süreyi taslak yürürlüğe girince kullanır.
export const gerceklesenKabulCevabi = z.object({ taslak: komutCevabi, sureler: surelerCevabi });

export type RevizyonDurumu = z.output<typeof revizyonDurumu>;
export type Bagimlilik = z.output<typeof bagimlilik>;
export type MakineKullanimi = z.output<typeof makineKullanimi>;
export type RevizyonKomutu = z.output<typeof revizyonKomutu>;
export type UrunOzeti = z.output<typeof urunOzeti>;
export type RevizyonOzeti = z.output<typeof revizyonOzeti>;
export type Adim = z.output<typeof adimSemasi>;
export type AdimGirdisi = z.output<typeof adimGirdisi>;
export type KaydetGovdesiCikti = z.output<typeof kaydetGovdesi>;
export type KaydetGovdesi = z.input<typeof kaydetGovdesi>;
export type TaslakAcGovdesi = z.input<typeof taslakAcGovdesi>;
export type SurumGovdesi = z.input<typeof surumGovdesi>;
export type OnaylaGovdesi = z.input<typeof onaylaGovdesi>;
export type KopyalaGovdesi = z.input<typeof kopyalaGovdesi>;
export type KopyaIsteGovdesi = z.input<typeof kopyaIsteGovdesi>;
export type KopyaIstegiCevabi = z.output<typeof kopyaIstegiCevabi>;
export type SablonYazGovdesi = z.input<typeof sablonYazGovdesi>;
export type SablonKaydetGovdesi = z.input<typeof sablonKaydetGovdesi>;
export type Sablon = z.output<typeof sablonSemasi>;
export type SablonlarCevabi = z.output<typeof sablonlarCevabi>;
export type SablonCevabi = z.output<typeof sablonCevabi>;
export type TalimatYazGovdesi = z.input<typeof talimatYazGovdesi>;
export type RevizyonAyrintisi = z.output<typeof revizyonAyrintisi>;
export type RotaListesiCevabi = z.output<typeof rotaListesiCevabi>;
export type RevizyonOzetiCevabi = z.output<typeof revizyonOzetiCevabi>;
export type UrunRevizyonlariCevabi = z.output<typeof urunRevizyonlariCevabi>;
export type FarkCevabi = z.output<typeof farkCevabi>;
export type AgacCevabi = z.output<typeof agacCevabi>;
export type SeceneklerCevabi = z.output<typeof seceneklerCevabi>;
export type TalimatlarCevabi = z.output<typeof talimatlarCevabi>;
export type KomutCevabi = z.output<typeof komutCevabi>;
export type GerceklesenSureGovdesi = z.input<typeof gerceklesenSureGovdesi>;
export type GerceklesenKabulGovdesi = z.input<typeof gerceklesenKabulGovdesi>;
export type GerceklesenKabulCevabi = z.output<typeof gerceklesenKabulCevabi>;
export type SurelerCevabi = z.output<typeof surelerCevabi>;
export type GerceklesenTuru = (typeof GERCEKLESEN_TURLERI)[number];
export type GerceklesenKaynagi = (typeof GERCEKLESEN_KAYNAKLARI)[number];

// Malzemeler bölümü: kartların hangi rotalarda kullanıldığı (yürürlükteki ve açık revizyonlar; bileşen ya da yan ürün olarak).
export const kullanimSorgusu = z.object({ malzemeIdleri: z.string().regex(/^\d+(,\d+){0,199}$/).transform((m) => m.split(',').map(Number)) });
export const kullanimCevabi = z.object({
  kullanimlar: z.array(z.object({
    malzemeId: z.number().int(), urun: urunOzeti, revizyon: z.object({ id: KIMLIK, harf: z.string(), durum: z.enum(REVIZYON_DURUMLARI) }),
    opNo: z.number().int(), adimAdi: z.string(), rol: z.enum(['bilesen', 'yan']),
  })),
});
export type KullanimCevabi = z.output<typeof kullanimCevabi>;

export type KaynakGirdisi = z.input<typeof kaynakGirdisi>;
export type KaynakOzeti = z.output<typeof kaynakOzeti>;
export type AdimKaynakOzeti = z.output<typeof adimKaynakOzeti>;
export type AdimKaynakGirdisi = z.input<typeof adimKaynakGirdisi>;

// Rotanın emre kopyalanması (karar K1): yürürlükteki revizyondan üretim emri açılır; her adım bir iş emri olur.
export const emreKopyalaGovdesi = z.object({
  adet: z.number().int().positive('Adet sıfırdan büyük olmalı.').max(TAM_SAYI_UST),
  teslim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Teslim YYYY-AA-GG olmalı.').nullable(),
  // İlk sistemin emir formu: öncelik (1 acil - 4 düşük), başlangıç ve açıklama; verilmezse uretim-emirleri varsayılanı.
  oncelik: z.number().int().min(1, 'Öncelik 1-4 olmalı.').max(4, 'Öncelik 1-4 olmalı.').optional(),
  baslangic: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Başlangıç YYYY-AA-GG olmalı.').nullish(),
  aciklama: z.string().trim().max(300, 'Açıklama en çok 300 karakter.').nullish(),
  // Taslak emir plana alınana dek terminale düşmez (prototip: taslak -> Plana al -> serbest).
  taslak: z.boolean().optional(),
  // Boş bırakılırsa emir projesiz açılır; projenin geçerliliğini uretim-emirleri denetler.
  projeId: KIMLIK.nullish(),
  // 176 a: emir bu sipariş satırını üretir; satırın projenin siparişinde olduğunu uretim-emirleri denetler (değilse 409).
  siparisSatiriId: KIMLIK.nullish(),
  // Girdiler serbest stoktan emre ayrılsın (rezerve); yetmeyen kısım mal kabulde öncelik sırasıyla gelir. Formda varsayılan açık.
  stoktanRezerve: z.boolean().optional(),
  // Emrin türü (kart #699, borç R13): ekranda seçilen etiket; verilmezse uretim-emirleri varsayılanı (seri).
  emirTuru: z.enum(EMIR_TURLERI).optional(),
});
export const emreKopyalaCevabi = z.object({ uretimEmriId: KIMLIK, isEmriIdleri: z.array(KIMLIK) });
export type EmreKopyalaGovdesi = z.input<typeof emreKopyalaGovdesi>;

// Emir listesi (teslimdeki "Rev N akışta aç" ve "rota değişti"): emir kaynak revizyonun kimliğini taşır; harf ve yürürlük rotada.
export const revizyonKunyeSorgusu = z.object({
  idler: z.string().regex(/^\d{1,10}(,\d{1,10}){0,199}$/, 'Revizyon kimlikleri virgülle ayrılmış sayılar olmalı.')
    .transform((t) => [...new Set(t.split(',').map(Number))]).pipe(z.array(KIMLIK)),
});
export const revizyonKunyeleriCevabi = z.object({
  revizyonlar: z.array(z.object({ id: KIMLIK, harf: z.string(), malzemeId: KIMLIK, yururlukteId: KIMLIK.nullable() })),
});
export const emirParametresi = z.object({ id: yolKimligi });
// "Emirlere uygula (yürürlükteki rota)": başlamamış iş emirleri yürürlükteki revizyondan yenilenir, başlamış olanlar korunur.
export const emreUygulaCevabi = z.object({ degisenler: z.array(z.string()), kaynakRevizyon: z.object({ id: KIMLIK, harf: z.string() }) });
export type RevizyonKunyeleriCevabi = z.output<typeof revizyonKunyeleriCevabi>;
export type EmreUygulaCevabi = z.output<typeof emreUygulaCevabi>;
export type EmreKopyalaCevabi = z.output<typeof emreKopyalaCevabi>;

// Malzeme seçici: kartlar malzemeler modülündedir; rota onun arama fonksiyonunu çağırır (metin kod, ad ya da kart no).
export const malzemeAraSorgusu = z.object({
  metin: z.string().trim().max(60).optional().transform((m) => (m ? m : null)),
  tur: z.string().regex(/^[a-z,]*$/).optional().transform((t) => (t ? t.split(',').filter(Boolean) : [])),
  hepsi: z.enum(['true', 'false']).optional().transform((h) => h === 'true'),
  sayfa: z.coerce.number().int().min(1).max(10_000).default(1),
});
export const malzemeAraCevabi = z.object({ satirlar: z.array(urunOzeti), toplam: z.number().int(), sayfaBoyu: z.number().int() });
export type MalzemeAraCevabi = z.output<typeof malzemeAraCevabi>;

/* ---------------- işlem şartnamesi (971 a) ---------------- */

// Kaplama, boya, ısıl işlem gibi işlemlerin ortak şartları: rota adımı şartname seçer, emir açılınca yürürlükteki sürüm emre sabitlenir.
export const SARTNAME_KAPSAMLARI = ['ic', 'fason', 'ikisi'] as const;
export const SARTNAME_KAYNAKLARI = ['varsayilan', 'firma', 'musteri'] as const;
export const SARTNAME_SURUM_DURUMLARI = ['taslak', 'yururlukte', 'eski'] as const;
export const PARAMETRE_TURLERI = ['sayi', 'aralik', 'secim', 'coklu', 'metin', 'evet'] as const;
export const ATIF_ROLLERI = ['yontem', 'kabul', 'test', 'olcum', 'malzeme', 'gosterim'] as const;
export const AZAMI_PARAMETRE = 40;
export const AZAMI_ATIF = 30;
export const AZAMI_SECENEK = 30;
export const AZAMI_BELGE = 20;
export const AZAMI_ADIM_SARTNAMESI = 5;
export const AZAMI_METIN_DEGERI = 200;
export const AZAMI_SAYI_DEGERI = 1_000_000_000;

export type SartnameKapsami = (typeof SARTNAME_KAPSAMLARI)[number];
export type ParametreTuru = (typeof PARAMETRE_TURLERI)[number];

const sayiDegeri = z.number().finite().min(-AZAMI_SAYI_DEGERI).max(AZAMI_SAYI_DEGERI);
// Değerin türe uyduğunu sunucu parametrenin türüne bakarak denetler; şema yalnız biçimi sınırlar. null: değer verilmedi.
export const parametreDegeri = z.union([
  sayiDegeri, z.tuple([sayiDegeri, sayiDegeri]), z.string().max(AZAMI_METIN_DEGERI), z.array(z.string().max(80)).max(AZAMI_SECENEK), z.boolean(),
]).nullable();
export type ParametreDegeri = z.output<typeof parametreDegeri>;
export const parametreDegerleri = z.record(z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/), parametreDegeri)
  .refine((d) => Object.keys(d).length <= AZAMI_PARAMETRE, `En çok ${AZAMI_PARAMETRE} değer.`);
export type ParametreDegerleri = z.output<typeof parametreDegerleri>;

const bosMetin = (azami: number) => z.string().trim().max(azami).nullable().transform((m) => (m === '' ? null : m));

export const sartnameParametresi = z.object({ id: yolKimligi });
export const sartnameSorgusu = z.object({
  idler: z.string().regex(/^\d{1,10}(,\d{1,10}){0,199}$/, 'İş emri kimlikleri virgülle ayrılmış sayılar olmalı.')
    .transform((t) => [...new Set(t.split(',').map(Number))]).pipe(z.array(KIMLIK)),
});

export const parametreGirdisi = z.object({
  anahtar: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'Anahtar küçük harfle başlar; yalnız harf ve rakam.'),
  ad: metin(80, 'Alan adı zorunlu.'),
  tur: z.enum(PARAMETRE_TURLERI),
  birim: bosMetin(20),
  secenekler: z.array(metin(80, 'Seçenek boş olamaz.')).max(AZAMI_SECENEK).nullable(),
  varsayilan: parametreDegeri,
  ipucu: bosMetin(120),
  zorunlu: z.boolean(),
  adimdaDegisir: z.boolean(),
});
export const atifGirdisi = z.object({ standartId: KIMLIK, rol: z.enum(ATIF_ROLLERI), not: bosMetin(120) });

export const sartnameEkleGovdesi = z.object({
  kod: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,29}$/, 'Kod 2-30 karakter: büyük harf, rakam ve tire.'),
  kategoriId: KIMLIK,
  ad: metin(120, 'Şartname adı zorunlu.'),
  kapsam: z.enum(SARTNAME_KAPSAMLARI),
  // Müşteri şartnamesinin karşılığı: firma ve belge numarası birlikte verilir; ikisi de boşsa atölyenin kendi şartnamesidir.
  musteriFirmaId: KIMLIK.nullable(),
  musteriBelgeNo: bosMetin(60),
});
export const sartnameKopyalaGovdesi = sartnameEkleGovdesi.omit({ kategoriId: true, kapsam: true });
export const sartnameKunyeGovdesi = z.object({ surum: KIMLIK, ad: metin(120, 'Şartname adı zorunlu.'), kategoriId: KIMLIK });
export const sartnameTaslakGovdesi = z.object({
  surum: KIMLIK,
  parametreler: z.array(parametreGirdisi).max(AZAMI_PARAMETRE),
  atiflar: z.array(atifGirdisi).max(AZAMI_ATIF),
  istenenBelgeler: z.array(metin(120, 'Belge adı boş olamaz.')).max(AZAMI_BELGE),
  terminalNotu: bosMetin(1000),
  degisiklikNotu: bosMetin(500),
});
export const standartEkleGovdesi = z.object({ numara: metin(60, 'Standart numarası zorunlu.'), kisaAciklama: metin(200, 'Kısa açıklama zorunlu.') });
// Adımın şartnameleri bütün olarak yazılır; sıra dizideki sıradır. Değeri yalnız "adımda değişir" alanlar alır.
export const adimSartnameleriGovdesi = z.object({
  surum: KIMLIK,
  opNo: KIMLIK,
  sartnameler: z.array(z.object({ sartnameId: KIMLIK, degerler: parametreDegerleri })).max(AZAMI_ADIM_SARTNAMESI),
});

const parametreSemasi = parametreGirdisi.extend({ sira: KIMLIK, birim: z.string().nullable(), ipucu: z.string().nullable(), ad: z.string(), secenekler: z.array(z.string()).nullable() });
const standartSemasi = z.object({ id: KIMLIK, numara: z.string(), kisaAciklama: z.string() });
const atifSemasi = z.object({ sira: KIMLIK, standart: standartSemasi, rol: z.enum(ATIF_ROLLERI), not: z.string().nullable() });
export const sartnameSurumuSemasi = z.object({
  id: KIMLIK, surumNo: KIMLIK, durum: z.enum(SARTNAME_SURUM_DURUMLARI),
  istenenBelgeler: z.array(z.string()), terminalNotu: z.string().nullable(), degisiklikNotu: z.string().nullable(),
  acan: adliKayit.nullable(), acilma: zaman, yayinlayan: adliKayit.nullable(), yayin: zaman.nullable(),
  parametreler: z.array(parametreSemasi), atiflar: z.array(atifSemasi),
});
export const sartnameOzeti = z.object({
  id: KIMLIK, kod: z.string(), ad: z.string(), kategoriId: KIMLIK, kapsam: z.enum(SARTNAME_KAPSAMLARI), kaynak: z.enum(SARTNAME_KAYNAKLARI),
  musteriFirma: adliKayit.nullable(), musteriBelgeNo: z.string().nullable(), aktif: z.boolean(), surum: KIMLIK,
  yururlukteSurumNo: KIMLIK.nullable(), taslakSurumNo: KIMLIK.nullable(),
  // Onaya gönderilmiş, onaylı ya da yürürlükteki revizyonlarda şartnameyi kullanan adım sayısı.
  kullanim: z.number().int().nonnegative(),
});
export const kategoriSemasi = z.object({ id: KIMLIK, kod: z.string(), ad: z.string(), sira: KIMLIK });
export const sartnamelerCevabi = z.object({
  kategoriler: z.array(kategoriSemasi), standartlar: z.array(standartSemasi), sartnameler: z.array(sartnameOzeti),
});
export const sartnameCevabi = z.object({ sartname: sartnameOzeti.extend({ surumler: z.array(sartnameSurumuSemasi) }) });
export const standartCevabi = z.object({ standart: standartSemasi });

// Revizyondaki adım şartnameleri: seçilen şartname, adımın değerleri ve yürürlükteki sürüm (yoksa null; yayınlanmamış şartname emre geçmez).
export const revizyonSartnameleriCevabi = z.object({
  adimlar: z.array(z.object({
    opNo: KIMLIK,
    sartnameler: z.array(z.object({
      sira: KIMLIK, sartname: sartnameOzeti, degerler: parametreDegerleri, yururlukte: sartnameSurumuSemasi.nullable(),
      // Emir açılırken boş kalacak zorunlu alanların adları ve kapsam uyuşmazlığı; onaya göndermede ve emirde reddedilir.
      eksikler: z.array(z.string()), kapsamUyumsuz: z.boolean(),
    })),
  })),
});

// Emre sabitlenen şartnameler: terminal (iç adım) ve fason iş emri belgesi okur.
export const isEmriSartnamesiSemasi = z.object({
  sira: KIMLIK, sartname: z.object({ id: KIMLIK, kod: z.string(), ad: z.string() }), surum: sartnameSurumuSemasi, degerler: parametreDegerleri,
  sabitleyen: adliKayit, sabitlenme: zaman,
});
export const isEmriSartnameleriCevabi = z.object({
  isEmirleri: z.array(z.object({ isEmriId: KIMLIK, sartnameler: z.array(isEmriSartnamesiSemasi) })),
});

export type SartnameEkleGovdesi = z.input<typeof sartnameEkleGovdesi>;
export type SartnameKopyalaGovdesi = z.input<typeof sartnameKopyalaGovdesi>;
export type SartnameKunyeGovdesi = z.input<typeof sartnameKunyeGovdesi>;
export type SartnameTaslakGovdesi = z.input<typeof sartnameTaslakGovdesi>;
export type SartnameTaslakGovdesiCikti = z.output<typeof sartnameTaslakGovdesi>;
export type StandartEkleGovdesi = z.input<typeof standartEkleGovdesi>;
export type AdimSartnameleriGovdesi = z.input<typeof adimSartnameleriGovdesi>;
export type ParametreGirdisi = z.output<typeof parametreGirdisi>;
export type AtifGirdisi = z.output<typeof atifGirdisi>;
export type SartnameParametresiSatiri = z.output<typeof parametreSemasi>;
export type SartnameSurumu = z.output<typeof sartnameSurumuSemasi>;
export type SartnameOzeti = z.output<typeof sartnameOzeti>;
export type SartnamelerCevabi = z.output<typeof sartnamelerCevabi>;
export type SartnameCevabi = z.output<typeof sartnameCevabi>;
export type StandartCevabi = z.output<typeof standartCevabi>;
export type RevizyonSartnameleriCevabi = z.output<typeof revizyonSartnameleriCevabi>;
export type IsEmriSartnamesi = z.output<typeof isEmriSartnamesiSemasi>;
export type IsEmriSartnameleriCevabi = z.output<typeof isEmriSartnameleriCevabi>;

/* ---------------- talimat şablonu (989 a) ---------------- */

// Şablon kütüphanedir: "şablondan başla" adımları talimata kopyalar, bağ kurmaz; şablon sonra değişse ürün talimatı değişmez.
export const talimatSablonParametresi = z.object({ id: yolKimligi });
const talimatSablonKodu = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,29}$/, 'Kod 2-30 karakter: büyük harf, rakam ve tire.');
export const talimatSablonEkleGovdesi = z.object({
  kod: talimatSablonKodu, ad: metin(120, 'Şablon adı zorunlu.'), sartnameId: KIMLIK.nullable(), adimlar: talimatAdimlari,
});
export const talimatSablonKaydetGovdesi = z.object({ surum: KIMLIK, ad: metin(120, 'Şablon adı zorunlu.'), sartnameId: KIMLIK.nullable(), adimlar: talimatAdimlari });
export const talimatSablonDurumGovdesi = z.object({ surum: KIMLIK, aktif: z.boolean() });
const talimatSablonOzeti = z.object({
  id: KIMLIK, kod: z.string(), ad: z.string(), sartname: z.object({ id: KIMLIK, kod: z.string(), ad: z.string() }).nullable(),
  aktif: z.boolean(), surum: KIMLIK, adimSayisi: z.number().int().nonnegative(),
  // Listede gösterilir (1180 a): kontrol noktalı adım, resim ve video sayısı.
  kontrolSayisi: z.number().int().nonnegative(), resimSayisi: z.number().int().nonnegative(), videoSayisi: z.number().int().nonnegative(),
});
export const talimatSablonlariCevabi = z.object({ sablonlar: z.array(talimatSablonOzeti) });
export const talimatSablonuCevabi = z.object({ sablon: talimatSablonOzeti.extend({ adimlar: z.array(talimatAdimiSemasi) }) });

export type KontrolNoktasi = z.output<typeof kontrolSemasi>;
export type TalimatAdimiGirdisi = z.input<typeof talimatAdimiGirdisi>;
export type TalimatAdimi = z.output<typeof talimatAdimiSemasi>;
export type TalimatMedyasi = z.output<typeof medyaSemasi>;
export type AdimliTalimatYazGovdesi = z.input<typeof adimliTalimatYazGovdesi>;
export type TalimatTaslakKaydetGovdesi = z.input<typeof talimatTaslakKaydetGovdesi>;
export type TalimatTaslakKomutGovdesi = z.input<typeof talimatTaslakKomutGovdesi>;
export type TalimatSablonEkleGovdesi = z.input<typeof talimatSablonEkleGovdesi>;
export type TalimatSablonKaydetGovdesi = z.input<typeof talimatSablonKaydetGovdesi>;
export type TalimatSablonlariCevabi = z.output<typeof talimatSablonlariCevabi>;
export type TalimatSablonuCevabi = z.output<typeof talimatSablonuCevabi>;

/* ---------------- ek adımın şartnamesi (1034) ---------------- */

// Planlama hatalı parçanın rework adımını (ya da kola koyduğu tamir veya ek adımı) doldurunca şartnamesini seçer. Liste bütün olarak
// yazılır; boş liste sabitleri kaldırır. surum emrin sürümüdür (komut emri değiştirmez).
export const ekAdimSartnameParametresi = z.object({ emirId: yolKimligi, isEmriId: yolKimligi });
export const ekAdimSartnameleriGovdesi = z.object({
  surum: KIMLIK,
  sartnameler: z.array(z.object({ sartnameId: KIMLIK, degerler: parametreDegerleri })).max(AZAMI_ADIM_SARTNAMESI),
}).strict();
export type EkAdimSartnameleriGovdesi = z.input<typeof ekAdimSartnameleriGovdesi>;
