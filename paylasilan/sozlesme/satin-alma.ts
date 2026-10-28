import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { dosyaOzeti } from './dosya.ts';
import { SIPARIS_ODEME_YONTEMLERI } from './finans.ts';
import { KM_TEDARIKCI_DURUMLARI } from './kalite-merkezi.ts';

// Satın alma (sürüm 6): Satın Alma Merkezi'nin veri modelinin Türkçe karşılığı. Talep bütün olarak, sürümle kaydedilir;
// alt kayıt kimlikleri istemcide üretilen uuid'dir. Tutarlar ondalık metindir (float yok).

export const TALEP_DURUMLARI = ['taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda', 'siparis_verildi', 'teslim_alindi', 'iptal'] as const;
export const ONCELIKLER = ['dusuk', 'normal', 'acil'] as const;
export const TEDARIKCI_DURUMLARI = ['onayli', 'deneme', 'askida'] as const;
export const KARAR_MODLARI = ['tek', 'bolunmus'] as const;
export const KALITELER = ['sorunsuz', 'kismi_sorun', 'red_iade'] as const;
export const PARA_BIRIMLERI = ['TRY', 'USD', 'EUR', 'GBP'] as const;
// Stoktaki mal kabulden türetilir (SAT-38).
export const TESLIM_DURUMLARI = ['bekleniyor', 'kismi', 'tamam'] as const;
// Malzemeyi tedarikçi mi getirir, biz mi alırız (kart #1310); boş: belirtilmedi.
export const TESLIM_YONTEMLERI = ['firma_getirir', 'biz_alacagiz'] as const;

export type TalepDurumu = (typeof TALEP_DURUMLARI)[number];
export type Kalite = (typeof KALITELER)[number];

const uuid = z.string().uuid();
const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olur.');
const firmaKimligi = z.number().int().positive().max(2147483647);
const kisiKimligi = z.number().int().positive().max(2147483647);
const eksiOlmayan = ondalikMetinSemasi.refine((d) => !d.startsWith('-'), 'Değer eksi olamaz.');
const yuzde = z.string().regex(/^(100(\.0+)?|\d{1,2}(\.\d+)?)$/, 'Yüzde 0 ile 100 arasında olur.');
const metin = (azami: number) => z.string().max(azami).default('');
const agirlik = z.number().int().min(0).max(100);

export const agirliklarSemasi = z.object({ maliyet: agirlik, termin: agirlik, tedarikci: agirlik, garanti: agirlik });

export const kalemSemasi = z.object({
  id: uuid,
  katalogId: uuid.nullable(),
  ad: z.string().trim().min(1, 'Kalem adı zorunlu.').max(160),
  ozellik: metin(500),
  miktar: ondalikMetinSemasi.nullable(),
  birim: z.string().trim().min(1).max(20),
  kategori: metin(60),
});

export const teklifIstegiSemasi = z.object({ firmaId: firmaKimligi, gonderim: tarih, sonTarih: tarih.nullable() });

export const teklifSemasi = z.object({
  id: uuid,
  firmaId: firmaKimligi.nullable(),
  tedarikciAdi: metin(160),
  teklifTarihi: tarih,
  gecerlilik: tarih.nullable(),
  paraBirimi: z.enum(PARA_BIRIMLERI),
  kur: ondalikMetinSemasi.nullable(),
  iskontoYuzdesi: yuzde,
  nakliye: eksiOlmayan,
  digerMasraf: eksiOlmayan,
  teslimSekli: metin(200),
  nakliyeDahil: z.boolean(),
  terminGun: z.number().int().min(0).max(3650).nullable(),
  vadeGun: z.number().int().min(0).max(3650),
  avansYuzdesi: yuzde,
  garantiAy: z.number().int().min(0).max(600).nullable(),
  teknikUygun: z.boolean(),
  notlar: metin(2000),
  ilkToplam: ondalikMetinSemasi.nullable(),
  revizyon: z.number().int().min(0),
  // Boş fiyat yazılmaz: o kaleme teklif verilmemiştir.
  // 1099 a: satır iskontosu (genel iskontodan önce), satır termini ve en az miktar; boş olan teklifin genel değerine düşer.
  // Gönderilmeyen alan saklanan değeri korur: bu alanları bilmeyen ekran kaydedince silinmez.
  fiyatlar: z.array(z.object({
    kalemId: uuid, birimFiyat: eksiOlmayan,
    iskontoYuzdesi: yuzde.nullable().optional(),
    terminGun: z.number().int().min(0).max(3650).nullable().optional(),
    enAzMiktar: eksiOlmayan.refine((d) => !/^0*(\.0*)?$/.test(d), 'En az miktar sıfırdan büyük olur.').nullable().optional(),
  })).max(500),
});

// İstemci yalnız satın almanın alanlarını yazar; teslim stok mal kabulünde yazılır (SAT-37, SAT-38, SH1 a); kalite GKK gelene kadar boş.
export const siparisSemasi = z.object({
  teklifId: uuid,
  siparisNo: metin(40),
  siparisTarihi: tarih.nullable(),
  beklenenTeslim: tarih.nullable(),
});
export const siparisSatiriSemasi = z.object({
  id: z.number().int(),
  kalemId: uuid,
  miktar: ondalikMetinSemasi,
  birim: z.string(),
  // Stoktaki mal kabulde yazılan net teslim ve son teslim günü; teslim yoksa boş.
  teslimAlinan: ondalikMetinSemasi.nullable(),
  sonTeslimTarihi: z.string().nullable(),
  // Kalanı aşan teslim reddedilmez; sipariş miktarını aşan kısım. Aşma yoksa boş.
  fazlaTeslim: ondalikMetinSemasi.nullable(),
});
// #205 karar 1: siparişin Logo'daki durumu; Logo'ya hiç sıraya girmemiş siparişte (bağlantıdan önce verilmiş) boş. Sunucu yazar.
export const LOGO_DURUMLARI = ['bekliyor', 'gonderildi', 'hata'] as const;
export const siparisLogoSemasi = z.object({
  durum: z.enum(LOGO_DURUMLARI),
  kayitNo: z.string().nullable(),
  hata: z.string().nullable(),
  // Logo'ya gitmiş sipariş iptal edilince Logo'daki kaydın iptali; iptal yoksa boş.
  iptalDurumu: z.enum(LOGO_DURUMLARI).nullable(),
  iptalHata: z.string().nullable(),
  // S2 b: Logo'ya gitmiş siparişin değişikliği Logo'ya düzenleme olarak gider; değişiklik yoksa boş.
  guncellemeDurumu: z.enum(LOGO_DURUMLARI).nullable(),
  guncellemeHata: z.string().nullable(),
  // "Kalanı kapat": Logo'daki siparişin teslim alınmamış kalanı kapatılır; kapatılan siparişe teslim yazılmaz. Açık siparişte boş.
  kapatmaDurumu: z.enum(LOGO_DURUMLARI).nullable(),
  kapatmaHata: z.string().nullable(),
});
export const siparisCikisSemasi = siparisSemasi.extend({
  // TMI'nin verdiği sipariş numarası (Sistem ayarlarındaki numara kuralı; kart #544); `siparisNo` Logo / tedarikçi numarasıdır. Sunucu yazar.
  no: z.string().nullable(),
  satirlar: z.array(siparisSatiriSemasi),
  teslimDurumu: z.enum(TESLIM_DURUMLARI),
  // GKK sonucunun satın almadaki karşılığı; GKK kalite modülüyle gelecek (SH2 b), o zamana kadar boş.
  kalite: z.enum(KALITELER).nullable(),
  logo: siparisLogoSemasi.nullable(),
});

