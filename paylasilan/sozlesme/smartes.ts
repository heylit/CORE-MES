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

export const SMARTES_ONERI_GEREKCELERI = ['ayni-kod', 'ayni-ad', 'benzer-ad'] as const;
export type SmartesOneriGerekcesi = (typeof SMARTES_ONERI_GEREKCELERI)[number];

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
    // Eşlenmemiş kayda SmartES listesinden bulunan aday: aynı kod, aynı ad ya da benzer ad. Kişi onaylamadan eşleme yazılmaz.
    oneri: z.object({ kod: z.string(), ad: z.string().nullable(), gerekce: z.enum(SMARTES_ONERI_GEREKCELERI) }).nullable(),
  })),
  // SmartES'in kendi listesi (istasyon, makine, operasyon); kod buradan seçilir. Hiç okunamadıysa null: kod elle girilir.
  smartesListesi: z.array(z.object({ kod: z.string(), ad: z.string().nullable() })).nullable(),
});

// Önerilerin onayı (tek ya da toplu): yalnız ekranda görülen öneriler gider. Sunucu öneriyi yeniden hesaplar; arada eşlenmiş,
// kodu başka kayda verilmiş ya da önerisi değişmiş satır yazılmaz, sayılır.
export const onerileriOnaylaGovdesi = z.object({
  tur: z.enum(SMARTES_ESLEME_TURLERI),
  satirlar: z.array(z.object({ tmiId: z.number().int().positive(), smartesKod: z.string().min(1).max(50) })).min(1).max(500),
});
export const onerileriOnaylaCevabi = z.object({ yazilan: z.number().int(), atlanan: z.number().int() });

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

/* ---------------- Makine bulguları (kart 3192): makine verisiyle çalışanın girdiği karşılaştırılır; yalnız gösterilir ---------------- */

export const MAKINE_BULGU_TURLERI = ['durum', 'durus', 'sayim', 'program', 'cevrim', 'bitis', 'oee', 'oran', 'yuk', 'alarm'] as const;
export type MakineBulguTuru = (typeof MAKINE_BULGU_TURLERI)[number];
export const MAKINE_BULGU_TONLARI = ['tamam', 'uyari', 'hata', 'pasif'] as const;
export const MAKINE_CIZELGE_TURLERI = ['calisiyor', 'nedenli', 'nedensiz', 'alarm', 'kapali'] as const;

const bulguSerisi = z.object({ ad: z.string(), degerler: z.array(z.number().nullable()) });
const kategori = z.object({ etiket: z.string(), deger: z.number() });

export const makineBulgulariCevabi = z.object({
  okumaAcik: z.boolean(),
  sonOkuma: zamanSemasi.nullable(),
  // Tür henüz hesaplanmıyorsa (sonraki adımlar) kutu "veri yok" der: deger null.
  kutular: z.array(z.object({ tur: z.enum(MAKINE_BULGU_TURLERI), deger: z.string().nullable(), alt: z.string().nullable(), ton: z.enum(MAKINE_BULGU_TONLARI) })),
  bulgular: z.array(z.object({
    id: z.string(), tur: z.enum(MAKINE_BULGU_TURLERI), ton: z.enum(MAKINE_BULGU_TONLARI), makineKodu: z.string(), makineAdi: z.string().nullable(),
    emirNo: z.string().nullable(), opNo: z.number().int().nullable(), baslik: z.string(), hesap: z.string(), ne: z.string(), zaman: zamanSemasi,
  })),
  karne: z.array(z.object({
    makineKodu: z.string(), makineAdi: z.string().nullable(),
    hucreler: z.record(z.enum(MAKINE_BULGU_TURLERI), z.object({ metin: z.string().nullable(), ton: z.enum(MAKINE_BULGU_TONLARI) })),
  })),
  grafikler: z.object({
    cizelge: z.object({
      baslangic: zamanSemasi, bitis: zamanSemasi, simdi: zamanSemasi,
      satirlar: z.array(z.object({
        makineKodu: z.string(),
        parcalar: z.array(z.object({ baslangic: zamanSemasi, bitis: zamanSemasi, tur: z.enum(MAKINE_CIZELGE_TURLERI), not: z.string() })),
      })),
    }),
    duruslar: z.array(kategori),
    // Makine sayacı SmartES'ten, operatörün adedi CORE terminalinden; makine CORE'da eşlenmemişse yalnız makine serisi gelir.
    sayim: z.object({ makineKodu: z.string(), etiketler: z.array(z.string()), seriler: z.array(bulguSerisi) }).nullable(),
  }).nullable(),
});
export type MakineBulgulariCevabi = z.output<typeof makineBulgulariCevabi>;
// Fire ve duruş adı eşlemesi (3174): liste SmartES'in tanım listesinden gelir (RejectsList, DownTimeList); her ad bir CORE nedenine bağlanır.
// "yok": eşlenmiş ad son okumada SmartES listesinde bulunmadı (silinmiş ya da adı değişmiş). "yeni": ilk listeden sonra gelmiş, eşlenmemiş ad.
export const SMARTES_GELEN_AD_TURLERI = ['fire', 'durus'] as const;
export type SmartesGelenAdTuru = (typeof SMARTES_GELEN_AD_TURLERI)[number];
export const SMARTES_AD_DURUMLARI = ['eslendi', 'eslenmedi', 'yok', 'yeni'] as const;
// Fire eşlemesinde: hatalı kaydı (kalite kararına) ya da doğrudan hurda (stoktan fire çıkışı).
export const SMARTES_FIRE_SONUCLARI = ['hatali', 'hurda'] as const;
export type SmartesFireSonucu = (typeof SMARTES_FIRE_SONUCLARI)[number];

