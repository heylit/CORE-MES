import type { Db } from '#cekirdek/db.ts';

export interface TesisAramaSatiri {
  tur: 'istasyon' | 'makine';
  id: number;
  kod: string;
  ad: string;
  aktif: boolean;
}

// Metin istasyonun ya da makinenin kodunda veya adında geçer. Kodu tam tutan önce, sonra aktifler, sonra koda göre.
export function tesisAra(db: Db, metin: string, sinir: number): Promise<TesisAramaSatiri[]> {
  const desen = `%${metin.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db.sorgu<TesisAramaSatiri>(
    `SELECT * FROM (
        SELECT 'istasyon' AS tur, id, kod, ad, aktif FROM istasyon WHERE kod ILIKE $1 OR ad ILIKE $1
        UNION ALL
        SELECT 'makine' AS tur, id, kod, ad, aktif FROM makine WHERE kod ILIKE $1 OR ad ILIKE $1
      ) t
      ORDER BY (upper(t.kod) = upper($2)) DESC, t.aktif DESC, t.kod, t.tur LIMIT $3`,
    [desen, metin, sinir],
  );
}
