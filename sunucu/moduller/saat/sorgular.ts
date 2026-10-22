import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

// Modülün tek tablosu üstlenmedir (saat_uyari_ustlenme); öbür kaynak kayıtları sahiplerinin disari.ts fonksiyonlarıyla okunur.
export async function simdi(db: Db): Promise<string> {
  const satir = await db.tek<{ an: string }>(`SELECT ${zamanMetni('now()')} AS an`);
  if (satir === null) throw new Error('Veritabanı saati okunamadı.');
  return satir.an;
}

// Geçerli (son `saat` saatteki) üstlenmeler.
export async function ustlenmeler(db: Db, kimlikler: readonly string[], saat: number): Promise<{ kimlik: string; kisiId: number; an: string }[]> {
  if (kimlikler.length === 0) return [];
  return db.sorgu(
    `SELECT kimlik, kisi_id AS "kisiId", ${zamanMetni('ustlenme')} AS an FROM saat_uyari_ustlenme
      WHERE kimlik = ANY($1::text[]) AND ustlenme > now() - make_interval(hours => $2)`,
    [kimlikler, saat],
  );
}

// Tek sorguda yazar: boş ya da süresi geçmiş üstlenmeyi alır, kişinin kendi üstlenmesini tazeler; geçerli başka üstlenme varsa
// satır değişmez ve false döner (aynı anda iki saatten gelen istekte biri kazanır).
export async function ustlen(db: Db, kimlik: string, kisiId: number, saat: number): Promise<boolean> {
  const satir = await db.tek<{ kimlik: string }>(
    `INSERT INTO saat_uyari_ustlenme (kimlik, kisi_id) VALUES ($1, $2)
     ON CONFLICT (kimlik) DO UPDATE SET kisi_id = EXCLUDED.kisi_id, ustlenme = now()
       WHERE saat_uyari_ustlenme.kisi_id = EXCLUDED.kisi_id OR saat_uyari_ustlenme.ustlenme <= now() - make_interval(hours => $3)
     RETURNING kimlik`,
    [kimlik, kisiId, saat],
  );
  return satir !== null;
}
