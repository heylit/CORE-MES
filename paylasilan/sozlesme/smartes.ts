import { z } from 'zod';
import { listeCevapSemasi, sayfaSorguAlanlari } from '../liste.ts';
import { surumSemasi } from '../surum.ts';
import { zamanSemasi } from '../zaman.ts';

// SmartES bağlantısı (kart #778): kod eşlemesi, okunan makine gerçekleşenleri ve iş emri giden kutusu.
export const SMARTES_ESLEME_TURLERI = ['istasyon', 'makine', 'operasyon-tipi', 'durus-nedeni'] as const;
export type SmartesEslemeTuru = (typeof SMARTES_ESLEME_TURLERI)[number];
export const SMARTES_ESLEME_TURU_ADLARI: Readonly<Record<SmartesEslemeTuru, string>> = {
  istasyon: 'İstasyon', makine: 'Makine', 'operasyon-tipi': 'Operasyon tipi', 'durus-nedeni': 'Duruş nedeni',
};

export const SMARTES_BAGLANTI_DURUMLARI = ['kapali', 'acik', 'ortam-degiskeni-yok'] as const;
export type SmartesBaglantiDurumu = (typeof SMARTES_BAGLANTI_DURUMLARI)[number];
export const SMARTES_OKUMA_KAYNAKLARI = ['is-emri-durumu', 'durus', 'alarm'] as const;

export const durumCevabi = z.object({
  baglanti: z.enum(SMARTES_BAGLANTI_DURUMLARI),
  okumalar: z.array(z.object({
    kaynak: z.enum(SMARTES_OKUMA_KAYNAKLARI),
    sonBitis: zamanSemasi.nullable(),
    sonDeneme: zamanSemasi,
    sonSonuc: z.enum(['tamam', 'hata']),
    sonHata: z.string().nullable(),
    okunan: z.number().int().nullable(),
    kimliksiz: z.number().int().nullable(),
  })),
  sayilar: z.object({
    isEmriDurumu: z.number().int(),
    durus: z.number().int(),
    alarm: z.number().int(),
    gidenGonderilen: z.number().int(),
    gidenHatali: z.number().int(),
  }),
});

export const eslemeSorgusu = z.object({ tur: z.enum(SMARTES_ESLEME_TURLERI) });

export const eslemelerCevabi = z.object({
  tur: z.enum(SMARTES_ESLEME_TURLERI),
  satirlar: z.array(z.object({
    tmiId: z.number().int(),
    tmiKod: z.string(),
    tmiAd: z.string(),
    aktif: z.boolean(),
    smartesKod: z.string().nullable(),
    // Eşleme yoksa null; düzenleme ve kaldırma bu sürümle gider.
    surum: surumSemasi.nullable(),
  })),
});

// SmartES kodu baştan ve sondan boşluksuz, en çok 50 karakter; boş kod "kaldır" ucuyla gider.
const smartesKodu = z.string().trim().min(1, 'SmartES kodu zorunlu.').max(50, 'SmartES kodu en çok 50 karakter.');

export const eslemeAtaGovdesi = z.object({
  tur: z.enum(SMARTES_ESLEME_TURLERI),
  tmiId: z.number().int().positive(),
  smartesKod: smartesKodu,
  // Yeni eşlemede null; var olanı değiştirirken okunan sürüm.
  surum: surumSemasi.nullable(),
});

export const eslemeKaldirGovdesi = z.object({
  tur: z.enum(SMARTES_ESLEME_TURLERI),
  tmiId: z.number().int().positive(),
  surum: surumSemasi,
});

export const eslemeCevabi = z.object({ tmiId: z.number().int(), smartesKod: z.string().nullable(), surum: surumSemasi.nullable() });

export const sayfaSorgusu = z.object({ ...sayfaSorguAlanlari });

export const isEmriDurumlariCevabi = listeCevapSemasi(z.object({
  smartesId: z.number().int(),
  isEmriNo: z.string().nullable(),
  erpId: z.string().nullable(),
  istasyonKodu: z.string().nullable(),
  operasyonKodu: z.string().nullable(),
  makineKodu: z.string().nullable(),
  stokNo: z.string().nullable(),
  saglam: z.number().int().nullable(),
  red: z.number().int().nullable(),
  makineSaglam: z.number().int().nullable(),
  makineRed: z.number().int().nullable(),
  baslangic: zamanSemasi.nullable(),
  bitis: zamanSemasi.nullable(),
  sonOkuma: zamanSemasi,
}));