const nedenOzeti = z.object({ id: z.number().int(), kod: z.string(), ad: z.string() });
// SmartES kimliği ('id:<n>') ya da kimlik gelmediyse ad ('ad:<ad>').
const adAnahtari = z.string().min(4).max(210);

export const gelenAdSorgusu = z.object({ tur: z.enum(SMARTES_GELEN_AD_TURLERI) });

export const gelenAdlarCevabi = z.object({
  tur: z.enum(SMARTES_GELEN_AD_TURLERI),
  // SmartES listesinin son başarılı okuması; hiç okunmadıysa null.
  sonOkuma: zamanSemasi.nullable(),
  // Son deneme hata verdiyse iletisi; liste eski haliyle gösterilir.
  sonHata: z.string().nullable(),
  // Okunan kayıtların üretim ve duruş kaydına işlenmesi bağlı mı. Bağlı değilken eşleme yalnız saklanır, kayıt işlenmez.
  islemeBagli: z.boolean(),
  satirlar: z.array(z.object({
    anahtar: adAnahtari,
    smartesId: z.string().nullable(),
    ad: z.string(),
    grup: z.string().nullable(),
    operatorKaynakli: z.boolean().nullable(),
    // SmartES fire tanımında "yeniden işlenir" alanı yoktur; ileride gelirse dolar.
    rework: z.boolean().nullable(),
    durum: z.enum(SMARTES_AD_DURUMLARI),
    neden: nedenOzeti.nullable(),
    sonuc: z.enum(SMARTES_FIRE_SONUCLARI).nullable(),
    // Bu adla okunmuş, adı eşlenmediği için bekleyen kayıt sayısı.
    bekleyen: z.number().int(),
    // Eşlenmemiş ada adı aynı ya da çok benzeyen CORE nedeni; kişi onaylamadan eşleme yazılmaz.
    oneri: nedenOzeti.nullable(),
    ilkBekleyen: zamanSemasi.nullable(),
    surum: surumSemasi.nullable(),
  })),
  nedenler: z.array(nedenOzeti),
});

export const gelenAdEsleGovdesi = z.object({
  tur: z.enum(SMARTES_GELEN_AD_TURLERI),
  anahtar: adAnahtari,
  nedenId: z.number().int().positive(),
  // Firede zorunlu, duruşta null.
  sonuc: z.enum(SMARTES_FIRE_SONUCLARI).nullable(),
  // Yeni eşlemede null; var olanı değiştirirken okunan sürüm.
  surum: surumSemasi.nullable(),
});
export const gelenAdKaldirGovdesi = z.object({ tur: z.enum(SMARTES_GELEN_AD_TURLERI), anahtar: adAnahtari, surum: surumSemasi });
export const gelenAdOnerileriOnaylaGovdesi = z.object({
  tur: z.enum(SMARTES_GELEN_AD_TURLERI),
  satirlar: z.array(z.object({ anahtar: adAnahtari, nedenId: z.number().int().positive() })).min(1).max(500),
});

