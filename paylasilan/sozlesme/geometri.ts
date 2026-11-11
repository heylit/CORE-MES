import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

// 3D Atölyesi (kart 1441): malzeme kartına bağlı, yayındaki STEP/IGES modelinin geometri analizi. Ölçüler mm; değerler üçgen
// ağından hesaplanır (yaklaşıktır, yuvarlatılmış yüzeyde ağ inceliğine bağlı). Analizi olmayan alan null'dır, sıfır uydurulmaz.

export const GEOMETRI_IS_DURUMLARI = ['bekliyor', 'calisiyor', 'bitti', 'hata'] as const;
export type GeometriIsDurumu = (typeof GEOMETRI_IS_DURUMLARI)[number];
// Ekran durumu: iş yoksa (tarama henüz yakalamadı) 'yok'.
export const GEOMETRI_DURUMLARI = ['yok', ...GEOMETRI_IS_DURUMLARI] as const;
export type GeometriDurumu = (typeof GEOMETRI_DURUMLARI)[number];
export const GEOMETRI_DOSYA_TURLERI = ['step', 'iges'] as const;
export type GeometriDosyaTuru = (typeof GEOMETRI_DOSYA_TURLERI)[number];

const mm = z.number().nonnegative();

// Kesin yüz türleri (kart 1984): B-rep yüzeyinin türü; dönel, ekstrüzyon ve ofset genel yüzeylerdir.
export const GEOMETRI_YUZ_TURLERI = ['duzlem', 'silindir', 'koni', 'kure', 'torus', 'bezier', 'bspline', 'donel', 'ekstruzyon', 'ofset', 'diger'] as const;
export type GeometriYuzTuru = (typeof GEOMETRI_YUZ_TURLERI)[number];
// Yüz özeti: motor, toplam yüz ve türe göre sayı (olmayan tür yazılmaz). Yüz okunamadıysa ya da sınırı aştıysa analizde null.
export const geometriYuzOzetiSemasi = z.object({
  motor: z.string(),
  toplam: z.number().int().min(0),
  sayilar: z.partialRecord(z.enum(GEOMETRI_YUZ_TURLERI), z.number().int().min(1)),
});

export const geometriAnaliziSemasi = z.object({
  motor: z.string(),
  // Eksenlere hizalı dış kutu (modelin kendi eksenlerinde).
  kutu: z.object({ x: mm, y: mm, z: mm }),
  // Döndürülmüş en küçük kutu: kenarlar büyükten küçüğe; yon satırları kutu eksenleri (birim vektör). cap: uzun eksen (a) çevresinde
  // parçayı kapsayan en küçük daire çapı (döner parçada parçanın çapı).
  obb: z.object({ a: mm, b: mm, c: mm, cap: mm, yon: z.array(z.array(z.number()).length(3)).length(3) }),
  // Ağ kapalı değilse null.
  hacimMm3: z.number().positive().nullable(),
  alanMm2: mm,
  govdeSayisi: z.number().int().min(1),
  kapali: z.boolean(),
  ucgenSayisi: z.number().int().min(1),
  hesapSuresiMs: z.number().int().min(0),
  hesapZamani: zamanSemasi,
  yuzler: geometriYuzOzetiSemasi.nullable(),
});
export type GeometriAnalizi = z.output<typeof geometriAnaliziSemasi>;

export const geometriIsSemasi = z.object({
  durum: z.enum(GEOMETRI_IS_DURUMLARI),
  denemeSayisi: z.number().int().min(0),
  hataMetni: z.string().nullable(),
  olusturma: zamanSemasi,
  baslama: zamanSemasi.nullable(),
  bitis: zamanSemasi.nullable(),
  surum: surumSemasi,
});

export const revizyonParametresi = z.object({ revizyonId: z.coerce.number<number>().int().min(1) });

