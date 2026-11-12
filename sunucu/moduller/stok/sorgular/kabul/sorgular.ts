import type { Db } from '#cekirdek/db.ts';
import type { Dilim, SiralamaIstegi, SiralamaTanimi } from '#cekirdek/liste.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { KaliteDurumu, KonumTuru, MalKabulBelgeTuru } from '#paylasilan/sozlesme/stok.ts';
import { S, icinde } from '../ortak/sorgular.ts';

// ---- Mal kabulü yapılanlar (2890): satır düzeyi liste ve lotların bugünkü bakiyeleri -----------------------------------------
export interface MalKabulSatirSuzgeci {
  metin?: string | undefined; malzemeId?: number | undefined; tur?: string | undefined; logoDurumu?: string | undefined;
  baslangic?: string | undefined; bitis?: string | undefined;
}
const KAYNAK = 'FROM stok_mal_kabul_satiri s JOIN stok_mal_kabul m ON m.id = s.mal_kabul_id LEFT JOIN stok_parti p ON p.id = s.parti_id';
const suzgec = (s: MalKabulSatirSuzgeci) => ({
  sql: `WHERE ($1::int IS NULL OR s.malzeme_id = $1) AND ($2::text IS NULL OR m.tur = $2) AND ($3::text IS NULL OR s.logo_durumu = $3)
          AND ($4::timestamptz IS NULL OR m.zaman >= $4) AND ($5::timestamptz IS NULL OR m.zaman < $5)
          AND ($6::text IS NULL OR ${S('m.no')} LIKE $6 OR ${S('m.irsaliye_no')} LIKE $6 OR ${S('p.lot_no')} LIKE $6 OR ${S('p.tedarikci_parti_no')} LIKE $6)`,
  p: [s.malzemeId ?? null, s.tur ?? null, s.logoDurumu ?? null, s.baslangic ?? null, s.bitis ?? null, icinde(s.metin)],
});
export const MAL_KABUL_SATIRI_SIRALAMASI: SiralamaTanimi<'zaman'> = { sutunlar: { zaman: 'm.zaman' }, ikincil: 's.id', varsayilan: { sutun: 'm.zaman', yon: 'azalan' } };
export async function malKabulSatiriSay(db: Db, s: MalKabulSatirSuzgeci): Promise<number> {
  const f = suzgec(s);
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${KAYNAK} ${f.sql}`, f.p))?.toplam ?? 0;
}
export interface MalKabulListeSatiriHam {
  id: number; malKabulId: number; belgeNo: string; tur: MalKabulBelgeTuru; irsaliyeNo: string | null; zaman: string; kisiId: number;
  sira: number; malzemeId: number; sayilanMiktar: string; partiId: number | null; lotNo: string | null; tedarikciPartiNo: string | null;
  ilkKonumKod: string | null; siparisSatirId: number | null; fasonMalzemeId: number | null; gkk: boolean;
  logoDurumu: 'irsaliye_bekleniyor' | 'eslesti' | 'fark_var'; duzeltenId: number | null;
}
export function malKabulListeSatirlari(db: Db, s: MalKabulSatirSuzgeci, sira: SiralamaIstegi<'zaman'>, d: Dilim): Promise<MalKabulListeSatiriHam[]> {
  const f = suzgec(s);
  return db.sorgu(
    `SELECT s.id, m.id AS "malKabulId", m.no AS "belgeNo", m.tur, m.irsaliye_no AS "irsaliyeNo", ${zamanMetni('m.zaman')} AS zaman, m.kisi_id AS "kisiId",
       s.sira, s.malzeme_id AS "malzemeId", s.sayilan_miktar::text AS "sayilanMiktar", s.parti_id AS "partiId", p.lot_no AS "lotNo",
       p.tedarikci_parti_no AS "tedarikciPartiNo", k.kod AS "ilkKonumKod", s.siparis_satir_id AS "siparisSatirId", fh.malzeme_id AS "fasonMalzemeId",
       COALESCE(h.tur = 'giris' AND h.giris_kaynagi = 'mal_kabul' AND h.hedef_kalite_durumu = 'karar_bekliyor', false) AS gkk,
       s.logo_durumu AS "logoDurumu", (SELECT d.id FROM stok_mal_kabul d WHERE d.duzeltilen_id = m.id) AS "duzeltenId"
     ${KAYNAK} LEFT JOIN stok_konum k ON k.id = s.konum_id LEFT JOIN stok_hareketi h ON h.id = s.hareket_id
       LEFT JOIN stok_hareketi fh ON fh.id = s.fason_cikis_hareket_id
     ${f.sql}
     ORDER BY ${siralamaSql(MAL_KABUL_SATIRI_SIRALAMASI, sira)} LIMIT $7 OFFSET $8`,
    [...f.p, d.sinir, d.atla],
  );
}
export interface LotYeriHam { partiId: number; konumId: number; konumKod: string; konumTur: KonumTuru; miktar: string; kaliteDurumu: KaliteDurumu }
// Lotların bugünkü sıfırdan büyük bakiyeleri, konum ve kalite başına toplanmış (statü ve rezerve ayrımı burada gerekmez).
export const lotYerleri = (db: Db, partiIdler: readonly number[]): Promise<LotYeriHam[]> => db.sorgu(
  `SELECT b.parti_id AS "partiId", k.id AS "konumId", k.kod AS "konumKod", k.tur AS "konumTur", sum(b.miktar)::text AS miktar, b.kalite_durumu AS "kaliteDurumu"
     FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
    WHERE b.parti_id = ANY($1::int[]) AND b.miktar > 0
    GROUP BY b.parti_id, k.id, k.kod, k.tur, b.kalite_durumu ORDER BY b.parti_id, k.kod, b.kalite_durumu`, [[...partiIdler]]);

// 3087 a: kişinin yarım kalan mal kabul taslağı (kişi başına tek satır).
export interface MalKabulTaslakHam { govde: Record<string, unknown>; surum: number; guncellendi: string }
const TASLAK_ALANLARI = `govde, surum, ${zamanMetni('guncellendi')} AS guncellendi`;

export function malKabulTaslagiOku(db: Db, kisiId: number): Promise<MalKabulTaslakHam | null> {
  return db.tek<MalKabulTaslakHam>(`SELECT ${TASLAK_ALANLARI} FROM stok_mal_kabul_taslagi WHERE kisi_id = $1`, [kisiId]);
}

// İlk yazma: aynı anda gelen ikinci ilk yazma satır açmaz, null döner (sürüm çakışması).
export function malKabulTaslagiAc(db: Db, kisiId: number, govde: unknown): Promise<MalKabulTaslakHam | null> {
  return db.tek<MalKabulTaslakHam>(
    `INSERT INTO stok_mal_kabul_taslagi (kisi_id, govde) VALUES ($1, $2) ON CONFLICT (kisi_id) DO NOTHING RETURNING ${TASLAK_ALANLARI}`,
    [kisiId, JSON.stringify(govde)],
  );
}

// Okunan sürüm tutmazsa satır değişmez, null döner.
export function malKabulTaslagiGuncelle(db: Db, kisiId: number, govde: unknown, surum: number): Promise<MalKabulTaslakHam | null> {
  return db.tek<MalKabulTaslakHam>(
    `UPDATE stok_mal_kabul_taslagi SET govde = $2, surum = surum + 1, guncellendi = now() WHERE kisi_id = $1 AND surum = $3 RETURNING ${TASLAK_ALANLARI}`,
    [kisiId, JSON.stringify(govde), surum],
  );
}

// surum null: sürüme bakmadan siler (teslimde aynı işlemde). Silinen satır sayısını döner.
export async function malKabulTaslagiSil(db: Db, kisiId: number, surum: number | null): Promise<number> {
  const r = await db.sorgu<{ kisi_id: number }>(
    'DELETE FROM stok_mal_kabul_taslagi WHERE kisi_id = $1 AND ($2::int IS NULL OR surum = $2) RETURNING kisi_id',
    [kisiId, surum],
  );
  return r.length;
}
