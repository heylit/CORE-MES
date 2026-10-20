import type { Db } from '#cekirdek/db.ts';
import type { DurusNedeni, HurdaNedeni } from '#paylasilan/sozlesme/durus-nedenleri.ts';

const DURUS_SUTUNLARI = `id, kod, ad, simge, kategori, cagri_ekibi AS "cagriEkibi",
  cagri_gecikme_dk AS "cagriGecikmeDk", aktif, sira, surum`;
const HURDA_SUTUNLARI = 'id, kod, ad, aktif, sira, surum';

export function durusNedenleriniOku(db: Db, yalnizAktif: boolean): Promise<DurusNedeni[]> {
  return db.sorgu<DurusNedeni>(
    `SELECT ${DURUS_SUTUNLARI} FROM durus_nedeni WHERE ($1::boolean IS NOT TRUE OR aktif) ORDER BY sira, id`,
    [yalnizAktif],
  );
}

export function durusNedeniniOku(db: Db, id: number): Promise<DurusNedeni | null> {
  return db.tek<DurusNedeni>(`SELECT ${DURUS_SUTUNLARI} FROM durus_nedeni WHERE id = $1`, [id]);
}

export async function durusKodlariniOku(db: Db): Promise<string[]> {
  return (await db.sorgu<{ kod: string }>('SELECT kod FROM durus_nedeni')).map((s) => s.kod);
}

export interface DurusYazimi {
  kod: string;
  ad: string;
  simge: string | null;
  kategori: string;
  cagriEkibi: string | null;
  cagriGecikmeDk: number | null;
}

export function durusNedeniEkle(db: Db, y: DurusYazimi): Promise<DurusNedeni | null> {
  return db.tek<DurusNedeni>(
    `INSERT INTO durus_nedeni (kod, ad, simge, kategori, cagri_ekibi, cagri_gecikme_dk, sira)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sira), 0) + 1 FROM durus_nedeni))
     RETURNING ${DURUS_SUTUNLARI}`,
    [y.kod, y.ad, y.simge, y.kategori, y.cagriEkibi, y.cagriGecikmeDk],
  );
}

// Sürüm tutmazsa satır dönmez; çağıran çekirdeğin surumluGuncelle'si ile 404/409 ayırır.
export function durusNedeniniGuncelle(
  db: Db, id: number, y: DurusYazimi & { aktif: boolean; surum: number },
): Promise<DurusNedeni | null> {
  return db.tek<DurusNedeni>(
    `UPDATE durus_nedeni
        SET kod = $2, ad = $3, simge = $4, kategori = $5, cagri_ekibi = $6, cagri_gecikme_dk = $7, aktif = $8,
            surum = surum + 1
      WHERE id = $1 AND surum = $9
      RETURNING ${DURUS_SUTUNLARI}`,
    [id, y.kod, y.ad, y.simge, y.kategori, y.cagriEkibi, y.cagriGecikmeDk, y.aktif, y.surum],
  );
}

export async function durusNedeniVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM durus_nedeni WHERE id = $1', [id])) !== null;
}

export function hurdaNedenleriniOku(db: Db, yalnizAktif: boolean): Promise<HurdaNedeni[]> {
  return db.sorgu<HurdaNedeni>(
    `SELECT ${HURDA_SUTUNLARI} FROM hurda_nedeni WHERE ($1::boolean IS NOT TRUE OR aktif) ORDER BY sira, id`,
    [yalnizAktif],
  );
}

export function hurdaNedeniniOku(db: Db, id: number): Promise<HurdaNedeni | null> {
  return db.tek<HurdaNedeni>(`SELECT ${HURDA_SUTUNLARI} FROM hurda_nedeni WHERE id = $1`, [id]);
}

export async function hurdaKodlariniOku(db: Db): Promise<string[]> {
  return (await db.sorgu<{ kod: string }>('SELECT kod FROM hurda_nedeni')).map((s) => s.kod);
}

export function hurdaNedeniEkle(db: Db, kod: string, ad: string): Promise<HurdaNedeni | null> {
  return db.tek<HurdaNedeni>(
    `INSERT INTO hurda_nedeni (kod, ad, sira)
     VALUES ($1, $2, (SELECT COALESCE(MAX(sira), 0) + 1 FROM hurda_nedeni))
     RETURNING ${HURDA_SUTUNLARI}`,
    [kod, ad],
  );
}

export function hurdaNedeniniGuncelle(
  db: Db, id: number, y: { kod: string; ad: string; aktif: boolean; surum: number },
): Promise<HurdaNedeni | null> {
  return db.tek<HurdaNedeni>(
    `UPDATE hurda_nedeni SET kod = $2, ad = $3, aktif = $4, surum = surum + 1
      WHERE id = $1 AND surum = $5 RETURNING ${HURDA_SUTUNLARI}`,
    [id, y.kod, y.ad, y.aktif, y.surum],
  );
}

export async function hurdaNedeniVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM hurda_nedeni WHERE id = $1', [id])) !== null;
}
