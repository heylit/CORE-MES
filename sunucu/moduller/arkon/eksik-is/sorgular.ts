import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { EksikIsKonusu, EksikIsTuru } from '#paylasilan/sozlesme/arkon.ts';

// Eksik iş olayları (kart 2421 c); tablo arkon_eksik_is_olayi.
export interface EksikIsOlayiSatiri {
  id: number;
  tur: EksikIsTuru;
  konuTur: EksikIsKonusu;
  konuId: number | null;
  isEmriId: number | null;
  uretimEmriId: number | null;
  emirNo: string | null;
  opNo: number | null;
  istasyonId: number | null;
  kaynakTur: 'makine' | 'kisi' | null;
  kaynakId: number | null;
  deger: number;
  kalanAdet: number | null;
  planaGore: boolean;
  dayanakAni: string | null;
  acilis: string;
  kapanis: string | null;
}

const SUTUNLAR = `id::float8 AS id, tur, konu_tur AS "konuTur", konu_id AS "konuId", is_emri_id AS "isEmriId", uretim_emri_id AS "uretimEmriId", emir_no AS "emirNo",
  op_no AS "opNo", istasyon_id AS "istasyonId", kaynak_tur AS "kaynakTur", kaynak_id AS "kaynakId", deger::float8 AS deger, kalan_adet AS "kalanAdet",
  plana_gore AS "planaGore", ${zamanMetni('dayanak_ani')} AS "dayanakAni", ${zamanMetni('acilis')} AS acilis, ${zamanMetni('kapanis')} AS kapanis`;

export function acikEksikIsler(db: Db): Promise<EksikIsOlayiSatiri[]> {
  return db.sorgu<EksikIsOlayiSatiri>(`SELECT ${SUTUNLAR} FROM arkon_eksik_is_olayi WHERE kapanis IS NULL ORDER BY id`);
}

export type YeniEksikIs = Omit<EksikIsOlayiSatiri, 'id' | 'kapanis'>;
export async function eksikIsAc(db: Db, o: YeniEksikIs): Promise<number> {
  const r = await db.tek<{ id: number }>(
    `INSERT INTO arkon_eksik_is_olayi (tur, konu_tur, konu_id, is_emri_id, uretim_emri_id, emir_no, op_no, istasyon_id, kaynak_tur, kaynak_id, deger, kalan_adet,
       plana_gore, dayanak_ani, acilis, guncelleme)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz, $15::timestamptz, $15::timestamptz) RETURNING id::float8 AS id`,
    [o.tur, o.konuTur, o.konuId, o.isEmriId, o.uretimEmriId, o.emirNo, o.opNo, o.istasyonId, o.kaynakTur, o.kaynakId, o.deger, o.kalanAdet, o.planaGore, o.dayanakAni, o.acilis],
  );
  return r!.id;
}

export function eksikIsGuncelle(
  db: Db, id: number, g: { deger: number; kalanAdet: number | null; planaGore: boolean; dayanakAni: string | null; istasyonId: number | null; guncelleme: string },
): Promise<unknown> {
  return db.sorgu(
    `UPDATE arkon_eksik_is_olayi SET deger = $2, kalan_adet = $3, plana_gore = $4, dayanak_ani = $5::timestamptz, istasyon_id = COALESCE($6, istasyon_id),
            guncelleme = $7::timestamptz WHERE id = $1 AND kapanis IS NULL`,
    [id, g.deger, g.kalanAdet, g.planaGore, g.dayanakAni, g.istasyonId, g.guncelleme],
  );
}

export function eksikIsKapat(db: Db, id: number, an: string): Promise<unknown> {
  return db.sorgu('UPDATE arkon_eksik_is_olayi SET kapanis = $2::timestamptz, guncelleme = $2::timestamptz WHERE id = $1 AND kapanis IS NULL', [id, an]);
}

export function eksikIsBildirildi(db: Db, id: number, an: string): Promise<unknown> {
  return db.sorgu('UPDATE arkon_eksik_is_olayi SET bildirim = $2::timestamptz WHERE id = $1', [id, an]);
}

// Sayfa için: açık olaylar ve verilen andan sonra kapananlar, önce açıklar, değeri büyükten; sınırlı.
export function eksikIslerGoster(db: Db, sonra: string, sinir: number): Promise<EksikIsOlayiSatiri[]> {
  return db.sorgu<EksikIsOlayiSatiri>(
    `SELECT ${SUTUNLAR} FROM arkon_eksik_is_olayi WHERE kapanis IS NULL OR kapanis >= $1::timestamptz
      ORDER BY (kapanis IS NULL) DESC, deger DESC, id DESC LIMIT $2`, [sonra, sinir]);
}
