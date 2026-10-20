import { z } from 'zod';
import { MODEL_AZAMI_BAYT, MODEL_PARCA_BAYT } from '../atolye-sabitleri.ts';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { istasyonTipi } from './istasyonlar.ts';

export const RAF_TURLERI = ['palet', 'kucuk_parca', 'konsol', 'zemin'] as const;
// Kabul, üretim çıkışı, depo zemini, fason, bekleme (ara_alan) ve hurda stok konumudur (kart #686, #1304): stok miktarı bu alana bağlanır.
export const ALAN_TURLERI = ['yuruyus_yolu', 'bolge', 'karantina', 'sevkiyat', 'oda', 'cam_oda', 'palet', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'ara_alan', 'hurda'] as const;
export const KAPI_KENARLARI = ['on', 'arka', 'sol', 'sag'] as const;
// Bölümün dış duvarındaki geçiş türleri; 3B'de her biri ayrı çizilir.
export const GECIS_TURLERI = ['kepenk', 'acik', 'kapi', 'yangin_kapisi'] as const;
export const ARAMA_TURLERI = ['goz', 'raf', 'istasyon', 'alan'] as const;
// Kayıttaki öğe sayısı sınırı: istek gövdesi ve tek transaction makul boyda kalsın.
export const AZAMI_OGE = 500;
export const ARAMA_AZAMI_SONUC = 20;

// 3B model sınırları zod taşımayan dosyadadır (istemci değer olarak ithal eder).
export { MODEL_AZAMI_BAYT, MODEL_PARCA_BAYT };
export const MODEL_KAYNAK_BICIMLERI = ['step', 'stl', 'glb', 'gltf'] as const;
export const MODEL_BIRIMLERI = ['mm', 'cm', 'm'] as const;
export const YUKARI_EKSENLERI = ['y', 'z'] as const;
export const KALEM_AMBALAJLARI = ['otomatik', 'koli', 'kasa', 'kutu', 'demet', 'levha'] as const;
export const RAFTA_GOSTERIMLERI = ['paket', 'model'] as const;

// Salon kodu ortak kod biçimidir; raf kodu tiresizdir, çünkü tire göz adresinin ayracıdır (R1-02-3-1).
export const SALON_KOD_DESENI = /^[A-Z0-9][A-Z0-9._-]{0,23}$/;
export const RAF_KOD_DESENI = /^[A-Z][A-Z0-9]{0,4}$/;

const TAM_SAYI_UST = 2147483647;
const kimlik = z.number().int().positive().max(TAM_SAYI_UST);
const yolKimligi = z.coerce.number().pipe(kimlik);
const zaman = z.string();
const ad = z.string().trim().min(1, 'Ad zorunlu.').max(120);
const kodSemasi = (desen: RegExp, ileti: string) =>
  z.string().trim().transform((k) => k.toUpperCase()).pipe(z.string().regex(desen, ileti));
const salonKodu = kodSemasi(SALON_KOD_DESENI, 'Salon kodu harf ya da rakamla başlar; en çok 24 karakter, harf, rakam, nokta, alt çizgi, tire.');
const rafKodu = kodSemasi(RAF_KOD_DESENI, 'Raf kodu harfle başlar; en çok 5 karakter, yalnız harf ve rakam (tire göz adresinin ayracıdır).');

// Ölçüler gövdede sayıdır; sunucu yuvarlayıp numeric olarak saklar, cevapta metin döner.
const olcu = (enaz: number, encok: number, adi: string) =>
  z.number({ invalid_type_error: `${adi} sayı olmalı.` }).finite().min(enaz, `${adi} en az ${enaz}.`).max(encok, `${adi} en çok ${encok}.`);
const konum = z.number().finite().min(-1000).max(1000);
const donus = z.number().finite().min(-3600).max(3600);
const sayi = (enaz: number, encok: number, adi: string) =>
  z.number().int(`${adi} tam sayı olmalı.`).min(enaz, `${adi} en az ${enaz}.`).max(encok, `${adi} en çok ${encok}.`);

export const rafTuru = z.enum(RAF_TURLERI);
export const alanTuru = z.enum(ALAN_TURLERI);
export const kapiKenari = z.enum(KAPI_KENARLARI);
export const gecisTuru = z.enum(GECIS_TURLERI);
export const aramaTuru = z.enum(ARAMA_TURLERI);

export const salonParametresi = z.object({ id: yolKimligi });
export const istasyonParametresi = z.object({ id: yolKimligi });
export const modelParametresi = z.object({ id: yolKimligi });
export const modelParcaParametresi = z.object({ id: yolKimligi, sira: z.coerce.number().int().min(0).max(100000) });
export const krokiParcaParametresi = modelParcaParametresi;
export const krokiSiraParametresi = z.object({ sira: z.coerce.number().int().min(0).max(100000) });
export const rafParametresi = z.object({ id: yolKimligi });

export const salonGovdesi = z.object({
  kod: salonKodu,
  ad,
  genislik: olcu(5, 500, 'Genişlik'),
  derinlik: olcu(5, 500, 'Derinlik'),
  hucreBoyu: olcu(1, 50, 'Hücre boyu'),
});