// Model listesi: 3B modeli olan malzemeler, model başına bir satır.
export const geometriModelListeSorgusu = z.object({
  ...sayfaSorguAlanlari,
  ara: z.string().trim().max(100).optional(),
  durum: z.enum(GEOMETRI_DURUMLARI).optional(),
});
export const geometriModelSatiri = z.object({
  malzemeNo: z.number().int(),
  malzemeKodu: z.string(),
  malzemeAdi: z.string().nullable(),
  belgeId: z.number().int(),
  belgeAdi: z.string(),
  revizyonId: z.number().int(),
  harf: z.string(),
  // 2138-2: gösterilen revizyon kodu (modelin kodu, yoksa bağlı malzeme kartının revizyonu); harf merkezin iç sırasıdır, gösterilmez.
  revKodu: z.string().nullable().optional(),
  dosyaTuru: z.enum(GEOMETRI_DOSYA_TURLERI),
  durum: z.enum(GEOMETRI_DURUMLARI),
  hataMetni: z.string().nullable(),
  // Malzeme kartına bağlı ama Çizim Merkezi'nde yayınlanmamış model: listede "Taslak" görünür, ölçülmez. Yoksa yayındadır.
  yayinda: z.boolean().optional(),
});
export type GeometriModelSatiri = z.output<typeof geometriModelSatiri>;
export const geometriModelListeCevabi = listeCevapSemasi(geometriModelSatiri);
export type GeometriModelListeCevabi = z.output<typeof geometriModelListeCevabi>;

// Eski bağlantı: revizyon yayından düştüyse aynı belgenin bugün listede olan revizyonu; yoksa null.
export const geometriGuncelRevizyonCevabi = z.object({ revizyonId: z.number().int().nullable() });
export type GeometriGuncelRevizyonCevabi = z.output<typeof geometriGuncelRevizyonCevabi>;

export const geometriAnalizCevabi = z.object({
  revizyonId: z.number().int(),
  belgeId: z.number().int(),
  dosyaTuru: z.enum(GEOMETRI_DOSYA_TURLERI),
  durum: z.enum(GEOMETRI_DURUMLARI),
  is: geometriIsSemasi.nullable(),
  // Analiz başka içeriğe (eski özet) aitse gösterilmez: null.
  analiz: geometriAnaliziSemasi.nullable(),
});
export type GeometriAnalizCevabi = z.output<typeof geometriAnalizCevabi>;

// Özellik tanıma (kart 2044; 1923 b): kesin B-rep yüzlerinden delik, kademe (havşa başı), havşa (koni), pah ve radyüs. Sonuç yalnız
// öneridir; rotaya, karta ya da Kalite Merkezi'ne kendiliğinden yazılmaz. Türün taşımadığı ölçü null'dır. ust: bağlı olduğu deliğin
// listedeki sırası (kademe ve havşa için). yuzler: özelliği oluşturan yüzlerin analizdeki sıra numaraları.
export const GEOMETRI_OZELLIK_TURLERI = ['delik', 'kademe', 'havsa', 'pah', 'radyus'] as const;
export type GeometriOzellikTuru = (typeof GEOMETRI_OZELLIK_TURLERI)[number];
export const GEOMETRI_DELIK_DIPLERI = ['duz', 'matkap'] as const;
export type GeometriDelikDibi = (typeof GEOMETRI_DELIK_DIPLERI)[number];
const yon3 = z.array(z.number()).length(3);
export const geometriOzellikSemasi = z.object({
  sira: z.number().int().min(1),
  tur: z.enum(GEOMETRI_OZELLIK_TURLERI),
  ust: z.number().int().min(1).nullable(),
  capMm: mm.nullable(),
  yaricapMm: mm.nullable(),
  derinlikMm: mm.nullable(),
  aciDerece: z.number().nullable(),
  genislikMm: mm.nullable(),
  boyMm: mm.nullable(),
  // Delikte: dibi yoksa (iki ucu açık) true.
  gecis: z.boolean().nullable(),
  dip: z.enum(GEOMETRI_DELIK_DIPLERI).nullable(),
  // Radyüste: iç köşe (içbükey) ise true, dış kenar ise false.
  ic: z.boolean().nullable(),
  // Delikte eksen girişten içeri doğrudur, konum girişteki eksen noktasıdır.
  eksen: yon3.nullable(),
  konum: yon3.nullable(),
  yuzler: z.array(z.number().int().min(1)),
});
export type GeometriOzellik = z.output<typeof geometriOzellikSemasi>;
// Tanıma yoksa (analiz yok, yüzler okunamadı ya da sınırı aştı) ozellikler null; tanındı ama özellik yoksa boş liste.
export const geometriOzellikCevabi = z.object({
  revizyonId: z.number().int(),
  motor: z.string().nullable(),
  ozellikler: z.array(geometriOzellikSemasi).nullable(),
});
export type GeometriOzellikCevabi = z.output<typeof geometriOzellikCevabi>;