// "Şimdi oku": SmartES'in tanım listeleri (istasyon, makine, operasyon, fire, duruş) yeniden okunur. Okunamayan liste eski haliyle kalır.
export const SMARTES_LISTE_TURLERI = ['istasyon', 'makine', 'operasyon', 'fire', 'durus'] as const;
export const listeOkuCevabi = z.object({ okunan: z.array(z.enum(SMARTES_LISTE_TURLERI)), hatali: z.array(z.enum(SMARTES_LISTE_TURLERI)) });
export type ListeOkuCevabi = z.output<typeof listeOkuCevabi>;

// SmartES'ten gelen her şeyin özeti: hangi bilgi okunuyor, en son ne zaman, kaç kayıt, CORE'da nerede kullanılıyor.
// okunuyor: düzenli okunur. kapali: bağlantı ya da o okumanın anahtarı kapalı. okunmuyor: CORE bu bilgiyi henüz okumuyor.
export const SMARTES_GELEN_DURUMLARI = ['okunuyor', 'kapali', 'okunmuyor'] as const;
export const gelenlerCevabi = z.object({
  kalemler: z.array(z.object({
    anahtar: z.string(),
    baslik: z.string(),
    durum: z.enum(SMARTES_GELEN_DURUMLARI),
    sonOkuma: zamanSemasi.nullable(),
    sayi: z.number().int().nullable(),
    kullanim: z.string(),
    yol: z.string().nullable(),
  })),
});

const gelenSatir = { smartesId: z.number().int(), isEmriNo: z.string().nullable(), stokNo: z.string().nullable(), zaman: zamanSemasi.nullable() };
export const fireHareketleriCevabi = listeCevapSemasi(z.object({
  ...gelenSatir, istasyonKodu: z.string().nullable(), makineKodu: z.string().nullable(), adet: z.number().int().nullable(), neden: z.string().nullable(),
}));
export const ambarHareketleriCevabi = listeCevapSemasi(z.object({
  ...gelenSatir, ambarKodu: z.string().nullable(), hareketTuru: z.string().nullable(), miktar: z.number().nullable(),
}));
export const kaliteOlcumleriCevabi = listeCevapSemasi(z.object({
  ...gelenSatir, istasyonKodu: z.string().nullable(), makineKodu: z.string().nullable(), olcumAdi: z.string().nullable(),
  olcumDegeri: z.string().nullable(), sonuc: z.string().nullable(),
}));

// Satırın SmartES'ten geldiği haliyle bütün alanları (saklanan ham kayıt).
export const SMARTES_HAM_TURLERI = ['uretim', 'durus', 'alarm', 'fire', 'ambar', 'kalite'] as const;
export type SmartesHamTuru = (typeof SMARTES_HAM_TURLERI)[number];
export const hamKayitParametresi = z.object({ tur: z.enum(SMARTES_HAM_TURLERI), id: z.coerce.number<number>().int().positive() });
export const hamKayitCevabi = z.object({ alanlar: z.array(z.object({ ad: z.string(), deger: z.string().nullable() })) });

export type GelenlerCevabi = z.output<typeof gelenlerCevabi>;
export type FireHareketleriCevabi = z.output<typeof fireHareketleriCevabi>;
export type AmbarHareketleriCevabi = z.output<typeof ambarHareketleriCevabi>;
export type KaliteOlcumleriCevabi = z.output<typeof kaliteOlcumleriCevabi>;
export type HamKayitCevabi = z.output<typeof hamKayitCevabi>;

export type OnerileriOnaylaGovdesi = z.input<typeof onerileriOnaylaGovdesi>;
export type OnerileriOnaylaCevabi = z.output<typeof onerileriOnaylaCevabi>;
export type GelenAdlarCevabi = z.output<typeof gelenAdlarCevabi>;
export type GelenAdEsleGovdesi = z.input<typeof gelenAdEsleGovdesi>;
export type GelenAdKaldirGovdesi = z.input<typeof gelenAdKaldirGovdesi>;
export type GelenAdOnerileriOnaylaGovdesi = z.input<typeof gelenAdOnerileriOnaylaGovdesi>;