export const kararSemasi = z.object({
  mod: z.enum(KARAR_MODLARI),
  teklifId: uuid.nullable(),
  bolunme: z.array(z.object({ kalemId: uuid, teklifId: uuid })).max(500),
  gerekce: metin(2000),
  kararVerenKisiId: kisiKimligi.nullable(),
  kararTarihi: tarih,
  ogrenilenler: metin(4000),
  // 1096 a: kur ve faiz karar onaya gönderilince sunucuda sabitlenir; istemcinin gönderdiği değer yok sayılır.
  sabitKurlar: z.array(z.object({ paraBirimi: z.enum(PARA_BIRIMLERI), kur: ondalikMetinSemasi, aylikFaizYuzdesi: ondalikMetinSemasi.nullable().optional() })).max(4),
  siparisler: z.array(siparisSemasi).max(100),
  kurKilidi: z.string().nullable().optional(),
});

// Onay ve geçmiş yalnız eklenir: kayıtta yeni kimlikler eklenir, var olanlar değişmez; kişi ve zaman sunucunundur.
export const onaySemasi = z.object({
  id: uuid,
  zaman: z.string(),
  kisiId: kisiKimligi.nullable(),
  kisiAdi: z.string().nullable(),
  sonuc: z.enum(['onay', 'ret']),
  dortGozsuz: z.boolean(),
  notlar: metin(2000),
});
export const hareketSemasi = z.object({
  id: uuid,
  zaman: z.string(),
  kisiId: kisiKimligi.nullable(),
  kisiAdi: z.string().nullable(),
  metin: z.string().trim().min(1).max(1000),
});
export const senaryoSemasi = z.object({
  id: uuid,
  ad: z.string().trim().min(1).max(80),
  kisiId: kisiKimligi.nullable(),
  kisiAdi: z.string().nullable(),
  olusturma: z.string(),
  paylar: z.array(z.object({ kalemId: uuid, teklifId: uuid, miktar: eksiOlmayan })).max(5000),
  dengeler: z.array(z.object({ kalemId: uuid, denge: ondalikMetinSemasi.nullable() })).max(500),
});

const talepAlanlari = {
  id: uuid,
  baslik: z.string().trim().min(1, 'Başlık zorunlu.').max(160),
  birim: z.string().max(60).nullable(),
  talepEdenKisiId: kisiKimligi.nullable(),
  oncelik: z.enum(ONCELIKLER),
  ihtiyacTarihi: tarih.nullable(),
  notlar: metin(4000),
  durum: z.enum(TALEP_DURUMLARI),
  iptalNedeni: metin(500),
  // Talebin açıldığı üretim emri; yalnız açık (planlı ya da başlamış) emir seçilir. Boş: emre bağlı değil.
  uretimEmriId: z.number().int().positive().max(2147483647).nullable().default(null),
  agirliklar: agirliklarSemasi.nullable(),
  kalemler: z.array(kalemSemasi).max(200),
  teklifIstekleri: z.array(teklifIstegiSemasi).max(50),
  teklifler: z.array(teklifSemasi).max(30),
  karar: kararSemasi.nullable(),
  onaylar: z.array(onaySemasi).max(200),
  hareketler: z.array(hareketSemasi).max(2000),
  senaryolar: z.array(senaryoSemasi).max(30),
};

// Komut gövdesi: istemcinin bütünü. Sunucunun verdiği alanlar (no, olusturma, ad alanları) gövdede yok sayılır.
export const talepGovdesi = z.object(talepAlanlari);
export const talepKaydetGovdesi = z.object({ ...talepAlanlari, ...beklenenSurum });
export const talepSilGovdesi = z.object(beklenenSurum);
// Borç 36: siparişi verilmiş kalemin miktarı ya da birimi onay yetkilisince, gerekçeyle değişir; değişiklik talebin hareketine yazılır.
export const siparisKalemiDegistirGovdesi = z.object({
  kalemId: uuid,
  miktar: ondalikMetinSemasi.refine((d) => !d.startsWith('-') && Number(d) > 0, 'Miktar sıfırdan büyük olur.'),
  birim: z.string().trim().min(1).max(20),
  gerekce: z.string().trim().min(1, 'Gerekçe zorunlu.').max(500),
  ...beklenenSurum,
});
// Logo'ya gitmiş siparişin kalanı satın almacının komutuyla, gerekçeyle kapatılır; gerekçe talebin hareketine yazılır.
// "Biz alacağız" seçilen talebin siparişi sevkiyat bekleme listesine alım olarak düşer (kart #1310).
export const teslimYontemiGovdesi = z.object({ teslimYontemi: z.enum(TESLIM_YONTEMLERI).nullable(), ...beklenenSurum });
export const siparisKapatGovdesi = z.object({
  teklifId: uuid,
  gerekce: z.string().trim().min(1, 'Gerekçe zorunlu.').max(500),
  ...beklenenSurum,
});

// Kart #1124: siparişin ödeme planı (finansın beklenen ödemesi) ve takip satırları. Plan siparişe çevrilirken tekliften dolar
// (avans sipariş tarihinde, kalan beklenen teslim + vade gününde); satın almacı tarih, tutar ve ödeme şeklini değiştirir.
export const ODEME_PLANI_TURLERI = ['avans', 'vade'] as const;
export const odemePlaniSatiri = z.object({
  tur: z.enum(ODEME_PLANI_TURLERI),
  vade: tarih,
  yontem: z.enum(SIPARIS_ODEME_YONTEMLERI),
  tutar: ondalikMetinSemasi.refine((t) => /^\d{1,16}(\.\d{1,2})?$/.test(t) && Number(t) > 0, 'Tutar sıfırdan büyük, en çok iki ondalıklı olur.'),
});
export const odemePlaniGovdesi = z.object({
  teklifId: uuid,
  satirlar: z.array(odemePlaniSatiri).min(1, 'Ödeme planında en az bir satır olur.').max(12),
  ...beklenenSurum,
});
export const siparisTakibiCevabi = z.object({
  siparisler: z.array(z.object({
    teklifId: uuid,
    // Stok mal kabulündeki irsaliyeyi sipariş satırından okumak için (GET /stok/siparis-irsaliyeleri).
    satirIdleri: z.array(z.number().int()),
    paraBirimi: z.string(),
    odemePlani: z.array(odemePlaniSatiri),
    // Bağlı alış faturaları (finansta girilir); tutar gelmez (FNS-48).
    faturalar: z.array(z.object({ belgeNo: z.string().nullable(), belgeTarihi: tarih, vade: tarih })),
  })),
});
export type OdemePlaniSatiri = z.output<typeof odemePlaniSatiri>;
export type OdemePlaniYazimi = z.output<typeof odemePlaniGovdesi>;
export type SiparisTakibiCevabi = z.output<typeof siparisTakibiCevabi>;