const girisGovdesi = z.object({ x: konum, z: konum }).nullable();

export const istasyonYeriGovdesi = z.object({
  istasyonId: kimlik,
  x: konum,
  z: konum,
  donus,
  genislik: olcu(0.2, 50, 'Ayak izi genişliği'),
  derinlik: olcu(0.2, 50, 'Ayak izi derinliği'),
  // Gösterilen 3B model; verilmezse ya da null ise istasyon tipinden çizilir.
  modelId: kimlik.nullable().default(null),
});

// Makinenin yeri (kart #1120): haritadaki 3B nesne makinedir; makine kaydı istasyonlar modülündedir.
export const makineYeriGovdesi = z.object({
  makineId: kimlik,
  x: konum,
  z: konum,
  donus,
  genislik: olcu(0.2, 50, 'Makine genişliği'),
  derinlik: olcu(0.2, 50, 'Makine derinliği'),
  // Gösterilen 3B model; null ise istasyonun tipinden çizilir.
  modelId: kimlik.nullable().default(null),
});

export const rafGovdesi = z.object({
  // Var olan raf kimliğiyle gelir; yeni raf null. Kimlik gözleri korur, kod değişebilir.
  id: kimlik.nullable(),
  kod: rafKodu,
  ad,
  tur: rafTuru,
  bolmeSayisi: sayi(1, 99, 'Bölme sayısı'),
  katSayisi: sayi(1, 10, 'Kat sayısı'),
  gozSayisi: sayi(1, 9, 'Göz sayısı'),
  bolmeGenisligi: olcu(0.2, 10, 'Bölme genişliği'),
  derinlik: olcu(0.2, 10, 'Raf derinliği'),
  yukseklik: olcu(0.1, 15, 'Raf yüksekliği'),
  x: konum,
  z: konum,
  donus,
  aktif: z.boolean(),
  // Net ölçüler (metre, isteğe bağlı): her katın net yüksekliği alttan üste (kat sayısı kadar), göz net eni ve
  // derinliği. Verilmezse raf türünden hesaplanır; verilince rafta sığma gerçek ölçüyle denetlenir (ATL-33).
  katYukseklikleri: z.array(olcu(0.05, 15, 'Kat net yüksekliği')).min(1).max(10).nullable().default(null),
  gozGenisligi: olcu(0.05, 10, 'Göz net genişliği').nullable().default(null),
  gozDerinligi: olcu(0.05, 10, 'Göz net derinliği').nullable().default(null),
});

export const kapiSemasi = z.object({
  kenar: kapiKenari,
  // Kapının ortasının kenarın ortasından kayması (metre): ön ve arka kenarda odanın x yönünde, sol ve sağda z yönünde.
  ofset: z.number().finite().min(-250).max(250),
  genislik: olcu(0.5, 10, 'Kapı genişliği'),
});

// Geçiş bölümün dış kenarındadır (ATL-34): ofset geçişin ortasının kenarın ortasından kayması (metre), ön ve arka
// kenarda x yönünde, sol ve sağda z yönünde. Ortak duvardaki geçiş komşu bölüme de açılır.
export const gecisGovdesi = z.object({
  tur: gecisTuru,
  kenar: kapiKenari,
  ofset: z.number().finite().min(-250).max(250),
  genislik: olcu(0.8, 20, 'Geçiş genişliği'),
});

export const alanGovdesi = z.object({
  // Var olan alan kimliğiyle gelir; yeni alan null. Kimlik korunur: stok konumu alana bağlıdır.
  id: kimlik.nullable().default(null),
  tur: alanTuru,
  ad,
  x: konum,
  z: konum,
  donus,
  genislik: olcu(0.2, 500, 'Genişlik'),
  derinlik: olcu(0.2, 500, 'Derinlik'),
  kapi: kapiSemasi.nullable(),
});

export const duvarGovdesi = z.object({
  basX: konum,
  basZ: konum,
  sonX: konum,
  sonZ: konum,
  kalinlik: olcu(0.05, 1, 'Duvar kalınlığı'),
  cam: z.boolean(),
});

// Yerleşim tek parça kaydedilir: düzenleyicide yapılan her değişiklik tek komutla, tek transaction'da yazılır.
// `surum` düzenleyicinin açtığı sürümdür; arada başkası kaydettiyse komut 409 alır.
export const yerlesimGovdesi = z.object({
  surum: z.number().int().min(1).max(TAM_SAYI_UST),
  salon: salonGovdesi.extend({ giris: girisGovdesi }),
  istasyonYerleri: z.array(istasyonYeriGovdesi).max(AZAMI_OGE),
  // Verilmezse bölümün kayıtlı makine yerleri olduğu gibi kalır; boş dizi hepsini kaldırır.
  makineYerleri: z.array(makineYeriGovdesi).max(AZAMI_OGE).optional(),
  raflar: z.array(rafGovdesi).max(AZAMI_OGE),
  alanlar: z.array(alanGovdesi).max(AZAMI_OGE),
  duvarlar: z.array(duvarGovdesi).max(AZAMI_OGE),
  // Verilmezse bölümün kayıtlı geçişleri olduğu gibi kalır; boş dizi hepsini kaldırır.
  gecisler: z.array(gecisGovdesi).max(AZAMI_OGE).optional(),
});

