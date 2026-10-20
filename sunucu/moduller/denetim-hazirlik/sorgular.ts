import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { DepoBelgesi, Veri } from './kurallar.ts';

// Denetim Hazırlığı belge deposunun SQL'i. Sürüm tek sayaçtan gelir; silme de sayacı ilerletir (değişiklik damgası).

const BELGE_SUTUNLARI = 'yol, kimlik, veri, surum';

export async function koleksiyonBelgeleri(db: Db, ust: string): Promise<DepoBelgesi[]> {
  return db.sorgu<DepoBelgesi>(`SELECT ${BELGE_SUTUNLARI} FROM denetim_hazirlik_belge WHERE ust = $1 ORDER BY kimlik`, [ust]);
}

export async function belgeGetir(db: Db, yol: string): Promise<DepoBelgesi | null> {
  return db.tek<DepoBelgesi>(`SELECT ${BELGE_SUTUNLARI} FROM denetim_hazirlik_belge WHERE yol = $1`, [yol]);
}

export interface KilitliBelge extends DepoBelgesi { olusturanKisiId: number | null; kilitSahibi: string | null; kilitBitis: number | null }

// Yazmadan önce satırı kilitler: aynı belgeye eşzamanlı birleştirme ve sürüm denetimi sırayla koşar.
export async function belgeKilitle(db: Db, yol: string): Promise<KilitliBelge | null> {
  return db.tek<KilitliBelge>(
    `SELECT ${BELGE_SUTUNLARI}, olusturan_kisi_id AS "olusturanKisiId", kilit_sahibi AS "kilitSahibi",
            (extract(epoch FROM kilit_bitis) * 1000)::bigint AS "kilitBitis"
       FROM denetim_hazirlik_belge WHERE yol = $1 FOR UPDATE`,
    [yol],
  );
}

export async function belgeYaz(db: Db, g: { yol: string; ust: string; kimlik: string; veri: Veri; kisiId: number }): Promise<DepoBelgesi> {
  const satir = await db.tek<DepoBelgesi>(
    `INSERT INTO denetim_hazirlik_belge (yol, ust, kimlik, veri, surum, olusturan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, $2, $3, $4::jsonb, nextval('denetim_hazirlik_surum'), $5, $5)
     ON CONFLICT (yol) DO UPDATE
       SET veri = EXCLUDED.veri, surum = EXCLUDED.surum, guncelleyen_kisi_id = $5, guncellendi = now()
     RETURNING ${BELGE_SUTUNLARI}`,
    [g.yol, g.ust, g.kimlik, JSON.stringify(g.veri), g.kisiId],
  );
  if (satir === null) throw new Error('Belge yazılamadı.');
  return satir;
}

export async function belgeSil(db: Db, yol: string): Promise<boolean> {
  const silinen = await db.sorgu<{ yol: string }>('DELETE FROM denetim_hazirlik_belge WHERE yol = $1 RETURNING yol', [yol]);
  if (silinen.length > 0) await db.tek('SELECT nextval(\'denetim_hazirlik_surum\')');
  return silinen.length > 0;
}

export async function kilitYaz(db: Db, yol: string, sahip: string, sureMs: number): Promise<{ surum: number; bitis: string }> {
  const satir = await db.tek<{ surum: number; bitis: string }>(
    `UPDATE denetim_hazirlik_belge
        SET kilit_sahibi = $2, kilit_bitis = now() + ($3::int * interval '1 millisecond')
      WHERE yol = $1
      RETURNING surum, ${zamanMetni('kilit_bitis')} AS bitis`,
    [yol, sahip, sureMs],
  );
  if (satir === null) throw new Error('Kilit yazılamadı.');
  return satir;
}

export async function kilitBitisi(db: Db, yol: string): Promise<string | null> {
  return (await db.tek<{ bitis: string | null }>(`SELECT ${zamanMetni('kilit_bitis')} AS bitis FROM denetim_hazirlik_belge WHERE yol = $1`, [yol]))?.bitis ?? null;
}

export async function simdiMs(db: Db): Promise<number> {
  return (await db.tek<{ an: number }>('SELECT (extract(epoch FROM now()) * 1000)::bigint AS an'))?.an ?? 0;
}

// Sayaç hiç ilerlememişse 0.
export async function damga(db: Db): Promise<number> {
  return (await db.tek<{ damga: number }>(
    'SELECT CASE WHEN is_called THEN last_value ELSE 0 END AS damga FROM denetim_hazirlik_surum',
  ))?.damga ?? 0;
}

export async function varOlanYollar(db: Db, yollar: readonly string[]): Promise<string[]> {
  if (yollar.length === 0) return [];
  return (await db.sorgu<{ yol: string }>('SELECT yol FROM denetim_hazirlik_belge WHERE yol = ANY($1::text[])', [yollar])).map((s) => s.yol);
}

export async function ekEkle(db: Db, g: { ad: string; tur: string; icerik: Buffer; kisiId: number }): Promise<{ id: string; ad: string; tur: string; boyut: number }> {
  const satir = await db.tek<{ id: string; ad: string; tur: string; boyut: number }>(
    `INSERT INTO denetim_hazirlik_ek (id, ad, tur, boyut, icerik, yukleyen_kisi_id)
     VALUES (replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5)
     RETURNING id, ad, tur, boyut`,
    [g.ad, g.tur, g.icerik.length, g.icerik, g.kisiId],
  );
  if (satir === null) throw new Error('Ek yazılamadı.');
  return satir;
}

export async function ekGetir(db: Db, id: string): Promise<{ id: string; ad: string; tur: string; boyut: number; icerik: Buffer } | null> {
  return db.tek('SELECT id, ad, tur, boyut, icerik FROM denetim_hazirlik_ek WHERE id = $1', [id]);
}