// Karar verenin adı yalnız çıkışta: kişi sunucunun verdiği alandır, gövdede gelmez (B-001).
// Kur kilidinin zamanı sunucunundur (1096 a); kilitsiz kararda (eski akış) boş.
export const kararCikisSemasi = kararSemasi.extend({ siparisler: z.array(siparisCikisSemasi), kararVerenAdi: z.string().nullable() });

export const talepSemasi = z.object({
  ...talepAlanlari,
  karar: kararCikisSemasi.nullable(),
  teslimYontemi: z.enum(TESLIM_YONTEMLERI).nullable(),
  no: z.string(),
  uretimEmriNo: z.string().nullable(),
  talepEdenAdi: z.string().nullable(),
  acanKisiId: z.number().int(),
  surum: surumSemasi,
  olusturma: z.string(),
  guncelleme: z.string(),
});

// Talep formunun üretim emri seçimi: açık emirler.
export const acikEmirlerCevabi = z.object({
  emirler: z.array(z.object({ id: z.number().int(), emirNo: z.string(), parcaNo: z.string(), parcaAd: z.string() })),
});
export type AcikEmirlerCevabi = z.output<typeof acikEmirlerCevabi>;

// İş kutusunun salt okunur "Stokta olmayan malzeme istekleri" kartı: stoğun karşılayamadığı açık istekler, en eski önce.
// Malzeme kartı ya da emir okunamıyorsa ilgili alan null gelir; miktar ondalık metindir.
export const stokYokIstegiSemasi = z.object({
  id: z.number().int(),
  no: z.string(),
  malzemeKodu: z.string().nullable(),
  malzemeAdi: z.string().nullable(),
  miktar: ondalikMetinSemasi,
  birim: z.string().nullable(),
  emirNo: z.string().nullable(),
  acilma: zamanSemasi,
});
export const stokYokIstekleriCevabi = z.object({ istekler: z.array(stokYokIstegiSemasi) });
export type StokYokIstegi = z.output<typeof stokYokIstegiSemasi>;
export type StokYokIstekleriCevabi = z.output<typeof stokYokIstekleriCevabi>;

export const tedarikciSemasi = z.object({
  firmaId: firmaKimligi,
  // Firma alanları finans modülünden gelir (salt okunur; firma finansta açılır ve düzenlenir).
  ad: z.string(),
  vergiNo: z.string().nullable(),
  yetkili: z.string().nullable(),
  telefon: z.string().nullable(),
  eposta: z.string().nullable(),
  sehir: z.string().nullable(),
  firmaAktif: z.boolean(),
  // Finans özetinde firma sürümü yok; finans verene kadar boş (satın alma firmayı yazmaz).
  firmaSurum: surumSemasi.nullable(),
  // 236 a: satın almanın eski durum sütunu; artık yazılmaz ve siparişi engellemez, yalnız gösterilir.
  durum: z.enum(TEDARIKCI_DURUMLARI),
  // 236 a: tedarikçi onay durumunun sahibi Kalite Merkezi'dir; kaydı yoksa null. "Aday" ve "Askıda" tedarikçiye sipariş verilmez.
  kaliteDurumu: z.enum(KM_TEDARIKCI_DURUMLARI).nullable(),
  puan: z.number().int().min(1).max(5),
  notlar: z.string(),
  kategoriler: z.array(z.string()),
  degerlendirmeler: z.array(z.object({
    id: uuid, tarih, puan: z.number().int().min(1).max(5), metin: z.string(), degerlendiren: z.string(),
    kisiId: z.number().int().nullable(), kisiAdi: z.string().nullable(),
  })),
  surum: surumSemasi,
  olusturma: z.string(),
});
export const tedarikciKaydetGovdesi = z.object({
  firmaId: firmaKimligi,
  puan: z.number().int().min(1).max(5),
  notlar: metin(2000),
  kategoriler: z.array(z.string().trim().min(1).max(60)).max(50),
  // Yeni değerlendirmeler eklenir; var olanlar değişmez.
  degerlendirmeler: z.array(z.object({
    id: uuid, tarih, puan: z.number().int().min(1).max(5), metin: metin(2000), degerlendiren: metin(120),
  })).max(500),
  // Yeni tedarikçide null; var olanda okunan sürüm.
  surum: surumSemasi.nullable(),
});

// SA2 b: katalog kalemi malzeme kartına bağlıdır; kod, ad, kategori ve birim karttan okunur. Kalem yalnız "Malzemeler ve Hizmetler"de açılır.
export const katalogSemasi = z.object({
  id: uuid,
  kod: z.string(),
  ad: z.string(),
  kategori: z.string(),
  birim: z.string(),
  ozellik: z.string(),
  notlar: z.string(),
  takmaAdlari: z.array(z.string()),
  // Malzeme katalog kartının sayı kimliği.
  malzemeNo: z.number().int(),
  surum: surumSemasi,
  olusturma: z.string(),
});
export const katalogKaydetGovdesi = z.object({
  id: uuid,
  malzemeNo: z.number().int().positive().max(2147483647),
  ozellik: metin(500),
  notlar: metin(2000),
  takmaAdlari: z.array(z.string().trim().min(1).max(160)).max(50),
  surum: surumSemasi.nullable(),
});
export const katalogSilGovdesi = z.object(beklenenSurum);

export const ayarlarSemasi = z.object({
  sirket: z.string(),
  agirliklar: agirliklarSemasi,
  gecerlilikGun: z.number().int(),
  enAzTeklif: z.number().int(),
  fiyatUyariYuzdesi: ondalikMetinSemasi,
  // Güncel kur ve aylık faiz finanstan (SA3 a, 937 b); finansta kaydı olmayan para biriminde boş. Kur tarihi, gelen kurların en eskisinin günü.
  kurTarihi: z.string().nullable(),
  kurlar: z.array(z.object({ paraBirimi: z.enum(PARA_BIRIMLERI), kur: ondalikMetinSemasi.nullable(), aylikFaizYuzdesi: ondalikMetinSemasi.nullable() })),
  kategoriler: z.array(z.string()),
  birimler: z.array(z.object({ ad: z.string(), yillikButce: ondalikMetinSemasi })),
  onayLimitleri: z.array(z.object({ azamiTutar: ondalikMetinSemasi.nullable(), seviye: z.string() })),
  surum: surumSemasi,
});
// Şirket adının esası satın alma ayarıdır (A7, #514); boşsa null. Finans ekranı adı buradan gösterir.
export const sirketAdiCevabi = z.object({ sirketAdi: z.string().nullable() });
export const ayarlarKaydetGovdesi = z.object({
  sirket: metin(120),
  agirliklar: agirliklarSemasi,
  gecerlilikGun: z.number().int().min(1).max(365),
  enAzTeklif: z.number().int().min(1).max(20),
  fiyatUyariYuzdesi: eksiOlmayan,
  // Yalnız para birimi listesi ve sırası; kur ve faiz finansın tablosuna finans uçlarıyla yazılır (937 b).
  kurlar: z.array(z.object({ paraBirimi: z.enum(PARA_BIRIMLERI) })).min(1).max(4),
  kategoriler: z.array(z.string().trim().min(1).max(60)).max(100),
  birimler: z.array(z.object({ ad: z.string().trim().min(1).max(60), yillikButce: eksiOlmayan })).max(100),
  onayLimitleri: z.array(z.object({ azamiTutar: eksiOlmayan.nullable(), seviye: z.string().trim().min(1).max(80) })).max(20),
  ...beklenenSurum,
});

