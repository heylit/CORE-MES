import type { Db } from '#cekirdek/db.ts';
import { EMIR_ANAHTARI, EMIR_ANLIK_ONEKI, IS_EMRI_ANLIK_ONEKI } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import type { Kayit, TezgahAyari } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { KURULUM_ADIMI } from './kurallar.ts';
import type { TezgahAyarSatiri } from './kurallar.ts';

// CNC kurulum kayıt deposunun SQL'i. Sürüm tek sayaçtan gelir.

const SUTUNLAR = 'anahtar, bicim, deger, surum';

// Emirlerin saklanan kurulumları (EMIR_ANLIK_ONEKI) çerçeveye gitmez: yalnız emir seçme komutu okur.
export async function kayitlar(db: Db): Promise<Kayit[]> {
  return db.sorgu<Kayit>(`SELECT ${SUTUNLAR} FROM cnc_kurulum_kayit WHERE left(anahtar, length($1::text)) <> $1::text ORDER BY anahtar`, [EMIR_ANLIK_ONEKI]);
}

export async function kayitGetir(db: Db, anahtar: string): Promise<Kayit | null> {
  return db.tek<Kayit>(`SELECT ${SUTUNLAR} FROM cnc_kurulum_kayit WHERE anahtar = $1`, [anahtar]);
}

// Yazmadan önce satırı kilitler: aynı kayda eşzamanlı iki yazma sürüm denetiminden sırayla geçer. Kayıt yoksa ilk yazmayı
// birincil anahtar ayırır (eşzamanlı ikinci INSERT çakışma hatası verir).
export async function surumKilitle(db: Db, anahtar: string): Promise<number | null> {
  return (await db.tek<{ surum: number }>('SELECT surum FROM cnc_kurulum_kayit WHERE anahtar = $1 FOR UPDATE', [anahtar]))?.surum ?? null;
}

export async function kayitEkle(db: Db, g: { anahtar: string; bicim: string; deger: unknown; kisiId: number }): Promise<Kayit | null> {
  return db.tek<Kayit>(
    `INSERT INTO cnc_kurulum_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id)
     VALUES ($1, $2, $3::jsonb, nextval('cnc_kurulum_surum'), $4)
     ON CONFLICT (anahtar) DO NOTHING
     RETURNING ${SUTUNLAR}`,
    [g.anahtar, g.bicim, JSON.stringify(g.deger), g.kisiId],
  );
}

export async function kayitGuncelle(db: Db, g: { anahtar: string; bicim: string; deger: unknown; kisiId: number }): Promise<Kayit | null> {
  return db.tek<Kayit>(
    `UPDATE cnc_kurulum_kayit
        SET bicim = $2, deger = $3::jsonb, surum = nextval('cnc_kurulum_surum'), guncelleyen_kisi_id = $4, guncellendi = now()
      WHERE anahtar = $1
      RETURNING ${SUTUNLAR}`,
    [g.anahtar, g.bicim, JSON.stringify(g.deger), g.kisiId],
  );
}

export async function kayitSil(db: Db, anahtar: string): Promise<boolean> {
  return (await db.sorgu<{ anahtar: string }>('DELETE FROM cnc_kurulum_kayit WHERE anahtar = $1 RETURNING anahtar', [anahtar])).length > 0;
}

// Zaman ISO metni olarak döner (sürücü Date nesnesine çevirmesin).
const ISO = (sutun: string): string => `to_json(${sutun}) #>> '{}'`;

// Hazırlık onay defteri: yalnız eklenir. Olay onay anında seçili iş emriyle ve üst emriyle yazılır (seçim yoksa ikisi de boş).
export async function hazirlikOlaylariEkle(
  db: Db, olaylar: readonly { adim: string; olay: string; imza: string | null }[], secim: { isEmriId: number; uretimEmriId: number } | null, kisiId: number,
): Promise<void> {
  if (olaylar.length === 0) return;
  await db.sorgu(
    `INSERT INTO cnc_kurulum_hazirlik_olayi (adim, olay, imza, emir_id, is_emri_id, kisi_id)
     SELECT o.adim, o.olay, o.imza, $4, $5, $6 FROM unnest($1::text[], $2::text[], $3::text[]) WITH ORDINALITY AS o (adim, olay, imza, sira)
      ORDER BY o.sira`,
    [olaylar.map((o) => o.adim), olaylar.map((o) => o.olay), olaylar.map((o) => o.imza), secim?.uretimEmriId ?? null, secim?.isEmriId ?? null, kisiId],
  );
}

