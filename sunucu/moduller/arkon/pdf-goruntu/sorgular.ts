import type { Db } from '#cekirdek/db.ts';

// Yayındaki paketlerin PDF dosyaları (sayfa ve okuma ayarıyla). Dosya belgede { "$blob": özet } diye anılır (arkon/web store.ts toWire).
export interface PdfKaynagi { ozet: string; sayfa: number; ayar: unknown }
export function yayindakiPdfler(db: Db): Promise<PdfKaynagi[]> {
  return db.sorgu<PdfKaynagi>(
    `SELECT DISTINCT f -> 'bytes' ->> '$blob' AS ozet,
            CASE WHEN f ->> 'page' ~ '^[1-9][0-9]{0,3}$' THEN (f ->> 'page')::int ELSE 1 END AS sayfa,
            b.govde -> 'readCfg' AS ayar
       FROM arkon_belge b CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(b.govde -> 'files') = 'array' THEN b.govde -> 'files' ELSE '[]'::jsonb END) f
      WHERE b.depo = 'pkgs' AND b.govde ->> 'status' = 'published' AND f ->> 'kind' = 'pdf'
        AND f -> 'bytes' ->> '$blob' ~ '^[0-9a-f]{64}$'`,
  );
}

export function varOlanImzalar(db: Db, kaynaklar: readonly string[]): Promise<{ kaynak: string; sayfa: number; imza: string }[]> {
  if (kaynaklar.length === 0) return Promise.resolve([]);
  return db.sorgu('SELECT kaynak, sayfa, imza FROM arkon_pdf_goruntu WHERE kaynak = ANY($1::text[])', [kaynaklar]);
}

export async function goruntuYaz(
  db: Db, kaynak: string, sayfa: number, imza: string, g: { genislik: number; yukseklik: number; png: Buffer; sureMs: number } | { hata: string },
): Promise<void> {
  const basari = 'png' in g;
  await db.sorgu(
    `INSERT INTO arkon_pdf_goruntu (kaynak, sayfa, imza, genislik, yukseklik, png, hata, sure_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (kaynak, sayfa, imza) DO NOTHING`,
    [kaynak, sayfa, imza, basari ? g.genislik : null, basari ? g.yukseklik : null, basari ? g.png : null, basari ? null : g.hata, basari ? g.sureMs : null],
  );
}

export function goruntu(db: Db, kaynak: string, sayfa: number, imza: string): Promise<{ png: Buffer; genislik: number; yukseklik: number } | null> {
  return db.tek(
    'SELECT png, genislik, yukseklik FROM arkon_pdf_goruntu WHERE kaynak = $1 AND sayfa = $2 AND imza = $3 AND png IS NOT NULL', [kaynak, sayfa, imza],
  );
}

// Artık hiçbir yayındaki paketin anmadığı kaynakların görüntüleri silinir (türetilmiş veri; disk ve yedek büyümesin).
export async function yetimleriSil(db: Db, kaynaklar: readonly string[]): Promise<number> {
  const s = await db.sorgu<{ n: number }>(
    'WITH silinen AS (DELETE FROM arkon_pdf_goruntu WHERE NOT (kaynak = ANY($1::text[])) RETURNING 1) SELECT count(*)::int AS n FROM silinen', [kaynaklar],
  );
  return s[0]?.n ?? 0;
}
