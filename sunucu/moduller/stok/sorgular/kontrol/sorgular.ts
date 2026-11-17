import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { ArtikDurumu } from '#paylasilan/sozlesme/stok-kontrol.ts';
import { KULLANILABILIR_SQL } from '../ortak/sorgular.ts';

// 3398: ölçüyle aramanın stok tarafı. Kullanılabilir miktar stokMiktarlari ile aynı kuraldır (raf, kabul, zemin; statüsüz; serbest ya da
// şartlı); konum kodları en eski girişten.
export interface KullanilabilirStokHam { malzemeId: number; miktar: string; konumlar: string[]; ilkGiris: string }
export const kullanilabilirStoklar = (db: Db, malzemeIdler: readonly number[]): Promise<KullanilabilirStokHam[]> => db.sorgu(
  `SELECT b.malzeme_id AS "malzemeId", sum(b.miktar)::text AS miktar,
          array_agg(DISTINCT k.kod ORDER BY k.kod) AS konumlar, ${zamanMetni('min(b.ilk_giris)')} AS "ilkGiris"
     FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
    WHERE b.malzeme_id = ANY($1::int[]) AND k.tur IN ('raf_gozu', 'kabul', 'depo_zemini') AND b.statu_id IS NULL AND b.${KULLANILABILIR_SQL} AND b.miktar > 0
    GROUP BY b.malzeme_id HAVING sum(b.miktar) > 0`, [malzemeIdler]);

export interface ArtikParcaHam {
  id: number; malzemeId: number; konumId: number; konumKod: string; partiId: number | null; olcu: Record<string, unknown>; adet: number;
  durum: ArtikDurumu; aciklama: string | null; kaydedenKisiId: number; kayitZamani: string; surum: number;
}
const ARTIK_SECIMI = `SELECT a.id, a.malzeme_id AS "malzemeId", a.konum_id AS "konumId", k.kod AS "konumKod", a.parti_id AS "partiId", a.olcu, a.adet,
  a.durum, a.aciklama, a.kaydeden_kisi_id AS "kaydedenKisiId", ${zamanMetni('a.kayit_zamani')} AS "kayitZamani", a.surum
  FROM stok_artik_parca a JOIN stok_konum k ON k.id = a.konum_id`;
// Aramaya giren artıklar: açık, konumu aktif ve stok konumu (raf, kabul, zemin), o konumda o malzemenin kullanılabilir bakiyesi var.
// Bakiye sıfıra düşmüşse artık önerilmez (kesilip tükenmiş ama kapatılmamış olabilir).
export const acikArtiklar = (db: Db, malzemeIdler: readonly number[]): Promise<ArtikParcaHam[]> =>
  db.sorgu(`${ARTIK_SECIMI} WHERE a.malzeme_id = ANY($1::int[]) AND a.durum = 'acik' AND k.aktif AND k.tur IN ('raf_gozu', 'kabul', 'depo_zemini')
     AND EXISTS (SELECT 1 FROM stok_bakiye b WHERE b.malzeme_id = a.malzeme_id AND b.konum_id = a.konum_id AND b.statu_id IS NULL
                    AND b.${KULLANILABILIR_SQL} AND b.miktar > 0)
   ORDER BY a.kayit_zamani, a.id`, [malzemeIdler]);
export const artikParcalar = (db: Db, a: { malzemeId: number | null; durum: ArtikDurumu }, sinir: number): Promise<ArtikParcaHam[]> =>
  db.sorgu(`${ARTIK_SECIMI} WHERE ($1::int IS NULL OR a.malzeme_id = $1) AND a.durum = $2 ORDER BY a.kayit_zamani DESC, a.id DESC LIMIT $3`,
    [a.malzemeId, a.durum, sinir]);
export const artikParcaEkle = (db: Db, a: { malzemeId: number; konumId: number; partiId: number | null; olcu: Record<string, number>; adet: number; aciklama: string | null; kisiId: number }): Promise<{ id: number; surum: number } | null> =>
  db.tek(`INSERT INTO stok_artik_parca (malzeme_id, konum_id, parti_id, olcu, adet, aciklama, kaydeden_kisi_id)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING id, surum`,
    [a.malzemeId, a.konumId, a.partiId, JSON.stringify(a.olcu), a.adet, a.aciklama, a.kisiId]);
// Yalnız açık artık kapanır; sürüm tutmazsa ya da artık kapalıysa null.
export const artikParcaKapat = (db: Db, id: number, surum: number, durum: 'kullanildi' | 'hurda', kisiId: number): Promise<{ id: number; surum: number } | null> =>
  db.tek(`UPDATE stok_artik_parca SET durum = $3, kapatan_kisi_id = $4, kapanis_zamani = now(), surum = surum + 1
           WHERE id = $1 AND surum = $2 AND durum = 'acik' RETURNING id, surum`, [id, surum, durum, kisiId]);
export const artikParcaVarMi = async (db: Db, id: number): Promise<{ durum: ArtikDurumu } | null> =>
  db.tek('SELECT durum FROM stok_artik_parca WHERE id = $1', [id]);