export interface HazirlikSatiri { adim: string; olay: 'onay' | 'tamam'; imza: string | null; kisiId: number; zaman: string }

// İş emrinin her hazırlık adımının son olayı; son olayı geri alma olan adım gelmez. İş emri yoksa seçimsiz verilen onaylar
// (266 a öncesinin emir düzeyindeki onayları ikisine de girmez).
export async function hazirlikSonOnaylari(db: Db, isEmriId: number | null): Promise<HazirlikSatiri[]> {
  return db.sorgu<HazirlikSatiri>(
    `SELECT adim, olay, imza, kisi_id AS "kisiId", ${ISO('zaman')} AS zaman FROM (
       SELECT DISTINCT ON (adim) adim, olay, imza, kisi_id, zaman FROM cnc_kurulum_hazirlik_olayi
        WHERE (CASE WHEN $1::int IS NULL THEN is_emri_id IS NULL AND emir_id IS NULL ELSE is_emri_id = $1::int END) AND adim <> $2
        ORDER BY adim, id DESC
     ) s WHERE olay <> 'geri' ORDER BY zaman, adim`,
    [isEmriId, KURULUM_ADIMI],
  );
}

// İş emrinin son "kurulum tamam" kaydı.
export async function kurulumSonu(db: Db, isEmriId: number): Promise<{ imza: string | null; kisiId: number; zaman: string } | null> {
  return db.tek(
    `SELECT imza, kisi_id AS "kisiId", ${ISO('zaman')} AS zaman FROM cnc_kurulum_hazirlik_olayi
      WHERE is_emri_id = $1 AND adim = $2 ORDER BY id DESC LIMIT 1`,
    [isEmriId, KURULUM_ADIMI],
  );
}

// İş emirlerinin hazırlık özeti ("kurulum tamam" hazırlık sayılmaz): hiç olayı olan iş emirleri ve her birinin son onay adımındaki
// son olayı (tamam ya da geri alma).
export async function isEmriHazirlikOzetleri(
  db: Db, isEmriIdleri: readonly number[], sonOnayAdimi: string,
): Promise<{ isEmriId: number; sonOlay: string | null; zaman: string | null }[]> {
  if (isEmriIdleri.length === 0) return [];
  return db.sorgu(
    `SELECT e.is_emri_id AS "isEmriId", s.olay AS "sonOlay", ${ISO('s.zaman')} AS zaman
       FROM (SELECT DISTINCT is_emri_id FROM cnc_kurulum_hazirlik_olayi WHERE is_emri_id = ANY($1::int[]) AND adim <> $3) e
       LEFT JOIN LATERAL (SELECT olay, zaman FROM cnc_kurulum_hazirlik_olayi o
                           WHERE o.is_emri_id = e.is_emri_id AND o.adim = $2 ORDER BY o.id DESC LIMIT 1) s ON true`,
    [isEmriIdleri, sonOnayAdimi, KURULUM_ADIMI],
  );
}

// Kurulumda seçilmiş iş emirleri: şu an seçili olan, saklanan kurulumu olan ya da hazırlık defterinde kaydı olan. Seçili kaydın
// 266 a öncesi biçimi (uretimEmriId alanı yok) üretim emri kimliği taşır, sayılmaz.
export async function secilmisIsEmirleri(db: Db, isEmriIdleri: readonly number[]): Promise<number[]> {
  if (isEmriIdleri.length === 0) return [];
  const satirlar = await db.sorgu<{ id: number }>(
    `SELECT i.id FROM unnest($1::int[]) AS i(id)
      WHERE EXISTS (SELECT 1 FROM cnc_kurulum_kayit k WHERE k.anahtar = $2::text || i.id::text)
         OR EXISTS (SELECT 1 FROM cnc_kurulum_kayit k WHERE k.anahtar = $3::text AND k.deger ? 'uretimEmriId' AND k.deger->>'id' = i.id::text)
         OR EXISTS (SELECT 1 FROM cnc_kurulum_hazirlik_olayi o WHERE o.is_emri_id = i.id)`,
    [isEmriIdleri, IS_EMRI_ANLIK_ONEKI, EMIR_ANAHTARI],
  );
  return satirlar.map((s) => s.id);
}

