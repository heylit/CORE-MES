import type { Db } from '#cekirdek/db.ts';

// 3478: olay başına ana anahtar (göç bildirim_olay_acik) ve kapanıştan önceki kademe ayarı (bildirim_onceki_hal).

export async function acikTurler(db: Db): Promise<Set<string>> {
  return new Set((await db.sorgu<{ tur: string }>('SELECT tur FROM bildirim_olay_acik WHERE acik')).map((r) => r.tur));
}

export async function turAcikMi(db: Db, tur: string): Promise<boolean> {
  return (await db.tek<{ acik: boolean }>('SELECT acik FROM bildirim_olay_acik WHERE tur = $1', [tur]))?.acik ?? false;
}

export function anahtarSatirlari(db: Db): Promise<{ tur: string; acik: boolean; surum: number }[]> {
  return db.sorgu('SELECT tur, acik, surum FROM bildirim_olay_acik ORDER BY tur');
}

// Satırı olmayan olayda beklenen sürüm null'dır; yarışta kaybeden yazım null döner (sürüm tutmadı).
export async function anahtarYaz(db: Db, tur: string, acik: boolean, surum: number | null, kisiId: number): Promise<{ surum: number } | null> {
  if (surum === null) {
    return db.tek<{ surum: number }>(
      `INSERT INTO bildirim_olay_acik (tur, acik, degistiren_id) VALUES ($1, $2, $3) ON CONFLICT (tur) DO NOTHING RETURNING surum`, [tur, acik, kisiId]);
  }
  return db.tek<{ surum: number }>(
    `UPDATE bildirim_olay_acik SET acik = $2, surum = surum + 1, degistiren_id = $3, degisti = now() WHERE tur = $1 AND surum = $4 RETURNING surum`,
    [tur, acik, kisiId, surum]);
}

// Toplu yazım sürüm sormaz: modül başlığındaki anahtar o anki seçimi bütün satırlara yazar.
export async function topluYaz(db: Db, turler: readonly string[], acik: boolean, kisiId: number | null): Promise<void> {
  await db.sorgu(
    `INSERT INTO bildirim_olay_acik (tur, acik, degistiren_id) SELECT t, $2, $3 FROM unnest($1::text[]) AS t
     ON CONFLICT (tur) DO UPDATE SET acik = EXCLUDED.acik, surum = bildirim_olay_acik.surum + 1, degistiren_id = EXCLUDED.degistiren_id, degisti = now()
      WHERE bildirim_olay_acik.acik IS DISTINCT FROM EXCLUDED.acik`,
    [[...turler], acik, kisiId]);
}

export interface OncekiHalSatiri { kademe: { kaynak: string; acik: boolean }[]; alindi: string; donuldu: string | null }
export function oncekiHal(db: Db, kilitli = false): Promise<OncekiHalSatiri | null> {
  return db.tek<OncekiHalSatiri>(
    `SELECT kademe, to_char(alindi AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS alindi,
            to_char(donuldu AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS donuldu
       FROM bildirim_onceki_hal WHERE id = 1${kilitli ? ' FOR UPDATE' : ''}`);
}
export async function donulduYaz(db: Db, kisiId: number): Promise<void> {
  await db.sorgu('UPDATE bildirim_onceki_hal SET donuldu = now(), donen_id = $1 WHERE id = 1', [kisiId]);
}

// Kademe ayarında yalnız ana anahtar geri yazılır; satırı olmayan kaynağın satırı çağıranın verdiği katalog değerleriyle açılır.
export async function kademeAcikYaz(db: Db, kaynak: string, acik: boolean, kisiId: number | null): Promise<boolean> {
  return (await db.tek(
    `UPDATE bildirim_kademe_ayari SET acik = $2, surum = surum + 1, degistiren_id = $3, degisti = now() WHERE kaynak = $1 RETURNING 1`,
    [kaynak, acik, kisiId])) !== null;
}