// Pay her yüzeye eklenen işleme payıdır (mm). Sorguda yoksa sistem ayarı (geometri.ham-payi-mm) geçerlidir; ayar da boşsa pay 0 ve
// kaynağı 'yok' döner, ekran bunu söyler. Stok listesi aktif hammadde kartlarıdır (1469 a); kalite verilirse yalnız o kalite.
export const PAY_EN_COK_MM = 100;
export const geometriHamSorgusu = z.object({
  payMm: z.coerce.number<number>().min(0).max(PAY_EN_COK_MM).optional(),
  kalite: z.string().trim().min(1).max(100).optional(),
});
export const HAM_STOK_FORMLARI = ['cubuk', 'altigen', 'lama', 'levha', 'blok'] as const;
export const HAM_PAY_KAYNAKLARI = ['istek', 'ayar', 'yok'] as const;
export const HAM_STOK_NEDENLERI = ['analiz-yok', 'stok-listesi-yok', 'sigan-yok'] as const;
export const hamStokOnerisi = z.object({
  malzemeNo: z.number().int(),
  kod: z.string(),
  ad: z.string().nullable(),
  kalite: z.string().nullable(),
  form: z.enum(HAM_STOK_FORMLARI),
  // Kartın ölçüleri, Malzemeler'in form ölçü adlarıyla (çubuk d,l; altıgen s,l; lama a,b,l; levha t,w,l; blok a,b,h).
  olcu: z.record(z.string(), z.number()),
  // 1480: kalitenin yoğunluğu (g/cm³). Sunucu yalnız özel ve ayarda eklenen kaliteyi bilir; null ise ekran aile ve kalite koduyla
  // Malzemeler'in yerleşik kalite tablosundan bulur, orada da yoksa kullanıcı yazar.
  aile: z.string().nullable(),
  kaliteKodu: z.string().nullable(),
  yogunluk: z.number().positive().nullable(),
  // Çubuk, altıgen, lama ve levhada kesilecek boy; blokta null.
  kesimBoyuMm: mm.nullable(),
  hamHacimMm3: mm,
});
export type HamStokOnerisi = z.output<typeof hamStokOnerisi>;
export const geometriHamCevabi = z.object({
  revizyonId: z.number().int(),
  payMm: z.number(),
  payKaynagi: z.enum(HAM_PAY_KAYNAKLARI),
  // Döndürülmüş kutu + iki yüzde pay; analiz yoksa null.
  enAz: z.object({ a: mm, b: mm, c: mm }).nullable(),
  // Her formda sığan en küçük kart, ham hacmine göre artan sırada (en az talaş önce).
  oneriler: z.array(hamStokOnerisi),
  // Listede bulunan kaliteler (süzgeç için; kalite süzgecinden bağımsız).
  kaliteler: z.array(z.string()),
  // Öneri yoksa nedeni; varsa null.
  neden: z.enum(HAM_STOK_NEDENLERI).nullable(),
});
export type GeometriHamCevabi = z.output<typeof geometriHamCevabi>;

// İş henüz yoksa null gönderilir (ekran 'yok' gördü); iş varsa okunan sürüm.
export const yenidenHesaplaGovdesi = z.object({ surum: surumSemasi.nullable() }).strict();
export const yenidenHesaplaCevabi = geometriAnalizCevabi;