// ---- Takım ömrü (295 a).

export interface TakimYukuSatiri {
  istasyonId: number; cep: number; takimKimligi: string; takimAd: string;
  parcaBasiDk: number | null; omurDk: number | null; omurAdet: number | null;
}

// İstasyonun magazini kurulumla yeniden yazılır: yükü olmayan cep düşer. Hedef (ömür) aynı takımda korunur.
export async function takimYukleriniYaz(
  db: Db, istasyonId: number, yukler: readonly { cep: number; takimKimligi: string; takimAd: string; parcaBasiDk: number | null }[], kisiId: number,
): Promise<void> {
  await db.sorgu(
    `DELETE FROM cnc_kurulum_takim_yuku y WHERE y.istasyon_id = $1
        AND NOT EXISTS (SELECT 1 FROM unnest($2::smallint[], $3::text[]) AS g (cep, kimlik) WHERE g.cep = y.cep AND g.kimlik = y.takim_kimligi)`,
    [istasyonId, yukler.map((y) => y.cep), yukler.map((y) => y.takimKimligi)],
  );
  if (yukler.length === 0) return;
  await db.sorgu(
    `INSERT INTO cnc_kurulum_takim_yuku (istasyon_id, cep, takim_kimligi, takim_ad, parca_basi_dk, guncelleyen_kisi_id)
     SELECT $1, g.cep, g.kimlik, g.ad, g.sure, $6 FROM unnest($2::smallint[], $3::text[], $4::text[], $5::numeric[]) AS g (cep, kimlik, ad, sure)
     ON CONFLICT (istasyon_id, cep) DO UPDATE
        SET takim_ad = EXCLUDED.takim_ad, parca_basi_dk = EXCLUDED.parca_basi_dk, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncellendi = now()`,
    [istasyonId, yukler.map((y) => y.cep), yukler.map((y) => y.takimKimligi), yukler.map((y) => y.takimAd), yukler.map((y) => y.parcaBasiDk), kisiId],
  );
}

const YUK_SUTUNLARI = `istasyon_id AS "istasyonId", cep, takim_kimligi AS "takimKimligi", takim_ad AS "takimAd",
  parca_basi_dk::float8 AS "parcaBasiDk", omur_dk::float8 AS "omurDk", omur_adet AS "omurAdet"`;

export async function istasyonTakimYukleri(db: Db, istasyonIdler: readonly number[]): Promise<TakimYukuSatiri[]> {
  if (istasyonIdler.length === 0) return [];
  return db.sorgu<TakimYukuSatiri>(
    `SELECT ${YUK_SUTUNLARI} FROM cnc_kurulum_takim_yuku WHERE istasyon_id = ANY($1::int[]) ORDER BY istasyon_id, cep`, [istasyonIdler],
  );
}

export async function takimOlaylariEkle(
  db: Db, olaylar: readonly { istasyonId: number; cep: number; takimKimligi: string; tur: 'sayim' | 'degisim' | 'duzeltme'; dk: number; adet: number }[],
  kaynak: { uretimEmriId: number | null; isEmriId: number | null; neden: string | null; kisiId: number },
): Promise<void> {
  if (olaylar.length === 0) return;
  await db.sorgu(
    `INSERT INTO cnc_kurulum_takim_olayi (istasyon_id, cep, takim_kimligi, tur, dk, adet, uretim_emri_id, is_emri_id, neden, kisi_id)
     SELECT g.istasyon, g.cep, g.kimlik, g.tur, g.dk, g.adet, $7, $8, $9, $10
       FROM unnest($1::int[], $2::smallint[], $3::text[], $4::text[], $5::numeric[], $6::numeric[]) AS g (istasyon, cep, kimlik, tur, dk, adet)`,
    [olaylar.map((o) => o.istasyonId), olaylar.map((o) => o.cep), olaylar.map((o) => o.takimKimligi), olaylar.map((o) => o.tur),
      olaylar.map((o) => o.dk), olaylar.map((o) => o.adet), kaynak.uretimEmriId, kaynak.isEmriId, kaynak.neden, kaynak.kisiId],
  );
}

