import type { Db } from '#cekirdek/db.ts';
import { ISO, NULLU_ISO } from '../ortak/sorgular.ts';

export type KartsizIzinKayitDurumu = 'bekliyor' | 'izin' | 'ret' | 'iptal' | 'kullanildi';
export interface KartsizIzinSatiri {
  id: number; uretimEmriId: number; emirNo: string; isEmriId: number | null; adimSira: number | null; adimAd: string | null;
  isteyenKisiId: number; isteyenAd: string; istekAn: string; durum: KartsizIzinKayitDurumu;
  kararVeren: string | null; kararGerekce: string | null; kararAn: string | null;
}

const SECIM = `z.id, z.uretim_emri_id AS "uretimEmriId", e.emir_no AS "emirNo", z.is_emri_id AS "isEmriId", a.sira AS "adimSira", a.ad AS "adimAd",
  z.isteyen_kisi_id AS "isteyenKisiId", ik.ad AS "isteyenAd", ${ISO('z.istek_an')} AS "istekAn", z.durum,
  kk.ad AS "kararVeren", z.karar_gerekce AS "kararGerekce", ${NULLU_ISO('z.karar_an')} AS "kararAn"`;
const KAYNAK = `FROM uretim_emirleri_kartsiz_izin z
  JOIN uretim_emri e ON e.id = z.uretim_emri_id
  JOIN kisi ik ON ik.id = z.isteyen_kisi_id
  LEFT JOIN kisi kk ON kk.id = z.karar_veren_kisi_id
  LEFT JOIN uretim_emirleri_is_emri a ON a.id = z.is_emri_id`;

// Kilitli okuma karar, iptal ve kullanma komutlarınındır: iki yetkili aynı anda karar veremez, izin iki kez kullanılamaz.
export async function kartsizIzinGetir(db: Db, id: number, kilitle = false): Promise<KartsizIzinSatiri | null> {
  if (kilitle) await db.sorgu('SELECT id FROM uretim_emirleri_kartsiz_izin WHERE id = $1 FOR UPDATE', [id]);
  const [s] = await db.sorgu<KartsizIzinSatiri>(`SELECT ${SECIM} ${KAYNAK} WHERE z.id = $1`, [id]);
  return s ?? null;
}

// Aynı kişinin aynı işteki bekleyen isteği yenisi açılmadan iptal olur (tek bekleyen dizini).
export function bekleyenKartsizIzniIptalEt(db: Db, kisiId: number, uretimEmriId: number, isEmriId: number | null): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_kartsiz_izin SET durum = 'iptal'
      WHERE isteyen_kisi_id = $1 AND uretim_emri_id = $2 AND coalesce(is_emri_id, 0) = coalesce($3::int, 0) AND durum = 'bekliyor'`,
    [kisiId, uretimEmriId, isEmriId],
  );
}

export async function kartsizIzinEkle(db: Db, y: { uretimEmriId: number; isEmriId: number | null; kisiId: number; an: string }): Promise<number> {
  const [s] = await db.sorgu<{ id: number }>(
    `INSERT INTO uretim_emirleri_kartsiz_izin (uretim_emri_id, is_emri_id, isteyen_kisi_id, istek_an) VALUES ($1, $2, $3, $4::timestamptz) RETURNING id`,
    [y.uretimEmriId, y.isEmriId, y.kisiId, y.an],
  );
  return s!.id;
}

export function kartsizIzinKarariYaz(db: Db, id: number, y: { durum: 'izin' | 'ret'; kisiId: number; gerekce: string; an: string }): Promise<unknown> {
  return db.sorgu(
    `UPDATE uretim_emirleri_kartsiz_izin SET durum = $2, karar_veren_kisi_id = $3, karar_gerekce = $4, karar_an = $5::timestamptz
      WHERE id = $1 AND durum = 'bekliyor'`,
    [id, y.durum, y.kisiId, y.gerekce, y.an],
  );
}

export function kartsizIzniIptalEt(db: Db, id: number): Promise<unknown> {
  return db.sorgu(`UPDATE uretim_emirleri_kartsiz_izin SET durum = 'iptal' WHERE id = $1 AND durum = 'bekliyor'`, [id]);
}

export function kartsizIzniKullan(db: Db, id: number, an: string): Promise<unknown> {
  return db.sorgu(`UPDATE uretim_emirleri_kartsiz_izin SET durum = 'kullanildi', kullanildi_an = $2::timestamptz WHERE id = $1 AND durum = 'izin'`, [id, an]);
}

// Sunucunun şimdiki anı (ISO): istek ve karar anı terminal saatine değil sunucuya göre yazılır.
export async function simdi(db: Db): Promise<string> {
  const [s] = await db.sorgu<{ an: string }>(`SELECT ${ISO('now()')} AS an`);
  return s!.an;
}
