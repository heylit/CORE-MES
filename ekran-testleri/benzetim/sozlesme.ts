// Robot ile izleme uygulaması arasındaki tek sözleşme: koşu klasöründeki dosyaların biçimi. İzleme yalnız bu dosyaları okur;
// ana uygulamaya ve veritabanına bağlanmaz. Biçim değişirse SURUM artar, izleme bilmediği sürümü göstermez.
export const SOZLESME_SURUMU = 1;

export const DOSYA = {
  ozet: 'ozet.json',
  adimlar: 'adimlar.jsonl',
  yorum: 'yorum.md',
  ekler: 'ekler',
} as const;

export const SONUCLAR = ['gecti', 'dustu', 'ara-sira', 'baglanmamis'] as const;
export type Sonuc = (typeof SONUCLAR)[number];

export const ADIM_TURLERI = ['api', 'ekran', 'degismez', 'model'] as const;
export type AdimTuru = (typeof ADIM_TURLERI)[number];

export const MODEL_KIPLERI = ['kapali', 'claude-kod', 'api'] as const;
export type ModelKipi = (typeof MODEL_KIPLERI)[number];

export type Sayac = Record<Sonuc, number>;

export interface KosuOzeti {
  surum: typeof SOZLESME_SURUMU;
  kosuId: string;
  taban: string | null;
  baslangic: string;
  bitis: string | null;
  durum: 'kosuyor' | 'bitti' | 'durdu';
  tohum: number;
  gunSayisi: number;
  gun: number;
  roller: string[];
  senaryolar: string[];
  sayac: Sayac;
  model: { kip: ModelKipi; cagri: number; ustSinir: number };
  ileti: string | null;
}

// Bir satır, bir adım. ek: koşu klasörüne göre ekran görüntüsü ya da iz dosyası yolları.
export interface AdimSatiri {
  zaman: string;
  gun: number;
  rol: string;
  senaryo: string;
  adim: string;
  tur: AdimTuru;
  sonuc: Sonuc;
  sureMs: number;
  yontem: string | null;
  yol: string | null;
  beklenen: string | null;
  gelen: string | null;
  ileti: string | null;
  ek: string[];
}

export const bosSayac = (): Sayac => ({ gecti: 0, dustu: 0, 'ara-sira': 0, baglanmamis: 0 });

const metinMi = (d: unknown): d is string => typeof d === 'string';
const metinYaDaNull = (d: unknown): boolean => d === null || typeof d === 'string';
const tamSayi = (d: unknown): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0;

// İzleme dosyayı başka süreçten okur; yarım ya da bozuk satır sessizce yutulmaz, nedeniyle döner.
export function adimSatiriOku(satir: string): AdimSatiri | string {
  let d: unknown;
  try {
    d = JSON.parse(satir);
  } catch {
    return 'JSON değil';
  }
  if (typeof d !== 'object' || d === null) return 'nesne değil';
  const a = d as Record<string, unknown>;
  for (const alan of ['zaman', 'rol', 'senaryo', 'adim'] as const) if (!metinMi(a[alan])) return `${alan} metin değil`;
  if (!tamSayi(a['gun'])) return 'gun tam sayı değil';
  if (!tamSayi(a['sureMs'])) return 'sureMs tam sayı değil';
  if (!ADIM_TURLERI.includes(a['tur'] as AdimTuru)) return 'tur bilinmiyor';
  if (!SONUCLAR.includes(a['sonuc'] as Sonuc)) return 'sonuc bilinmiyor';
  for (const alan of ['yontem', 'yol', 'beklenen', 'gelen', 'ileti'] as const) if (!metinYaDaNull(a[alan])) return `${alan} metin ya da null değil`;
  if (!Array.isArray(a['ek']) || !a['ek'].every(metinMi)) return 'ek metin listesi değil';
  if ((a['ek'] as string[]).some((y) => y.startsWith('/') || y.includes('..'))) return 'ek koşu klasörü dışını gösteriyor';
  return a as unknown as AdimSatiri;
}

export function kosuOzetiOku(metin: string): KosuOzeti | string {
  let d: unknown;
  try {
    d = JSON.parse(metin);
  } catch {
    return 'JSON değil';
  }
  if (typeof d !== 'object' || d === null) return 'nesne değil';
  const o = d as Record<string, unknown>;
  if (o['surum'] !== SOZLESME_SURUMU) return `sürüm ${String(o['surum'])} bilinmiyor`;
  if (!metinMi(o['kosuId']) || !metinMi(o['baslangic'])) return 'kosuId ya da baslangic eksik';
  if (!['kosuyor', 'bitti', 'durdu'].includes(o['durum'] as string)) return 'durum bilinmiyor';
  return o as unknown as KosuOzeti;
}
