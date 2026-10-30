import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { BaskiSonucu, Yazici } from '#paylasilan/sozlesme/etiket-merkezi.ts';

const YAZICI_SUTUNLARI = 'id, ad, dil, dpi, baglanti, host(adres) AS adres, sade, aktif, surum';

export const yazicilariOku = (db: Db): Promise<Yazici[]> =>
  db.sorgu<Yazici>(`SELECT ${YAZICI_SUTUNLARI} FROM etiket_merkezi_yazici ORDER BY aktif DESC, ad, id`);

export const yaziciOku = (db: Db, id: number): Promise<Yazici | null> =>
  db.tek<Yazici>(`SELECT ${YAZICI_SUTUNLARI} FROM etiket_merkezi_yazici WHERE id = $1`, [id]);

export async function yaziciVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek<{ id: number }>('SELECT id FROM etiket_merkezi_yazici WHERE id = $1', [id])) !== null;
}

export interface YaziciYazimi { ad: string; dil: string; dpi: number; baglanti: string; adres: string | null; sade: boolean }

export const yaziciEkle = (db: Db, y: YaziciYazimi, kisiId: number): Promise<Yazici | null> =>
  db.tek<Yazici>(
    `INSERT INTO etiket_merkezi_yazici (ad, dil, dpi, baglanti, adres, sade, degistiren_kisi_id)
     VALUES ($1, $2, $3, $4, $5::inet, $6, $7) RETURNING ${YAZICI_SUTUNLARI}`,
    [y.ad, y.dil, y.dpi, y.baglanti, y.adres, y.sade, kisiId],
  );

export const yaziciGuncelle = (db: Db, id: number, y: YaziciYazimi & { aktif: boolean; surum: number }, kisiId: number): Promise<Yazici | null> =>
  db.tek<Yazici>(
    `UPDATE etiket_merkezi_yazici
        SET ad = $3, dil = $4, dpi = $5, baglanti = $6, adres = $7::inet, sade = $8, aktif = $9,
            degistiren_kisi_id = $10, degisme_zamani = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING ${YAZICI_SUTUNLARI}`,
    [id, y.surum, y.ad, y.dil, y.dpi, y.baglanti, y.adres, y.sade, y.aktif, kisiId],
  );

export interface BaskiYazimi {
  yaziciId: number; sablonAnahtar: string; adet: number; kisiId: number; sonuc: BaskiSonucu; hata: string | null;
  kayit: { tur: string; idler: readonly number[] } | null;
}

// Baskı ve basılan kayıtlar tek komutta yazılır: biri yazılıp öteki eksik kalmaz.
export async function baskiEkle(db: Db, b: BaskiYazimi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `WITH b AS (
       INSERT INTO etiket_merkezi_baski (yazici_id, sablon_anahtar, adet, kisi_id, sonuc, hata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
     ), k AS (
       INSERT INTO etiket_merkezi_baski_kaydi (baski_id, kaynak_tur, kaynak_id)
       SELECT b.id, $7, x FROM b, unnest($8::int[]) AS x WHERE $7::text IS NOT NULL
     )
     SELECT id FROM b`,
    [b.yaziciId, b.sablonAnahtar, b.adet, b.kisiId, b.sonuc, b.hata, b.kayit?.tur ?? null, b.kayit?.idler ?? []],
  );
  if (!satir) throw new Error('Baskı kaydı yazılamadı.');
  return satir.id;
}

export interface BaskiSatiri {
  id: number; zaman: string; yazici: string; sablonAnahtar: string; adet: number; kisiId: number; sonuc: BaskiSonucu; hata: string | null;
  kayitSayisi: number;
}

export const sonBaskilar = (db: Db, sinir: number): Promise<BaskiSatiri[]> =>
  db.sorgu<BaskiSatiri>(
    `SELECT b.id, ${zamanMetni('b.zaman')} AS zaman, y.ad AS yazici, b.sablon_anahtar AS "sablonAnahtar", b.adet,
            b.kisi_id AS "kisiId", b.sonuc, b.hata,
            (SELECT count(*)::int FROM etiket_merkezi_baski_kaydi k WHERE k.baski_id = b.id) AS "kayitSayisi"
       FROM etiket_merkezi_baski b JOIN etiket_merkezi_yazici y ON y.id = b.yazici_id
      ORDER BY b.zaman DESC, b.id DESC LIMIT $1`,
    [sinir],
  );

export interface EtiketTuruSatiri {
  kod: string; ad: string; sahipModul: string; tetik: string; alanlar: string; sablonTuru: string | null; kayitTurleri: string[];
  durum: string; disaridakiYol: string | null;
}

export const etiketTurleriOku = (db: Db): Promise<EtiketTuruSatiri[]> =>
  db.sorgu<EtiketTuruSatiri>(
    `SELECT kod, ad, sahip_modul AS "sahipModul", tetik, alanlar, sablon_turu AS "sablonTuru", kayit_turleri AS "kayitTurleri",
            durum, disaridaki_yol AS "disaridakiYol"
       FROM etiket_merkezi_etiket_turu ORDER BY sira, kod`,
  );