// Malzeme kartında net ağırlık (1710, 1704 a): kartın yayındaki en yeni modelinin hacmi ve yoğunluk ön değeri için ilk stok
// önerisinin kalitesi (3D Atölyesi ekranının kuralı, 1480). Ağırlığı ekran hesaplar ve yalnız düğmeyle forma yazar; kart her
// zamanki kaydetmeyle yazılır. neden: model-yok, analiz-yok, hacim-yok (ağ kapalı değil); hacim varsa null.
export const malzemeParametresi = z.object({ malzemeNo: z.coerce.number<number>().int().min(1) });
export const agirlikOzetiCevabi = z.object({
  // kapak: model kartta kapak seçili olduğu için alındı (GEO-2 a); değilse en son yayınlanan. modelSayisi: karta bağlı yayındaki 3B model sayısı.
  model: z.object({ belgeAdi: z.string(), harf: z.string(), revKodu: z.string().nullable().optional(), kapak: z.boolean() }).nullable(),
  modelSayisi: z.number().int().min(0),
  hacimMm3: z.number().positive().nullable(),
  neden: z.enum(['model-yok', 'analiz-yok', 'hacim-yok']).nullable(),
  kalite: z.object({ ad: z.string().nullable(), aile: z.string().nullable(), kaliteKodu: z.string().nullable(), yogunluk: z.number().positive().nullable() }).nullable(),
});
export type AgirlikOzetiCevabi = z.output<typeof agirlikOzetiCevabi>;

// Montaj ağacı (kart 2109, M1): STEP montajının düğümleri ve bileşen listesi. Ölçüler üçgen ağındandır ve yalnız öneridir (2101-2 b,
// oneri her zaman true): gerçek montaj dosyasıyla denenmedi; rotaya, reçeteye ya da karta kendiliğinden yazılmaz. Analiz yoksa ya da
// başka içeriğe aitse neden 'analiz-yok'; analiz montajı okumadıysa (2109 öncesi hesap, parça yok ya da düğüm sınırı aşıldı) 'montaj-yok'.
// Tek parçalı modelde ağaç tek düğümdür ve montaj false'tur.
export const GEOMETRI_MONTAJ_DUGUM_TURLERI = ['montaj', 'parca'] as const;
export const GEOMETRI_MONTAJ_NEDENLERI = ['analiz-yok', 'montaj-yok'] as const;
const kose = z.array(z.number()).length(3);
const kenarlar3 = z.object({ a: mm, b: mm, c: mm });
// sira 1'den ve ön sıralı (üst alttan önce); ust kökte null. kutuEn/kutuUst modelin koordinatında eksenlere hizalı kutunun köşeleri
// (montajda altındaki parçaları kapsar, parçası yoksa null). Parçada obb (döndürülmüş kutu kenarları, büyükten küçüğe), alan ve kapali
// doludur; montajda null. Ad dosyadakidir, yoksa null.
export const geometriMontajDugumuSemasi = z.object({
  sira: z.number().int().min(1),
  ust: z.number().int().min(1).nullable(),
  tur: z.enum(GEOMETRI_MONTAJ_DUGUM_TURLERI),
  ad: z.string().nullable(),
  kutuEn: kose.nullable(),
  kutuUst: kose.nullable(),
  obb: kenarlar3.nullable(),
  hacimMm3: z.number().positive().nullable(),
  alanMm2: mm.nullable(),
  kapali: z.boolean().nullable(),
});
export type GeometriMontajDugumu = z.output<typeof geometriMontajDugumuSemasi>;
// Aynı ad ve ölçüdeki parçalar tek satırdır (yerleşim yönünden bağımsız); dugumler o parçaların düğüm sıraları.
export const geometriMontajBileseniSemasi = z.object({
  sira: z.number().int().min(1),
  ad: z.string().nullable(),
  adet: z.number().int().min(1),
  obb: kenarlar3,
  hacimMm3: z.number().positive().nullable(),
  alanMm2: mm,
  kapali: z.boolean(),
  dugumler: z.array(z.number().int().min(1)).min(1),
});
export type GeometriMontajBileseni = z.output<typeof geometriMontajBileseniSemasi>;
export const geometriMontajCevabi = z.object({
  revizyonId: z.number().int(),
  oneri: z.literal(true),
  motor: z.string().nullable(),
  montaj: z.boolean().nullable(),
  dugumler: z.array(geometriMontajDugumuSemasi).nullable(),
  bilesenler: z.array(geometriMontajBileseniSemasi).nullable(),
  neden: z.enum(GEOMETRI_MONTAJ_NEDENLERI).nullable(),
});
export type GeometriMontajCevabi = z.output<typeof geometriMontajCevabi>;

