import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';

// Tezgah bağlantısı denemesi (kart 3373, ADR 0033): tezgahların ortak MTConnect servisinden salt okunur anlık değerler.
// Üretim kaydına, sayıma, stoğa işlenmez; yalnız SmartES'in aynı tezgah için değeriyle yan yana gösterilir.
export const TEZGAH_DURUMLARI = ['calisiyor', 'bekliyor', 'alarm', 'baglanti-yok', 'bilinmiyor'] as const;
export type TezgahDurumu = (typeof TEZGAH_DURUMLARI)[number];

// Karşılaştırılan alanlar iki genişlikte aynıdır: durum, program, sayaç birebir; iş mili hızı ve yükü eşikle.
export const TEZGAH_KARSILASTIRMA_ALANLARI = ['durum', 'program', 'sayac', 'isMiliHizi', 'isMiliYuku'] as const;
export type TezgahKarsilastirmaAlani = (typeof TEZGAH_KARSILASTIRMA_ALANLARI)[number];

export const TEZGAH_BAGLANTI_HALLERI = ['kapali', 'adres-yok', 'acik'] as const;

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
});

export const tezgahBaglantisiDurumCevabi = z.object({
  baglanti: z.enum(TEZGAH_BAGLANTI_HALLERI),
  aralikSaniye: z.number().int(),
  sonDeneme: zamanSemasi.nullable(),
  sonOkuma: zamanSemasi.nullable(),
  // Son turun hatası; adres ve cevap gövdesi taşımaz.
  sonHata: z.string().nullable(),
  tezgahlar: z.array(tezgahSatiri),
});
export type TezgahBaglantisiDurumCevabi = z.output<typeof tezgahBaglantisiDurumCevabi>;

export const tezgahParametresi = z.object({ cihazAdi: z.string().min(1).max(100) });

export const tezgahAyrintisiCevabi = z.object({
  cihazAdi: z.string(),
  durum: z.enum(TEZGAH_DURUMLARI),
  okundu: zamanSemasi,
  eski: z.boolean(),
  // Tezgahın yayınladığı bütün öğeler, geldiği adla.
  ogeler: z.array(z.object({
    tur: z.string(), ad: z.string().nullable(), bilesen: z.string().nullable(), deger: z.string().nullable(), zaman: z.string().nullable(),
  })),
});
export type TezgahAyrintisiCevabi = z.output<typeof tezgahAyrintisiCevabi>;