// Takımın son değişimden (yoksa ilk olaydan) bu yana kullanımı; istasyon ve cep başına, yalnız o anki yükün takımı.
export async function takimKullanimlari(db: Db, istasyonIdler: readonly number[]): Promise<{ istasyonId: number; cep: number; dk: number; adet: number }[]> {
  if (istasyonIdler.length === 0) return [];
  return db.sorgu(
    `SELECT y.istasyon_id AS "istasyonId", y.cep, coalesce(sum(o.dk), 0)::float8 AS dk, coalesce(sum(o.adet), 0)::float8 AS adet
       FROM cnc_kurulum_takim_yuku y
       LEFT JOIN cnc_kurulum_takim_olayi o
         ON o.istasyon_id = y.istasyon_id AND o.cep = y.cep AND o.takim_kimligi = y.takim_kimligi AND o.tur <> 'degisim'
        AND o.id > coalesce((SELECT max(d.id) FROM cnc_kurulum_takim_olayi d
                              WHERE d.istasyon_id = y.istasyon_id AND d.cep = y.cep AND d.takim_kimligi = y.takim_kimligi AND d.tur = 'degisim'), 0)
      WHERE y.istasyon_id = ANY($1::int[])
      GROUP BY y.istasyon_id, y.cep
      ORDER BY y.istasyon_id, y.cep`,
    [istasyonIdler],
  );
}

// ---- Tezgâh ayarı (1091 a, 1139 b): makine başına bir satır.
const TEZGAH_SUTUNLARI = `makine_id AS "makineId", tur, kontrol, konik, cep_sayisi AS "cepSayisi", devir, is_mili_devri AS "isMiliDevri",
  canli_takim AS "canliTakim", canli_devir AS "canliDevir", elle, model_turu AS "modelTuru", surum`;

export async function tezgahAyarlari(db: Db): Promise<TezgahAyarSatiri[]> {
  return db.sorgu<TezgahAyarSatiri>(`SELECT ${TEZGAH_SUTUNLARI} FROM cnc_kurulum_tezgah ORDER BY makine_id`);
}

// Sürüm 0 ayarı olmayan makineyi bekler: satır varsa yazılmaz. Öteki sürüm satırdakiyle aynı değilse yazılmaz (null döner).
export async function tezgahAyariYaz(db: Db, makineId: number, a: TezgahAyari, beklenenSurum: number, kisiId: number): Promise<TezgahAyarSatiri | null> {
  return db.tek<TezgahAyarSatiri>(
    `INSERT INTO cnc_kurulum_tezgah AS t
       (makine_id, tur, kontrol, konik, cep_sayisi, devir, is_mili_devri, canli_takim, canli_devir, elle, model_turu, guncelleyen_kisi_id)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12 WHERE $13::int = 0 OR EXISTS (SELECT 1 FROM cnc_kurulum_tezgah WHERE makine_id = $1)
     ON CONFLICT (makine_id) DO UPDATE SET tur = EXCLUDED.tur, kontrol = EXCLUDED.kontrol, konik = EXCLUDED.konik, cep_sayisi = EXCLUDED.cep_sayisi,
       devir = EXCLUDED.devir, is_mili_devri = EXCLUDED.is_mili_devri, canli_takim = EXCLUDED.canli_takim, canli_devir = EXCLUDED.canli_devir,
       elle = EXCLUDED.elle, model_turu = EXCLUDED.model_turu, guncelleyen_kisi_id = EXCLUDED.guncelleyen_kisi_id, guncellendi = now(), surum = t.surum + 1
       WHERE t.surum = $13
     RETURNING ${TEZGAH_SUTUNLARI}`,
    [makineId, a.tur, a.kontrol, a.konik, a.cepSayisi, a.devir, a.isMiliDevri, a.canliTakim, a.canliDevir, a.elle, a.modelTuru, kisiId, beklenenSurum],
  );
}