// Dosya sağlık raporu (kart 2143, 2140-1 a): okuyucunun kendi onarımından sonra kalan açık kenar, geçersiz yüz, büyük tolerans, çok kısa
// kenar ve birim şüphesi. Yalnız uyarıdır; ölçüye ne kadar güvenileceğini söyler, dosyayı değiştirmez.
export const GEOMETRI_SAGLIK_DURUMLARI = ['iyi', 'dikkat', 'guvenme'] as const;
export type GeometriSaglikDurumu = (typeof GEOMETRI_SAGLIK_DURUMLARI)[number];
export const GEOMETRI_SAGLIK_BULGULARI = [
  'acik-kenar', 'gecersiz-yuz', 'gecersiz-sekil', 'acik-ag', 'buyuk-tolerans', 'tolerans', 'kucuk-kenar', 'birim-mm-degil', 'olcu-cok-kucuk', 'olcu-cok-buyuk',
] as const;
export const GEOMETRI_SAGLIK_NEDENLERI = ['analiz-yok', 'saglik-yok'] as const;
export const geometriSaglikBulgusu = z.object({
  kod: z.enum(GEOMETRI_SAGLIK_BULGULARI),
  durum: z.enum(['dikkat', 'guvenme']),
  metin: z.string(),
});
export type GeometriSaglikBulgusu = z.output<typeof geometriSaglikBulgusu>;
export const geometriSaglikCevabi = z.object({
  revizyonId: z.number().int(),
  oneri: z.literal(true),
  motor: z.string().nullable(),
  durum: z.enum(GEOMETRI_SAGLIK_DURUMLARI).nullable(),
  acikKenarSayisi: z.number().int().nullable(),
  acikSinirSayisi: z.number().int().nullable(),
  gecersizYuzSayisi: z.number().int().nullable(),
  sekilGecerli: z.boolean().nullable(),
  enBuyukToleransMm: z.number().nullable(),
  kucukKenarSayisi: z.number().int().nullable(),
  dosyaBirimi: z.string().nullable(),
  kapali: z.boolean().nullable(),
  bulgular: z.array(geometriSaglikBulgusu),
  hesapZamani: zamanSemasi.nullable(),
  neden: z.enum(GEOMETRI_SAGLIK_NEDENLERI).nullable(),
});
export type GeometriSaglikCevabi = z.output<typeof geometriSaglikCevabi>;

// Yüzey işaretleri (kart 2144; 2144-1 a, 2140-3, 2140-4 a): revizyonun B-rep yüzlerine boya, kaplama ya da maske. Bir yüz tek işleme
// atanır. İşlem listesi malzemenin yürürlükteki rota revizyonundaki yüzey işlemi adımlarıdır (şartname kategorisi KPL, DNS, AST, BYA,
// YHZ); maske rotada adım değildir, "bu yüze işlem uygulanmaz" demektir. Alanlar B-rep yüz alanından, mm²; yalnız öneridir.
export const GEOMETRI_YUZEY_KATEGORILERI = ['KPL', 'DNS', 'AST', 'BYA', 'YHZ'] as const;
export const GEOMETRI_YUZEY_NEDENLERI = ['analiz-yok', 'yuz-yok'] as const;
// bagli: rota okundu; rota-yok: malzemenin yürürlükte rotası yok; rota-bagli-degil: rota bağı kurulmadı (liste boş, yalnız maske).
export const GEOMETRI_YUZEY_ROTA_DURUMLARI = ['bagli', 'rota-yok', 'rota-bagli-degil'] as const;
export const GEOMETRI_YUZEY_EN_COK_ISARET = 20000;