export const acilisCevabi = z.object({
  kullanici: z.object({ id: z.number().int(), ad: z.string() }),
  talepler: z.array(talepSemasi),
  tedarikciler: z.array(tedarikciSemasi),
  // Teklif seçicisi için: aktif, tedarikçi olabilen ama henüz satın alma tedarikçisi olmayan firma kartları.
  firmaKartlari: z.array(z.object({ id: firmaKimligi, ad: z.string() })),
  katalog: z.array(katalogSemasi),
  ayarlar: ayarlarSemasi,
});

// Tedarikçi eklerken finanstaki firmayı seçmek için arama (kullanıcı kararı S1, 07.10.2026).
export const firmaSecenekleriSorgusu = z.object({ ara: z.string().trim().min(2).max(80) });
// D6 b (kullanıcı kararı 11.10.2026): sipariş finanstaki alış faturasına bağlanır; bağı satın alma yazar (ADR 0006).
// Liste tutar taşımaz (FNS-48).
export const siparisFaturalariSorgusu = z.object({ talepId: uuid, teklifId: uuid });
export const siparisFaturasiSemasi = z.object({
  id: z.number().int(),
  belgeNo: z.string().nullable(),
  belgeTarihi: z.string(),
  aciklama: z.string().nullable(),
  bagli: z.boolean(),
  baskaSipariste: z.boolean(),
});
export const siparisFaturalariCevabi = z.object({ faturalar: z.array(siparisFaturasiSemasi) });
export const siparisFaturasiGovdesi = z.object({ teklifId: uuid, belgeId: z.number().int().positive().max(2147483647), bagla: z.boolean() });
export const firmaSecenekleriCevabi = z.object({
  firmalar: z.array(z.object({ id: firmaKimligi, ad: z.string(), tedarikci: z.boolean() })),
});

// SA2 b: kataloğa bağlanacak aktif malzeme kartı aranır; kataloğa bağlı olan işaretli.
// Sertifika ve rapor sipariş satırına bağlanır (kullanıcı isteği 13.10.2026): belge Çizimler'de açılır ve yayınlanır, satır
// kayıttan görünür; stok mal kabulde satırın belgesini okur. İstemci dosyayı önce `/dosyalar/:ozet/parca` ile yükler.
export const SIPARIS_BELGE_TURLERI = ['sertifika', 'rapor'] as const;
export const siparisSatiriParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const siparisBelgesiParametresi = z.object({
  id: z.coerce.number().int().positive().max(2147483647), belgeId: z.coerce.number().int().positive().max(2147483647),
});
export const siparisBelgesiGovdesi = z.object({
  tur: z.enum(SIPARIS_BELGE_TURLERI),
  ad: z.string().trim().min(1, 'Belge adı zorunlu.').max(120),
  ozet: dosyaOzeti,
  dosyaAdi: z.string().trim().min(1, 'Dosya adı zorunlu.').max(120),
}).strict();
export const siparisBelgesiSemasi = z.object({ id: z.number().int(), ad: z.string(), tur: z.string(), harf: z.string().nullable() });
export const siparisBelgeleriCevabi = z.object({ belgeler: z.array(siparisBelgesiSemasi) });
export type SiparisBelgesi = z.output<typeof siparisBelgesiSemasi>;
export type SiparisBelgesiYazimi = z.output<typeof siparisBelgesiGovdesi>;
export type SiparisBelgeleriCevabi = z.output<typeof siparisBelgeleriCevabi>;
// Talep türü (#1192): malzeme talebi fiziksel kartları, hizmet talebi yalnız alınan hizmet kartlarını seçer.
export const TALEP_TURLERI = ['malzeme', 'hizmet'] as const;
export type TalepTuru = (typeof TALEP_TURLERI)[number];
// Boş arama açılır listenin ilk sayfasıdır.
export const malzemeSecenekleriSorgusu = z.object({ ara: z.string().trim().max(80).default(''), tur: z.enum(TALEP_TURLERI).default('malzeme') });
export const malzemeSecenekleriCevabi = z.object({
  malzemeler: z.array(z.object({
    no: z.number().int(), kod: z.string(), ad: z.string(), birim: z.string().nullable(), kategori: z.string().nullable(), katalogId: uuid.nullable(),
  })),
});

// Ana sayfadan talep (kart #375): talep eden kalemi malzeme kartından seçer ya da adıyla yazar ("kart bekliyor").
// Kişi alanı yoktur: talep oturumdaki kişi adına açılır, gövdede gelen başka alan yok sayılır.
export const hizliKalemSemasi = z.object({
  malzemeNo: z.number().int().positive().max(2147483647).nullable().default(null),
  ad: z.string().trim().max(160).default(''),
  birim: z.string().trim().max(20).default(''),
  miktar: ondalikMetinSemasi.refine((d) => !d.startsWith('-') && Number(d) > 0, 'Miktar sıfırdan büyük olur.'),
  aciklama: metin(500),
  // 898 a: hizmet kalemi hangi parça ya da malzeme üzerinde yapılacak; fason ön talepten gelen kalem iş emrini taşır. İkisi yalnız hizmette.
  uygulananMalzemeNo: z.number().int().positive().max(2147483647).nullable().default(null),
  isEmriId: z.number().int().positive().max(2147483647).nullable().default(null),
});
export const hizliAcGovdesi = z.object({
  id: uuid,
  tur: z.enum(TALEP_TURLERI).default('malzeme'),
  ihtiyacTarihi: tarih.nullable().default(null),
  aciklama: metin(4000),
  uretimEmriId: z.number().int().positive().max(2147483647).nullable().default(null),
  kalemler: z.array(hizliKalemSemasi).min(1, 'En az bir kalem girin.').max(50),
});
// Talep edenin gördüğü: fiyat, teklif, tedarikçi, karar, bütçe, kur yok.
export const talebimSemasi = z.object({
  id: uuid,
  no: z.string(),
  baslik: z.string(),
  durum: z.enum(TALEP_DURUMLARI),
  ihtiyacTarihi: z.string().nullable(),
  olusturma: z.string(),
  uretimEmriNo: z.string().nullable(),
  // 898 a: fason ön talepten açılan talep "fason", gerisi "elle". Kalemde uygulanan parça ("kod · ad") ve fason adım ("emir no · Op n").
  kaynak: z.enum(['elle', 'fason']),
  kalemler: z.array(z.object({
    ad: z.string(), miktar: z.string().nullable(), birim: z.string(), kartBekliyor: z.boolean(), uygulanan: z.string().nullable(), fasonAdim: z.string().nullable(),
  })),
});
export const taleplerimSorgusu = z.object({ sinir: z.coerce.number().int().min(1).max(500).default(10) });
export const taleplerimCevabi = z.object({ talepler: z.array(talebimSemasi), toplam: z.number().int() });