export const duruslarCevabi = listeCevapSemasi(z.object({
  smartesId: z.number().int(),
  makineKodu: z.string().nullable(),
  nedenKodu: z.string().nullable(),
  isEmriNo: z.string().nullable(),
  baslangic: zamanSemasi.nullable(),
  bitis: zamanSemasi.nullable(),
}));

export const alarmlarCevabi = listeCevapSemasi(z.object({
  smartesId: z.number().int(),
  makineKodu: z.string().nullable(),
  alarmKodu: z.string().nullable(),
  aciklama: z.string().nullable(),
  baslangic: zamanSemasi.nullable(),
  bitis: zamanSemasi.nullable(),
}));

export const gidenCevabi = listeCevapSemasi(z.object({
  isEmriId: z.number().int(),
  smartesIsEmriNo: z.string(),
  durum: z.enum(['gonderildi', 'hata', 'kapandi']),
  denemeSayisi: z.number().int(),
  sonDeneme: zamanSemasi,
  sonHata: z.string().nullable(),
  sonrakiDeneme: zamanSemasi.nullable(),
}));

export type DurumCevabi = z.output<typeof durumCevabi>;
export type EslemelerCevabi = z.output<typeof eslemelerCevabi>;
export type EslemeAtaGovdesi = z.input<typeof eslemeAtaGovdesi>;
export type EslemeKaldirGovdesi = z.input<typeof eslemeKaldirGovdesi>;
export type EslemeCevabi = z.output<typeof eslemeCevabi>;
export type IsEmriDurumlariCevabi = z.output<typeof isEmriDurumlariCevabi>;
export type DuruslarCevabi = z.output<typeof duruslarCevabi>;
export type AlarmlarCevabi = z.output<typeof alarmlarCevabi>;
export type GidenCevabi = z.output<typeof gidenCevabi>;

// Bağlantı hazırlığı ve canlı kontrol (Sistem Ayarları > Bağlantılar > Hazırlık). Durum adları logo sözleşmesindekiyle aynıdır.
export const SMARTES_AKIS_DURUMLARI = ['hazir', 'kapali', 'ayar-eksik', 'baglanmadi', 'kodda-yok'] as const;
export const SMARTES_AKIS_YONLERI = ['tmi-smartes', 'smartes-tmi'] as const;

export const smartesHazirlikCevabi = z.object({
  baglanti: z.enum(SMARTES_BAGLANTI_DURUMLARI),
  ortam: z.object({
    // Servisin tam adresi (kurum içi); tanımlı değilse null.
    adres: z.string().nullable(),
    adAlani: z.string().nullable(),
  }),
  akislar: z.array(z.object({
    anahtar: z.string(),
    yon: z.enum(SMARTES_AKIS_YONLERI),
    baslik: z.string(),
    aciklama: z.string(),
    durum: z.enum(SMARTES_AKIS_DURUMLARI),
    // Akışın kendi Sistem Ayarları anahtarı; yoksa yalnız ana bağlantı anahtarına bağlıdır. Alan sonradan eklendi, eski istemci görmezden gelir.
    ayar: z.string().nullable().optional(),
    // İşlenen ve hatalı kayıt sayısı, son deneme; akışın kaydı yoksa null.
    islenen: z.number().int().nullable(),
    hatali: z.number().int().nullable(),
    sonDeneme: zamanSemasi.nullable(),
    // Son okumanın hatası (yalnız okuma akışlarında).
    sonHata: z.string().nullable(),
  })),
});

export const smartesKontrolCevabi = z.object({
  zaman: zamanSemasi,
  ulasildi: z.boolean(),
  adimlar: z.array(z.object({
    ad: z.string(),
    sonuc: z.enum(['tamam', 'hata', 'atlandi']),
    sureMs: z.number().int().nullable(),
    ileti: z.string(),
  })),
});

export type SmartesHazirlikCevabi = z.output<typeof smartesHazirlikCevabi>;
export type SmartesKontrolCevabi = z.output<typeof smartesKontrolCevabi>;
