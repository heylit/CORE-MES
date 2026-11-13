import { z } from 'zod';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Logo birim seti listesi (kart #207, LB6 c): köprüden okunan ve yönetici eliyle girilen kodlar.
// Köprüden liste hiç okunmadıysa elle girilen kod geçerlidir; okunduysa yalnız listede olan geçerlidir.
export const LOGO_BAGLANTI_DURUMLARI = ['kapali', 'acik', 'ortam-degiskeni-yok'] as const;

const kodSemasi = z.string().trim().min(1, 'Kod zorunlu.').max(40).regex(/^\S+$/, 'Kod boşluk taşımaz.');

export const birimSetleriCevabi = z.object({
  setler: z.array(z.object({
    kod: z.string(),
    ad: z.string().nullable(),
    elle: z.boolean(),
    kopruListesinde: z.boolean(),
    gecerli: z.boolean(),
  })),
  // Köprüden son liste okuma zamanı; hiç okunmadıysa null.
  sonOkuma: zamanSemasi.nullable(),
  baglanti: z.enum(LOGO_BAGLANTI_DURUMLARI),
});

export const birimSetiEkleGovdesi = z.object({
  kod: kodSemasi,
  ad: z.string().trim().min(1).max(80).nullable().prefault(null),
});
export const birimSetiParametresi = z.object({ kod: kodSemasi });
export const birimSetiCevabi = z.object({ kod: z.string() });

export type BirimSetleriCevabi = z.output<typeof birimSetleriCevabi>;
export type BirimSetiEkleGovdesi = z.input<typeof birimSetiEkleGovdesi>;
export type LogoBaglantiDurumu = (typeof LOGO_BAGLANTI_DURUMLARI)[number];

// Bağlantı hazırlığı ve canlı kontrol (Sistem Ayarları > Bağlantılar > Hazırlık). Anahtarın kendisi hiç dışarı çıkmaz.
// hazir: kod, ayar ve ortam tamam; kapali: ayar anahtarı kapalı; ayar-eksik: ortam değişkeni yok;
// baglanmadi: kod var, kaynağı olan modül henüz bağlanmadı; kodda-yok: bu akış yazılmadı.
export const BAGLANTI_AKIS_DURUMLARI = ['hazir', 'kapali', 'ayar-eksik', 'baglanmadi', 'kodda-yok'] as const;
export const LOGO_AKIS_YONLERI = ['tmi-logo', 'logo-tmi'] as const;

export const logoHazirlikCevabi = z.object({
  baglanti: z.enum(LOGO_BAGLANTI_DURUMLARI),
  ortam: z.object({
    // Köprünün kök adresi (kurum içi); tanımlı değilse null.
    adres: z.string().nullable(),
    anahtarTanimli: z.boolean(),
  }),
  ayarlar: z.array(z.object({ anahtar: z.string(), baslik: z.string(), acik: z.boolean() })),
  akislar: z.array(z.object({
    anahtar: z.string(),
    yon: z.enum(LOGO_AKIS_YONLERI),
    baslik: z.string(),
    aciklama: z.string(),
    durum: z.enum(BAGLANTI_AKIS_DURUMLARI),
    // Logo'ya giden belgelerin son durumu; akışın giden kaydı yoksa null.
    gonderilen: z.number().int().nullable(),
    hatali: z.number().int().nullable(),
    sonDeneme: zamanSemasi.nullable(),
  })),
  sonBirimSetiOkuma: zamanSemasi.nullable(),
});

export const BAGLANTI_KONTROL_SONUCLARI = ['tamam', 'hata', 'atlandi'] as const;

export const logoKontrolCevabi = z.object({
  zaman: zamanSemasi,
  // Köprüye en az bir istek ulaşıp anahtar kabul edildiyse true.
  ulasildi: z.boolean(),
  adimlar: z.array(z.object({
    ad: z.string(),
    yol: z.string(),
    sonuc: z.enum(BAGLANTI_KONTROL_SONUCLARI),
    sureMs: z.number().int().nullable(),
    ileti: z.string(),
  })),
});

export type LogoHazirlikCevabi = z.output<typeof logoHazirlikCevabi>;
export type LogoKontrolCevabi = z.output<typeof logoKontrolCevabi>;
export type BaglantiAkisDurumu = (typeof BAGLANTI_AKIS_DURUMLARI)[number];

// D7 (kartlar 2986 a, 2987 a): Logo'da CORE MES dışında açılmış satın alma siparişini okuma ve düzeltme. Yalnız `logo.siparis-duzelt`;
// özellik ayrıca TMIV2_LOGO_SIPARIS_DUZELTME=acik ile açılır (kapalıyken uçlar yok sayılır, 404).
const fisNoSemasi = z.string().trim().min(1, 'Fiş numarası zorunlu.').max(16, 'Fiş numarası en çok 16 karakter.');
const pozitifOndalik = ondalikMetinSemasi.refine((d) => !d.startsWith('-'), 'Değer eksi olamaz.');
const aciklamaSemasi = z.string().max(250);

export const disSiparisSorgusu = z.object({ no: fisNoSemasi });

export const DIS_SIPARIS_OKUMA_DURUMLARI = ['tamam', 'yok', 'kapali', 'ortam-degiskeni-yok', 'hata'] as const;

const disSiparisSatiri = z.object({
  ref: z.number().int().positive(),
  turKodu: z.number().int(),
  kod: z.string().nullable(),
  ad: z.string().nullable(),
  miktar: ondalikMetinSemasi,
  birim: z.string().nullable(),
  fiyat: ondalikMetinSemasi.nullable(),
  dovizFiyati: ondalikMetinSemasi.nullable(),
  kdv: ondalikMetinSemasi.nullable(),
  termin: tarihSemasi.nullable(),
  aciklama: z.string().nullable(),
  kapali: z.boolean(),
});

export const disSiparisCevabi = z.object({
  durum: z.enum(DIS_SIPARIS_OKUMA_DURUMLARI),
  ileti: z.string().nullable(),
  siparis: z.object({
    ref: z.number().int().positive(),
    no: z.string(),
    tarih: tarihSemasi.nullable(),
    cariKodu: z.string().nullable(),
    dovizTuru: z.number().int().nullable(),
    kur: ondalikMetinSemasi.nullable(),
    durum: z.number().int().nullable(),
    iptal: z.boolean(),
    satirlar: z.array(disSiparisSatiri),
  }).nullable(),
  // Okuma anının izi: düzeltme komutu bunu geri yollar; iş gönderimden önce Logo'yu yeniden okur, iz tutmazsa yazmaz.
  iz: z.string().nullable(),
});

export const disSiparisDuzeltGovdesi = z.object({
  no: fisNoSemasi,
  iz: z.string().regex(/^[0-9a-f]{64}$/, 'Okuma izi geçersiz; siparişi yeniden açın.'),
  tarih: tarihSemasi.optional(),
  satirlar: z.array(z.object({
    ref: z.number().int().positive(),
    miktar: pozitifOndalik.optional(),
    fiyat: pozitifOndalik.optional(),
    termin: tarihSemasi.optional(),
    aciklama: aciklamaSemasi.optional(),
    kapat: z.boolean().optional(),
  })).max(500),
  yeniSatirlar: z.array(z.object({
    hizmet: z.boolean(),
    kod: z.string().trim().min(1).max(24),
    miktar: pozitifOndalik,
    fiyat: pozitifOndalik,
    birim: z.string().trim().min(1).max(40),
    kdv: z.number().min(0).max(100),
    termin: tarihSemasi.optional(),
    aciklama: aciklamaSemasi.optional(),
  })).max(100),
});

export const DIS_DUZELTME_DURUMLARI = ['bekliyor', 'gonderildi', 'reddedildi', 'hata'] as const;

// Fiyat taşımaz: yalnız hangi satırın değiştiği, kapandığı ve kaç satır eklendiği.
const disDuzeltmeKaydi = z.object({
  id: z.number().int().positive(),
  fisNo: z.string(),
  durum: z.enum(DIS_DUZELTME_DURUMLARI),
  hata: z.string().nullable(),
  ozet: z.object({ tarih: z.boolean(), degisen: z.array(z.number().int()), kapanan: z.array(z.number().int()), yeni: z.number().int() }).nullable(),
  kisiId: z.number().int().positive(),
  olusturma: zamanSemasi,
  sonucZamani: zamanSemasi.nullable(),
});

export const disDuzeltmeCevabi = z.object({ kayit: disDuzeltmeKaydi });
export const disDuzeltmelerCevabi = z.object({ kayitlar: z.array(disDuzeltmeKaydi) });

export type DisSiparisCevabi = z.output<typeof disSiparisCevabi>;
export type DisSiparisDuzeltGovdesi = z.input<typeof disSiparisDuzeltGovdesi>;
export type DisDuzeltmeKaydi = z.output<typeof disDuzeltmeKaydi>;

// 3077 a: "Logo geçişi" sayfasındaki "Şimdi oku" ve "Geçişi bitir" komutlarının cevabı.
export const logoGecisKomutuCevabi = z.object({ tamam: z.literal(true) });

// 3080 a: Logo geçişinde tek kart canlı araması. Arama yalnız okur ve sonucu kişinin süreç belleğinde tutar; "ekle" bulunan kartı
// okunmuş kopyaya yazar (köprüye gitmez). Kapalıysa ya da köprü yoksa durum ve ileti döner, kart dönmez.
export const LOGO_MALZEME_ARAMA_EN_AZ = 3;
export const LOGO_MALZEME_ARAMA_EN_COK = 100;
export const LOGO_MALZEME_ARAMA_SONUCU = 20;
export const logoMalzemeAramaSorgusu = z.object({
  q: z.string().trim().min(LOGO_MALZEME_ARAMA_EN_AZ, `En az ${LOGO_MALZEME_ARAMA_EN_AZ} karakter yazın.`).max(LOGO_MALZEME_ARAMA_EN_COK),
});
export const logoMalzemeAramaCevabi = z.object({
  durum: z.enum(['tamam', 'kapali', 'ortam-degiskeni-yok', 'hata']),
  ileti: z.string().nullable(),
  kartlar: z.array(z.object({ logoKayitNo: z.number().int(), kod: z.string(), ad: z.string().nullable() })).max(LOGO_MALZEME_ARAMA_SONUCU),
});
export type LogoMalzemeAramaCevabi = z.output<typeof logoMalzemeAramaCevabi>;
export const logoMalzemeEkleGovdesi = z.object({
  kartlar: z.array(z.number().int().positive()).min(1).max(LOGO_MALZEME_ARAMA_SONUCU),
}).strict();
export const logoMalzemeEkleCevabi = z.object({ eklenen: z.number().int() });
export type LogoMalzemeEkleCevabi = z.output<typeof logoMalzemeEkleCevabi>;

// 3201: malzeme kartının "Logo'da" bölümü (yalnız okuma). Miktar ve fiyat işaretli ondalık metin; veri yoksa null.
const kartMiktari = z.string().regex(/^-?\d+(\.\d+)?$/);
export const logoKartParametresi = z.object({ kod: z.string().trim().min(1).max(64) });
export const logoKartBolumuCevabi = z.object({
  // Açık parçalar: anahtar kapalı olan parça ekranda yoktur. fiyat yalnız fiyat görebilen kişide true.
  parcalar: z.object({ stok: z.boolean(), hareket: z.boolean(), fiyat: z.boolean() }),
  // Logo'daki kart kodu (CORE kodundan farklıysa eşlemeden).
  logoKodu: z.string(),
  stok: z.object({
    // Stok aynasının son tam turu; hiç bitmediyse null (ekranda "henüz okunmadı").
    sonOkuma: zamanSemasi.nullable(),
    ambarlar: z.array(z.object({
      ambarNo: z.number().int(), ambarAdi: z.string().nullable(), logo: kartMiktari.nullable(),
      depo: z.object({ kod: z.string(), ad: z.string() }).nullable(), core: kartMiktari.nullable(), fark: kartMiktari.nullable(),
    })),
    eslenen: z.object({ logo: kartMiktari, core: kartMiktari, fark: kartMiktari }).nullable(),
    eslenmemis: kartMiktari.nullable(),
  }).nullable(),
});
export type LogoKartBolumuCevabi = z.output<typeof logoKartBolumuCevabi>;

const kartOkumaDurumu = z.enum(['tamam', 'kapali', 'ortam-degiskeni-yok', 'hata', 'kart-yok']);
export const logoKartHareketSorgusu = z.object({ once: z.coerce.number().int().positive().optional() });
export const logoKartHareketleriCevabi = z.object({
  durum: kartOkumaDurumu,
  ileti: z.string().nullable(),
  kayitlar: z.array(z.object({
    logoKayitNo: z.number().int(), tarih: tarihSemasi, fisTuru: z.number().int(), fisAdi: z.string(),
    yon: z.enum(['giris', 'cikis']).nullable(), fisNo: z.string().nullable(), ambarNo: z.number().int().nullable(),
    miktar: kartMiktari, birim: z.string().nullable(),
  })),
  // Daha eski hareketlerin imleci; yoksa null.
  dahaEski: z.number().int().positive().nullable(),
});
export type LogoKartHareketleriCevabi = z.output<typeof logoKartHareketleriCevabi>;
export const logoKartAlislariCevabi = z.object({
  durum: kartOkumaDurumu,
  ileti: z.string().nullable(),
  kayitlar: z.array(z.object({
    logoKayitNo: z.number().int(), tarih: tarihSemasi, tedarikci: z.string().nullable(), faturaNo: z.string().nullable(),
    miktar: kartMiktari, birim: z.string().nullable(), fiyat: kartMiktari, dovizTuru: z.number().int().nullable(), dovizFiyati: kartMiktari.nullable(),
  })),
});
export type LogoKartAlislariCevabi = z.output<typeof logoKartAlislariCevabi>;