// 898 a: ön talep. Fason: açık emrin, siparişe ve açık talebe bağlanmamış, yoksayılmamış fason iş emri. Gereken tarih emrin teslim günüdür
// (plan tarihi satın almaya gelmez); yoksa null. Firma rotadaki fason firmadır. Miktar emrin adedi, birim adet.
export const onTalepSemasi = z.object({
  kaynak: z.literal('fason'),
  isEmriId: z.number().int(),
  uretimEmriId: z.number().int(),
  emirNo: z.string(),
  opNo: z.number().int(),
  adim: z.string().nullable(),
  parca: z.object({ no: z.number().int(), kod: z.string(), ad: z.string() }).nullable(),
  urun: z.string().nullable(),
  miktar: z.number().int(),
  birim: z.string(),
  gerekenTarih: z.string().nullable(),
  terminGun: z.number().int().nullable(),
  firmaAdi: z.string().nullable(),
});
export const yoksayilanOnTalepSemasi = z.object({
  id: z.number().int(), kaynak: z.literal('fason'), baslik: z.string(), neden: z.string(), kisiAdi: z.string().nullable(), zaman: z.string(),
});
export const onTalepleriCevabi = z.object({ onTalepler: z.array(onTalepSemasi), yoksayilanlar: z.array(yoksayilanOnTalepSemasi) });
export const onTalepYoksayGovdesi = z.object({
  kaynak: z.literal('fason'),
  isEmriId: z.number().int().positive().max(2147483647),
  neden: z.string().trim().min(1, 'Nedeni yazın.').max(200),
});
export const onTalepGeriAlGovdesi = z.object({ id: z.number().int().positive().max(2147483647) });
export type OnTalep = z.output<typeof onTalepSemasi>;
export type YoksayilanOnTalep = z.output<typeof yoksayilanOnTalepSemasi>;
export type OnTalepleriCevabi = z.output<typeof onTalepleriCevabi>;
export type OnTalepYoksayYazimi = z.output<typeof onTalepYoksayGovdesi>;

export const talepParametresi = z.object({ id: uuid });
export const firmaParametresi = z.object({ id: z.coerce.number().int().positive().max(2147483647) });
export const tamamCevabi = z.object({ tamam: z.literal(true) });

export type Talep = z.output<typeof talepSemasi>;
export type TalepGovdesi = z.input<typeof talepGovdesi>;
export type TalepYazimi = z.output<typeof talepGovdesi>;
export type TalepKaydetYazimi = z.output<typeof talepKaydetGovdesi>;
export type SiparisKalemiDegistirYazimi = z.output<typeof siparisKalemiDegistirGovdesi>;
export type SiparisKapatYazimi = z.output<typeof siparisKapatGovdesi>;
export type TeslimYontemiYazimi = z.output<typeof teslimYontemiGovdesi>;
export type TeslimYontemi = (typeof TESLIM_YONTEMLERI)[number];
export type SiparisFaturasiYazimi = z.output<typeof siparisFaturasiGovdesi>;
export type SiparisFaturalariCevabi = z.output<typeof siparisFaturalariCevabi>;
export type Kalem = z.output<typeof kalemSemasi>;
export type Teklif = z.output<typeof teklifSemasi>;
export type Karar = z.output<typeof kararSemasi>;
export type KararCikisi = z.output<typeof kararCikisSemasi>;
export type SiparisCikisi = z.output<typeof siparisCikisSemasi>;
export type SiparisLogo = z.output<typeof siparisLogoSemasi>;
export type TeslimDurumu = (typeof TESLIM_DURUMLARI)[number];
export type Onay = z.output<typeof onaySemasi>;
export type Hareket = z.output<typeof hareketSemasi>;
export type Senaryo = z.output<typeof senaryoSemasi>;
export type Tedarikci = z.output<typeof tedarikciSemasi>;
export type TedarikciKaydetYazimi = z.output<typeof tedarikciKaydetGovdesi>;
export type KatalogKaydi = z.output<typeof katalogSemasi>;
export type KatalogKaydetYazimi = z.output<typeof katalogKaydetGovdesi>;
export type Ayarlar = z.output<typeof ayarlarSemasi>;
export type AyarlarKaydetYazimi = z.output<typeof ayarlarKaydetGovdesi>;
export type SirketAdiCevabi = z.output<typeof sirketAdiCevabi>;
export type AcilisCevabi = z.output<typeof acilisCevabi>;
export type FirmaSecenekleriCevabi = z.output<typeof firmaSecenekleriCevabi>;
export type MalzemeSecenekleriCevabi = z.output<typeof malzemeSecenekleriCevabi>;
export type HizliAcYazimi = z.output<typeof hizliAcGovdesi>;
export type HizliKalem = z.output<typeof hizliKalemSemasi>;
export type Talebim = z.output<typeof talebimSemasi>;
export type TaleplerimCevabi = z.output<typeof taleplerimCevabi>;