const kimlik = z.number().int().min(1);
export const geometriYuzeyIslemiSemasi = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('maske') }).strict(),
  z.object({ tur: z.literal('rota'), opNo: kimlik, sartnameId: kimlik }).strict(),
]);
export type GeometriYuzeyIslemi = z.output<typeof geometriYuzeyIslemiSemasi>;

export const geometriYuzeyAdimiSemasi = z.object({
  opNo: kimlik,
  adimAdi: z.string(),
  fason: z.boolean(),
  talimatVar: z.boolean(),
  sartname: z.object({ id: kimlik, kod: z.string(), ad: z.string(), kategoriKodu: z.enum(GEOMETRI_YUZEY_KATEGORILERI) }),
  // 2144-3 b: şartnamenin yürürlükteki alanları ve adımdaki değeri (yoksa varsayılan); ekran kalınlığı ve yoğunluğu buradan okur.
  parametreler: z.array(z.object({
    anahtar: z.string(), ad: z.string(), birim: z.string().nullable(),
    deger: z.union([z.number(), z.tuple([z.number(), z.number()]), z.string(), z.array(z.string()), z.boolean()]).nullable(),
  })),
});
export type GeometriYuzeyAdimi = z.output<typeof geometriYuzeyAdimiSemasi>;

// oneri: önceki revizyondan (2140-4 a) taşınan, henüz onaylanmamış işaret; onaylanana kadar terminale ve maske resmine girmez.
// rotadaVar: rota işaretinin adımı bugünkü rotada var mı (rotadan kalkan adımın işareti silinmez, uyarıyla görünür).
export const geometriYuzeyIsaretiSemasi = z.object({
  yuzSira: kimlik,
  islem: geometriYuzeyIslemiSemasi,
  oneri: z.boolean(),
  rotadaVar: z.boolean(),
});
export type GeometriYuzeyIsareti = z.output<typeof geometriYuzeyIsaretiSemasi>;

export const geometriYuzeyCevabi = z.object({
  revizyonId: z.number().int(),
  oneri: z.literal(true),
  neden: z.enum(GEOMETRI_YUZEY_NEDENLERI).nullable(),
  yuzler: z.array(z.object({ sira: kimlik, tur: z.enum(GEOMETRI_YUZ_TURLERI), ters: z.boolean(), alanMm2: mm })),
  rota: z.object({ durum: z.enum(GEOMETRI_YUZEY_ROTA_DURUMLARI), adimlar: z.array(geometriYuzeyAdimiSemasi) }),
  isaretler: z.array(geometriYuzeyIsaretiSemasi),
  alanlar: z.array(z.object({ islem: geometriYuzeyIslemiSemasi, yuzSayisi: z.number().int().min(1), alanMm2: mm, oneriVar: z.boolean() })),
  isaretsizMm2: mm,
  toplamMm2: mm,
  // Kaydedilmiş işaret yoksa surum, guncelleyen ve guncelleme null.
  surum: surumSemasi.nullable(),
  guncelleyen: z.object({ id: kimlik, ad: z.string().nullable() }).nullable(),
  guncelleme: zamanSemasi.nullable(),
  // Önceki revizyondan öneri taşındıysa kaynağı ve eşleşme sayıları; kayıt varsa null.
  tasima: z.object({ kaynakRevizyonId: kimlik, eslesen: z.number().int().min(0), eslesmeyen: z.number().int().min(0) }).nullable(),
});
export type GeometriYuzeyCevabi = z.output<typeof geometriYuzeyCevabi>;

// Bütün işaretler tek komutla yazılır (boş dizi hepsini kaldırır). Kaydı ilk kez açan istek surum null gönderir.
export const geometriYuzeyKaydetGovdesi = z.object({
  surum: surumSemasi.nullable(),
  isaretler: z.array(z.object({ yuzSira: kimlik, islem: geometriYuzeyIslemiSemasi, oneri: z.boolean() }).strict()).max(GEOMETRI_YUZEY_EN_COK_ISARET),
}).strict();
export type GeometriYuzeyKaydetGovdesi = z.output<typeof geometriYuzeyKaydetGovdesi>;
