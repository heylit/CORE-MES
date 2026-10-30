import { z } from 'zod';
import { MAKINE_DURUMLARI } from './istasyonlar.ts';
import { tarihSemasi, zamanSemasi } from '../zaman.ts';

// Kaynak 360 (kart 1325, kararlar 1304 a, 1322 a, 1323 a): istasyonun, makinenin ve kişinin üretim yüzü tek ekranda. Modül tablosuzdur
// ve yazmaz; sahip modüllerin dışa açık okumalarını birleştirir. Her bölüm sahibinin okuma işlemini ister; işlemi olmayana bölüm
// null döner ve sorgusu atılmaz (1322 a). Veri yoksa null; sıfır uydurulmaz.

const TAM_SAYI_UST = 2147483647;
const KIMLIK = z.number().int().positive().max(TAM_SAYI_UST);

export const KAYNAK_TURLERI = ['istasyon', 'makine', 'kisi'] as const;
export type KaynakTuru = (typeof KAYNAK_TURLERI)[number];
export const kaynakParametresi = z.object({ id: z.coerce.number().pipe(KIMLIK) });

export const KAYNAK_ARAMA_EN_COK = 50;
export const kaynakAramaSorgusu = z.object({ metin: z.string().trim().max(60).default('') });
export const kaynakAramaCevabi = z.object({
  satirlar: z.array(z.object({ tur: z.enum(KAYNAK_TURLERI), id: KIMLIK, kod: z.string().nullable(), ad: z.string(), aktif: z.boolean(), ust: z.string().nullable() })),
  dahaVar: z.boolean(),
});

// Bölümlerin okuma işlemleri (1322 a): sahibin kendi ekranını açan işlemlerden biri. Ekran gizlediği bölümü bu tablodan bilir.
export const BOLUM_ISLEMLERI = {
  tesis: ['sayfa.istasyonlar', 'istasyonlar.yaz'],
  vardiya: ['sayfa.vardiya'],
  izin: ['ik.oku', 'ik.izin-oku'],
  isler: ['sayfa.uretim-emirleri'],
  oee: ['oee.oku'],
  maliyet: ['finans.maliyet-oku'],
} as const;
export type Bolum = keyof typeof BOLUM_ISLEMLERI;

const kaynakOzeti = z.object({ tur: z.enum(KAYNAK_TURLERI), id: KIMLIK, kod: z.string().nullable(), ad: z.string(), aktif: z.boolean() });
const kisiPayi = z.object({ kisiId: KIMLIK, ad: z.string(), yuzde: z.string() });
const makineDurumu = z.object({ durum: z.enum(MAKINE_DURUMLARI), aciklama: z.string().nullable(), degisme: zamanSemasi });
// Son yedi günün OEE'si (oran 0-1); veri yoksa alanlar null.
const oeeOzeti = z.object({ baslangic: tarihSemasi, bitis: tarihSemasi, oee: z.number().nullable(), kullanilabilirlik: z.number().nullable(), performans: z.number().nullable(), kalite: z.number().nullable() });
const saatMaliyeti = z.object({ saatMaliyeti: z.string(), paraBirimi: z.string() });

export const istasyon360Cevabi = z.object({
  kaynak: kaynakOzeti,
  isMerkezi: z.object({ id: KIMLIK, kod: z.string(), ad: z.string(), aktif: z.boolean() }).nullable(),
  tesis: z.object({
    makineler: z.array(kaynakOzeti.extend({ durum: makineDurumu.nullable() })),
    atananlar: z.array(kisiPayi),
    yetkinler: z.array(z.object({ kisiId: KIMLIK, ad: z.string() })),
  }).nullable(),
  oee: oeeOzeti.nullable(),
  maliyet: saatMaliyeti.nullable(),
  gorunurBolumler: z.array(z.string()),
});

export const makine360Cevabi = z.object({
  kaynak: kaynakOzeti,
  istasyon: kaynakOzeti.nullable(),
  tesis: z.object({
    durum: makineDurumu.nullable(),
    atananlar: z.array(kisiPayi),
    yetkinler: z.array(z.object({ kisiId: KIMLIK, ad: z.string() })),
  }).nullable(),
  // Bakım ve arıza geçmişi Arkon'dan okunacak (1323 a); Arkon'un makineye göre okuması gelene kadar boş (BASKA-MODUL-ISTEKLERI).
  gorunurBolumler: z.array(z.string()),
});

export const kisi360Cevabi = z.object({
  kaynak: kaynakOzeti,
  gorev: z.string().nullable(),
  tesis: z.object({
    atamalar: z.array(z.object({ tur: z.enum(['istasyon', 'makine']), id: KIMLIK, kod: z.string(), ad: z.string(), yuzde: z.string() })),
    istasyonYetkinlikleri: z.array(kaynakOzeti),
    makineYetkinlikleri: z.array(kaynakOzeti),
  }).nullable(),
  vardiya: z.object({ vardiyaId: KIMLIK, ad: z.string(), baslangic: z.string(), bitis: z.string() }).nullable(),
  // Bugün onaylı izinde mi (yalnız evet/hayır; izin türü ve gerekçesi İK'da kalır).
  izin: z.object({ bugunIzinli: z.boolean() }).nullable(),
  // Son yedi günde sayımı ya da katılımı olan iş emirleri, en yeni önce (en çok 20).
  isler: z.array(z.object({ isEmriId: z.number().int().nullable(), emirNo: z.string(), parca: z.string(), saglam: z.number().nullable(), hurda: z.number().nullable() })).nullable(),
  maliyet: saatMaliyeti.nullable(),
  gorunurBolumler: z.array(z.string()),
});

export type KaynakAramaCevabi = z.output<typeof kaynakAramaCevabi>;
export type Istasyon360Cevabi = z.output<typeof istasyon360Cevabi>;
export type Makine360Cevabi = z.output<typeof makine360Cevabi>;
export type Kisi360Cevabi = z.output<typeof kisi360Cevabi>;
