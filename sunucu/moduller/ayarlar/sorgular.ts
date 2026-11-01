import type { Db } from '#cekirdek/db.ts';
import { islemKilidiAl } from '#cekirdek/kilit.ts';

export interface SaklananDeger {
  deger: unknown;
}

export function ayarDegeriniOku(db: Db, anahtar: string): Promise<SaklananDeger | null> {
  return db.tek<SaklananDeger>('SELECT deger FROM ayar WHERE anahtar = $1', [anahtar]);
}

// Değiştirme eski değeri okumadan önce anahtarı kilitler: aynı ayarı aynı anda değiştiren ikinci komut birincinin bitmesini
// bekler. Satır kilidi yetmez: hiç yazılmamış ayarda kilitlenecek satır yoktur.
export async function ayarKilitle(db: Db, anahtar: string): Promise<void> {
  await islemKilidiAl(db, `ayar-degistir-${anahtar}`);
}

export function ayarDegerleriniOku(db: Db): Promise<(SaklananDeger & { anahtar: string })[]> {
  return db.sorgu<SaklananDeger & { anahtar: string }>('SELECT anahtar, deger FROM ayar');
}

export async function ayarDegeriniYaz(db: Db, anahtar: string, deger: unknown, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (anahtar) DO UPDATE
       SET deger = EXCLUDED.deger, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncelleme = now()`,
    [anahtar, JSON.stringify(deger), kisiId],
  );
}

export async function ayarDegeriniSil(db: Db, anahtar: string): Promise<void> {
  await db.sorgu('DELETE FROM ayar WHERE anahtar = $1', [anahtar]);
}

// Yıl ve ay atölyenin saatiyle: gece yarısından sonra açılan kayıt yeni ayın numarasını alır.
export async function simdikiYilAy(db: Db): Promise<{ yil: number; ay: number }> {
  const satir = await db.tek<{ yil: number; ay: number }>(
    `SELECT extract(year FROM now() AT TIME ZONE 'Europe/Istanbul')::int AS yil, extract(month FROM now() AT TIME ZONE 'Europe/Istanbul')::int AS ay`,
  );
  if (satir === null) throw new Error('Saat okunamadı.');
  return satir;
}

export async function sayacArtir(db: Db, anahtar: string, donem: string): Promise<number> {
  const satir = await db.tek<{ sira: number }>(
    `INSERT INTO ayar_numara_sayaci (anahtar, donem, son_sira) VALUES ($1, $2, 1)
     ON CONFLICT (anahtar, donem) DO UPDATE SET son_sira = ayar_numara_sayaci.son_sira + 1
     RETURNING son_sira AS sira`,
    [anahtar, donem],
  );
  if (satir === null) throw new Error('Sayaç artırılamadı.');
  return satir.sira;
}

// Uzun dış işi bekleyen transaction'ın boşta sayılmaması için (gece yedeği, kart #1205).
export async function nabiz(db: Db): Promise<void> {
  await db.tek('SELECT 1');
}