// Ekranın tipli çağrısı (istemci/src/ortak/veri/uc-cagrisi.ts).
export interface SatinAlmaUclari {
  'GET /satin-alma-menu-sayaclari': { cevap: Record<string, number | null> };
  'GET /satin-alma/ozet': { cevap: SatinAlmaOzetiCevabi };
  'GET /satin-alma-dis-operasyonlar': { cevap: DisOperasyonlarCevabi };
  'GET /satin-alma-fason-sureleri': { sorgu: z.input<typeof fasonSureleriSorgusu>; cevap: FasonSureleriCevabi };
  'GET /satin-alma-acilis': { cevap: AcilisCevabi };
  'GET /satin-alma-acik-emirler': { cevap: AcikEmirlerCevabi };
  'POST /satin-alma-talepleri/ac': { govde: z.input<typeof talepGovdesi>; cevap: Talep };
  'GET /satin-alma-taleplerim': { sorgu: z.input<typeof taleplerimSorgusu>; cevap: TaleplerimCevabi };
  'POST /satin-alma-talepleri/hizli-ac': { govde: z.input<typeof hizliAcGovdesi>; cevap: Talebim };
  'GET /satin-alma-on-talepleri': { cevap: OnTalepleriCevabi };
  'POST /satin-alma-on-talepleri/yoksay': { govde: z.input<typeof onTalepYoksayGovdesi>; cevap: { tamam: true } };
  'POST /satin-alma-on-talepleri/geri-al': { govde: z.input<typeof onTalepGeriAlGovdesi>; cevap: { tamam: true } };
  'POST /satin-alma-talepleri/:id/kaydet': { govde: z.input<typeof talepKaydetGovdesi>; cevap: Talep };
  'POST /satin-alma-talepleri/:id/sil': { govde: z.input<typeof talepSilGovdesi>; cevap: { tamam: true } };
  'POST /satin-alma-talepleri/:id/siparis-kalemi-degistir': { govde: z.input<typeof siparisKalemiDegistirGovdesi>; cevap: Talep };
  'POST /satin-alma-talepleri/:id/siparis-kapat': { govde: z.input<typeof siparisKapatGovdesi>; cevap: Talep };
  'POST /satin-alma-talepleri/:id/teslim-yontemi': { govde: z.input<typeof teslimYontemiGovdesi>; cevap: Talep };
  'GET /satin-alma-talepleri/:id/siparis-takibi': { cevap: SiparisTakibiCevabi };
  'GET /satin-alma-talepleri/:id/degerlendirme': { cevap: DegerlendirmeCevabi };
  'GET /satin-alma-talepleri/:id/kart-ayrintilari': { cevap: KartAyrintilariCevabi };
  'POST /satin-alma-talepleri/:id/odeme-plani': { govde: z.input<typeof odemePlaniGovdesi>; cevap: SiparisTakibiCevabi };
  'GET /satin-alma-siparis-satirlari/:id/belgeler': { cevap: SiparisBelgeleriCevabi };
  'POST /satin-alma-siparis-satirlari/:id/belge-ekle': { govde: z.input<typeof siparisBelgesiGovdesi>; cevap: SiparisBelgeleriCevabi };
  'POST /satin-alma-siparis-satirlari/:id/belgeler/:belgeId/kaldir': { cevap: SiparisBelgeleriCevabi };
  'GET /satin-alma-siparis-faturalari': { sorgu: z.input<typeof siparisFaturalariSorgusu>; cevap: SiparisFaturalariCevabi };
  'POST /satin-alma-talepleri/:id/siparis-faturasi': { govde: z.input<typeof siparisFaturasiGovdesi>; cevap: SiparisFaturalariCevabi };
  'GET /satin-alma-firma-secenekleri': { sorgu: z.input<typeof firmaSecenekleriSorgusu>; cevap: FirmaSecenekleriCevabi };
  'POST /satin-alma-tedarikcileri/kaydet': { govde: z.input<typeof tedarikciKaydetGovdesi>; cevap: Tedarikci };
  'POST /satin-alma-tedarikcileri/:id/sil': { cevap: { tamam: true } };
  'GET /satin-alma-malzeme-secenekleri': { sorgu: z.input<typeof malzemeSecenekleriSorgusu>; cevap: MalzemeSecenekleriCevabi };
  'POST /satin-alma-katalogu/kaydet': { govde: z.input<typeof katalogKaydetGovdesi>; cevap: KatalogKaydi };
  'POST /satin-alma-katalogu/:id/sil': { govde: z.input<typeof katalogSilGovdesi>; cevap: { tamam: true } };
  'POST /satin-alma-ayarlari/kaydet': { govde: z.input<typeof ayarlarKaydetGovdesi>; cevap: Ayarlar };
  'GET /satin-alma-ayarlari/sirket-adi': { cevap: SirketAdiCevabi };
  'GET /satin-alma-kg-fiyatlari': { cevap: KgFiyatlariCevabi };
  'GET /satin-alma-kg-fiyatlari/gecmis': { sorgu: z.input<typeof kgFiyatiGecmisiSorgusu>; cevap: KgFiyatiGecmisiCevabi };
  'POST /satin-alma-kg-fiyatlari/ekle': { govde: KgFiyatiEkleGovdesi; cevap: KgFiyatlariCevabi };
  'GET /satin-alma-kg-fiyatlari/malzemeler': { sorgu: z.input<typeof malzemeKgFiyatlariSorgusu>; cevap: MalzemeKgFiyatlariCevabi };
  'GET /satin-alma-tedarik-terminleri': { cevap: TedarikTerminleriCevabi };
  'POST /satin-alma-tedarik-terminleri/kaydet': { govde: z.input<typeof tedarikTerminiKaydetGovdesi>; cevap: TedarikTerminiKaydetCevabi };
}

// 1094 b: teklif karşılaştırmasının sunucudaki hesabı. Tutarlar TL ve ondalık metindir (2 basamak); puanlar 0-100.
// Karar onaydaysa ya da sipariş verildiyse sabit kur ve faizle, değilse finansın bugünkü kuru ve faiziyle hesaplanır (1096 a).
const kriterSayilari = z.object({ maliyet: z.number(), termin: z.number(), tedarikci: z.number(), garanti: z.number() });
export const degerlendirmeCevabi = z.object({
  kurKaynagi: z.enum(['sabit', 'guncel']),
  kurKilidi: z.string().nullable(),
  // Sabit kur 7 günü geçtiyse ya da kur %3'ten fazla saptıysa siparişi durduracak ileti; yoksa boş.
  kilitUyarisi: z.string().nullable(),
  agirliklar: agirliklarSemasi,
  teklifler: z.array(z.object({
    teklifId: uuid,
    firmaId: firmaKimligi.nullable(),
    disarida: z.enum(['teknik', 'kursuz', 'fiyatsiz']).nullable(),
    kur: ondalikMetinSemasi.nullable(),
    toplam: ondalikMetinSemasi,
    tlToplam: ondalikMetinSemasi.nullable(),
    bugunkuDeger: ondalikMetinSemasi.nullable(),
    vadeKazanci: ondalikMetinSemasi.nullable(),
    vadeHesabaKatilmadi: z.boolean(),
    kapsanan: z.number().int(),
    tumKalemler: z.boolean(),
    termin: z.number().int().nullable(),
    gecikmeGun: z.number().int().nullable(),
    puan: z.number(),
    kriterPuani: kriterSayilari,
    satirlar: z.array(z.object({ kalemId: uuid, alinanMiktar: ondalikMetinSemasi, tutar: ondalikMetinSemasi, bugunkuDegerTl: ondalikMetinSemasi.nullable(), termin: z.number().int().nullable() })),
  })),
  sira: z.array(uuid),
  oneri: uuid.nullable(),
  bolme: z.object({
    atama: z.array(z.object({ kalemId: uuid, teklifId: uuid })),
    bugunkuDeger: ondalikMetinSemasi,
    tekTedarikci: ondalikMetinSemasi.nullable(),
    kazanc: ondalikMetinSemasi.nullable(),
    onerilir: z.boolean(),
  }).nullable(),
  // Verilmiş kararın tutarı ve onay limitindeki basamağı (1095 b: bilgi); karar yoksa ya da tutar hesaplanamıyorsa boş.
  karar: z.object({ tlToplam: ondalikMetinSemasi, bugunkuDeger: ondalikMetinSemasi, basamak: z.string().nullable() }).nullable(),
});
export type DegerlendirmeCevabi = z.output<typeof degerlendirmeCevabi>;

