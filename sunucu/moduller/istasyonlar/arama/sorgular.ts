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

export interface TesisSecimSatiri {
  id: number;
  kod: string;
  ad: string;
  aktif: boolean;
  ust: { id: number; kod: string; ad: string } | null;
}

// Ortak seçici (kart #1318): istasyon iş merkeziyle, makine istasyonuyla gelir. Kodu tam tutan önce, sonra koda göre; bir fazlası
// okunur ki "daha var" bilinsin. `istasyonId` yalnız makineyi süzer (istasyonda boş gelir).
export function tesisSecimAra(
  db: Db, s: { tur: 'istasyon' | 'makine'; metin: string; istasyonId: number | null; pasifler: boolean; sinir: number; atla: number },
): Promise<TesisSecimSatiri[]> {
  const desen = `%${s.metin.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const kaynak = s.tur === 'istasyon'
    ? 'SELECT k.id, k.kod, k.ad, k.aktif, NULL::int AS istasyon_id, u.id AS ust_id, u.kod AS ust_kod, u.ad AS ust_ad FROM istasyon k LEFT JOIN is_merkezi u ON u.id = k.is_merkezi_id'
    : 'SELECT k.id, k.kod, k.ad, k.aktif, k.istasyon_id, u.id AS ust_id, u.kod AS ust_kod, u.ad AS ust_ad FROM makine k LEFT JOIN istasyon u ON u.id = k.istasyon_id';
  return db.sorgu<TesisSecimSatiri>(
    `SELECT t.id, t.kod, t.ad, t.aktif,
            CASE WHEN t.ust_id IS NULL THEN NULL ELSE json_build_object('id', t.ust_id, 'kod', t.ust_kod, 'ad', t.ust_ad) END AS ust
       FROM (${kaynak}) t
      WHERE ($3::int IS NULL OR t.istasyon_id = $3) AND ($4::boolean OR t.aktif) AND ($2 = '' OR t.kod ILIKE $1 OR t.ad ILIKE $1)
      ORDER BY (upper(t.kod) = upper($2)) DESC, t.kod, t.id LIMIT $5 OFFSET $6`,
    [desen, s.metin, s.istasyonId, s.pasifler, s.sinir, s.atla],
  );
}
