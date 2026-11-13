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

// Canlı makine panosu (3176): SmartES'ten makine başına anlık bilgi; CORE'un okuma zamanı ve durum değişimleriyle.
// "bilinmiyor": SmartES'in durum kodunun karşılığı henüz bilinmiyor; kod ham haliyle gösterilir, uydurulmaz.
export const SMARTES_MAKINE_DURUMLARI = ['calisiyor', 'bekliyor', 'alarm', 'kapali', 'baglanti-yok', 'bilinmiyor'] as const;
export type SmartesMakineDurumu = (typeof SMARTES_MAKINE_DURUMLARI)[number];

const durumDilimi = z.object({ durum: z.enum(SMARTES_MAKINE_DURUMLARI), baslangic: zamanSemasi, bitis: zamanSemasi.nullable() });

export const canliMakinelerCevabi = z.object({
  baglanti: z.enum(SMARTES_BAGLANTI_DURUMLARI),
  // Canlı makine okumasının kendi anahtarı (varsayılan kapalı); kapalıyken istek atılmaz, eski kayıtlar gösterilmez.
  okumaAcik: z.boolean(),
  // SmartES bu metodu sunmuyorsa false; pano "bu bilgiyi vermiyor" der, bağlantı hata sayılmaz.
  destekleniyor: z.boolean(),
  aralikSaniye: z.number().int(),
  sonOkuma: zamanSemasi.nullable(),
  makineler: z.array(z.object({
    makineKodu: z.string(),
    makineAdi: z.string().nullable(),
    istasyonKodu: z.string().nullable(),
    istasyonAdi: z.string().nullable(),
    durum: z.enum(SMARTES_MAKINE_DURUMLARI),
    durumKodu: z.string().nullable(),
    durumBaslangic: zamanSemasi.nullable(),
    mod: z.string().nullable(),
    alarm: z.string().nullable(),
    uyari: z.string().nullable(),
    programNo: z.string().nullable(),
    programAdi: z.string().nullable(),
    sayac: z.number().int().nullable(),
    spindleYuku: z.number().nullable(),
    okundu: zamanSemasi,
    calisanIs: z.object({
      emirId: z.number().int(), emirNo: z.string(), opNo: z.number().int(), opAdi: z.string(),
      // SmartES'in kendi hesabı (WorkordersList): adetçe tamamlanma yüzdesi ve tahmini bitiş. SmartES vermediyse null.
      tamamlananYuzde: z.number().nullable(), tahminiBitis: zamanSemasi.nullable(),
    }).nullable(),
    bugun: z.array(durumDilimi),
  })),
});

// SmartES eksen bilgisini makine başına tek değer verir (eksen başına ayrı değer yoktur); takım için yalnız o anki cep numarası gelir.
export const canliMakineAyrintisiCevabi = z.object({
  makineKodu: z.string(),
  okundu: zamanSemasi,
  mod: z.string().nullable(),
  uyari: z.string().nullable(),
  sayacToplam: z.number().int().nullable(),
  eksenHizi: z.number().int().nullable(),
  eksenOrani: z.number().int().nullable(),
  spindle: z.object({ hiz: z.number().int().nullable(), yuk: z.number().int().nullable(), oran: z.number().int().nullable() }),
  takimCebi: z.number().int().nullable(),
  degisimler: z.array(z.object({ zaman: zamanSemasi, eski: z.enum(SMARTES_MAKINE_DURUMLARI).nullable(), yeni: z.enum(SMARTES_MAKINE_DURUMLARI), aciklama: z.string().nullable() })),
});
export const canliMakineParametresi = z.object({ kod: z.string().min(1).max(200) });
export type CanliMakinelerCevabi = z.output<typeof canliMakinelerCevabi>;
export type CanliMakineAyrintisiCevabi = z.output<typeof canliMakineAyrintisiCevabi>;
