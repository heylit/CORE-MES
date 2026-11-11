import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { beklenenSurum, surumSemasi } from '../surum.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';
import { dosyaOzeti } from './dosya.ts';
import { SIPARIS_ODEME_YONTEMLERI } from './finans.ts';
import { KM_TEDARIKCI_DURUMLARI } from './kalite-merkezi.ts';
import { DIS_ISLEM_EMRI_DURUMLARI, disIslemEmriSemasi } from './uretim-emirleri.ts';

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

const uuid = z.guid();
const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olur.');
const firmaKimligi = z.number().int().positive().max(2147483647);
const kisiKimligi = z.number().int().positive().max(2147483647);
const eksiOlmayan = ondalikMetinSemasi.refine((d) => !d.startsWith('-'), 'Değer eksi olamaz.');
const yuzde = z.string().regex(/^(100(\.0+)?|\d{1,2}(\.\d+)?)$/, 'Yüzde 0 ile 100 arasında olur.');
const metin = (azami: number) => z.string().max(azami).prefault('');
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

export const VADE_BASLANGICLARI = ['teslim', 'siparis'] as const;
export type VadeBaslangici = (typeof VADE_BASLANGICLARI)[number];

// İstemci yalnız satın almanın alanlarını yazar; teslim stok mal kabulünde yazılır (SAT-37, SAT-38, SH1 a); kalite GKK gelene kadar boş.
export const siparisSemasi = z.object({
  teklifId: uuid,
  siparisNo: metin(40),
  siparisTarihi: tarih.nullable(),
  beklenenTeslim: tarih.nullable(),
  // Kart 2417: vadeli ödeme teslimattan (her mal kabul kendi payıyla, varsayılan) ya da sipariş tarihinden sayılır.
  vadeBaslangici: z.enum(VADE_BASLANGICLARI).default('teslim'),
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
  // 2881: sipariş anında sabitlenen parça revizyonu (fasonda uygulanacak parçanın); yoksa boş. Yalnız çıkışta.
  parcaRevizyonu: z.string().nullable().optional(),
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

const projeSecenegiSemasi = z.object({ id: z.number().int(), kod: z.string(), ad: z.string() });

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
  uretimEmriId: z.number().int().positive().max(2147483647).nullable().prefault(null),
  // 2611 a: emre bağlı olmayan talebin projesi; alımın bedeli proje maliyetine gider. Emirli talepte boştur (proje emirden gelir).
  // Gelmeyen alan kayıttaki projeyi korur: alanı bilmeyen istemci kaydederken projeyi silmez.
  projeId: z.number().int().positive().max(2147483647).nullable().optional(),
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
// 2413 a: elle durum değiştirme yalnız "İptali geri al"dır. Talep iptalden önceki durumuna döner; gerekçe zorunlu, talebin hareketine yazılır.
// 2414 a: kimlik birleşik talebin, istemcide üretilir. Kaynaklar tekildir (K7).
export const talepBirlestirGovdesi = z.object({
  id: uuid,
  talepIdleri: z.array(uuid).min(2, 'En az iki talep seçin.').max(20).refine((l) => new Set(l).size === l.length, 'Aynı talep iki kez seçilemez.'),
});
// Boş liste: bütün kaynaklar ayrılır.
export const talepAyirGovdesi = z.object({ talepIdleri: z.array(uuid).min(1).max(20).optional(), ...beklenenSurum });
export const iptaliGeriAlGovdesi = z.object({ gerekce: z.string().trim().min(1, 'Gerekçe zorunlu.').max(500), ...beklenenSurum });
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
  // 2132-7: siparişin KDV oranı (plan KDV dahildir). Gelmezse siparişteki seçim değişmez.
  kdvOrani: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'KDV oranı geçersiz.').optional(),
  ...beklenenSurum,
});
export const siparisTakibiCevabi = z.object({
  siparisler: z.array(z.object({
    teklifId: uuid,
    // Stok mal kabulündeki irsaliyeyi sipariş satırından okumak için (GET /stok/siparis-irsaliyeleri).
    satirIdleri: z.array(z.number().int()),
    paraBirimi: z.string(),
    // 2132-7: planın KDV oranı (elle seçilmediyse finansın genel oranı; finansta geçerli oran yoksa boş) ve seçilebilecek oranlar.
    kdvOrani: z.string().nullable(),
    kdvElle: z.boolean(),
    kdvSecenekleri: z.array(z.string()),
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

// 2429: hizmet kaleminin bağları (uygulanan parça, fason adımı) yalnız çıkışta; kayıt gövdesi taşımaz, bağ hızlı açılışta yazılır.
// Silinmiş kart ya da iş emri numarasıyla gelir (ad boş). Talep eden firmayı görmez (firma boş).
export const kalemBagiCikisSemasi = z.object({
  kalemId: uuid,
  // 2881: revizyon, parçanın o anki yürürlükteki revizyonu (teklif isteme metni); yoksa alan gelmez.
  uygulanan: z.object({ no: z.number().int(), kod: z.string().nullable(), ad: z.string().nullable(), revizyon: z.string().nullable().optional() }).nullable(),
  fason: z.object({
    isEmriId: z.number().int(), uretimEmriId: z.number().int().nullable(), emirNo: z.string().nullable(), opNo: z.number().int().nullable(),
    adim: z.string().nullable(), firmaId: z.number().int().nullable(), firmaAdi: z.string().nullable(),
  }).nullable(),
});
export type KalemBagiCikisi = z.output<typeof kalemBagiCikisSemasi>;
// 2414 a: birleştirilmiş kaynak talep, birleşik talebi gösterir; birleşik talep kaynaklarını alt dal olarak taşır. Yalnız çıkışta.
export const birlesmeSemasi = z.object({ talepId: uuid, no: z.string(), durum: z.enum(TALEP_DURUMLARI) });
// 2876 (2871-1 b): güncelleme grubu: kök talep ve ona bağlı güncelleme talepleri (kök önce, açılış sırasıyla). Yalnız çıkışta, grup varsa.
export const guncellemeGrubuSemasi = z.array(z.object({ id: uuid, no: z.string(), durum: z.enum(TALEP_DURUMLARI), kok: z.boolean() }));
export const talepKaynagiSemasi = z.object({
  talepId: uuid, no: z.string(), talepEdenAdi: z.string().nullable(), kalemIdleri: z.array(uuid), ihtiyacTarihi: z.string().nullable(),
  // V4 a: kalemin harcaması bu birime yazılır; boşsa birleşik talebin birimine.
  birim: z.string().nullable(),
  // 2624 b: kaynağın üretim emri; birleşik talepte kaynaktan gelen kalem bu emre bağlı kalır (mal kabulde emre ayrılır).
  uretimEmriNo: z.string().nullable(),
});
export type TalepKaynagi = z.output<typeof talepKaynagiSemasi>;
export const talepSemasi = z.object({
  ...talepAlanlari,
  birlesme: birlesmeSemasi.nullable().optional(),
  kaynaklar: z.array(talepKaynagiSemasi).optional(),
  guncellemeGrubu: guncellemeGrubuSemasi.optional(),
  kalemBaglari: z.array(kalemBagiCikisSemasi).optional(),
  // Yalnız talep edenin görünümünde (SAT-53 b): kararın seçtiği tedarikçiler; karar yoksa boş. Teklif ve fiyat taşımaz.
  secilenTedarikciler: z.array(z.object({ firmaId: z.number().int().nullable(), ad: z.string() })).optional(),
  karar: kararCikisSemasi.nullable(),
  teslimYontemi: z.enum(TESLIM_YONTEMLERI).nullable(),
  no: z.string(),
  uretimEmriNo: z.string().nullable(),
  proje: projeSecenegiSemasi.nullable().optional(),
  talepEdenAdi: z.string().nullable(),
  acanKisiId: z.number().int(),
  surum: surumSemasi,
  olusturma: z.string(),
  guncelleme: z.string(),
});

// Talep formunun üretim emri seçimi: açık emirler.
// 2611 a: talepte seçilebilen projeler (yalnız aktif); talep açan projeler.oku yetkisini taşımayabilir.
export const projeSecenekleriCevabi = z.object({ projeler: z.array(projeSecenegiSemasi) });
export type ProjeSecenekleriCevabi = z.output<typeof projeSecenekleriCevabi>;
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
  // 2157-1 a: elle verilen 1-5 puan; verilmemişse null (orta puan uydurulmaz).
  puan: z.number().int().min(1).max(5).nullable(),
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
  puan: z.number().int().min(1).max(5).nullable(),
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

// 1096 a: karar onaya gönderilince kur ve faiz sabitlenir. Sipariş, kilit 7 günü geçmişse ya da bir para biriminin güncel kuru
// sabit kurdan %3'ten fazla saptıysa verilmez. Sınırlar ekranda da gösterildiği için burada; kural sunucudadır (kurallar.ts).
export const KUR_KILIDI = { gun: 7, kaymaYuzdesi: 3 } as const;

export const ayarlarSemasi = z.object({
  // Sistem Ayarları > Firma adı (1942 a); salt okunur, kaydet gövdesinde yoktur.
  sirket: z.string(),
  agirliklar: agirliklarSemasi,
  gecerlilikGun: z.number().int(),
  enAzTeklif: z.number().int(),
  fiyatUyariYuzdesi: ondalikMetinSemasi,
  // Güncel kur ve aylık faiz finanstan (SA3 a, 937 b); finansta kaydı olmayan para biriminde boş. Kur tarihi, gelen kurların en eskisinin günü.
  kurTarihi: z.string().nullable(),
  // 2238-3 c: aylikFaizYuzdesi vadenin puanlandığı kredi faizidir; mevduat yanında gösterilir. İkisi de finansın yıllık oranının aylığı.
  kurlar: z.array(z.object({ paraBirimi: z.enum(PARA_BIRIMLERI), kur: ondalikMetinSemasi.nullable(), aylikFaizYuzdesi: ondalikMetinSemasi.nullable(), mevduatAylikFaizYuzdesi: ondalikMetinSemasi.nullable().optional() })),
  kategoriler: z.array(z.string()),
  birimler: z.array(z.object({ ad: z.string(), yillikButce: ondalikMetinSemasi })),
  // 2397 b: basamağın rolü (boş: onaylama yetkisi yeter). Sunucu her zaman yazar; eski ekran fikstürleri için isteğe bağlı.
  // rolAdi yalnız okumadır (2397-6): rolleri göremeyen satın almacı basamağın rolünü adıyla görür; kayıt gövdesi taşımaz.
  onayLimitleri: z.array(z.object({ azamiTutar: ondalikMetinSemasi.nullable(), seviye: z.string(), rolId: z.number().int().nullable().optional(), rolAdi: z.string().nullable().optional() })),
  // Sistem Ayarları 'satin-alma.dort-goz' (salt okunur): ekran kendi kararını onaylatmamayı söyler; ret sunucudadır.
  dortGoz: z.boolean(),
  // Sistem Ayarları 'satin-alma.onay-kademesi' (salt okunur, 2397 b): açıkken basamak rolü sunucuda denetlenir.
  onayKademesi: z.boolean().optional(),
  surum: surumSemasi,
});
export const ayarlarKaydetGovdesi = z.object({
  agirliklar: agirliklarSemasi,
  gecerlilikGun: z.number().int().min(1).max(365),
  enAzTeklif: z.number().int().min(1).max(20),
  fiyatUyariYuzdesi: eksiOlmayan,
  // Yalnız para birimi listesi ve sırası; kur ve faiz finansın tablosuna finans uçlarıyla yazılır (937 b).
  kurlar: z.array(z.object({ paraBirimi: z.enum(PARA_BIRIMLERI) })).min(1).max(4),
  kategoriler: z.array(z.string().trim().min(1).max(60)).max(100),
  birimler: z.array(z.object({ ad: z.string().trim().min(1).max(60), yillikButce: eksiOlmayan })).max(100),
  // Rolü göndermeyen (eski) ekranın kaydı aynı adlı basamağın rolünü korur; null rolü kaldırır.
  onayLimitleri: z.array(z.object({ azamiTutar: eksiOlmayan.nullable(), seviye: z.string().trim().min(1).max(80), rolId: z.number().int().positive().nullable().optional() })).max(20),
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
// 1839: bağlama cevabındaki üç yollu eşleşme uyarıları (rakamsız); liste okumasında boş.
export const siparisFaturalariCevabi = z.object({ faturalar: z.array(siparisFaturasiSemasi), uyarilar: z.array(z.string()) });
export const siparisFaturasiGovdesi = z.object({ teklifId: uuid, belgeId: z.number().int().positive().max(2147483647), bagla: z.boolean() });
export const firmaSecenekleriCevabi = z.object({
  firmalar: z.array(z.object({ id: firmaKimligi, ad: z.string(), tedarikci: z.boolean() })),
});

// SA2 b: kataloğa bağlanacak aktif malzeme kartı aranır; kataloğa bağlı olan işaretli.
// Sertifika ve rapor sipariş satırına bağlanır (kullanıcı isteği 13.10.2026): belge Çizimler'de açılır ve yayınlanır, satır
// kayıttan görünür; stok mal kabulde satırın belgesini okur. İstemci dosyayı önce `/dosyalar/:ozet/parca` ile yükler.
export const SIPARIS_BELGE_TURLERI = ['sertifika', 'rapor'] as const;
export const siparisSatiriParametresi = z.object({ id: z.coerce.number<number>().int().positive().max(2147483647) });
export const siparisBelgesiParametresi = z.object({
  id: z.coerce.number<number>().int().positive().max(2147483647), belgeId: z.coerce.number<number>().int().positive().max(2147483647),
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
// Talep türü (#1192): malzeme talebi fiziksel kartları, hizmet talebi yalnız alınan hizmet kartlarını seçer. Fason talebi (2428) de
// alınan hizmet kartını (işlem) seçer; her kalemi emrin fason adımına ya da stoktaki partiye bağlanır ve dış işlem emri açar.
export const TALEP_TURLERI = ['malzeme', 'hizmet', 'fason'] as const;
export type TalepTuru = (typeof TALEP_TURLERI)[number];
// Boş arama açılır listenin ilk sayfasıdır.
export const malzemeSecenekleriSorgusu = z.object({ ara: z.string().trim().max(80).prefault(''), tur: z.enum(TALEP_TURLERI).prefault('malzeme') });
export const malzemeSecenekleriCevabi = z.object({
  malzemeler: z.array(z.object({
    no: z.number().int(), kod: z.string(), ad: z.string(), birim: z.string().nullable(), kategori: z.string().nullable(), katalogId: uuid.nullable(),
    // 2871: hammadde kartının stok birimi başına kg'ı (kart ekranının yoğunluk ve ölçüden hesapladığı); bilinmiyorsa null.
    stokBirimi: z.string().nullable().optional(), birimKg: z.number().nullable().optional(),
  })),
});

// Ana sayfadan talep (kart #375): talep eden kalemi malzeme kartından seçer ya da adıyla yazar ("kart bekliyor").
// Kişi alanı yoktur: talep oturumdaki kişi adına açılır, gövdede gelen başka alan yok sayılır.
export const hizliKalemSemasi = z.object({
  malzemeNo: z.number().int().positive().max(2147483647).nullable().prefault(null),
  ad: z.string().trim().max(160).prefault(''),
  birim: z.string().trim().max(20).prefault(''),
  miktar: ondalikMetinSemasi.refine((d) => !d.startsWith('-') && Number(d) > 0, 'Miktar sıfırdan büyük olur.'),
  aciklama: metin(500),
  // 898 a: hizmet kalemi hangi parça ya da malzeme üzerinde yapılacak; fason ön talepten gelen kalem iş emrini taşır. İkisi yalnız hizmette.
  uygulananMalzemeNo: z.number().int().positive().max(2147483647).nullable().prefault(null),
  isEmriId: z.number().int().positive().max(2147483647).nullable().prefault(null),
  // 2428: fason kalemi emrin adımına (isEmriId) ya da stoktaki partiye bağlanır; parti uygulanan parçanın partisidir, konum isteğe bağlı.
  partiId: z.number().int().positive().max(2147483647).nullable().prefault(null),
  konumId: z.number().int().positive().max(2147483647).nullable().prefault(null),
});
export const hizliAcGovdesi = z.object({
  id: uuid,
  tur: z.enum(TALEP_TURLERI).prefault('malzeme'),
  ihtiyacTarihi: tarih.nullable().prefault(null),
  aciklama: metin(4000),
  uretimEmriId: z.number().int().positive().max(2147483647).nullable().prefault(null),
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
  birlesme: birlesmeSemasi.nullable().optional(),
  // 2871-1 a: sahibi teklif istenmeden önce (taslak) düzenler; sürüm ve açıklama düzenleme formu içindir.
  surum: z.number().int().optional(),
  aciklama: z.string().optional(),
  duzenlenebilir: z.boolean().optional(),
  // 2876: teklif toplanırken sahibi güncelleme talebi açar; grup eski ve yeni talebi birlikte gösterir.
  guncellenebilir: z.boolean().optional(),
  guncellemeGrubu: guncellemeGrubuSemasi.optional(),
  kalemler: z.array(z.object({
    id: uuid.optional(), aciklama: z.string().optional(),
    ad: z.string(), miktar: z.string().nullable(), birim: z.string(), kartBekliyor: z.boolean(), uygulanan: z.string().nullable(), fasonAdim: z.string().nullable(),
    // 2871: kg ile kartın stok birimi arasındaki karşılık (kartın birim ağırlığıyla); hesaplanamıyorsa null, uydurulmaz.
    karsilik: z.object({ miktar: z.string(), birim: z.string() }).nullable().optional(),
  })),
});
// 2871-1 a: talep edenin kendi taslağını düzenlemesi. Var olan kalem kimliğiyle gelir (yalnız miktar ve açıklama değişir); kimliksiz kalem
// yeni kalemdir (karttan ya da adıyla); gelmeyen kalem çıkar. Kişi, durum, teklif ve fiyat alanı yoktur.
export const talebimiDuzenleGovdesi = z.object({
  ihtiyacTarihi: tarih.nullable().prefault(null),
  aciklama: metin(4000),
  kalemler: z.array(hizliKalemSemasi.pick({ malzemeNo: true, ad: true, birim: true, miktar: true, aciklama: true })
    .extend({ id: uuid.nullable().prefault(null) })).min(1, 'En az bir kalem girin.').max(50),
  ...beklenenSurum,
});
// 2876 (2871-1 b): teklif toplanırken güncelleme talebi. Gövde düzenlemeyle aynıdır, yeni talebin kimliğiyle; kimlikli kalem eski talebin
// kalemidir (kartı, adı, birimi kopyalanır; miktar ve açıklama yeni), gelmeyen kalem yeni talebe girmez. Sürüm eski talebindir.
export const talebimGuncellemeGovdesi = talebimiDuzenleGovdesi.extend({ id: uuid });
export const taleplerimSorgusu = z.object({ sinir: z.coerce.number<number>().int().min(1).max(500).prefault(10) });
export const taleplerimCevabi = z.object({ talepler: z.array(talebimSemasi), toplam: z.number().int() });

// 898 a: ön talep. Fason: açık emrin, siparişe ve açık talebe bağlanmamış, yoksayılmamış fason iş emri. Gereken tarih emrin teslim günüdür
// (plan tarihi satın almaya gelmez); yoksa null. Firma rotadaki fason firmadır. Miktar emrin adedi, birim adet.
const fasonOnTalepSemasi = z.object({
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
  // 2874: fason adımın firması seçilmedi; satın alma siparişle seçer. İsteğe bağlı: sunucu her zaman yazar.
  firmaBekleniyor: z.boolean().optional(),
});
// Plan ihtiyacı (898 a, Dal 2): canlı planın stokla karşılanamayan malzemesinden açık sipariş, açık talep ve yoksayılan düşülmüş kalan.
// Hesap satırı ekranda gösterilir; miktarlar kartın stok birimindedir.
const planOnTalepSemasi = z.object({
  kaynak: z.literal('plan'),
  malzeme: z.object({ no: z.number().int(), kod: z.string(), ad: z.string() }),
  miktar: z.number(),
  birim: z.string(),
  gerekenTarih: z.string(),
  emirler: z.array(z.string()),
  stokBilinmiyor: z.boolean(),
  hesap: z.object({ eksik: z.number(), siparis: z.number(), talep: z.number(), yoksayilan: z.number() }),
});
export const onTalepSemasi = z.discriminatedUnion('kaynak', [fasonOnTalepSemasi, planOnTalepSemasi]);
export const yoksayilanOnTalepSemasi = z.object({
  id: z.number().int(), kaynak: z.enum(['fason', 'plan']), baslik: z.string(), neden: z.string(), kisiAdi: z.string().nullable(), zaman: z.string(),
});
export const onTalepleriCevabi = z.object({ onTalepler: z.array(onTalepSemasi), yoksayilanlar: z.array(yoksayilanOnTalepSemasi) });
const yoksayNedeni = z.string().trim().min(1, 'Nedeni yazın.').max(200);
// Plan ihtiyacında yoksayılan miktar sunucunun o anki hesabıdır; ihtiyaç bunu aşarsa artan kısım yeniden düşer.
export const onTalepYoksayGovdesi = z.discriminatedUnion('kaynak', [
  z.object({ kaynak: z.literal('fason'), isEmriId: z.number().int().positive().max(2147483647), neden: yoksayNedeni }),
  z.object({ kaynak: z.literal('plan'), malzemeNo: z.number().int().positive().max(2147483647), neden: yoksayNedeni }),
]);
export const onTalepGeriAlGovdesi = z.object({ id: z.number().int().positive().max(2147483647) });
export type OnTalep = z.output<typeof onTalepSemasi>;
export type FasonOnTalep = z.output<typeof fasonOnTalepSemasi>;
export type PlanOnTalep = z.output<typeof planOnTalepSemasi>;
export type YoksayilanOnTalep = z.output<typeof yoksayilanOnTalepSemasi>;
export type OnTalepleriCevabi = z.output<typeof onTalepleriCevabi>;
export type OnTalepYoksayYazimi = z.output<typeof onTalepYoksayGovdesi>;

export const talepParametresi = z.object({ id: uuid });
export const firmaParametresi = z.object({ id: z.coerce.number<number>().int().positive().max(2147483647) });
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
export type AcilisCevabi = z.output<typeof acilisCevabi>;
export type FirmaSecenekleriCevabi = z.output<typeof firmaSecenekleriCevabi>;
export type MalzemeSecenekleriCevabi = z.output<typeof malzemeSecenekleriCevabi>;
export type HizliAcYazimi = z.output<typeof hizliAcGovdesi>;
// İstemcinin gönderdiği gövde: varsayılanı olan alan (ör. 2428 parti ve konum) yazılmayabilir.
export type HizliAcGovdesi = z.input<typeof hizliAcGovdesi>;
export type HizliKalem = z.output<typeof hizliKalemSemasi>;
export type Talebim = z.output<typeof talebimSemasi>;
export type TalebimiDuzenleYazimi = z.output<typeof talebimiDuzenleGovdesi>;
export type TalebimGuncellemeYazimi = z.output<typeof talebimGuncellemeGovdesi>;
export type TaleplerimCevabi = z.output<typeof taleplerimCevabi>;

// Ekranın tipli çağrısı (istemci/src/ortak/veri/uc-cagrisi.ts).
export interface SatinAlmaUclari {
  'GET /satin-alma-menu-sayaclari': { cevap: Record<string, number | null> };
  'GET /satin-alma/ozet': { cevap: SatinAlmaOzetiCevabi };
  'GET /satin-alma-dis-operasyonlar': { cevap: DisOperasyonlarCevabi };
  'GET /satin-alma-fason-sureleri': { sorgu: z.input<typeof fasonSureleriSorgusu>; cevap: FasonSureleriCevabi };
  'GET /satin-alma-acilis': { cevap: AcilisCevabi };
  'GET /satin-alma-acik-emirler': { cevap: AcikEmirlerCevabi };
  'GET /satin-alma-talepleri/proje-secenekleri': { cevap: ProjeSecenekleriCevabi };
  'POST /satin-alma-talepleri/ac': { govde: z.input<typeof talepGovdesi>; cevap: Talep };
  'GET /satin-alma-taleplerim': { sorgu: z.input<typeof taleplerimSorgusu>; cevap: TaleplerimCevabi };
  'POST /satin-alma-talepleri/hizli-ac': { govde: z.input<typeof hizliAcGovdesi>; cevap: Talebim };
  'GET /satin-alma-on-talepleri': { cevap: OnTalepleriCevabi };
  'POST /satin-alma-on-talepleri/yoksay': { govde: z.input<typeof onTalepYoksayGovdesi>; cevap: { tamam: true } };
  'POST /satin-alma-on-talepleri/geri-al': { govde: z.input<typeof onTalepGeriAlGovdesi>; cevap: { tamam: true } };
  'POST /satin-alma-talepleri/:id/kaydet': { govde: z.input<typeof talepKaydetGovdesi>; cevap: Talep };
  'POST /satin-alma-talepleri/:id/talebimi-duzenle': { govde: z.input<typeof talebimiDuzenleGovdesi>; cevap: Talebim };
  'POST /satin-alma-talepleri/:id/guncelleme-ac': { govde: z.input<typeof talebimGuncellemeGovdesi>; cevap: Talebim };
  'POST /satin-alma-talepleri/:id/iptali-geri-al': { govde: z.input<typeof iptaliGeriAlGovdesi>; cevap: IptaliGeriAlCevabi };
  'POST /satin-alma-talepleri/birlestir': { govde: z.input<typeof talepBirlestirGovdesi>; cevap: Talep };
  'POST /satin-alma-talepleri/:id/ayir': { govde: z.input<typeof talepAyirGovdesi>; cevap: Talep };
  'POST /satin-alma-talepleri/:id/sil': { govde: z.input<typeof talepSilGovdesi>; cevap: { tamam: true } };
  'POST /satin-alma-talepleri/:id/siparis-kalemi-degistir': { govde: z.input<typeof siparisKalemiDegistirGovdesi>; cevap: Talep };
  'POST /satin-alma-talepleri/:id/siparis-kapat': { govde: z.input<typeof siparisKapatGovdesi>; cevap: Talep };
  'POST /satin-alma-talepleri/:id/teslim-yontemi': { govde: z.input<typeof teslimYontemiGovdesi>; cevap: Talep };
  'GET /satin-alma-talepleri/:id/siparis-takibi': { cevap: SiparisTakibiCevabi };
  'GET /satin-alma-talepleri/:id/degerlendirme': { cevap: DegerlendirmeCevabi };
  'GET /satin-alma-butce-kullanimi': { sorgu: z.input<typeof butceKullanimiSorgusu>; cevap: ButceKullanimiCevabi };
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
  'GET /satin-alma-kg-fiyatlari': { cevap: KgFiyatlariCevabi };
  'GET /satin-alma-kg-fiyatlari/gecmis': { sorgu: z.input<typeof kgFiyatiGecmisiSorgusu>; cevap: KgFiyatiGecmisiCevabi };
  'POST /satin-alma-kg-fiyatlari/ekle': { govde: KgFiyatiEkleGovdesi; cevap: KgFiyatlariCevabi };
  'POST /satin-alma-kg-fiyatlari/:id/iptal': { govde: z.input<typeof kgFiyatiIptalGovdesi>; cevap: KgFiyatlariCevabi };
  'GET /satin-alma-kg-fiyatlari/malzemeler': { sorgu: z.input<typeof malzemeKgFiyatlariSorgusu>; cevap: MalzemeKgFiyatlariCevabi };
  'GET /satin-alma-tedarik-terminleri': { cevap: TedarikTerminleriCevabi };
  'POST /satin-alma-tedarik-terminleri/kaydet': { govde: z.input<typeof tedarikTerminiKaydetGovdesi>; cevap: TedarikTerminiKaydetCevabi };
  'GET /satin-alma-fatura-eslemeleri/:belgeId': { cevap: FaturaEslemesiCevabi };
  'POST /satin-alma-fatura-eslemeleri/:belgeId/kaydet': { govde: z.input<typeof faturaEslemesiKaydetGovdesi>; cevap: FaturaEslemesiCevabi };
}

// 1094 b: teklif karşılaştırmasının sunucudaki hesabı. Tutarlar TL ve ondalık metindir (2 basamak); puanlar 0-100.
// Karar onaydaysa ya da sipariş verildiyse sabit kur ve faizle, değilse finansın bugünkü kuru ve faiziyle hesaplanır (1096 a).
// Tedarikçi başarımı bilinmiyorsa (puan, teslim ve kalite verisi yok) ya da termin girilmemişse null; o teklifte ağırlığı bilinen ölçütlere dağılır (2157).
const kriterSayilari = z.object({ maliyet: z.number(), termin: z.number().nullable(), tedarikci: z.number().nullable(), garanti: z.number() });
// 2454: birim başına bütçe kullanımı (TL, nominal). Birim kalemin kaynak birimi, yoksa talebin birimi; boş birim null. butce null: tanımsız.
// kullanilan: yılın siparişi verilmiş taleplerinin kalem tutarları; kalanı kapatılmış siparişte gerçekleşen teslim değeri (2462 a).
// hesaplanamayanKalem: kuru olmadığı için toplama girmeyen kalem sayısı.
const butceBirimSatiri = z.object({ birim: z.string().nullable(), butce: ondalikMetinSemasi.nullable(), kullanilan: ondalikMetinSemasi, hesaplanamayanKalem: z.number().int() });
export const butceKullanimiSorgusu = z.object({ yil: z.coerce.number<number>().int().min(2000).max(2100) });
export const butceKullanimiCevabi = z.object({ yil: z.number().int(), birimler: z.array(butceBirimSatiri) });
export type ButceKullanimiCevabi = z.output<typeof butceKullanimiCevabi>;
// Onay kırılımı: talebin kalemlerinin düştüğü her birim için bütçe, bu talep hariç yılın kullanımı ve bu alımın tutarı.
const talepButceSatiri = z.object({ birim: z.string().nullable(), butce: ondalikMetinSemasi.nullable(), yil: z.number().int(), kullanilan: ondalikMetinSemasi, buAlim: ondalikMetinSemasi });
export const degerlendirmeCevabi = z.object({
  butce: z.array(talepButceSatiri),
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
  // 2425: ortak pano (iş kutusuyla aynı tanımlar). Sipariş sayıları tedarikçi siparişi, diğerleri talep sayar; en eski gün,
  // en çok geciken siparişin ya da ihtiyacı en çok geçen talebin bugüne kadarki günü (yoksa boş). Yalnız tam gören dolu görür.
  gecikenTeslim: z.number().int().nullable(),
  buHaftaGelecekTeslim: z.number().int().nullable(),
  siparisVerilecek: z.number().int().nullable(),
  kararVerilecek: z.number().int().nullable(),
  ihtiyaciGecen: z.number().int().nullable(),
  gecikenEnEskiGun: z.number().int().nullable(),
  ihtiyaciGecenEnEskiGun: z.number().int().nullable(),
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
  // 2874: fason adımın firması seçilmedi; satın alma siparişle seçer. İsteğe bağlı: sunucu her zaman yazar.
  firmaBekleniyor: z.boolean().optional(),
  planlananGidis: tarih.nullable(),
  gerceklesenGidis: z.string().nullable(),
  termin: tarih.nullable(),
  ilkDonus: z.string().nullable(),
  sonDonus: z.string().nullable(),
  gonderilen: z.number().int().nullable(),
  donen: z.number().int().nullable(),
  hurda: z.number().int().nullable(),
  // İlk dönüşe göre (D3 b; eski ekranlar için korunur): dönüş yoksa bugüne kadar.
  gecikmeGun: z.number().int().nullable(),
  // 2424-a c: iki ölçü yan yana. Son dönüş: kalan adet varsa bugüne, yoksa son dönüşe göre termin aşımı (karneyle aynı).
  // Adet ağırlıklı: her dönüşün (hurda dahil) termin aşımı adediyle; dönmeyen adet bugüne göre. Termin yoksa ikisi de boş.
  gecikmeSonDonus: z.number().int().nullable(),
  gecikmeAgirlikli: z.number().nullable(),
  // 2426: mal kabul formu iş emriyle dolsun. Hizmet sipariş satırı ve firmanın stoktaki fason kutusu; bilinmiyorsa boş.
  siparisSatirId: z.number().int().nullable(),
  fasonKonumId: z.number().int().nullable(),
  // 1849: önceki iş emirleri bitti mi (fasona gönderilebilir mi); gidiş kaydıyla aynı kural.
  sirada: z.boolean(),
  // 2428: satırın dış işlem emri; canlıya geçiş göçünden önce açılmış ve göçe girmemiş iş için boş olabilir.
  dieId: z.number().int().nullable(),
  dieNo: z.string().nullable(),
  durum: z.enum(DIS_ISLEM_EMRI_DURUMLARI).nullable(),
});
// 2428: stoktaki partinin dış işlem emri (emirsiz fason): belge olduğu gibi, firma adı, sipariş satırı (kalem üzerinden) ve termin gecikmesi.
// Gidiş, dönüş ve tamamlama stoktan girer.
export const partiOperasyonuSemasi = disIslemEmriSemasi.extend({
  firmaAdi: z.string().nullable(),
  siparisSatirId: z.number().int().nullable(),
  gecikmeGun: z.number().int().nullable(),
});
// hazir: üretim emirlerinin fason listesi bağlı mı (bağlanana kadar liste boş, ekran bunu söyler).
export const disOperasyonlarCevabi = z.object({
  hazir: z.boolean(), operasyonlar: z.array(disOperasyonSemasi), partiOperasyonlari: z.array(partiOperasyonuSemasi),
});
// 2428: dış işlem emri ayrıntısı ve satın alma bağı (bağlı talep kalemleri ve sipariş satırları).
export const disOperasyonParametresi = z.object({ dieId: z.coerce.number<number>().int().positive().max(2147483647) });
export const disOperasyonAyrintisiCevabi = z.object({
  disIslemEmri: disIslemEmriSemasi,
  firmaAdi: z.string().nullable(),
  talepKalemleri: z.array(z.object({ talepId: uuid, talepNo: z.string(), kalemId: uuid, ad: z.string(), miktar: z.string().nullable(), birim: z.string(), durum: z.enum(TALEP_DURUMLARI) })),
  siparisSatirlari: z.array(z.object({ id: z.number().int(), talepId: uuid, siparisNo: z.string().nullable(), miktar: z.string(), birim: z.string(), tedarikciAdi: z.string().nullable() })),
});
export type PartiOperasyonu = z.output<typeof partiOperasyonuSemasi>;
export type DisOperasyonAyrintisiCevabi = z.output<typeof disOperasyonAyrintisiCevabi>;
export type DisOperasyon = z.output<typeof disOperasyonSemasi>;
export type DisOperasyonlarCevabi = z.output<typeof disOperasyonlarCevabi>;

// Fason süre ve termin grafikleri: gidişi ve dönüşü olan fason iş emirlerinin gerçekleşen geçmişi. Veri yoksa listeler boş gelir.
export const fasonSureleriSorgusu = z.object({ sonGun: z.coerce.number<number>().int().min(1).max(3650).prefault(365) });
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
// 2455-A: kaynak (boş: belirtilmedi) ve iptal. İptal yeni satırdır; iptal edilen giriş güncelden düşer, geçmişte iptalEdildi ile görünür.
export const KG_FIYATI_KAYNAKLARI = ['tedarikci_teklifi', 'piyasa', 'son_alis'] as const;
const kgFiyatiSatiri = z.object({
  id: z.number().int(),
  kaynak: z.enum(KG_FIYATI_KAYNAKLARI).nullable(),
  iptalEdildi: z.boolean(),
  // Güvenlik E2: iptal edildiyse iptal kaydı (gerekçe, iptal eden, zaman); değilse null.
  iptal: z.object({ gerekce: z.string(), kisiAdi: z.string().nullable(), zaman: zamanSemasi }).nullable(),
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
  // 1352 a: endüstriyel işlem ve aracı maliyeti katsayısı (çarpan); boşsa bilinmiyor. Etkin kg fiyatı ikisi de yazılıysa
  // kg fiyatı x işlem x aracı, aynı para biriminde; maliyet ve stok değeri hesaplarına girmez.
  islemKatsayisi: ondalikMetinSemasi.nullable(),
  araciKatsayisi: ondalikMetinSemasi.nullable(),
  etkinKgFiyati: ondalikMetinSemasi.nullable(),
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
// 2455-A güncel satırın izleme alanları. kartta: kalite + form aktif hammadde kartlarında var. yasGun: geçerlilik gününden bugüne takvim günü;
// eskiMi: yasGun eskime ayarına ulaştı (ayar boşsa false). Son alış (F-4): uygulanan kartların en son alışının kg fiyatı siparişin para
// biriminde ve bugünkü kurla TL; çevrilemezse boş. sapmaYuzde (G1): son alış / kg fiyatı - 1, yüzde; aynı para biriminde doğrudan, farklıysa
// ikisi de bugünkü kurla TL. sapanMi: |sapma| sapma eşiğine ulaştı (biri boşsa false).
const guncelKgFiyatiSatiri = kgFiyatiSatiri.extend({
  kartta: z.boolean(),
  yasGun: z.number().int(),
  eskiMi: z.boolean(),
  sonAlisKgFiyatiDoviz: ondalikMetinSemasi.nullable(),
  sonAlisParaBirimi: z.enum(PARA_BIRIMLERI).nullable(),
  sonAlisKgFiyati: ondalikMetinSemasi.nullable(),
  sapmaYuzde: z.string().regex(/^-?\d+(\.\d{1,2})?$/).nullable(),
  sapanMi: z.boolean(),
});
export const kgFiyatlariCevabi = z.object({ fiyatlar: z.array(guncelKgFiyatiSatiri), fiyatsizKaliteler: z.array(fiyatsizKalite), stokDegeri: kgStokDegeri.nullable() });
export type KgStokDegeri = z.output<typeof kgStokDegeri>;
export type FiyatsizKalite = z.output<typeof fiyatsizKalite>;
export const kgFiyatiGecmisiSorgusu = z.object({ kalite: kaliteKodu, form: z.string().trim().min(1).max(40).optional() });
export const kgFiyatiGecmisiCevabi = z.object({ girisler: z.array(kgFiyatiSatiri) });
// Katsayı: sıfırdan büyük, en çok 100, en çok 4 ondalık (sütun numeric(10,4)).
const katsayi = z.string().trim().regex(/^\d{1,3}(\.\d{1,4})?$/, 'Katsayı en çok 4 ondalıklı sayı olur (ör. 1.15).')
  .refine((d) => Number(d) > 0 && Number(d) <= 100, 'Katsayı sıfırdan büyük ve en çok 100 olur.');
export const kgFiyatiEkleGovdesi = z.object({
  satirlar: z.array(z.object({
    kaliteKodu,
    form: z.string().trim().min(1).max(40).nullable(),
    kgFiyati: eksiOlmayan.refine((d) => !/^0*(\.0*)?$/.test(d), 'Kg fiyatı sıfırdan büyük olur.'),
    talasKgFiyati: eksiOlmayan.refine((d) => !/^0*(\.0*)?$/.test(d), 'Talaş fiyatı sıfırdan büyük olur.').nullable().prefault(null),
    islemKatsayisi: katsayi.nullable().prefault(null),
    araciKatsayisi: katsayi.nullable().prefault(null),
    paraBirimi: z.enum(PARA_BIRIMLERI),
    gecerlilik: tarih,
    aciklama: z.string().trim().max(500).prefault(''),
    kaynak: z.enum(KG_FIYATI_KAYNAKLARI).nullable().prefault(null),
  })).min(1, 'En az bir fiyat girin.').max(500),
});
export const kgFiyatiParametresi = z.object({ id: z.coerce.number<number>().int().positive().max(2147483647) });
export const kgFiyatiIptalGovdesi = z.object({ gerekce: z.string().trim().min(1, 'İptal gerekçesi yazın.').max(500) });
export type KgFiyatiIptalYazimi = z.output<typeof kgFiyatiIptalGovdesi>;
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
export type GuncelKgFiyatiSatiri = z.output<typeof guncelKgFiyatiSatiri>;
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
// Açık sipariş satırı: plan bunu ayrıca okur (525 1 a); ekran yalnız gösterir, termin tablosuna yazılmaz.
export const terminSiparisiSemasi = z.object({ siparisNo: z.string(), tarih: tarihSemasi.nullable(), miktar: z.string(), birim: z.string() });
// 2433: termin takibi. Satır ihtiyaç kalemidir: malzemede malzeme başına (canlı plan ihtiyacı, açık talep, açık sipariş ve elle termin
// birleşir; 2433-2 a), hizmet ve fasonda talep kalemi başına. Durumu sunucu verir; ekran kodu rozete eşler.
export const TERMIN_TAKIP_TURLERI = ['malzeme', 'hizmet', 'fason'] as const;
export const TERMIN_DURUMLARI = ['gecikti', 'gec_kaliyor', 'teslim_tarihi_yok', 'eksik', 'termin_bekleniyor', 'talep_yolda', 'zamaninda', 'plan_istemiyor'] as const;
export type TerminDurumu = (typeof TERMIN_DURUMLARI)[number];
// Karşılayan: açık siparişin kalanı (tarih beklenen teslim; eski tarihsiz siparişte boş) ya da siparişi verilmemiş açık talep (tarih ihtiyaç tarihi).
export const terminKarsilayaniSemasi = z.object({
  tur: z.enum(['siparis', 'talep']),
  talepId: uuid, talepNo: z.string(), talepDurumu: z.enum(TALEP_DURUMLARI), teklifId: uuid.nullable(), siparisNo: z.string().nullable(),
  tarih: tarihSemasi.nullable(), miktar: z.string().nullable(), birim: z.string(),
});
export const terminTakipSatiri = z.object({
  anahtar: z.string(),
  tur: z.enum(TERMIN_TAKIP_TURLERI),
  malzemeNo: z.number().int().nullable(), kod: z.string().nullable(), ad: z.string(), birim: z.string().nullable(),
  // Malzemede canlı plan ihtiyacı; plan istemiyorsa ya da hizmet/fasonda miktar talep kaleminden, tarih talebin ihtiyaç tarihinden.
  ihtiyacMiktari: z.string().nullable(), gerekenTarih: tarihSemasi.nullable(),
  emirler: z.array(z.string()),
  karsilayanlar: z.array(terminKarsilayaniSemasi),
  // İhtiyaçla aynı birimdeki sipariş kalanı ve talep miktarı; ihtiyaç miktarı yoksa ikisi de boş.
  karsilanan: z.string().nullable(), eksik: z.string().nullable(),
  // Karşılayanlardan en geç gelecek olanın tarihi; sipariş yoksa elle termin.
  karsilayanTarih: tarihSemasi.nullable(),
  // Elle termin (2433-3 a): yalnız malzemede ve sipariş yokken; sipariş gelince boş döner (kayıt silinmez).
  elleTermin: tedarikTerminiSemasi.nullable(),
  durum: z.enum(TERMIN_DURUMLARI),
});
export const tedarikTerminleriCevabi = z.object({
  terminler: z.array(tedarikTerminiSemasi.extend({
    malzemeKodu: z.string(), malzemeAdi: z.string(), kisiAdi: z.string().nullable(), siparisler: z.array(terminSiparisiSemasi),
  })),
  // Sunucu her zaman yazar; eski ekran fikstürleri için isteğe bağlı.
  takip: z.array(terminTakipSatiri).optional(),
  bugun: tarihSemasi,
});
export type TerminTakipSatiri = z.output<typeof terminTakipSatiri>;
export type TerminKarsilayani = z.output<typeof terminKarsilayaniSemasi>;
// surum null: malzemenin ilk termini (satır varsa 409). termin null: termin kaldırılır, malzeme yeniden termin bekler.
export const tedarikTerminiKaydetGovdesi = z.object({
  malzemeNo: z.number().int().positive().max(2147483647),
  termin: tarihSemasi.nullable(),
  aciklama: z.string().trim().max(200).prefault(''),
  surum: surumSemasi.nullable(),
});
export const tedarikTerminiKaydetCevabi = z.object({ termin: tedarikTerminiSemasi });
export type TedarikTermini = z.output<typeof tedarikTerminiSemasi>;
export type TedarikTerminleriCevabi = z.output<typeof tedarikTerminleriCevabi>;
export type TedarikTerminiKaydetYazimi = z.output<typeof tedarikTerminiKaydetGovdesi>;
export type TedarikTerminiKaydetCevabi = z.output<typeof tedarikTerminiKaydetCevabi>;

// 2413 a: iptalden önceki durum kayıtlı değilse (2413'ten önceki iptal) veriden türetilir; ekran bunu kullanıcıya söyler.
export const iptaliGeriAlCevabi = z.object({ talep: talepSemasi, durum: z.enum(TALEP_DURUMLARI), turetildi: z.boolean() });
export type IptaliGeriAlCevabi = z.infer<typeof iptaliGeriAlCevabi>;
export type IptaliGeriAlYazimi = z.infer<typeof iptaliGeriAlGovdesi>;
export type TalepBirlestirYazimi = z.output<typeof talepBirlestirGovdesi>;
export type TalepAyirYazimi = z.output<typeof talepAyirGovdesi>;

// 2642 b: fatura (Finans belgesi) tutarının sipariş satırlarına eşlemesi. Tutar belgenin para biriminde, KDV hariç. surum belgenin eşleme
// sürümüdür (kayıt sayısı + kaldırılmış sayısı; 0'dan başlar), belge sürümü değil.
export const SATIR_YOLLARI = ['fason', 'bilinmiyor', 'stok', 'emir', 'proje', 'genel_gider'] as const;
export const ESLEME_DURUMLARI = ['yok', 'kismi', 'tam'] as const;
export const faturaEslemesiParametresi = z.object({ belgeId: z.coerce.number<number>().int().positive().max(2147483647) });
export const faturaEslemesiCevabi = z.object({
  belgeId: z.number().int(), belgeNo: z.string().nullable(), firmaAdi: z.string().nullable(), belgeTutari: ondalikMetinSemasi, paraBirimi: z.string(), siparisParaBirimi: z.string().nullable(), surum: z.number().int().min(0),
  satirlar: z.array(z.object({
    siparisSatiriId: z.number().int(), kalemAdi: z.string(), miktar: ondalikMetinSemasi, birim: z.string(), siparisTutari: ondalikMetinSemasi,
    yol: z.enum(SATIR_YOLLARI), tutar: ondalikMetinSemasi.nullable(), baskaBelgelerden: ondalikMetinSemasi.nullable(),
  })),
  bayat: z.array(z.object({ siparisSatiriId: z.number().int(), tutar: ondalikMetinSemasi })),
  eslenmemisKalan: ondalikMetinSemasi, oran: z.number().min(0).max(1).nullable(), esleme: z.enum(ESLEME_DURUMLARI),
});
export type FaturaEslemesiCevabi = z.output<typeof faturaEslemesiCevabi>;
export const faturaEslemesiKaydetGovdesi = z.object({
  surum: z.number().int().min(0).max(2147483647),
  satirlar: z.array(z.object({ siparisSatiriId: z.number().int().positive().max(2147483647), tutar: ondalikMetinSemasi })).max(500),
}).strict();
export type FaturaEslemesiKaydetGovdesi = z.output<typeof faturaEslemesiKaydetGovdesi>;
