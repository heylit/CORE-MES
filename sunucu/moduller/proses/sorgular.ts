import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { NcDurumu, NcKontrolu } from '#paylasilan/sozlesme/proses.ts';

export interface NcProgramSatiri {
  id: number;
  malzemeId: number;
  opNo: number;
  revizyonKodu: string | null;
  ad: string;
  kontrol: NcKontrolu | null;
  makineId: number | null;
  camYazilimi: string | null;
  camDosyasi: string | null;
  sifirNoktasi: string | null;
  cevrimSuresiDk: string | null;
  durum: NcDurumu;
  aciklama: string | null;
  surum: number;
  guncelleme: string;
}
export interface NcTakimSatiri { programId: number; sira: number; tNo: string; malzemeId: number; tutucu: string | null; cikintiMm: string | null; islem: string | null }
export interface NcAparatSatiri { programId: number; sira: number; malzemeId: number; aciklama: string | null }

const PROGRAM_SUTUNLARI = `id, malzeme_id AS "malzemeId", op_no AS "opNo", cizim_revizyon_kodu AS "revizyonKodu", ad, kontrol, makine_id AS "makineId",
  cam_yazilimi AS "camYazilimi", cam_dosyasi AS "camDosyasi", sifir_noktasi AS "sifirNoktasi", cevrim_suresi_dk AS "cevrimSuresiDk", durum, aciklama,
  surum, ${zamanMetni('guncelleme')} AS guncelleme`;

export function parcaninProgramlari(db: Db, malzemeId: number): Promise<NcProgramSatiri[]> {
  return db.sorgu<NcProgramSatiri>(`SELECT ${PROGRAM_SUTUNLARI} FROM proses_nc_programi WHERE malzeme_id = $1 ORDER BY op_no, lower(ad), id`, [malzemeId]);
}

// Kaydetmede programın kendisi kilitlenir: aynı programı iki kişinin aynı anda yazması sürümle ayrılır.
export function programKilitle(db: Db, id: number): Promise<NcProgramSatiri | null> {
  return db.tek<NcProgramSatiri>(`SELECT ${PROGRAM_SUTUNLARI} FROM proses_nc_programi WHERE id = $1 FOR UPDATE`, [id]);
}

export function takimlar(db: Db, programIdleri: readonly number[]): Promise<NcTakimSatiri[]> {
  if (programIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<NcTakimSatiri>(
    `SELECT program_id AS "programId", sira, t_no AS "tNo", malzeme_id AS "malzemeId", tutucu, cikinti_mm AS "cikintiMm", islem
       FROM proses_nc_takimi WHERE program_id = ANY($1::int[]) ORDER BY program_id, sira`, [programIdleri]);
}

export function aparatlar(db: Db, programIdleri: readonly number[]): Promise<NcAparatSatiri[]> {
  if (programIdleri.length === 0) return Promise.resolve([]);
  return db.sorgu<NcAparatSatiri>(
    `SELECT program_id AS "programId", sira, malzeme_id AS "malzemeId", aciklama FROM proses_nc_aparati
      WHERE program_id = ANY($1::int[]) ORDER BY program_id, sira`, [programIdleri]);
}

export interface ProgramYazimi {
  revizyonKodu: string | null;
  ad: string;
  kontrol: NcKontrolu | null;
  makineId: number | null;
  camYazilimi: string | null;
  camDosyasi: string | null;
  sifirNoktasi: string | null;
  cevrimSuresiDk: number | null;
  durum: NcDurumu;
  aciklama: string | null;
}

const YAZIM_DEGERLERI = (y: ProgramYazimi) =>
  [y.revizyonKodu, y.ad, y.kontrol, y.makineId, y.camYazilimi, y.camDosyasi, y.sifirNoktasi, y.cevrimSuresiDk, y.durum, y.aciklama];

export async function programEkle(db: Db, malzemeId: number, opNo: number, y: ProgramYazimi, kisiId: number): Promise<{ id: number; surum: number }> {
  const s = await db.tek<{ id: number; surum: number }>(
    `INSERT INTO proses_nc_programi (cizim_revizyon_kodu, ad, kontrol, makine_id, cam_yazilimi, cam_dosyasi, sifir_noktasi, cevrim_suresi_dk, durum, aciklama,
       malzeme_id, op_no, olusturan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13) RETURNING id, surum`,
    [...YAZIM_DEGERLERI(y), malzemeId, opNo, kisiId]);
  if (!s) throw new Error('NC programı eklenemedi.');
  return s;
}

// Sürüm koşullu yazma: arada başkası yazdıysa satır dönmez.
export function programGuncelle(db: Db, id: number, surum: number, y: ProgramYazimi, kisiId: number): Promise<{ id: number; surum: number } | null> {
  return db.tek<{ id: number; surum: number }>(
    `UPDATE proses_nc_programi SET cizim_revizyon_kodu = $1, ad = $2, kontrol = $3, makine_id = $4, cam_yazilimi = $5, cam_dosyasi = $6,
       sifir_noktasi = $7, cevrim_suresi_dk = $8, durum = $9, aciklama = $10, guncelleyen_kisi_id = $13, guncelleme = now(), surum = surum + 1
     WHERE id = $11 AND surum = $12 RETURNING id, surum`,
    [...YAZIM_DEGERLERI(y), id, surum, kisiId]);
}

export async function altlariYaz(
  db: Db, programId: number,
  t: readonly { tNo: string; malzemeId: number; tutucu: string | null; cikintiMm: number | null; islem: string | null }[],
  a: readonly { malzemeId: number; aciklama: string | null }[],
): Promise<void> {
  await db.sorgu('DELETE FROM proses_nc_takimi WHERE program_id = $1', [programId]);
  await db.sorgu('DELETE FROM proses_nc_aparati WHERE program_id = $1', [programId]);
  if (t.length > 0) {
    await db.sorgu(
      `INSERT INTO proses_nc_takimi (program_id, sira, t_no, malzeme_id, tutucu, cikinti_mm, islem)
       SELECT $1, x.sira, x.t_no, x.malzeme_id, x.tutucu, x.cikinti_mm, x.islem
         FROM unnest($2::int[], $3::text[], $4::int[], $5::text[], $6::numeric[], $7::text[]) AS x (sira, t_no, malzeme_id, tutucu, cikinti_mm, islem)`,
      [programId, t.map((_, i) => i + 1), t.map((x) => x.tNo), t.map((x) => x.malzemeId), t.map((x) => x.tutucu), t.map((x) => x.cikintiMm), t.map((x) => x.islem)]);
  }
  if (a.length > 0) {
    await db.sorgu(
      `INSERT INTO proses_nc_aparati (program_id, sira, malzeme_id, aciklama)
       SELECT $1, x.sira, x.malzeme_id, x.aciklama FROM unnest($2::int[], $3::int[], $4::text[]) AS x (sira, malzeme_id, aciklama)`,
      [programId, a.map((_, i) => i + 1), a.map((x) => x.malzemeId), a.map((x) => x.aciklama)]);
  }
}