// 1104 a, 1105 a: kalemin kart ayrıntısı (malzemeler kartından). Sipariş verilmiş satırda siparişteki kopya, kart sonra değiştiyse
// `kartDegisti`. `tedarikciye` teklif isteğinde ve siparişte tedarikçiye giden alanlardır: fiyat, en az sipariş, tercih edilen tedarikçi ve kart notu gitmez.
export const kartAyrintisiSemasi = z.object({
  tur: z.string(), surum: z.number().int(), kaliteAdi: z.string().nullable(), formAdi: z.string().nullable(), aciklamalar: z.array(z.string()),
  standartlar: z.array(z.string()), tolerans: z.string().nullable(), durum: z.string().nullable(), yuzey: z.string().nullable(),
  sertifikalar: z.array(z.string()), ureticiUrunKodu: z.string().nullable(), mensei: z.string().nullable(), gtip: z.string().nullable(),
  enAzSiparis: ondalikMetinSemasi.nullable(), tercihTedarikci: z.string().nullable(), not: z.string().nullable(),
});
export const kartAyrintilariCevabi = z.object({
  kalemler: z.array(z.object({
    kalemId: uuid,
    malzemeNo: z.number().int().nullable(),
    // Kartın bugünkü hâli; kartsız kalemde ya da kart iptalse boş.
    guncel: kartAyrintisiSemasi.nullable(),
    siparisler: z.array(z.object({ teklifId: uuid, kopya: kartAyrintisiSemasi, zaman: z.string(), kartDegisti: z.boolean() })),
    tedarikciye: z.array(z.object({ ad: z.string(), deger: z.string() })),
  })),
});
export type KartAyrintisi = z.output<typeof kartAyrintisiSemasi>;
export type KartAyrintilariCevabi = z.output<typeof kartAyrintilariCevabi>;

// Ana sayfa pano kartları (kart #489): yetkisi olmayan sayı null gelir, sıfır uydurulmaz.
export const satinAlmaOzetiCevabi = z.object({
  onayBekleyen: z.number().int().nullable(),
  acikTalep: z.number().int().nullable(),
  teslimBekleyenSatir: z.number().int().nullable(),
  acikSiparis: z.number().int().nullable(),
  // TL, ondalık metin; kuru bilinmeyen açık sipariş varsa boş.
  acikSiparisTutari: z.string().nullable(),
});
export type SatinAlmaOzetiCevabi = z.output<typeof satinAlmaOzetiCevabi>;
// Dış operasyonlar (fason, kart #542): tarihler iş emrindedir, satın alma üretim emirlerinden okur. Adetler ve tarihler
// veri yoksa null; gecikme sunucuda hesaplanır (termin geçti ve dönüş yok: bugüne kadar, dönüş geç geldi: dönüşe kadar gün).
export const disOperasyonSemasi = z.object({
  isEmriId: z.number().int(),
  // Gidiş, dönüş ve tamamlama üretim emirlerinin uçlarına emir kimliğiyle gider (/adimli-emirler/:id/is-emirleri/:isEmriId/...).
  uretimEmriId: z.number().int(),
  emirNo: z.string(),
  urun: z.string().nullable(),
  opNo: z.number().int(),
  adim: z.string().nullable(),
  firmaId: z.number().int().nullable(),
  firmaAdi: z.string().nullable(),
  planlananGidis: tarih.nullable(),
  gerceklesenGidis: z.string().nullable(),
  termin: tarih.nullable(),
  ilkDonus: z.string().nullable(),
  sonDonus: z.string().nullable(),
  gonderilen: z.number().int().nullable(),
  donen: z.number().int().nullable(),
  hurda: z.number().int().nullable(),
  gecikmeGun: z.number().int().nullable(),
});
// hazir: üretim emirlerinin fason listesi bağlı mı (bağlanana kadar liste boş, ekran bunu söyler).
export const disOperasyonlarCevabi = z.object({ hazir: z.boolean(), operasyonlar: z.array(disOperasyonSemasi) });
export type DisOperasyon = z.output<typeof disOperasyonSemasi>;
export type DisOperasyonlarCevabi = z.output<typeof disOperasyonlarCevabi>;

// Fason süre ve termin grafikleri: gidişi ve dönüşü olan fason iş emirlerinin gerçekleşen geçmişi. Veri yoksa listeler boş gelir.
export const fasonSureleriSorgusu = z.object({ sonGun: z.coerce.number().int().min(1).max(3650).default(365) });
// Kırılım: malzeme, operasyon, firma ve gönderilen adet. Süre ilk gidişten son dönüşe takvim günüdür (ondalık); aynı kırılımdaki
// iş emirlerinin ortalamasıdır. Malzemesi olmayan emirde malzeme alanları boş gelir.
export const fasonSureSatiri = z.object({
  malzemeNo: z.number().int().nullable(),
  malzemeAdi: z.string().nullable(),
  operasyonTipiId: z.number().int(),
  operasyonAdi: z.string().nullable(),
  firmaId: z.number().int(),
  firmaAdi: z.string().nullable(),
  adet: z.number().int(),
  ornekSayisi: z.number().int(),
  ortalamaSureGun: z.number(),
});
// Termin uyumu firma başına: fark = gerçek teslim (son dönüş) - termin (ilk gidiş + termin günü); artı geç, eksi erken. Termin günü
// olmayan iş emri dışarıda kalır.
export const fasonTerminUyumuSatiri = z.object({
  firmaId: z.number().int(),
  firmaAdi: z.string().nullable(),
  ornekSayisi: z.number().int(),
  gecKalanSayisi: z.number().int(),
  ortalamaFarkGun: z.number(),
});
export const fasonSureleriCevabi = z.object({ sureler: z.array(fasonSureSatiri), terminUyumu: z.array(fasonTerminUyumuSatiri) });
export type FasonSureSatiri = z.output<typeof fasonSureSatiri>;
export type FasonTerminUyumuSatiri = z.output<typeof fasonTerminUyumuSatiri>;
export type FasonSureleriCevabi = z.output<typeof fasonSureleriCevabi>;

