import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

// Modülün tablosu yoktur; kaynak kayıtları sahiplerinin disari.ts fonksiyonlarıyla okunur. Burada yalnız veritabanının saati.
export async function simdi(db: Db): Promise<string> {
  const satir = await db.tek<{ an: string }>(`SELECT ${zamanMetni('now()')} AS an`);
  if (satir === null) throw new Error('Veritabanı saati okunamadı.');
  return satir.an;
}
