import type { Db } from '#cekirdek/db.ts';
import { ISO, TARIH } from '../ortak/sorgular.ts';

// 3455-1: geçmiş giriş defteri ve geçmiş adımın iş emri ile sayım yazıları.

export interface GecmisGirisSatiri {
  id: number;
  isEmriId: number;
  baslama: string | null;
  bitis: string | null;
  saglamAdet: number;
  hurdaAdet: number;
  hurdaNedeniId: number | null;
  operatorId: number | null;
  girenId: number;
  stokYazildi: boolean;
  zaman: string;
}

const SATIR = `g.id, g.is_emri_id AS "isEmriId", ${TARIH('g.baslama')} AS baslama, ${TARIH('g.bitis')} AS bitis, g.saglam_adet AS "saglamAdet",
  g.hurda_adet AS "hurdaAdet", g.hurda_nedeni_id AS "hurdaNedeniId", g.operator_id AS "operatorId", g.giren_id AS "girenId",
  g.stok_yazildi AS "stokYazildi", ${ISO('g.zaman')} AS zaman`;

// Etkin giriş: kendisi geri alma satırı değil ve geri alınmamış. Emir başına iş emri sırasıyla.
export function etkinGirisler(db: Db, emirIdleri: readonly number[]): Promise<(GecmisGirisSatiri & { uretimEmriId: number })[]> {
  if (emirIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu(
    `SELECT ${SATIR}, g.uretim_emri_id AS "uretimEmriId"
       FROM uretim_emirleri_gecmis_giris g JOIN uretim_emirleri_is_emri i ON i.id = g.is_emri_id
      WHERE g.uretim_emri_id = ANY($1::int[]) AND g.geri_alinan_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_gecmis_giris r WHERE r.geri_alinan_id = g.id)
      ORDER BY g.uretim_emri_id, i.sira`,
    [[...emirIdleri]],
  );
}

export interface GecmisGirisYazisi {
  uretimEmriId: number; isEmriId: number; baslama: string | null; bitis: string | null; saglamAdet: number; hurdaAdet: number;
  hurdaNedeniId: number | null; operatorId: number | null; girenId: number; stokYazildi: boolean; geriAlinanId: number | null;
}

export async function girisEkle(db: Db, y: GecmisGirisYazisi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO uretim_emirleri_gecmis_giris
       (uretim_emri_id, is_emri_id, baslama, bitis, saglam_adet, hurda_adet, hurda_nedeni_id, operator_id, giren_id, stok_yazildi, geri_alinan_id)
     VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [y.uretimEmriId, y.isEmriId, y.baslama, y.bitis, y.saglamAdet, y.hurdaAdet, y.hurdaNedeniId, y.operatorId, y.girenId, y.stokYazildi, y.geriAlinanId],
  );
  if (satir === null) throw new Error('Geçmiş giriş yazılamadı.');
  return satir.id;
}

// Yalnız bekleyen adım biter; dönen sayı 0 ise adım bu arada değişmiştir.
export async function adimiGecmisleBitir(db: Db, isEmriId: number, saglamAdet: number, baslama: string, bitis: string): Promise<number> {
  const r = await db.sorgu<{ id: number }>(
    `UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = $3::timestamptz, bitis = $4::timestamptz, saglam_adet = $2, surum = surum + 1
      WHERE id = $1 AND durum = 'bekliyor' RETURNING id`,
    [isEmriId, saglamAdet, baslama, bitis],
  );
  return r.length;
}

export async function adimiBekleyeneDondur(db: Db, isEmriId: number): Promise<number> {
  const r = await db.sorgu<{ id: number }>(
    `UPDATE uretim_emirleri_is_emri SET durum = 'bekliyor', baslama = NULL, bitis = NULL, saglam_adet = NULL, surum = surum + 1
      WHERE id = $1 AND durum = 'tamam' RETURNING id`,
    [isEmriId],
  );
  return r.length;
}

// Geçmiş sayım giriş anında yazılır; kaynağı 'gecmis' olduğu için süre, OEE ve gün toplamlarına girmez (CANLI_SAYIM).
// Eksi adet geri almadır ve düzeltme sayılır (sayım kısıtları).
export function gecmisSayimEkle(
  db: Db, y: { emirId: number; isEmriId: number; kisiId: number; istasyonId: number; tur: 'saglam' | 'hurda'; adet: number; hurdaNedeniId: number | null },
): Promise<unknown> {
  return db.sorgu(
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, is_emri_id, kaynak)
     VALUES ($1, $2, $3, $4, $5, $6, $5 < 0, $7, 'gecmis')`,
    [y.emirId, y.kisiId, y.istasyonId, y.tur, y.adet, y.hurdaNedeniId, y.isEmriId],
  );
}

// Adımlarda kaynağı ne olursa olsun sayım var mı (geri almadan sonra başlamış üretim).
export async function sayimliAdimlar(db: Db, isEmriIdleri: readonly number[]): Promise<Set<number>> {
  if (isEmriIdleri.length === 0) return new Set();
  const r = await db.sorgu<{ id: number }>(
    'SELECT DISTINCT is_emri_id AS id FROM uretim_sayimi WHERE is_emri_id = ANY($1::int[])', [[...isEmriIdleri]],
  );
  return new Set(r.map((x) => x.id));
}

export function emirSurumunuArtir(db: Db, id: number): Promise<unknown> {
  return db.sorgu('UPDATE uretim_emri SET surum = surum + 1 WHERE id = $1', [id]);
}
