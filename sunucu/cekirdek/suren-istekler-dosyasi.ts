import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { surenIstekler, type SurenIstek } from './istek-izleme.ts';

// Sunucu düşerse bellek gider; o anda süren istekler bu dosyadan okunur (3668-1). Beş saniyede bir, yalnız liste değiştiyse yazılır.
// Dosya süre değil başlangıç anı taşır: değişmeyen liste yeniden yazılmadığı için "kaç sn" okuyan tarafta düşme anından hesaplanır.
export const SUREN_ISTEKLER_DOSYASI = 'suren-istekler.json';
export const SUREN_ISTEKLER_ARALIGI_MS = 5000;

export interface SurenIstekDosyasi {
  surum: 1;
  an: string;
  istekler: { yontem: string; adres: string; kisiId: number | null; baslangic: string }[];
}

export const surenIstekDosyaIcerigi = (liste: readonly SurenIstek[], simdi: number): SurenIstekDosyasi => ({
  surum: 1,
  an: new Date(simdi).toISOString(),
  istekler: liste.map((i) => ({ yontem: i.yontem, adres: i.adres, kisiId: i.kisiId, baslangic: new Date(simdi - i.sureMs).toISOString() })),
});

// Değişiklik kararı süreye bakmaz: aynı istekler sürüyorsa liste aynıdır.
const imza = (d: SurenIstekDosyasi): string => JSON.stringify(d.istekler);

export interface SurenIstekYaziciSecenegi {
  simdi?: () => number;
  yaz?: (yol: string, icerik: string) => Promise<void>;
  hataBildir?: (hata: unknown) => void;
}

async function atomikYaz(yol: string, icerik: string): Promise<void> {
  const gecici = `${yol}.tmp`;
  await writeFile(gecici, icerik, 'utf8');
  await rename(gecici, yol);
}

// Bir tur: dosya yazıldıysa true. Yazma hatası sunucuyu etkilemez (günlük klasörü dolu ya da kilitli olabilir).
export function surenIstekYaziciKur(dizin: string, secenek: SurenIstekYaziciSecenegi = {}): { tur: () => Promise<boolean>; baslat: () => () => void } {
  const simdi = secenek.simdi ?? Date.now;
  const yaz = secenek.yaz ?? atomikYaz;
  const yol = path.join(dizin, SUREN_ISTEKLER_DOSYASI);
  let son: string | null = null;
  const tur = async (): Promise<boolean> => {
    const an = simdi();
    const dosya = surenIstekDosyaIcerigi(surenIstekler(an), an);
    const yeni = imza(dosya);
    if (yeni === son) return false;
    try {
      await yaz(yol, JSON.stringify(dosya));
      son = yeni;
      return true;
    } catch (hata) {
      secenek.hataBildir?.(hata);
      return false;
    }
  };
  const baslat = (): (() => void) => {
    const zamanlayici = setInterval(() => { void tur(); }, SUREN_ISTEKLER_ARALIGI_MS);
    zamanlayici.unref();
    return () => { clearInterval(zamanlayici); };
  };
  return { tur, baslat };
}
