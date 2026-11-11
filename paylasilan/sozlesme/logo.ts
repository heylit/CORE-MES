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
