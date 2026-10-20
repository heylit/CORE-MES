import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';

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
  ad: z.string().trim().min(1).max(80).nullable().default(null),
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
