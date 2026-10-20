import type { Db } from '#cekirdek/db.ts';

export async function veritabaniYokla(db: Db): Promise<void> {
  await db.tek('SELECT 1 AS ok');
}

// Kayıt tablosu yoksa ya da boşsa hiç göç uygulanmamıştır: bilinmiyor, null.
export async function sonGocAdi(db: Db): Promise<string | null> {
  const tablo = await db.tek<{ tablo: string | null }>("SELECT to_regclass('goc_kaydi')::text AS tablo");
  if (!tablo || tablo.tablo === null) return null;
  const satir = await db.tek<{ ad: string }>('SELECT ad FROM goc_kaydi ORDER BY ad DESC LIMIT 1');
  return satir?.ad ?? null;
}
