import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';

// Tezgâh bağlantısı denemesi (kart 3373, ADR 0033): tezgahların ortak MTConnect servisinden salt okunur anlık değerler.
// Üretim kaydına, sayıma, stoğa işlenmez; yalnız SmartES'in aynı tezgah için değeriyle yan yana gösterilir.
export const TEZGAH_DURUMLARI = ['calisiyor', 'bekliyor', 'alarm', 'baglanti-yok', 'bilinmiyor'] as const;
export type TezgahDurumu = (typeof TEZGAH_DURUMLARI)[number];

// Karşılaştırılan alanlar iki genişlikte aynıdır: durum, program, sayaç birebir; iş mili hızı ve yükü eşikle.
export const TEZGAH_KARSILASTIRMA_ALANLARI = ['durum', 'program', 'sayac', 'isMiliHizi', 'isMiliYuku'] as const;
export type TezgahKarsilastirmaAlani = (typeof TEZGAH_KARSILASTIRMA_ALANLARI)[number];

// Tezgâh türü MTConnect'ten okunmaz; yönetici seçer (kart 3659-2). Çizim türe göre yapılır, tür yoksa çizilmez.
export const TEZGAH_TURLERI = ['dikey-freze', 'torna', 'yatay-islem'] as const;
export type TezgahTuru = (typeof TEZGAH_TURLERI)[number];

export const BOSLUK_NEDENLERI = ['tampon-asildi', 'servis-yeniden-basladi', 'satir-siniri'] as const;
export const DOLULUK_SEVIYELERI = ['normal', 'uyari', 'kritik'] as const;
export const TEZGAH_VARLIK_DURUMLARI = ['bekleniyor', 'okundu', 'yok', 'hata'] as const;
export const TEZGAH_BAGLANTI_HALLERI = ['kapali', 'adres-yok', 'acik'] as const;
export const TEZGAH_KAYNAKLARI = ['mtconnect', 'lsv2'] as const;
export type TezgahKaynagi = (typeof TEZGAH_KAYNAKLARI)[number];

const tezgahSatiri = z.object({
  cihazAdi: z.string(),
  durum: z.enum(TEZGAH_DURUMLARI),
  // Tezgahın yayınladığı ham değerler; yayınlamadığı alan null (sıfır uydurulmaz).
  calisma: z.string().nullable(),
  mod: z.string().nullable(),
  program: z.string().nullable(),
  sayac: z.number().int().nullable(),
  takim: z.string().nullable(),
  isMiliHizi: z.number().nullable(),
  isMiliYuku: z.number().nullable(),
  ilerleme: z.number().nullable(),
  alarm: z.string().nullable(),
  okundu: zamanSemasi,
  // Son okuma, okuma aralığının iki katından eskiyse true.
  eski: z.boolean(),
  // SmartES'in aynı kodlu makine için son değeri; SmartES'te o kod yoksa null.
  smartes: z.object({
    durum: z.string(),
    program: z.string().nullable(),
    sayac: z.number().int().nullable(),
    isMiliHizi: z.number().nullable(),
    isMiliYuku: z.number().nullable(),
    okundu: zamanSemasi,
  }).nullable(),
  farklar: z.array(z.enum(TEZGAH_KARSILASTIRMA_ALANLARI)),
  // Okuma kaynağı (kart 3753): ortak MTConnect servisi ya da Heidenhain kumandası (LSV2, doğrudan).
  kaynak: z.enum(TEZGAH_KAYNAKLARI),
  // Yalnız Heidenhain makinesinde: okunamayan alanın nedeni (kapalı ya da meşgul, DNC yok, sayaç için yetki yok); yoksa null.
  uyari: z.string().nullable(),
});

// Değer geçmişi tablosunun doluluğu (kart 3680). Yüzde 80'de uyarı, 95'te kritik; Sistem İzleme de bu alanı okuyabilir.
export const tezgahDoluluguSemasi = z.object({
  satirSayisi: z.number().int(),
  satirSiniri: z.number().int(),
  // Satır sayısının sınıra oranı (yüzde, bir ondalık).
  yuzde: z.number(),
  seviye: z.enum(DOLULUK_SEVIYELERI),
  // Tablonun diskteki boyutu (indeksler dahil, bayt); okunamadıysa null.
  diskBayt: z.number().int().nullable(),
  enEskiKayit: zamanSemasi.nullable(),
  // Süzgecin sayaçları sunucu belleğindedir: sunucu yeniden açılınca sıfırlanır. Ölçülmediyse (henüz tur yok) null.
  olcum: z.object({
    // Sayaçların kapsadığı süre (1-60 dakika).
    pencereDakika: z.number().int(),
    yazilan: z.number().int(),
    atlanan: z.number().int(),
    yazilanDakikada: z.number(),
    atlananDakikada: z.number(),
  }).nullable(),
});
export type TezgahDoluluguCevabi = z.output<typeof tezgahDoluluguSemasi>;

