import { z } from 'zod';
import { KATALOG_KART_DURUMLARI, KATALOG_TURLERI } from './malzemeler.ts';
import { KALITE_DURUMLARI, KONUM_TURLERI } from './stok.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Malzeme 360 (kart 1296, kararlar 1277 a, 1278 a, 1294 a): bir malzemenin elde, gelecek, para ve kalite hâli tek ekranda.
// Modül tablosuzdur ve yazmaz; sahip modüllerin dışa açık okumalarını birleştirir. Miktarlar numeric metindir; veri yoksa null.

const TAM_SAYI_UST = 2147483647;
const KIMLIK = z.number().int().positive().max(TAM_SAYI_UST);
const miktar = z.string();

export const malzemeParametresi = z.object({ id: z.coerce.number().pipe(KIMLIK) });

export const malzemeAramaSorgusu = z.object({
  metin: z.string().trim().max(60).optional(),
  sayfa: z.coerce.number().int().min(1).max(100_000).default(1),
});
export const malzemeAramaSatiri = z.object({
  id: KIMLIK, kod: z.string(), ad: z.string().nullable(), tur: z.enum(KATALOG_TURLERI), birim: z.string().nullable(),
});
export const malzemeAramaCevabi = z.object({
  satirlar: z.array(malzemeAramaSatiri), toplam: z.number().int().nullable(), sayfa: z.number().int(), sayfaBoyu: z.number().int(),
});

// Malzemenin hâli (1278 a): stok bakiyesinin beş ekseninden (konum türü, statü, kalite durumu, rezerve, lot) türetilen tek etiket.
// Şema değişmez; kural sunucuda saf işlevdir. "Siparişte" bakiyesi olmayan gelecek miktardır.
export const HALLER = ['siparis', 'kabul', 'kalite_bekliyor', 'red', 'sartli', 'fason', 'uretimde', 'rezerve', 'serbest', 'hurda'] as const;
export type Hal = (typeof HALLER)[number];
export const halGirdisi = z.object({
  konumTuru: z.enum(KONUM_TURLERI),
  statuId: z.number().int().nullable(),
  kaliteDurumu: z.enum(KALITE_DURUMLARI),
  rezerveMi: z.boolean(),
});
export type HalGirdisi = z.output<typeof halGirdisi>;

// Stok'un değer gruplarıyla bugünkü dağılım (228 a tanımı; stok sahibidir). Konum x hal ayrıntısı stok okuması gelince eklenecek
// (UYUM-BORCU madde 1).
export const STOK_GRUPLARI = ['kullanilabilir', 'kalite', 'fason', 'yolda', 'hurda', 'diger'] as const;
export type StokGrubu = (typeof STOK_GRUPLARI)[number];
export const stokOzeti = z.object({
  toplam: miktar,
  kullanilabilir: miktar,
  gruplar: z.array(z.object({ grup: z.enum(STOK_GRUPLARI), miktar })),
});

export const gelecekSatiri = z.object({ siparisNo: z.string(), tarih: tarihSemasi.nullable(), miktar, birim: z.string() });

export const partiSatiri = z.object({
  partiId: z.number().int(), lotNo: z.string(), tedarikciPartiNo: z.string().nullable(), kayitZamani: zamanSemasi, acikNcr: z.boolean(),
});

// Para bölümü yalnız finans.oku taşıyana dolar (stok panosuyla aynı kural). TL karşılığı hesaplanamayan fiyat null.
export const fiyatBilgisi = z.object({
  ortalamaAlis: z.object({ tryBirimFiyat: z.string().nullable(), teslimSayisi: z.number().int() }).nullable(),
  sonAlis: z.object({ birimFiyat: z.string(), paraBirimi: z.string(), tryBirimFiyat: z.string().nullable(), zaman: zamanSemasi }).nullable(),
  kg: z.object({ kgFiyati: z.string(), paraBirimi: z.string(), tryKgFiyati: z.string().nullable(), tryBirimFiyati: z.string().nullable(), gecerlilik: z.string() }).nullable(),
});

export const malzeme360Cevabi = z.object({
  kart: z.object({
    id: KIMLIK, kod: z.string(), ad: z.string().nullable(), tur: z.enum(KATALOG_TURLERI), birim: z.string().nullable(), onayDurumu: z.enum(KATALOG_KART_DURUMLARI),
  }),
  // Bakiyesi olmayan kartta null.
  stok: stokOzeti.nullable(),
  gelecek: z.array(gelecekSatiri),
  partiler: z.array(partiSatiri),
  paraGorunur: z.boolean(),
  para: fiyatBilgisi.nullable(),
});

export type MalzemeAramaCevabi = z.output<typeof malzemeAramaCevabi>;
export type MalzemeAramaSatiri = z.output<typeof malzemeAramaSatiri>;
export type Malzeme360Cevabi = z.output<typeof malzeme360Cevabi>;
export type GelecekSatiri = z.output<typeof gelecekSatiri>;
export type PartiSatiri = z.output<typeof partiSatiri>;
export type FiyatBilgisi = z.output<typeof fiyatBilgisi>;
