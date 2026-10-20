import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaIstegi, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { ProjeDurumu } from '#paylasilan/sozlesme/projeler.ts';

export interface ProjeSatiri {
  id: number;
  kod: string;
  ad: string;
  durum: ProjeDurumu;
  firma_id: number | null;
  siparis_id: number | null;
  butce_tutari: string | null;
  butce_para_birimi: string | null;
  baslangic: string | null;
  bitis: string | null;
  aciklama: string | null;
  olusturma: string;
  guncelleme: string | null;
  surum: number;
}

const SECIM = `SELECT p.id, p.kod, p.ad, p.durum, p.firma_id, p.siparis_id, p.butce_tutari, p.butce_para_birimi, p.baslangic, p.bitis, p.aciklama,
                      ${zamanMetni('p.olusturma')} AS olusturma, ${zamanMetni('p.guncelleme')} AS guncelleme, p.surum
                 FROM projeler_proje p`;

export type ProjeSiralamasi = 'kod' | 'ad' | 'baslangic';
export const SIRALAMA: SiralamaTanimi<ProjeSiralamasi> = {
  sutunlar: { kod: 'p.kod', ad: 'p.ad', baslangic: 'p.baslangic' },
  ikincil: 'p.id',
  varsayilan: { sutun: 'p.kod', yon: 'artan' },
};

export interface ProjeSuzgeci {
  kalip: string | null;
  durum: ProjeDurumu | null;
}

const KOSUL = `WHERE ($1::text IS NULL OR p.kod ILIKE $1 OR p.ad ILIKE $1) AND ($2::text IS NULL OR p.durum = $2)`;
const kosulParametreleri = (s: ProjeSuzgeci): unknown[] => [s.kalip, s.durum];

export async function projeSay(db: Db, s: ProjeSuzgeci): Promise<number> {
  const satir = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM projeler_proje p ${KOSUL}`, kosulParametreleri(s));
  return satir?.toplam ?? 0;
}

export function projeSatirlari(db: Db, s: ProjeSuzgeci, siralama: SiralamaIstegi<ProjeSiralamasi>, dilim: Dilim): Promise<ProjeSatiri[]> {
  return db.sorgu<ProjeSatiri>(
    `${SECIM} ${KOSUL} ORDER BY ${siralamaSql(SIRALAMA, siralama)} LIMIT $3 OFFSET $4`,
    [...kosulParametreleri(s), dilim.sinir, dilim.atla],
  );
}

export function projeGetir(db: Db, id: number): Promise<ProjeSatiri | null> {
  return db.tek<ProjeSatiri>(`${SECIM} WHERE p.id = $1`, [id]);
}

export function projeKodlaGetir(db: Db, kod: string): Promise<ProjeSatiri | null> {
  return db.tek<ProjeSatiri>(`${SECIM} WHERE p.kod = $1`, [kod]);
}

export function projeSecenekleri(db: Db, s: { yalnizAktif: boolean; firmaId: number | null }): Promise<ProjeSatiri[]> {
  return db.sorgu<ProjeSatiri>(
    `${SECIM} WHERE (NOT $1::boolean OR p.durum = 'aktif') AND ($2::int IS NULL OR p.firma_id = $2) ORDER BY p.kod, p.id`,
    [s.yalnizAktif, s.firmaId],
  );
}

export function projeAdlari(db: Db, idler: number[]): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM projeler_proje WHERE id = ANY($1::int[])', [idler]);
}

export function siparisProjeleri(db: Db, siparisId: number): Promise<ProjeSatiri[]> {
  return db.sorgu<ProjeSatiri>(`${SECIM} WHERE p.siparis_id = $1 ORDER BY p.id`, [siparisId]);
}

export interface KilitliProje { firma_id: number | null; siparis_id: number | null; butce_tutari: string | null; butce_para_birimi: string | null }
export async function projeFirmasi(db: Db, id: number): Promise<KilitliProje | null> {
  return db.tek<KilitliProje>('SELECT firma_id, siparis_id, butce_tutari, butce_para_birimi FROM projeler_proje WHERE id = $1 FOR UPDATE', [id]);
}

export interface ProjeAlanlari {
  ad: string;
  firmaId: number | null;
  baslangic: string | null;
  bitis: string | null;
  aciklama: string | null;
  butceTutari: string | null;
  butceParaBirimi: string | null;
}

export async function projeEkle(db: Db, kod: string, a: ProjeAlanlari, kisiId: number, siparisId: number | null = null): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO projeler_proje (kod, ad, firma_id, baslangic, bitis, aciklama, olusturan_id, siparis_id, butce_tutari, butce_para_birimi)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [kod, a.ad, a.firmaId, a.baslangic, a.bitis, a.aciklama, kisiId, siparisId, a.butceTutari, a.butceParaBirimi],
  );
  if (satir === null) throw new Error('Proje eklenemedi');
  return satir.id;
}

// Sürüm tutmazsa satır dönmez; çağıran surumluGuncelle ile 404/409 ayırır.
export function projeGuncelle(
  db: Db, id: number, a: ProjeAlanlari & { durum: ProjeDurumu }, surum: number, kisiId: number,
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE projeler_proje
        SET ad = $2, firma_id = $3, baslangic = $4, bitis = $5, aciklama = $6, durum = $7,
            butce_tutari = $10, butce_para_birimi = $11, guncelleyen_id = $8, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $9 RETURNING id`,
    [id, a.ad, a.firmaId, a.baslangic, a.bitis, a.aciklama, a.durum, kisiId, surum, a.butceTutari, a.butceParaBirimi],
  );
}

export async function projeVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM projeler_proje WHERE id = $1', [id])) !== null;
}
