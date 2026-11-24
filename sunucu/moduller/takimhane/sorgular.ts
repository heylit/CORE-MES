import type { Db } from '#cekirdek/db.ts';

// Takımhane'nin kendi tabloları (3613). Bakiye ve konum Stok'tadır; burada yalnız takıma özgü özellik ve emir takım listesi yazılır.
export interface OzellikSatiri {
  kartNo: number; sinif: string; capMm: string | null; kesiciSayisi: number | null; isoKodu: string | null;
  malzemeGruplari: string[]; yenidenBilenir: boolean; izleme: string; surum: number;
}
export const ozellikler = (db: Db, kartNolari: readonly number[]): Promise<OzellikSatiri[]> =>
  kartNolari.length === 0 ? Promise.resolve([]) : db.sorgu<OzellikSatiri>(
    `SELECT kart_no AS "kartNo", sinif, cap_mm::text AS "capMm", kesici_sayisi AS "kesiciSayisi", iso_kodu AS "isoKodu",
            malzeme_gruplari AS "malzemeGruplari", yeniden_bilenir AS "yenidenBilenir", izleme, surum
       FROM takimhane_ozellik WHERE kart_no = ANY($1::int[])`, [[...kartNolari]]);

export interface OzellikYaz {
  kartNo: number; sinif: string; capMm: number | null; kesiciSayisi: number | null; isoKodu: string | null;
  malzemeGruplari: readonly string[]; yenidenBilenir: boolean; izleme: string;
}
export const ozellikYaz = (db: Db, o: OzellikYaz): Promise<unknown[]> =>
  db.sorgu(
    `INSERT INTO takimhane_ozellik (kart_no, sinif, cap_mm, kesici_sayisi, iso_kodu, malzeme_gruplari, yeniden_bilenir, izleme)
     VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8)
     ON CONFLICT (kart_no) DO UPDATE SET sinif = EXCLUDED.sinif, cap_mm = EXCLUDED.cap_mm, kesici_sayisi = EXCLUDED.kesici_sayisi,
       iso_kodu = EXCLUDED.iso_kodu, malzeme_gruplari = EXCLUDED.malzeme_gruplari, yeniden_bilenir = EXCLUDED.yeniden_bilenir,
       izleme = EXCLUDED.izleme, surum = takimhane_ozellik.surum + 1
     RETURNING kart_no`, [o.kartNo, o.sinif, o.capMm, o.kesiciSayisi, o.isoKodu, [...o.malzemeGruplari], o.yenidenBilenir, o.izleme]);

export interface EmirTakimSatiri { cep: string; kartNo: number; adet: number }
export const emirTakimlari = (db: Db, emirId: number): Promise<EmirTakimSatiri[]> =>
  db.sorgu<EmirTakimSatiri>('SELECT cep, kart_no AS "kartNo", adet FROM takimhane_emir_takimi WHERE uretim_emri_id = $1 ORDER BY cep, kart_no', [emirId]);
export const emirTakimlariniSil = (db: Db, emirId: number): Promise<unknown[]> =>
  db.sorgu('DELETE FROM takimhane_emir_takimi WHERE uretim_emri_id = $1 RETURNING id', [emirId]);
export const emirTakimiEkle = (db: Db, emirId: number, s: EmirTakimSatiri): Promise<unknown[]> =>
  db.sorgu('INSERT INTO takimhane_emir_takimi (uretim_emri_id, cep, kart_no, adet) VALUES ($1, $2, $3, $4) RETURNING id', [emirId, s.cep, s.kartNo, s.adet]);

// Bekleyen iade: yolda olan (kabul edilmemiş) teslimler değil, depoya dönmek üzere kişide/istasyonda duran takım sayısı bakiyeden gelir.
// Burada yalnız kartın mevcut olduğunu denetlemek için.
export const kartVarMi = async (db: Db, kartNo: number): Promise<boolean> =>
  (await db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE no = $1', [kartNo])) !== null;