// Fabrika (toplu) kaydı: değişen bölümler tek komutla, tek transaction'da yazılır; her bölüm kendi sürümüyle.
// Öğe bölümler arasında taşınabilir (raf ve istasyon yeri başka bölüme geçer). Bulgu anahtarı `salon:<id>/<öğe>`;
// bölümün kendisi `bolum:<id>`.
export const fabrikaKonumuGovdesi = z.object({
  x: z.number().finite().min(-99999).max(99999),
  z: z.number().finite().min(-99999).max(99999),
  donus,
});
export const fabrikaKayitGovdesi = z.object({
  bolumler: z.array(z.object({ salonId: kimlik, fabrika: fabrikaKonumuGovdesi, yerlesim: yerlesimGovdesi })).min(1).max(50),
});

export const modelKaynakBicimi = z.enum(MODEL_KAYNAK_BICIMLERI);
export const modelBirimi = z.enum(MODEL_BIRIMLERI);
export const yukariEkseni = z.enum(YUKARI_EKSENLERI);

// Modelin yerleşim ayarı: dosya değişmeden düzeltilir.
export const modelAyariGovdesi = z.object({
  ad,
  birim: modelBirimi,
  yukari: yukariEkseni,
  donus,
  sigdir: z.boolean(),
});

// Yükleme başlar: dosyanın boyu ve özeti önceden bildirilir, parçalar ardından gelir, sunucu tamamlarken doğrular.
export const modelGovdesi = modelAyariGovdesi.extend({
  kaynakBicim: modelKaynakBicimi,
  boyutBayt: z.number().int().min(20, 'Dosya boş ya da bozuk.').max(MODEL_AZAMI_BAYT, `Model en çok ${MODEL_AZAMI_BAYT / 1048576} MB olur.`),
  ozet: z.string().regex(/^[0-9a-f]{64}$/, 'Özet SHA-256 onaltılık olmalı.'),
  ucgenSayisi: z.number().int().min(0).max(TAM_SAYI_UST),
});

export const modelAyarlaGovdesi = modelAyariGovdesi.extend({ surum: z.number().int().min(1).max(TAM_SAYI_UST) });

// Kroki (salonun mimari planı, PDF): yükleme modeldeki gibi başlar, parçalarla gelir, sunucu tamamlarken doğrular.
// Salon başına tek kroki; yeni yükleme eskisinin yerine geçer.
export const krokiGovdesi = z.object({
  ad,
  boyutBayt: z.number().int().min(20, 'Dosya boş ya da bozuk.').max(MODEL_AZAMI_BAYT, `Kroki en çok ${MODEL_AZAMI_BAYT / 1048576} MB olur.`),
  ozet: z.string().regex(/^[0-9a-f]{64}$/, 'Özet SHA-256 onaltılık olmalı.'),
  sayfa: z.number().int().min(1, 'Sayfa en az 1.').max(9999),
});
// Hizalama: PDF noktası (punto, sol üst köken) -> salon metresi; ölçek metre/punto, dönüş derece.
export const krokiHizalaGovdesi = z.object({
  surum: z.number().int().min(1).max(TAM_SAYI_UST),
  sayfa: z.number().int().min(1).max(9999),
  olcek: z.number().finite().gt(0, 'Ölçek sıfırdan büyük olmalı.').max(10, 'Ölçek çok büyük (en çok 10 m/punto).'),
  donus: z.number().finite().min(-3600).max(3600),
  x: z.number().finite().min(-100000).max(100000),
  z: z.number().finite().min(-100000).max(100000),
});

// Kalem görünümü: kod (parça no ya da malzeme kodu) makinede işlenen parçanın önizlemesini ve depoda rafta nasıl
// göründüğünü belirler. Rafta model gösterimi model ister; hiçbir şey seçilmemiş görünüm silinerek kaldırılır.
export const kalemAmbalaji = z.enum(KALEM_AMBALAJLARI);
export const raftaGosterim = z.enum(RAFTA_GOSTERIMLERI);
const kalemKodu = z.string().trim().min(1, 'Kod zorunlu.').max(60, 'Kod en çok 60 karakter.');
export const kalemGorunumuGovdesi = z.object({
  kod: kalemKodu,
  modelId: kimlik.nullable(),
  ambalaj: kalemAmbalaji,
  rafta: raftaGosterim,
}).refine((k) => k.rafta === 'paket' || k.modelId !== null, { message: 'Rafta model gösterimi için model seçin.', path: ['modelId'] })
  .refine((k) => k.modelId !== null || k.ambalaj !== 'otomatik', { message: 'Model ya da ambalaj seçin.', path: ['ambalaj'] });