// Malzeme kg fiyatı (kalite + form başına; form boş: kalitenin bütün formları). Geçmiş silinmez; güncel fiyat geçerlilik günü bugünü
// geçmemiş en son giriştir. TL karşılığı finansın güncel kurundan; kur yoksa boş.
const kaliteKodu = z.string().trim().min(1, 'Kalite boş olamaz.').max(60);
const kgFiyatiSatiri = z.object({
  kaliteKodu: z.string(),
  form: z.string().nullable(),
  kgFiyati: ondalikMetinSemasi,
  paraBirimi: z.enum(PARA_BIRIMLERI),
  tryKgFiyati: ondalikMetinSemasi.nullable(),
  // 214 a: talaşın satış fiyatı (kg fiyatıyla aynı para biriminde); boşsa bilinmiyor.
  talasKgFiyati: ondalikMetinSemasi.nullable(),
  tryTalasKgFiyati: ondalikMetinSemasi.nullable(),
  gecerlilik: z.string(),
  aciklama: z.string(),
  kisiAdi: z.string().nullable(),
  zaman: zamanSemasi,
});
// Katalogda kullanılan (aktif hammadde kartı olan) ama uygulanan fiyatı olmayan kalite + form, kart sayısıyla.
const fiyatsizKalite = z.object({ kaliteKodu: z.string(), aile: z.string().nullable(), form: z.string().nullable(), kartSayisi: z.number().int() });
// Hammadde stok değeri (TL): güncel kg fiyatıyla ve ortalama alış fiyatıyla; satır uygulanan kg fiyatı başına. Yalnız finans.oku
// olana döner (Stok ekranıyla aynı), değilse null. Stok bağlı değilse ya da fiyatlı stok yoksa tutarlar boş.
// 228 a: tutarlar yalnız kullanılabilir stoktandır; geri kalanı Stok'un değer gruplarıyla ayrı döner, değere girmez: kalite (karantina,
// kalite bekleyen ya da red), hurda, fason, yolda (sevkiyat dahil), diğer (istasyon, üretim çıkışı, ara alan).
export const STOK_AYRI_GRUPLARI = ['kalite', 'hurda', 'fason', 'yolda', 'diger'] as const;
export type StokAyriGrubu = (typeof STOK_AYRI_GRUPLARI)[number];
const ayriStokDegeri = z.object({ kgFiyatiyla: ondalikMetinSemasi.nullable(), alisFiyatiyla: ondalikMetinSemasi.nullable() });
const kgStokDegeri = z.object({
  kgFiyatiyla: ondalikMetinSemasi.nullable(),
  alisFiyatiyla: ondalikMetinSemasi.nullable(),
  kgFiyatsizKalem: z.number().int(),
  alisFiyatsizKalem: z.number().int(),
  ayriToplam: ayriStokDegeri,
  ayriGruplar: z.array(ayriStokDegeri.extend({ grup: z.enum(STOK_AYRI_GRUPLARI) })),
  satirlar: z.array(z.object({ kaliteKodu: z.string(), form: z.string().nullable(), tutar: ondalikMetinSemasi.nullable() })),
});
export const kgFiyatlariCevabi = z.object({ fiyatlar: z.array(kgFiyatiSatiri), fiyatsizKaliteler: z.array(fiyatsizKalite), stokDegeri: kgStokDegeri.nullable() });
export type KgStokDegeri = z.output<typeof kgStokDegeri>;
export type FiyatsizKalite = z.output<typeof fiyatsizKalite>;
export const kgFiyatiGecmisiSorgusu = z.object({ kalite: kaliteKodu, form: z.string().trim().min(1).max(40).optional() });
export const kgFiyatiGecmisiCevabi = z.object({ girisler: z.array(kgFiyatiSatiri) });
export const kgFiyatiEkleGovdesi = z.object({
  satirlar: z.array(z.object({
    kaliteKodu,
    form: z.string().trim().min(1).max(40).nullable(),
    kgFiyati: eksiOlmayan.refine((d) => !/^0*(\.0*)?$/.test(d), 'Kg fiyatı sıfırdan büyük olur.'),
    talasKgFiyati: eksiOlmayan.refine((d) => !/^0*(\.0*)?$/.test(d), 'Talaş fiyatı sıfırdan büyük olur.').nullable().default(null),
    paraBirimi: z.enum(PARA_BIRIMLERI),
    gecerlilik: tarih,
    aciklama: z.string().trim().max(500).default(''),
  })).min(1, 'En az bir fiyat girin.').max(500),
});
// Malzeme ekranı (köprü) malzemenin birim fiyatını buradan okur: en çok 200 malzeme no, virgülle. Fiyatı olmayan malzeme listede yoktur.
export const malzemeKgFiyatlariSorgusu = z.object({ nolar: z.string().regex(/^\d+(,\d+){0,199}$/).transform((m) => [...new Set(m.split(',').map(Number))]) });
const malzemeKgFiyati = z.object({
  malzemeNo: z.number().int(),
  kaliteKodu: z.string(),
  form: z.string().nullable(),
  kgFiyati: ondalikMetinSemasi,
  paraBirimi: z.enum(PARA_BIRIMLERI),
  tryKgFiyati: ondalikMetinSemasi.nullable(),
  gecerlilik: z.string(),
  birimFiyati: ondalikMetinSemasi.nullable(),
  tryBirimFiyati: ondalikMetinSemasi.nullable(),
  talasKgFiyati: ondalikMetinSemasi.nullable(),
  tryTalasKgFiyati: ondalikMetinSemasi.nullable(),
});
export const malzemeKgFiyatlariCevabi = z.object({ malzemeler: z.array(malzemeKgFiyati) });
export type MalzemeKgFiyatlariCevabi = z.output<typeof malzemeKgFiyatlariCevabi>;
export type KgFiyatiSatiri = z.output<typeof kgFiyatiSatiri>;
export type KgFiyatlariCevabi = z.output<typeof kgFiyatlariCevabi>;
export type KgFiyatiGecmisiCevabi = z.output<typeof kgFiyatiGecmisiCevabi>;
export type KgFiyatiEkleGovdesi = z.input<typeof kgFiyatiEkleGovdesi>;

// 533 a: malzemenin tedarik termini (malzeme başına tek satır, sahibi satın alma). termin boşsa malzeme termin bekler; gerekenTarih
// planın hesapladığı "olması gereken" tarihtir. Planlama ekranı da aynı kaydetme ucuna yazar.
export const tedarikTerminiSemasi = z.object({
  malzemeNo: z.number().int().positive(),
  termin: tarihSemasi.nullable(),
  gerekenTarih: tarihSemasi.nullable(),
  aciklama: z.string(),
  surum: surumSemasi,
  guncelleme: zamanSemasi,
});
export const tedarikTerminleriCevabi = z.object({
  terminler: z.array(tedarikTerminiSemasi.extend({ malzemeKodu: z.string(), malzemeAdi: z.string(), kisiAdi: z.string().nullable() })),
});
// surum null: malzemenin ilk termini (satır varsa 409). termin null: termin kaldırılır, malzeme yeniden termin bekler.
export const tedarikTerminiKaydetGovdesi = z.object({
  malzemeNo: z.number().int().positive().max(2147483647),
  termin: tarihSemasi.nullable(),
  aciklama: z.string().trim().max(200).default(''),
  surum: surumSemasi.nullable(),
});
export const tedarikTerminiKaydetCevabi = z.object({ termin: tedarikTerminiSemasi });
export type TedarikTermini = z.output<typeof tedarikTerminiSemasi>;
export type TedarikTerminleriCevabi = z.output<typeof tedarikTerminleriCevabi>;
export type TedarikTerminiKaydetYazimi = z.output<typeof tedarikTerminiKaydetGovdesi>;
export type TedarikTerminiKaydetCevabi = z.output<typeof tedarikTerminiKaydetCevabi>;
