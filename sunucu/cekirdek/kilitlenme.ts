import { vtGeciciCakisma } from './db.ts';
import type { Db } from './db.ts';

// İlk koşudan sonra en çok bu kadar yeniden koşulur (kullanıcı kararı, kart #370). Kilitlenmede sunucu bir tarafı hemen
// düşürür; kısa ve rastgele bekleme iki tarafın aynı anda yeniden çarpışmasını önler.
export const KILITLENME_YINELEME_SAYISI = 3;
const EN_AZ_BEKLEME_MS = 10;
const EN_COK_BEKLEME_MS = 50;

export interface YinelemeSecenegi {
  bekle?: (ms: number) => Promise<void>;
  rastgele?: () => number;
}

const uyu = (ms: number): Promise<void> => new Promise((coz) => { setTimeout(coz, ms); });

// `is` her denemede yeni bir transaction'da baştan koşar: kilitlenen transaction'ın db'si kullanılamaz, bu yüzden
// açık transaction içinden çağrılamaz (imza transaction açabilen nesne ister). Yalnız geçici çakışma yinelenir;
// iş kuralı reddi, kısıt ihlali ve süre aşımı ilk koşuda olduğu gibi döner. Denemeler tükenince son hata fırlar.
export async function kilitlenmedeYinele<T>(
  vt: { tx<S>(is: (db: Db) => Promise<S>): Promise<S> },
  is: (db: Db) => Promise<T>,
  secenek: YinelemeSecenegi = {},
): Promise<T> {
  const bekle = secenek.bekle ?? uyu;
  const rastgele = secenek.rastgele ?? Math.random;
  for (let yineleme = 0; ; yineleme += 1) {
    try {
      return await vt.tx(is);
    } catch (hata) {
      if (!vtGeciciCakisma(hata) || yineleme >= KILITLENME_YINELEME_SAYISI) throw hata;
      await bekle(EN_AZ_BEKLEME_MS + Math.floor(rastgele() * (EN_COK_BEKLEME_MS - EN_AZ_BEKLEME_MS + 1)));
    }
  }
}