export const kalemSilGovdesi = z.object({ kod: kalemKodu });

// Göz ataması: kalem göze konur, gözün yüzde kaçını doldurduğu elle verilir (adet stok modülünündür).
export const gozKalemiGovdesi = z.object({
  gozId: kimlik,
  kod: kalemKodu,
  ad: z.string().trim().min(1, 'Ad zorunlu.').max(120, 'Ad en çok 120 karakter.'),
  doluluk: z.number().int('Doluluk tam sayı olmalı.').min(1, 'Doluluk en az %1.').max(100, 'Doluluk en çok %100.'),
});
export const gozKalemiSilGovdesi = z.object({ id: kimlik });
export const gozKalemleriSorgusu = z.object({ salonId: yolKimligi.optional() });

// Parça base64 metindir; boyu parça sınırının base64 karşılığını aşmaz.
export const modelParcaGovdesi = z.object({
  sira: z.number().int().min(0).max(100000),
  veri: z.string().min(4).max(Math.ceil(MODEL_PARCA_BAYT / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Parça base64 olmalı.'),
});

export const aramaSorgusu = z.object({
  metin: z.string().trim().min(1, 'Aranacak metin yok.').max(60),
  salonId: yolKimligi.optional(),
});

// Bölme verilirse yalnız o bölmenin gözleri (raf görünümü bir bölmeyle çalışır).
export const gozSorgusu = z.object({ sayfa: z.coerce.number().int().min(1).max(100000).default(1), bolme: z.coerce.number().int().min(1).max(99).optional() });

const noktaSorgusu = z.coerce.number().finite().min(-1000).max(1000);
// Başlangıç verilmezse salonun girişidir.
export const rotaSorgusu = z.object({
  basX: noktaSorgusu.optional(),
  basZ: noktaSorgusu.optional(),
  hedefX: noktaSorgusu,
  hedefZ: noktaSorgusu,
}).refine((s) => (s.basX === undefined) === (s.basZ === undefined), {
  message: 'Başlangıç noktasının iki ekseni birlikte verilir.',
  path: ['basX'],
});

const metinOlcu = ondalikMetinSemasi;
// Kişi adı kişiler modülünden okunur; kişi bulunamazsa ad null'dır (uydurulmaz).
const kaydedenKisi = z.object({ id: kimlik, ad: z.string().nullable() });

// Bölümün fabrika planındaki yeri: sol üst köşesi (metre) ve o köşe çevresindeki dönüşü (derece).
export const fabrikaKonumuSemasi = z.object({ x: metinOlcu, z: metinOlcu, donus: metinOlcu });

export const salonOzetiSemasi = z.object({
  id: kimlik,
  kod: z.string(),
  ad: z.string(),
  genislik: metinOlcu,
  derinlik: metinOlcu,
  hucreBoyu: metinOlcu,
  surum: z.number().int(),
  fabrika: fabrikaKonumuSemasi,
});

export const salonSemasi = salonOzetiSemasi.extend({
  giris: z.object({ x: metinOlcu, z: metinOlcu }).nullable(),
  kaydeden: kaydedenKisi,
  kaydedildi: zaman,
  // Hücre ızgarasının sütun ve satır adları (A, B, ... ve 1, 2, ...).
  sutunlar: z.array(z.string()),
  satirlar: z.array(z.string()),
});

export const makineOzetiSemasi = z.object({
  id: kimlik,
  kod: z.string(),
  ad: z.string(),
  tur: z.string().nullable(),
  markaModel: z.string().nullable(),
});

// İstasyona atanmış modelin gösterimde gereken alanları.
export const istasyonModeliSemasi = z.object({
  id: kimlik,
  ad: z.string(),
  birim: modelBirimi,
  yukari: yukariEkseni,
  donus: metinOlcu,
  sigdir: z.boolean(),
  boyutBayt: z.number().int(),
  parcaSayisi: z.number().int(),
});

// Çizim Merkezi'nde istasyona bağlı, yayındaki 3B model (kart #921). Kütüphane modelinden önce gelir; ayarı
// dosya türünden (CAD mm ve Z yukarı, GLB metre ve Y yukarı) alır ve ayak izine sığdırılır.
export const MERKEZ_MODEL_TURLERI = MODEL_KAYNAK_BICIMLERI;
export const merkezModeliSemasi = z.object({
  belgeId: kimlik,
  ad: z.string(),
  harf: z.string(),
  ozet: z.string(),
  dosyaTuru: z.enum(MERKEZ_MODEL_TURLERI),
});

export const istasyonYeriSemasi = z.object({
  istasyonId: kimlik,
  kod: z.string(),
  ad: z.string(),
  tip: istasyonTipi,
  aktif: z.boolean(),
  x: metinOlcu,
  z: metinOlcu,
  donus: metinOlcu,
  genislik: metinOlcu,
  derinlik: metinOlcu,
  hucre: z.string(),
  makineler: z.array(makineOzetiSemasi),
  model: istasyonModeliSemasi.nullable(),
  merkezModeli: merkezModeliSemasi.nullable(),
});

// Makine yeri: makinenin kendisi, bağlı olduğu istasyon (yoksa null) ve haritadaki kutusu.
export const makineYeriSemasi = z.object({
  makineId: kimlik,
  kod: z.string(),
  ad: z.string(),
  tur: z.string().nullable(),
  markaModel: z.string().nullable(),
  aktif: z.boolean(),
  istasyon: z.object({ id: kimlik, kod: z.string(), ad: z.string(), tip: istasyonTipi, aktif: z.boolean() }).nullable(),
  x: metinOlcu,
  z: metinOlcu,
  donus: metinOlcu,
  genislik: metinOlcu,
  derinlik: metinOlcu,
  hucre: z.string(),
  model: istasyonModeliSemasi.nullable(),
});

export const rafSemasi = z.object({
  id: kimlik,
  kod: z.string(),
  ad: z.string(),
  tur: rafTuru,
  bolmeSayisi: z.number().int(),
  katSayisi: z.number().int(),
  gozSayisi: z.number().int(),
  bolmeGenisligi: metinOlcu,
  derinlik: metinOlcu,
  yukseklik: metinOlcu,
  x: metinOlcu,
  z: metinOlcu,
  donus: metinOlcu,
  aktif: z.boolean(),
  // Rafın boyu: bölme sayısı x bölme genişliği.
  genislik: metinOlcu,
  // Net ölçüler; null: girilmedi (raf türünden hesaplanır).
  katYukseklikleri: z.array(metinOlcu).nullable(),
  gozGenisligi: metinOlcu.nullable(),
  gozDerinligi: metinOlcu.nullable(),
  hucre: z.string(),
});

export const alanSemasi = z.object({
  id: kimlik,
  tur: alanTuru,
  ad: z.string(),
  x: metinOlcu,
  z: metinOlcu,
  donus: metinOlcu,
  genislik: metinOlcu,
  derinlik: metinOlcu,
  kapi: z.object({ kenar: kapiKenari, ofset: metinOlcu, genislik: metinOlcu }).nullable(),
  hucre: z.string(),
});

export const duvarSemasi = z.object({
  id: kimlik,
  basX: metinOlcu,
  basZ: metinOlcu,
  sonX: metinOlcu,
  sonZ: metinOlcu,
  kalinlik: metinOlcu,
  cam: z.boolean(),
});

export const gecisSemasi = z.object({
  id: kimlik,
  tur: gecisTuru,
  kenar: kapiKenari,
  ofset: metinOlcu,
  genislik: metinOlcu,
});

export const yerlesimCevabi = z.object({
  salon: salonSemasi,
  istasyonYerleri: z.array(istasyonYeriSemasi),
  makineYerleri: z.array(makineYeriSemasi),
  raflar: z.array(rafSemasi),
  alanlar: z.array(alanSemasi),
  duvarlar: z.array(duvarSemasi),
  gecisler: z.array(gecisSemasi),
});

// Öğe anahtarı düzenleyicinin gönderdiği diziye göre: istasyon:<istasyonId>, makine:<makineId>, raf:<sıra>, alan:<sıra>, duvar:<sıra>, gecis:<sıra>, giris.
export const bulguSemasi = z.object({
  kural: z.string(),
  mesaj: z.string(),
  ogeler: z.array(z.string()),
});

export const kayitCevabi = yerlesimCevabi.extend({ uyarilar: z.array(bulguSemasi) });

// Kareye atama (kart #1304, ATL-41): Stok Merkezi'nin zemin ızgarasından bir kareye alan türü ya da istasyon verilir. Karede
// merkezi duran alan varsa türü (ve verilirse adı) değişir, yoksa kare boyunda alan açılır; istasyon bu bölümdeyse kareye taşınır,
// yerleşmemişse kareye yerleşir. Başka bölümdeki istasyon buradan taşınmaz.
export const hucreAtaGovdesi = z.object({
  surum: z.number().int().min(1).max(TAM_SAYI_UST),
  hucre: z.string().trim().toUpperCase().regex(/^[A-Z]{1,3}[1-9][0-9]{0,3}$/, 'Kare adı harf ve numaradır (ör. C4).'),
  atama: z.discriminatedUnion('tur', [
    z.object({ tur: z.literal('alan'), alanTuru, ad: ad.optional() }),
    z.object({ tur: z.literal('istasyon'), istasyonId: kimlik }),
  ]),
});

// Fabrika: bütün bölümlerin yerleşimi, fabrika planındaki yerleriyle.
export const fabrikaCevabi = z.object({ bolumler: z.array(yerlesimCevabi) });
export const fabrikaKayitCevabi = fabrikaCevabi.extend({ uyarilar: z.array(bulguSemasi) });

export const salonlarCevabi = z.object({ salonlar: z.array(salonOzetiSemasi) });

export const aramaSonucuSemasi = z.object({
  tur: aramaTuru,
  // Gözde göz kimliği, rafta raf, istasyonda istasyon, alanda alan kimliği.
  kimlik,
  etiket: z.string(),
  ayrinti: z.string(),
  salon: z.object({ id: kimlik, kod: z.string(), ad: z.string() }),
  hucre: z.string(),
  x: metinOlcu,
  z: metinOlcu,
});
export const aramaCevabi = z.object({ sonuclar: z.array(aramaSonucuSemasi) });

export const gozSemasi = z.object({
  id: kimlik,
  adres: z.string(),
  bolme: z.number().int(),
  kat: z.number().int(),
  goz: z.number().int(),
});
export const gozlerCevabi = z.object({
  raf: z.object({ id: kimlik, kod: z.string(), ad: z.string(), aktif: z.boolean() }),
  satirlar: z.array(gozSemasi),
  toplam: z.number().int(),
  sayfaBoyu: z.number().int(),
});

// Rota hesaplanmış bir çizgidir (saklanmaz, numeric sütun değildir): noktalar metre, sayı olarak döner.
// Salonda serbest yer ya da başlangıç yoksa null.
export const rotaCevabi = z.object({
  rota: z.object({
    noktalar: z.array(z.object({ x: z.number(), z: z.number() })),
    uzunluk: z.number(),
  }).nullable(),
});

export const modelSemasi = z.object({
  id: kimlik,
  ad: z.string(),
  kaynakBicim: modelKaynakBicimi,
  boyutBayt: z.number().int(),
  parcaSayisi: z.number().int(),
  ozet: z.string(),
  ucgenSayisi: z.number().int(),
  birim: modelBirimi,
  yukari: yukariEkseni,
  donus: metinOlcu,
  sigdir: z.boolean(),
  // false: yükleme sürüyor ya da yarım kaldı; istasyona atanamaz, silinebilir.
  tamam: z.boolean(),
  surum: z.number().int(),
  kaydeden: kaydedenKisi,
  kaydedildi: zaman,
  // Modelin atandığı istasyon sayısı; sıfır değilse model silinemez.
  kullanim: z.number().int(),
  // Modelin bağlı olduğu kalem kodları (parça önizlemesi, rafta görünüm); boş değilse model silinemez.
  kalemKodlari: z.array(z.string()),
});
export const modellerCevabi = z.object({ modeller: z.array(modelSemasi) });
export const modelParcaYazCevabi = z.object({ alinan: z.number().int() });
export const modelParcaCevabi = z.object({ sira: z.number().int(), veri: z.string() });
export const modelSilCevabi = z.undefined();
export const krokiSemasi = z.object({
  // null: fabrika krokisi (hizalama fabrika metresine); dolu: bölüm krokisi (bölüm metresine).
  salonId: kimlik.nullable(),
  ad: z.string(),
  boyutBayt: z.number().int(),
  parcaSayisi: z.number().int(),
  ozet: z.string(),
  sayfa: z.number().int(),
  // Hizalanmamış krokide null.
  hizalama: z.object({ olcek: metinOlcu, donus: metinOlcu, x: metinOlcu, z: metinOlcu }).nullable(),
  // false: yükleme sürüyor ya da yarım kaldı.
  tamam: z.boolean(),
  surum: z.number().int(),
  kaydeden: kaydedenKisi,
  kaydedildi: zaman,
  // Bölüm krokisi Çizim Merkezi'ndeki belgeden geldiyse o belgenin yayındaki revizyonu; `ozet` krokininkinden farklıysa merkezde
  // yeni revizyon yayınlanmıştır. Fabrika krokisinde ve yerel yüklemede null.
  merkez: z.object({ belgeId: kimlik, ad: z.string(), harf: z.string(), ozet: z.string() }).nullable(),
});
export const krokiCevabi = z.object({ kroki: krokiSemasi.nullable() });
// Çizim Merkezi'nde yayında olan kroki belgeleri (bölüm krokisi seçicisi).
export const merkezKrokileriCevabi = z.object({
  belgeler: z.array(z.object({ id: kimlik, ad: z.string(), harf: z.string(), ozet: z.string() })),
});
export const krokiMerkezdenGovdesi = z.object({ belgeId: z.number().int().min(1).max(TAM_SAYI_UST) });
// İstasyonun Çizim Merkezi modeli (kart #921): seçici yayındaki, sahnede açılan 3B model belgelerini listeler.
// `istasyonlar`: modeli olan aktif istasyonlar (kart #1196); "Ekle" listesi haritada olmayan istasyonu modeliyle gösterir.
export const merkezModelleriCevabi = z.object({
  belgeler: z.array(z.object({ id: kimlik, ad: z.string(), harf: z.string(), ozet: z.string(), dosyaTuru: z.enum(MERKEZ_MODEL_TURLERI) })),
  istasyonlar: z.array(z.object({ istasyonId: kimlik, merkezModeli: merkezModeliSemasi })),
  // Çizim Merkezi'nde eşleşmiş ama yayında modeli olmayan istasyonlar (kart #1258): "Eklenecek makineler"de nedeniyle görünür.
  // İsteğe bağlı: bu alandan önce yazılmış istemci verisi geçerli kalır.
  taslaklar: z.array(z.object({ istasyonId: kimlik, belgeId: kimlik, ad: z.string() })).optional(),
});
// Açık (planlı ya da başlamış) emirlerin malzemelerine Çizim Merkezi'nde bağlı yayındaki 3B modeller (kart #1258): makinede
// üretilen parçanın önizlemesi önce buradan, yoksa harita kütüphanesinin kalem görünümünden gelir.
export const malzemeModelleriCevabi = z.object({ malzemeler: z.array(z.object({ malzemeNo: kimlik, merkezModeli: merkezModeliSemasi })) });
export const malzemeParametresi = z.object({ no: yolKimligi });
// Aktif ama fabrikanın hiçbir bölümüne (istasyon ya da ekipmanıyla) yerleşmemiş istasyonlar (kart #1296): haritanın
// "Yerleşmemiş makineler" süzgeci. `model`: Çizim Merkezi eşleşmesi (yayında, taslak ya da yok).
export const yerlesmemisIstasyonlarCevabi = z.object({
  istasyonlar: z.array(z.object({
    istasyonId: kimlik, kod: z.string(), ad: z.string(), tip: istasyonTipi,
    model: z.object({ ad: z.string(), yayinda: z.boolean() }).nullable(),
  })),
});
// `beklenen` panelin gördüğü bağlı belgedir: arada başkası değiştirdiyse komut 409 alır. `belgeId` null bağı kaldırır.
export const merkezModeliBaglaGovdesi = z.object({ belgeId: kimlik.nullable(), beklenen: kimlik.nullable() });
export const merkezModeliBaglaCevabi = z.object({ merkezModeli: merkezModeliSemasi.nullable() });
// Kalemin malzeme kartı (ATL-36): kod bir kartın stok koduyla eşleşirse dolu, eşleşmezse null. Kod serbest kalır;
// eşleşmeyen kod kaydı engellemez, ekranda uyarı olur.
export const kalemMalzemesiSemasi = z.object({ no: kimlik, stokKodu: z.string(), ad: z.string().nullable() });
export const kalemGorunumuSemasi = z.object({
  kod: z.string(),
  malzeme: kalemMalzemesiSemasi.nullable(),
  model: istasyonModeliSemasi.nullable(),
  ambalaj: kalemAmbalaji,
  rafta: raftaGosterim,
});
export const kalemGorunumleriCevabi = z.object({ kalemler: z.array(kalemGorunumuSemasi) });
export const gozKalemiSemasi = z.object({
  id: kimlik,
  gozId: kimlik,
  adres: z.string(),
  raf: z.object({ id: kimlik, kod: z.string(), ad: z.string() }),
  salon: z.object({ id: kimlik, kod: z.string(), ad: z.string() }),
  bolme: z.number().int(),
  kat: z.number().int(),
  goz: z.number().int(),
  kod: z.string(),
  ad: z.string(),
  malzeme: kalemMalzemesiSemasi.nullable(),
  doluluk: z.number().int(),
  kaydeden: kaydedenKisi,
  kaydedildi: zaman,
});
export const gozKalemleriCevabi = z.object({ kalemler: z.array(gozKalemiSemasi) });

// 409 cevabının ayrıntısı: düzenleyici kimin, ne zaman kaydettiğini gösterir.
export const surumCakismasiSemasi = z.object({
  guncelSurum: z.number().int(),
  kaydeden: kaydedenKisi,
  kaydedildi: zaman,
});

// 422 cevabının ayrıntısı: kayıt kuralları ihlal edildi.
export const ihlalAyrintisiSemasi = z.object({ ihlaller: z.array(bulguSemasi) });

export type RafTuru = z.output<typeof rafTuru>;
export type AlanTuru = z.output<typeof alanTuru>;
export type KapiKenari = z.output<typeof kapiKenari>;
export type AramaTuru = z.output<typeof aramaTuru>;
export type SalonKaydi = z.output<typeof salonGovdesi>;
export type SalonGovdesi = z.input<typeof salonGovdesi>;
export type YerlesimKaydi = z.output<typeof yerlesimGovdesi>;
export type YerlesimGovdesi = z.input<typeof yerlesimGovdesi>;
export type IstasyonYeriKaydi = z.output<typeof istasyonYeriGovdesi>;
export type MakineYeriKaydi = z.output<typeof makineYeriGovdesi>;
export type RafKaydi = z.output<typeof rafGovdesi>;
export type AlanKaydi = z.output<typeof alanGovdesi>;
export type DuvarKaydi = z.output<typeof duvarGovdesi>;
export type KapiKaydi = z.output<typeof kapiSemasi>;
export type GecisTuru = z.output<typeof gecisTuru>;
export type GecisKaydi = z.output<typeof gecisGovdesi>;
export type Gecis = z.output<typeof gecisSemasi>;
export type SalonOzeti = z.output<typeof salonOzetiSemasi>;
export type Salon = z.output<typeof salonSemasi>;
export type MakineOzeti = z.output<typeof makineOzetiSemasi>;
export type IstasyonYeri = z.output<typeof istasyonYeriSemasi>;
export type MakineYeri = z.output<typeof makineYeriSemasi>;
export type Raf = z.output<typeof rafSemasi>;
export type Alan = z.output<typeof alanSemasi>;
export type Duvar = z.output<typeof duvarSemasi>;
export type Bulgu = z.output<typeof bulguSemasi>;
export type YerlesimCevabi = z.output<typeof yerlesimCevabi>;
export type KayitCevabi = z.output<typeof kayitCevabi>;
export type HucreAtaGovdesi = z.output<typeof hucreAtaGovdesi>;
export type SalonlarCevabi = z.output<typeof salonlarCevabi>;
export type AramaSonucu = z.output<typeof aramaSonucuSemasi>;
export type AramaCevabi = z.output<typeof aramaCevabi>;
export type AramaSorgusu = z.input<typeof aramaSorgusu>;
export type Goz = z.output<typeof gozSemasi>;
export type GozlerCevabi = z.output<typeof gozlerCevabi>;
export type RotaSorgusu = z.output<typeof rotaSorgusu>;
export type RotaCevabi = z.output<typeof rotaCevabi>;
export type SurumCakismasi = z.output<typeof surumCakismasiSemasi>;
export type IhlalAyrintisi = z.output<typeof ihlalAyrintisiSemasi>;
export type ModelBirimi = z.output<typeof modelBirimi>;
export type YukariEkseni = z.output<typeof yukariEkseni>;
export type ModelKaynakBicimi = z.output<typeof modelKaynakBicimi>;
export type ModelAyari = z.output<typeof modelAyariGovdesi>;
export type ModelKaydi = z.output<typeof modelGovdesi>;
export type ModelGovdesi = z.input<typeof modelGovdesi>;
export type ModelAyarlaGovdesi = z.input<typeof modelAyarlaGovdesi>;
export type Model = z.output<typeof modelSemasi>;
export type ModellerCevabi = z.output<typeof modellerCevabi>;
export type ModelParcaCevabi = z.output<typeof modelParcaCevabi>;
export type ModelParcaYazCevabi = z.output<typeof modelParcaYazCevabi>;
export type IstasyonModeli = z.output<typeof istasyonModeliSemasi>;
export type MerkezModeli = z.output<typeof merkezModeliSemasi>;
export type MerkezModelleriCevabi = z.output<typeof merkezModelleriCevabi>;
export type YerlesmemisIstasyonlarCevabi = z.output<typeof yerlesmemisIstasyonlarCevabi>;
export type MalzemeModelleriCevabi = z.output<typeof malzemeModelleriCevabi>;
export type MerkezModeliBaglaGovdesi = z.input<typeof merkezModeliBaglaGovdesi>;
export type MerkezModeliBaglaKaydi = z.output<typeof merkezModeliBaglaGovdesi>;
export type MerkezModeliBaglaCevabi = z.output<typeof merkezModeliBaglaCevabi>;
export type Kroki = z.output<typeof krokiSemasi>;
export type FabrikaCevabi = z.output<typeof fabrikaCevabi>;
export type FabrikaKayitCevabi = z.output<typeof fabrikaKayitCevabi>;
export type FabrikaKayitGovdesi = z.input<typeof fabrikaKayitGovdesi>;
export type FabrikaKaydi = z.output<typeof fabrikaKayitGovdesi>;
export type FabrikaKonumu = z.output<typeof fabrikaKonumuSemasi>;
export type KrokiCevabi = z.output<typeof krokiCevabi>;
export type MerkezKrokileriCevabi = z.output<typeof merkezKrokileriCevabi>;
export type KrokiMerkezdenGovdesi = z.input<typeof krokiMerkezdenGovdesi>;
export type KrokiGovdesi = z.input<typeof krokiGovdesi>;
export type KrokiKaydi = z.output<typeof krokiGovdesi>;
export type KrokiHizalaGovdesi = z.input<typeof krokiHizalaGovdesi>;
export type KrokiHizalama = z.output<typeof krokiHizalaGovdesi>;
export type KalemAmbalaji = z.output<typeof kalemAmbalaji>;
export type RaftaGosterim = z.output<typeof raftaGosterim>;
export type KalemMalzemesi = z.output<typeof kalemMalzemesiSemasi>;
export type KalemGorunumu = z.output<typeof kalemGorunumuSemasi>;
export type KalemGorunumleriCevabi = z.output<typeof kalemGorunumleriCevabi>;
export type KalemGorunumuGovdesi = z.input<typeof kalemGorunumuGovdesi>;
export type KalemGorunumuKaydi = z.output<typeof kalemGorunumuGovdesi>;
export type GozKalemi = z.output<typeof gozKalemiSemasi>;
export type GozKalemleriCevabi = z.output<typeof gozKalemleriCevabi>;
export type GozKalemiGovdesi = z.input<typeof gozKalemiGovdesi>;
export type GozKalemiKaydi = z.output<typeof gozKalemiGovdesi>;