export const tezgahBaglantisiDurumCevabi = z.object({
  baglanti: z.enum(TEZGAH_BAGLANTI_HALLERI),
  // Heidenhain okuması (LSV2): ayar kapalı, makine listesi yok ya da açık.
  lsv2Baglanti: z.enum(TEZGAH_BAGLANTI_HALLERI),
  // Ayardaki okuma aralığı; ekran bu aralıkta yenilenir.
  aralikSaniye: z.number().int(),
  // /assets: servis takım verisi vermiyorsa "yok"; henüz okunmadıysa "bekleniyor".
  varlikDurumu: z.enum(TEZGAH_VARLIK_DURUMLARI),
  sonDeneme: zamanSemasi.nullable(),
  sonOkuma: zamanSemasi.nullable(),
  // Son turun hatası; adres ve cevap gövdesi taşımaz.
  sonHata: z.string().nullable(),
  tezgahlar: z.array(tezgahSatiri),
  doluluk: tezgahDoluluguSemasi,
});
export type TezgahBaglantisiDurumCevabi = z.output<typeof tezgahBaglantisiDurumCevabi>;

export const tezgahParametresi = z.object({ cihazAdi: z.string().min(1).max(100) });

const alanKategorisi = z.enum(['SAMPLE', 'EVENT', 'CONDITION']);

export const tezgahAyrintisiCevabi = z.object({
  cihazAdi: z.string(),
  durum: z.enum(TEZGAH_DURUMLARI),
  okundu: zamanSemasi,
  eski: z.boolean(),
  aralikSaniye: z.number().int(),
  // Yöneticinin seçtiği tür; seçilmediyse null.
  tezgahTuru: z.enum(TEZGAH_TURLERI).nullable(),
  // Tezgahın yayınladığı bütün öğeler, geldiği adla.
  ogeler: z.array(z.object({
    tur: z.string(), ad: z.string().nullable(), bilesen: z.string().nullable(), deger: z.string().nullable(), zaman: z.string().nullable(),
  })),
  // /probe tanımıyla birleşmiş alanlar (koşullar hariç): bileşen, birim, kategori; sayısal alanda son saatin dakikalık eğrisi.
  alanlar: z.array(z.object({
    kimlik: z.string().nullable(), tur: z.string(), ad: z.string().nullable(),
    bilesen: z.string().nullable(), bilesenAdi: z.string().nullable(), birim: z.string().nullable(), kategori: alanKategorisi.nullable(),
    deger: z.string().nullable(), sonDegisme: z.string().nullable(),
    egri: z.array(z.object({ zaman: zamanSemasi, deger: z.number() })),
  })),
  // Koşul kayıtları (son 24 saat, en yeni önce); bitis null ise sürüyor.
  kosullar: z.array(z.object({
    kimlik: z.string(), tur: z.string().nullable(), hal: z.enum(['Normal', 'Warning', 'Fault', 'Unavailable']),
    ileti: z.string().nullable(), baslangic: zamanSemasi, bitis: zamanSemasi.nullable(),
  })),
  varlikDurumu: z.enum(TEZGAH_VARLIK_DURUMLARI),
  varliklar: z.array(z.object({
    kimlik: z.string(), tur: z.string(), takimNo: z.string().nullable(), zaman: zamanSemasi.nullable(),
    omurler: z.array(z.object({
      tur: z.string().nullable(), yon: z.string().nullable(), deger: z.number().nullable(), baslangic: z.number().nullable(),
      uyari: z.number().nullable(), sinir: z.number().nullable(),
    })),
  })),
  // Servis tamponundan düşen ya da servisin yeniden başladığı anlar (son 24 saat).
  bosluklar: z.array(z.object({ zaman: zamanSemasi, neden: z.enum(BOSLUK_NEDENLERI) })),
  // Eğrilerin penceresi.
  egriBasi: zamanSemasi,
  egriSonu: zamanSemasi,
});
export type TezgahAyrintisiCevabi = z.output<typeof tezgahAyrintisiCevabi>;

// Heidenhain takım tablosu (kart 3790): seyrek okumayla LSV2'den okunan TOOL.T son durumu. okundu null ise hiç okunmadı.
// Program dosya listesi okunmaz (kumandada klasör değiştirmek yazma komutu ister); ekran bunu yazar.
export const tezgahTakimTablosuCevabi = z.object({
  cihazAdi: z.string(),
  seyrekAcik: z.boolean(),
  okundu: zamanSemasi.nullable(),
  // Son seyrek okumada tablo okunamadıysa nedeni (kumanda kodu dahil); okunduysa null.
  tani: z.string().nullable(),
  gecmisSayisi: z.number().int(),
  takimlar: z.array(z.object({
    no: z.number().int(), ad: z.string().nullable(), boy: z.number().nullable(), yaricap: z.number().nullable(),
    omur: z.number().nullable(), kullanilan: z.number().nullable(), kilitli: z.boolean().nullable(),
  })),
});
export type TezgahTakimTablosuCevabi = z.output<typeof tezgahTakimTablosuCevabi>;

export const tezgahTuruGovdesi = z.object({ tur: z.enum(TEZGAH_TURLERI).nullable() });
export const tezgahTuruCevabi = z.object({ tezgahTuru: z.enum(TEZGAH_TURLERI).nullable() });
