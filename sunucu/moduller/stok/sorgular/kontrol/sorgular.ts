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

// ---- 3398-2 a: ayırma isteği ----
export interface AyirmaKaynagiHam { malzemeNo: number; artikId: number | null; stokMiktari: number | null; karsilanan: number; konumlar: string[] }
// Açık (bekleyen ya da ayrılmış) isteklerin stok kaynakları: ölçüyle aramada ve ihtiyaç kuyruğunda düşülür.
export const acikAyirmaKaynaklari = async (db: Db): Promise<AyirmaKaynagiHam[]> =>
  (await db.sorgu<{ k: AyirmaKaynagiHam }>(
    `SELECT k FROM stok_ayirma_istegi i, jsonb_array_elements(i.kaynaklar) k WHERE i.durum IN ('bekliyor', 'ayrildi')`)).map((r) => r.k);
// Aynı stok iki isteğe ayrılmasın: istek açma sırayla yürür (kısa, seyrek komut).
export const ayirmaKilidi = (db: Db): Promise<unknown> => db.sorgu("SELECT pg_advisory_xact_lock(hashtext('stok_ayirma_istegi'))");
export const ayirmaIstegiEkle = (db: Db, a: {
  talepId: string; kalemId: string; talepNo: string; kalemAd: string; malzemeId: number; miktar: string; birim: string; uretimEmriId: number | null;
  kaynaklar: AyirmaKaynagiHam[]; kalemSatiri: unknown; kisiId: number;
}): Promise<{ id: number; surum: number } | null> =>
  db.tek(`INSERT INTO stok_ayirma_istegi (talep_id, kalem_id, talep_no, kalem_ad, malzeme_id, miktar, birim, uretim_emri_id, kaynaklar, kalem_satiri, isteyen_kisi_id)
          VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9::jsonb, $10::jsonb, $11) RETURNING id, surum`,
    [a.talepId, a.kalemId, a.talepNo, a.kalemAd, a.malzemeId, a.miktar, a.birim, a.uretimEmriId, JSON.stringify(a.kaynaklar),
      a.kalemSatiri === null ? null : JSON.stringify(a.kalemSatiri), a.kisiId]);

export interface AyirmaIstegiHam {
  id: number; talepId: string; kalemId: string; talepNo: string; kalemAd: string; malzemeId: number; miktar: string; birim: string; uretimEmriId: number | null;
  kaynaklar: AyirmaKaynagiHam[]; kalemSatiri: unknown; durum: 'bekliyor' | 'ayrildi' | 'teslim' | 'iptal'; iptalNedeni: string | null; geriEklendi: boolean | null;
  isteyenKisiId: number; istekZamani: string; kararKisiId: number | null; kararZamani: string | null; surum: number;
}
const AYIRMA_SECIMI = `SELECT id, talep_id::text AS "talepId", kalem_id::text AS "kalemId", talep_no AS "talepNo", kalem_ad AS "kalemAd", malzeme_id AS "malzemeId",
  miktar::text AS miktar, birim, uretim_emri_id AS "uretimEmriId", kaynaklar, kalem_satiri AS "kalemSatiri", durum, iptal_nedeni AS "iptalNedeni",
  geri_eklendi AS "geriEklendi", isteyen_kisi_id AS "isteyenKisiId", ${zamanMetni('istek_zamani')} AS "istekZamani", karar_kisi_id AS "kararKisiId",
  ${zamanMetni('karar_zamani')} AS "kararZamani", surum FROM stok_ayirma_istegi`;
export const ayirmaIstekleri = (db: Db, acik: boolean, sinir: number): Promise<AyirmaIstegiHam[]> =>
  db.sorgu(`${AYIRMA_SECIMI} WHERE (durum IN ('bekliyor', 'ayrildi')) = $1 ORDER BY istek_zamani ${acik ? 'ASC' : 'DESC'}, id LIMIT $2`, [acik, sinir]);
export const ayirmaIstegiKilitle = (db: Db, id: number): Promise<AyirmaIstegiHam | null> => db.tek(`${AYIRMA_SECIMI} WHERE id = $1 FOR UPDATE`, [id]);
export const ayirmaIstegiIlerlet = (db: Db, id: number, durum: 'ayrildi' | 'teslim', kisiId: number): Promise<{ id: number; surum: number } | null> =>
  db.tek('UPDATE stok_ayirma_istegi SET durum = $2, karar_kisi_id = $3, karar_zamani = now(), surum = surum + 1 WHERE id = $1 RETURNING id, surum', [id, durum, kisiId]);
export const ayirmaIstegiIptal = (db: Db, id: number, neden: string, geriEklendi: boolean, kisiId: number): Promise<{ id: number; surum: number } | null> =>
  db.tek(`UPDATE stok_ayirma_istegi SET durum = 'iptal', iptal_nedeni = $2, geri_eklendi = $3, karar_kisi_id = $4, karar_zamani = now(), surum = surum + 1
           WHERE id = $1 RETURNING id, surum`, [id, neden, geriEklendi, kisiId]);
