import type { Db } from '#cekirdek/db.ts';
import { siralamaSql } from '#cekirdek/liste.ts';
import type { Dilim, SiralamaIstegi, SiralamaTanimi } from '#cekirdek/liste.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { SiparisDurumu, TeklifDurumu } from '#paylasilan/sozlesme/siparisler.ts';

export interface SiparisSatiri {
  id: number;
  no: string;
  durum: SiparisDurumu;
  firma_id: number;
  musteri_siparis_no: string | null;
  siparis_tarihi: string;
  termin: string;
  para_birimi: string;
  kdv_orani: string;
  odeme_kosulu: string | null;
  aciklama: string | null;
  ara_toplam: string | null;
  kdv_tutari: string | null;
  genel_toplam: string | null;
  gecikme_ceza_orani: string | null;
  ceza_tavani_orani: string | null;
  odeme_vadesi_gun: number | null;
  iptal_nedeni: string | null;
  olusturma: string;
  guncelleme: string | null;
  onay_zamani: string | null;
  surum: number;
}

// Satır tutarı iki ondalığa yuvarlanır; toplam yuvarlanmış satırların toplamıdır, KDV toplamdan hesaplanır.
const SECIM = `SELECT s.id, s.no, s.durum, s.firma_id, s.musteri_siparis_no, s.siparis_tarihi, s.termin, s.para_birimi, s.kdv_orani,
                      s.odeme_kosulu, s.aciklama, t.ara_toplam, round(t.ara_toplam * s.kdv_orani / 100, 2) AS kdv_tutari,
                      t.ara_toplam + round(t.ara_toplam * s.kdv_orani / 100, 2) AS genel_toplam, s.gecikme_ceza_orani,
                      s.ceza_tavani_orani, s.odeme_vadesi_gun, s.iptal_nedeni,
                      ${zamanMetni('s.olusturma')} AS olusturma, ${zamanMetni('s.guncelleme')} AS guncelleme,
                      ${zamanMetni('s.onay_zamani')} AS onay_zamani, s.surum
                 FROM siparisler_siparis s
                 CROSS JOIN LATERAL (
                   SELECT CASE WHEN bool_and(r.birim_fiyat IS NOT NULL) IS FALSE THEN NULL
                          ELSE coalesce(sum(round(r.miktar * r.birim_fiyat, 2)), 0) END::numeric(20,2) AS ara_toplam
                     FROM siparisler_siparis_satiri r WHERE r.siparis_id = s.id
                 ) t`;

export type SiparisSiralamasi = 'no' | 'siparisTarihi' | 'termin';
export const SIRALAMA: SiralamaTanimi<SiparisSiralamasi> = {
  sutunlar: { no: 's.no', siparisTarihi: 's.siparis_tarihi', termin: 's.termin' },
  ikincil: 's.id',
  varsayilan: { sutun: 's.siparis_tarihi', yon: 'azalan' },
};

export interface SiparisSuzgeci {
  kalip: string | null;
  durum: SiparisDurumu | null;
  firmaId: number | null;
}

const KOSUL = `WHERE ($1::text IS NULL OR s.no ILIKE $1 OR s.musteri_siparis_no ILIKE $1)
                 AND ($2::text IS NULL OR s.durum = $2) AND ($3::int IS NULL OR s.firma_id = $3)`;
const kosulParametreleri = (s: SiparisSuzgeci): unknown[] => [s.kalip, s.durum, s.firmaId];

export async function siparisSay(db: Db, s: SiparisSuzgeci): Promise<number> {
  const satir = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM siparisler_siparis s ${KOSUL}`, kosulParametreleri(s));
  return satir?.toplam ?? 0;
}

export function siparisSatirlari(db: Db, s: SiparisSuzgeci, siralama: SiralamaIstegi<SiparisSiralamasi>, dilim: Dilim): Promise<SiparisSatiri[]> {
  return db.sorgu<SiparisSatiri>(
    `${SECIM} ${KOSUL} ORDER BY ${siralamaSql(SIRALAMA, siralama)} LIMIT $4 OFFSET $5`,
    [...kosulParametreleri(s), dilim.sinir, dilim.atla],
  );
}

export function siparisGetir(db: Db, id: number): Promise<SiparisSatiri | null> {
  return db.tek<SiparisSatiri>(`${SECIM} WHERE s.id = $1`, [id]);
}

export function siparisleriGetir(db: Db, idler: number[]): Promise<SiparisSatiri[]> {
  return db.sorgu<SiparisSatiri>(`${SECIM} WHERE s.id = ANY($1::int[])`, [idler]);
}

export interface KalemSatiri {
  id: number;
  siparis_id: number;
  sira: number;
  malzeme_no: number;
  miktar: string;
  birim_fiyat: string | null;
  tutar: string | null;
  termin: string | null;
  aciklama: string | null;
}

const KALEM_SECIMI = `SELECT id, siparis_id, sira, malzeme_no, miktar, birim_fiyat, round(miktar * birim_fiyat, 2) AS tutar, termin, aciklama
                        FROM siparisler_siparis_satiri`;

export function kalemler(db: Db, siparisId: number): Promise<KalemSatiri[]> {
  return db.sorgu<KalemSatiri>(`${KALEM_SECIMI} WHERE siparis_id = $1 ORDER BY sira`, [siparisId]);
}

export function kalemleriGetir(db: Db, idler: number[]): Promise<KalemSatiri[]> {
  return db.sorgu<KalemSatiri>(`${KALEM_SECIMI} WHERE id = ANY($1::int[]) ORDER BY id`, [idler]);
}

// Durum ve firma kilitlenerek okunur: eşzamanlı komutta kural güncel duruma göre işler.
export function siparisKilitle(db: Db, id: number): Promise<{ durum: SiparisDurumu; firma_id: number; surum: number } | null> {
  return db.tek<{ durum: SiparisDurumu; firma_id: number; surum: number }>(
    'SELECT durum, firma_id, surum FROM siparisler_siparis WHERE id = $1 FOR UPDATE', [id],
  );
}

export async function siparisVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM siparisler_siparis WHERE id = $1', [id])) !== null;
}

export async function siparisNoVarMi(db: Db, no: string): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM siparisler_siparis WHERE no = $1', [no])) !== null;
}

export interface BaslikAlanlari {
  firmaId: number;
  musteriSiparisNo: string | null;
  siparisTarihi: string;
  termin: string;
  paraBirimi: string;
  kdvOrani: string;
  odemeKosulu: string | null;
  aciklama: string | null;
  cezaOraniGun: string | null;
  cezaTavaniOrani: string | null;
  odemeVadesiGun: number | null;
}

export async function siparisEkle(db: Db, no: string, a: BaslikAlanlari, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO siparisler_siparis (no, firma_id, musteri_siparis_no, siparis_tarihi, termin, para_birimi, kdv_orani, odeme_kosulu, aciklama, olusturan_id,
                                     gecikme_ceza_orani, ceza_tavani_orani, odeme_vadesi_gun)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [no, a.firmaId, a.musteriSiparisNo, a.siparisTarihi, a.termin, a.paraBirimi, a.kdvOrani, a.odemeKosulu, a.aciklama, kisiId, a.cezaOraniGun, a.cezaTavaniOrani,
     a.odemeVadesiGun],
  );
  if (satir === null) throw new Error('Sipariş eklenemedi');
  return satir.id;
}

// Sürüm tutmazsa satır dönmez; çağıran surumluGuncelle ile 404/409 ayırır. Yalnız taslak yazılır (servis kilitle denetler).
export function siparisGuncelle(db: Db, id: number, a: BaslikAlanlari, surum: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE siparisler_siparis
        SET firma_id = $2, musteri_siparis_no = $3, siparis_tarihi = $4, termin = $5, para_birimi = $6, kdv_orani = $7,
            odeme_kosulu = $8, aciklama = $9, guncelleyen_id = $10, guncelleme = now(), surum = surum + 1,
            gecikme_ceza_orani = $12, ceza_tavani_orani = $13, odeme_vadesi_gun = $14
      WHERE id = $1 AND surum = $11 AND durum = 'taslak' RETURNING id`,
    [id, a.firmaId, a.musteriSiparisNo, a.siparisTarihi, a.termin, a.paraBirimi, a.kdvOrani, a.odemeKosulu, a.aciklama, kisiId, surum,
     a.cezaOraniGun, a.cezaTavaniOrani, a.odemeVadesiGun],
  );
}

export interface KalemAlanlari {
  malzemeNo: number;
  miktar: string;
  birimFiyat: string | null;
  termin: string | null;
  aciklama: string | null;
}

// Satırlar taslakta bütün olarak yeniden yazılır; sıra gövdedeki sıradır.
export async function kalemleriYaz(db: Db, siparisId: number, kalemListesi: KalemAlanlari[]): Promise<void> {
  await db.sorgu('DELETE FROM siparisler_siparis_satiri WHERE siparis_id = $1', [siparisId]);
  await db.sorgu(
    `INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, termin, aciklama)
     SELECT $1, k.sira, k.malzeme_no, k.miktar, k.birim_fiyat, k.termin, k.aciklama
       FROM unnest($2::int[], $3::int[], $4::numeric[], $5::numeric[], $6::date[], $7::text[])
         AS k (sira, malzeme_no, miktar, birim_fiyat, termin, aciklama)`,
    [
      siparisId,
      kalemListesi.map((_, i) => i + 1),
      kalemListesi.map((k) => k.malzemeNo),
      kalemListesi.map((k) => k.miktar),
      kalemListesi.map((k) => k.birimFiyat),
      kalemListesi.map((k) => k.termin),
      kalemListesi.map((k) => k.aciklama),
    ],
  );
}

export function durumYaz(
  db: Db, id: number, g: { hedef: SiparisDurumu; surum: number; kisiId: number; iptalNedeni: string | null },
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE siparisler_siparis
        SET durum = $2, iptal_nedeni = $3,
            onaylayan_id = CASE WHEN $2 = 'onayli' THEN $4 ELSE onaylayan_id END,
            onay_zamani = CASE WHEN $2 = 'onayli' THEN now() ELSE onay_zamani END,
            guncelleyen_id = $4, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $5 RETURNING id`,
    [id, g.hedef, g.iptalNedeni, g.kisiId, g.surum],
  );
}

// ---- Satış teklifi ----

export interface TeklifBaslikSatiri {
  id: number;
  no: string;
  durum: TeklifDurumu;
  firma_id: number;
  baslik: string;
  para_birimi: string;
  istenen_tarih: string | null;
  aciklama: string | null;
  not_metni: string | null;
  kabul_surumu: number | null;
  siparis_id: number | null;
  son_surum_no: number | null;
  olusturma: string;
  guncelleme: string | null;
  surum: number;
}

const TEKLIF_SECIMI = `SELECT t.id, t.no, t.durum, t.firma_id, t.baslik, t.para_birimi, t.istenen_tarih, t.aciklama, t.not_metni, t.kabul_surumu,
                              t.siparis_id, (SELECT max(v.surum_no) FROM siparisler_teklif_surumu v WHERE v.teklif_id = t.id)::int AS son_surum_no,
                              ${zamanMetni('t.olusturma')} AS olusturma, ${zamanMetni('t.guncelleme')} AS guncelleme, t.surum
                         FROM siparisler_teklif t`;

export type TeklifSiralamasi = 'no' | 'olusturma';
export const TEKLIF_SIRALAMASI: SiralamaTanimi<TeklifSiralamasi> = {
  sutunlar: { no: 't.no', olusturma: 't.olusturma' },
  ikincil: 't.id',
  varsayilan: { sutun: 't.olusturma', yon: 'azalan' },
};

const TEKLIF_KOSULU = `WHERE ($1::text IS NULL OR t.no ILIKE $1 OR t.baslik ILIKE $1)
                         AND ($2::text IS NULL OR t.durum = $2) AND ($3::int IS NULL OR t.firma_id = $3)`;
export interface TeklifSuzgeci { kalip: string | null; durum: TeklifDurumu | null; firmaId: number | null }
const teklifParametreleri = (s: TeklifSuzgeci): unknown[] => [s.kalip, s.durum, s.firmaId];

export async function teklifSay(db: Db, s: TeklifSuzgeci): Promise<number> {
  const satir = await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam FROM siparisler_teklif t ${TEKLIF_KOSULU}`, teklifParametreleri(s));
  return satir?.toplam ?? 0;
}

export function teklifSatirlari(db: Db, s: TeklifSuzgeci, siralama: SiralamaIstegi<TeklifSiralamasi>, dilim: Dilim): Promise<TeklifBaslikSatiri[]> {
  return db.sorgu<TeklifBaslikSatiri>(
    `${TEKLIF_SECIMI} ${TEKLIF_KOSULU} ORDER BY ${siralamaSql(TEKLIF_SIRALAMASI, siralama)} LIMIT $4 OFFSET $5`,
    [...teklifParametreleri(s), dilim.sinir, dilim.atla],
  );
}

export function teklifDurumlariniBul(db: Db, idler: number[]): Promise<{ id: number; durum: TeklifDurumu }[]> {
  return db.sorgu<{ id: number; durum: TeklifDurumu }>('SELECT id, durum FROM siparisler_teklif WHERE id = ANY($1::int[])', [idler]);
}

export function teklifGetir(db: Db, id: number): Promise<TeklifBaslikSatiri | null> {
  return db.tek<TeklifBaslikSatiri>(`${TEKLIF_SECIMI} WHERE t.id = $1`, [id]);
}

export function teklifKilitle(db: Db, id: number): Promise<{ durum: TeklifDurumu; firma_id: number; para_birimi: string } | null> {
  return db.tek<{ durum: TeklifDurumu; firma_id: number; para_birimi: string }>(
    'SELECT durum, firma_id, para_birimi FROM siparisler_teklif WHERE id = $1 FOR UPDATE', [id],
  );
}

export async function teklifVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM siparisler_teklif WHERE id = $1', [id])) !== null;
}

export async function teklifNoVarMi(db: Db, no: string): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM siparisler_teklif WHERE no = $1', [no])) !== null;
}

export interface TeklifAlanlari {
  firmaId: number;
  baslik: string;
  paraBirimi: string;
  istenenTarih: string | null;
  aciklama: string | null;
}

export async function teklifEkle(db: Db, no: string, a: TeklifAlanlari, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO siparisler_teklif (no, firma_id, baslik, para_birimi, istenen_tarih, aciklama, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [no, a.firmaId, a.baslik, a.paraBirimi, a.istenenTarih, a.aciklama, kisiId],
  );
  if (satir === null) throw new Error('Teklif eklenemedi');
  return satir.id;
}

export function teklifGuncelle(db: Db, id: number, a: TeklifAlanlari, surum: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE siparisler_teklif
        SET firma_id = $2, baslik = $3, para_birimi = $4, istenen_tarih = $5, aciklama = $6,
            guncelleyen_id = $7, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $8 AND durum = 'yeni' RETURNING id`,
    [id, a.firmaId, a.baslik, a.paraBirimi, a.istenenTarih, a.aciklama, kisiId, surum],
  );
}

export interface TalepSatiri { id: number; teklif_id: number; sira: number; malzeme_no: number | null; tanim: string; miktar: string }

export function talepSatirlari(db: Db, teklifId: number): Promise<TalepSatiri[]> {
  return db.sorgu<TalepSatiri>(
    'SELECT id, teklif_id, sira, malzeme_no, tanim, miktar FROM siparisler_teklif_satiri WHERE teklif_id = $1 ORDER BY sira', [teklifId],
  );
}

export async function talepSatirlariniYaz(
  db: Db, teklifId: number, satirlar: { malzemeNo: number | null; tanim: string; miktar: string }[],
): Promise<void> {
  await db.sorgu('DELETE FROM siparisler_teklif_satiri WHERE teklif_id = $1', [teklifId]);
  await db.sorgu(
    `INSERT INTO siparisler_teklif_satiri (teklif_id, sira, malzeme_no, tanim, miktar)
     SELECT $1, k.sira, k.malzeme_no, k.tanim, k.miktar
       FROM unnest($2::int[], $3::int[], $4::text[], $5::numeric[]) AS k (sira, malzeme_no, tanim, miktar)`,
    [teklifId, satirlar.map((_, i) => i + 1), satirlar.map((s) => s.malzemeNo), satirlar.map((s) => s.tanim), satirlar.map((s) => s.miktar)],
  );
}

export function kartBagla(db: Db, teklifId: number, satirId: number, malzemeNo: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE siparisler_teklif_satiri SET malzeme_no = $3 WHERE id = $2 AND teklif_id = $1 RETURNING id', [teklifId, satirId, malzemeNo],
  );
}

export interface TeklifSurumSatiri {
  id: number;
  surum_no: number;
  iskonto_orani: string;
  teslim_gun: number | null;
  termin_tarihi: string | null;
  odeme_kosulu: string | null;
  gecerlilik: string | null;
  aciklama: string | null;
  olusturma: string;
  toplam: string;
  onaylayan_id: number | null;
  onay_ani: string | null;
}

export function teklifSurumleri(db: Db, teklifId: number): Promise<TeklifSurumSatiri[]> {
  return db.sorgu<TeklifSurumSatiri>(
    `SELECT v.id, v.surum_no, v.iskonto_orani, v.teslim_gun, v.termin_tarihi, v.odeme_kosulu, v.gecerlilik, v.aciklama, ${zamanMetni('v.olusturma')} AS olusturma,
            o.onaylayan_id, ${zamanMetni('o.an')} AS onay_ani,
            (SELECT coalesce(sum(round(round(f.birim_fiyat * (100 - v.iskonto_orani) / 100, 4) * r.miktar, 2)), 0)::numeric(20,2)
               FROM siparisler_teklif_fiyati f JOIN siparisler_teklif_satiri r ON r.id = f.satir_id WHERE f.surum_id = v.id) AS toplam
       FROM siparisler_teklif_surumu v LEFT JOIN siparisler_teklif_iskonto_onayi o ON o.surum_id = v.id
      WHERE v.teklif_id = $1 ORDER BY v.surum_no`, [teklifId],
  );
}

export async function sonSurumuVeren(db: Db, teklifId: number): Promise<number | null> {
  const [s] = await db.sorgu<{ olusturan_id: number }>(
    'SELECT olusturan_id FROM siparisler_teklif_surumu WHERE teklif_id = $1 ORDER BY surum_no DESC LIMIT 1', [teklifId]);
  return s?.olusturan_id ?? null;
}

export async function iskontoOnayiEkle(db: Db, teklifId: number, kisiId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO siparisler_teklif_iskonto_onayi (surum_id, onaylayan_id)
     SELECT id, $2 FROM siparisler_teklif_surumu WHERE teklif_id = $1 ORDER BY surum_no DESC LIMIT 1`,
    [teklifId, kisiId],
  );
}

export interface FiyatSatiri { surum_id: number; satir_id: number; birim_fiyat: string; iskontolu_fiyat: string; tutar: string }

// İskontolu fiyat dört ondalığa, tutar iki ondalığa yuvarlanır.
export function teklifFiyatlari(db: Db, teklifId: number): Promise<FiyatSatiri[]> {
  return db.sorgu<FiyatSatiri>(
    `SELECT f.surum_id, f.satir_id, f.birim_fiyat,
            round(f.birim_fiyat * (100 - v.iskonto_orani) / 100, 4) AS iskontolu_fiyat,
            round(round(f.birim_fiyat * (100 - v.iskonto_orani) / 100, 4) * r.miktar, 2) AS tutar
       FROM siparisler_teklif_fiyati f
       JOIN siparisler_teklif_surumu v ON v.id = f.surum_id
       JOIN siparisler_teklif_satiri r ON r.id = f.satir_id
      WHERE v.teklif_id = $1
      ORDER BY v.surum_no, r.sira`, [teklifId],
  );
}

export async function surumEkle(
  db: Db, teklifId: number,
  g: {
    iskontoOrani: string; teslimGun: number | null; terminTarihi: string | null; odemeKosulu: string | null; gecerlilik: string | null; aciklama: string | null;
  },
  fiyatlar: { satirId: number; birimFiyat: string }[], kisiId: number,
): Promise<{ id: number; surumNo: number }> {
  const satir = await db.tek<{ id: number; surum_no: number }>(
    `INSERT INTO siparisler_teklif_surumu (teklif_id, surum_no, iskonto_orani, teslim_gun, termin_tarihi, odeme_kosulu, gecerlilik, aciklama, olusturan_id)
     SELECT $1, coalesce(max(surum_no), 0) + 1, $2, $3, $4, $5, $6, $7, $8 FROM siparisler_teklif_surumu WHERE teklif_id = $1
     RETURNING id, surum_no`,
    [teklifId, g.iskontoOrani, g.teslimGun, g.terminTarihi, g.odemeKosulu, g.gecerlilik, g.aciklama, kisiId],
  );
  if (satir === null) throw new Error('Teklif sürümü eklenemedi');
  await db.sorgu(
    `INSERT INTO siparisler_teklif_fiyati (surum_id, satir_id, birim_fiyat)
     SELECT $1, k.satir_id, k.birim_fiyat FROM unnest($2::int[], $3::numeric[]) AS k (satir_id, birim_fiyat)`,
    [satir.id, fiyatlar.map((f) => f.satirId), fiyatlar.map((f) => f.birimFiyat)],
  );
  return { id: satir.id, surumNo: satir.surum_no };
}

// Son sürümün iskontosu eşiği aşıyor ve onaysızsa iskonto onayı bekler (291 a).
export async function sonSurumIskontosu(db: Db, teklifId: number): Promise<{ iskonto_orani: string; onayli: boolean } | null> {
  return db.tek<{ iskonto_orani: string; onayli: boolean }>(
    `SELECT v.iskonto_orani, o.surum_id IS NOT NULL AS onayli
       FROM siparisler_teklif_surumu v LEFT JOIN siparisler_teklif_iskonto_onayi o ON o.surum_id = v.id
      WHERE v.teklif_id = $1 ORDER BY v.surum_no DESC LIMIT 1`, [teklifId],
  );
}

export function teklifDurumYaz(
  db: Db, id: number,
  g: { hedef: TeklifDurumu; surum: number; kisiId: number; not: string | null; kabulSurumu: number | null; siparisId: number | null },
): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE siparisler_teklif
        SET durum = $2, not_metni = coalesce($3, not_metni), kabul_surumu = coalesce($4, kabul_surumu), siparis_id = coalesce($5, siparis_id),
            guncelleyen_id = $6, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $7 RETURNING id`,
    [id, g.hedef, g.not, g.kabulSurumu, g.siparisId, g.kisiId, g.surum],
  );
}

// Kart bağlama başlığın sürümünü de artırır: satırı değiştiren her yazma ana satırın sürümünü artırır.
export function teklifSurumuArtir(db: Db, id: number, surum: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE siparisler_teklif SET guncelleyen_id = $2, guncelleme = now(), surum = surum + 1 WHERE id = $1 AND surum = $3 RETURNING id',
    [id, kisiId, surum],
  );
}

// ---- Teklif plan taslağı (44, 49) ----

// Gün veritabanının saatinden gelir; geçerlilik karşılaştırmasıyla aynı saat.
export async function bugun(db: Db): Promise<string> {
  const s = await db.tek<{ gun: string }>('SELECT current_date::text AS gun');
  if (s === null) throw new Error('Gün okunamadı');
  return s.gun;
}

const YER_TUTAR = "tur = 'satis' AND durum IN ('aktif', 'onay-bekliyor')";

export interface PlanTaslagiYazimi {
  teklifId: number;
  surumId: number | null;
  tur: 'deneme' | 'satis';
  durum: 'aktif' | 'onay-bekliyor';
  planSurumu: string | null;
  gecerlilik: string | null;
  istenenTermin: string | null;
  planTermini: string | null;
  termin: string | null;
  karOrani: string;
  maliyetToplami: string | null;
  kalemler: unknown[];
  kayanlar: unknown[];
  kilitler: unknown[];
  onayGerekli: boolean;
}

export async function planTaslagiEkle(db: Db, t: PlanTaslagiYazimi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO siparisler_teklif_plan_taslagi (teklif_id, surum_id, tur, durum, plan_surumu, gecerlilik, istenen_termin, plan_termini, termin,
            kar_orani, maliyet_toplami, kalemler, kayanlar, kilitler, onay_gerekli, olusturan_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16) RETURNING id`,
    [t.teklifId, t.surumId, t.tur, t.durum, t.planSurumu, t.gecerlilik, t.istenenTermin, t.planTermini, t.termin, t.karOrani, t.maliyetToplami,
      JSON.stringify(t.kalemler), JSON.stringify(t.kayanlar), JSON.stringify(t.kilitler), t.onayGerekli, kisiId],
  );
  if (satir === null) throw new Error('Plan taslağı eklenemedi');
  return satir.id;
}

export interface YerTutanTaslak { id: number; durum: 'aktif' | 'onay-bekliyor'; istenen_termin: string | null; termin: string | null; gecerli: boolean }

// Teklifin planda yer tutan satış taslağı; çağıran teklifi kilitlemiştir. Geçerliliği geçmişse gecerli false (yeri kalkmıştır).
export function yerTutanTaslak(db: Db, teklifId: number): Promise<YerTutanTaslak | null> {
  return db.tek<YerTutanTaslak>(
    `SELECT id, durum, istenen_termin, termin, gecerlilik >= current_date AS gecerli
       FROM siparisler_teklif_plan_taslagi WHERE teklif_id = $1 AND ${YER_TUTAR}`, [teklifId],
  );
}

// Yerine yenisi gelen ya da teklifi biten satış taslağı kalkar; geçerliliği zaten geçmişse "süresi doldu" olarak kalır.
export async function yerTutaniKaldir(db: Db, teklifId: number): Promise<void> {
  await db.sorgu(
    `UPDATE siparisler_teklif_plan_taslagi SET durum = CASE WHEN gecerlilik < current_date THEN 'suresi-doldu' ELSE 'kalkti' END
      WHERE teklif_id = $1 AND ${YER_TUTAR}`, [teklifId],
  );
}

// Yer değişmeden yeni sürüme taşınır: geçerlilik ve kâr yeni sürümündür.
export async function taslagiSurumeTasi(db: Db, id: number, surumId: number, gecerlilik: string, karOrani: string): Promise<void> {
  await db.sorgu('UPDATE siparisler_teklif_plan_taslagi SET surum_id = $2, gecerlilik = $3, kar_orani = $4 WHERE id = $1', [id, surumId, gecerlilik, karOrani]);
}

export function terminOnayiYaz(db: Db, teklifId: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE siparisler_teklif_plan_taslagi SET durum = 'aktif', onaylayan_id = $2, onay_ani = now()
      WHERE teklif_id = $1 AND tur = 'satis' AND durum = 'onay-bekliyor' RETURNING id`, [teklifId, kisiId],
  );
}

export interface PlanTaslagiSatiri {
  id: number;
  teklif_id: number;
  surum_no: number | null;
  tur: 'deneme' | 'satis';
  gorunum: 'deneme' | 'satis' | 'onay-bekliyor' | 'satis-deneme' | 'kalkti';
  plan_surumu: string | null;
  gecerlilik: string | null;
  istenen_termin: string | null;
  plan_termini: string | null;
  termin: string | null;
  kar_orani: string;
  maliyet_toplami: string | null;
  kayan_sayisi: number;
  geciken_sayisi: number;
  onay_gerekli: boolean;
  onaylayan_id: number | null;
  onay_ani: string | null;
  olusturan_id: number;
  olusturma: string;
}

// 49: görünüm okuma anında çıkar; geçerliliği geçen satış taslağı plandan kalkmış satış denemesidir, zamanlanmış iş gerekmez.
const GORUNUM = `CASE WHEN t.tur = 'deneme' THEN 'deneme'
                      WHEN t.durum = 'kalkti' THEN 'kalkti'
                      WHEN t.durum = 'suresi-doldu' OR t.gecerlilik < current_date THEN 'satis-deneme'
                      WHEN t.durum = 'onay-bekliyor' THEN 'onay-bekliyor'
                      ELSE 'satis' END`;

export function planTaslaklari(db: Db, teklifId: number): Promise<PlanTaslagiSatiri[]> {
  return db.sorgu<PlanTaslagiSatiri>(
    `SELECT t.id, t.teklif_id, v.surum_no, t.tur, ${GORUNUM} AS gorunum, t.plan_surumu, t.gecerlilik, t.istenen_termin, t.plan_termini, t.termin,
            t.kar_orani, t.maliyet_toplami, jsonb_array_length(t.kayanlar) AS kayan_sayisi,
            (SELECT count(*) FROM jsonb_array_elements(t.kayanlar) k WHERE (k->>'gecikir')::boolean)::int AS geciken_sayisi,
            t.onay_gerekli, t.onaylayan_id, ${zamanMetni('t.onay_ani')} AS onay_ani, t.olusturan_id, ${zamanMetni('t.olusturma')} AS olusturma
       FROM siparisler_teklif_plan_taslagi t LEFT JOIN siparisler_teklif_surumu v ON v.id = t.surum_id
      WHERE t.teklif_id = $1 ORDER BY t.id DESC`, [teklifId],
  );
}

export interface SatisKilidiSatiri {
  id: number;
  teklif_id: number;
  teklif_no: string;
  gecerlilik: string;
  termin: string | null;
  kalemler: { satirId: number; malzemeNo: number | null; adet: string }[];
  kilitler: { satirId: number; opId: string; tezgah: string; baslangic: string; bitis: string }[];
}

// Planda yer tutan satış taslakları: geçerliliği sürüyor, teklif açık (red ya da siparişe dönmüş teklifin taslağı zaten kalkmıştır).
export function satisKilitleri(db: Db): Promise<SatisKilidiSatiri[]> {
  return db.sorgu<SatisKilidiSatiri>(
    `SELECT t.id, t.teklif_id, k.no AS teklif_no, t.gecerlilik, t.termin,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('satirId', e->'satirId', 'malzemeNo', e->'malzemeNo', 'adet', e->'adet')), '[]'::jsonb)
               FROM jsonb_array_elements(t.kalemler) e WHERE NOT (e->>'plansiz')::boolean) AS kalemler,
            t.kilitler
       FROM siparisler_teklif_plan_taslagi t JOIN siparisler_teklif k ON k.id = t.teklif_id
      WHERE t.tur = 'satis' AND t.durum IN ('aktif', 'onay-bekliyor') AND t.gecerlilik >= current_date
      ORDER BY t.id`,
  );
}

export interface AtolyeTaslagiSatiri {
  id: number;
  teklif_id: number;
  teklif_no: string;
  firma_id: number;
  para_birimi: string;
  gorunum: 'satis' | 'onay-bekliyor' | 'satis-deneme';
  kalemler: { tanim: string; adet: string }[];
  termin: string | null;
  gecerlilik: string | null;
  kar_orani: string;
  tutar: string | null;
  olusturan_id: number;
  olusturma: string;
}

// Atölyedeki satış taslakları: yer tutan ve onay bekleyenler, sonra son 30 günde süresi dolanlar. Yerine yenisi gelen (kalktı) gösterilmez.
// Tutar sürümün iskonto sonrası toplamıdır (fiyat tablosu ve satır miktarı); fiyatı eksik satır varsa null.
export function atolyeTaslaklari(db: Db): Promise<AtolyeTaslagiSatiri[]> {
  return db.sorgu<AtolyeTaslagiSatiri>(
    `SELECT t.id, t.teklif_id, k.no AS teklif_no, k.firma_id, k.para_birimi, ${GORUNUM} AS gorunum,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('tanim', e->'tanim', 'adet', e->'adet') ORDER BY (e->>'sira')::int), '[]'::jsonb)
               FROM jsonb_array_elements(t.kalemler) e) AS kalemler,
            t.termin, t.gecerlilik, t.kar_orani,
            (SELECT CASE WHEN count(f.satir_id) = count(*) THEN round(sum(f.birim_fiyat * s.miktar) * (1 - v.iskonto_orani / 100), 2)::text END
               FROM siparisler_teklif_satiri s LEFT JOIN siparisler_teklif_fiyati f ON f.satir_id = s.id AND f.surum_id = v.id
              WHERE s.teklif_id = t.teklif_id) AS tutar,
            t.olusturan_id, ${zamanMetni('t.olusturma')} AS olusturma
       FROM siparisler_teklif_plan_taslagi t
       JOIN siparisler_teklif k ON k.id = t.teklif_id
       JOIN siparisler_teklif_surumu v ON v.id = t.surum_id
      WHERE t.tur = 'satis' AND t.durum <> 'kalkti' AND t.gecerlilik >= current_date - 30
      ORDER BY (t.durum IN ('aktif', 'onay-bekliyor') AND t.gecerlilik >= current_date) DESC, t.termin NULLS LAST, t.id`,
  );
}

// Ana sayfa özeti tek okumada: gün tesis saatine göre (Europe/Istanbul), istemciden alınmaz.
export async function siparisOzetiSay(db: Db, yaklasanGun: number, ay: number): Promise<{
  acikTeklif: number; yaklasanTermin: number; gecikenSiparis: number; aylik: { ay: string; sayi: number }[];
}> {
  const sayilar = await db.tek<{ acikTeklif: number; yaklasanTermin: number; gecikenSiparis: number }>(
    `WITH bugun AS (SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date AS gun)
     SELECT (SELECT count(*) FROM siparisler_teklif WHERE durum NOT IN ('red', 'siparis'))::int AS "acikTeklif",
            (SELECT count(*) FROM siparisler_siparis, bugun
              WHERE durum = 'onayli' AND termin >= bugun.gun AND termin < bugun.gun + $1::int)::int AS "yaklasanTermin",
            (SELECT count(*) FROM siparisler_siparis, bugun WHERE durum = 'onayli' AND termin < bugun.gun)::int AS "gecikenSiparis"`,
    [yaklasanGun],
  );
  const aylik = await db.sorgu<{ ay: string; sayi: number }>(
    `WITH aylar AS (
       SELECT generate_series(date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')::date) - make_interval(months => $1::int - 1),
                              date_trunc('month', (now() AT TIME ZONE 'Europe/Istanbul')::date), interval '1 month')::date AS bas
     )
     SELECT to_char(a.bas, 'YYYY-MM') AS ay, count(s.id)::int AS sayi
       FROM aylar a
       LEFT JOIN siparisler_siparis s ON s.durum IN ('onayli', 'kapandi') AND date_trunc('month', s.siparis_tarihi)::date = a.bas
      GROUP BY a.bas ORDER BY a.bas`,
    [ay],
  );
  return { ...sayilar!, aylik };
}

// ---- Logo gönderim sırası (H10, soru 238). Aynı iş ikinci kez eklenmez.

export async function logoTeklifSirasinaEkle(db: Db, teklifId: number, surumNo: number | null): Promise<void> {
  await db.sorgu(
    `INSERT INTO siparisler_logo_gonderim (tur, teklif_id, surum_no)
     SELECT 'teklif', $1, coalesce($2::smallint, max(surum_no)) FROM siparisler_teklif_surumu WHERE teklif_id = $1
     ON CONFLICT ON CONSTRAINT siparisler_logo_gonderim_tek DO NOTHING`,
    [teklifId, surumNo],
  );
}

export async function logoSiparisSirasinaEkle(db: Db, teklifId: number, surumNo: number, siparisId: number): Promise<void> {
  await db.sorgu(
    `INSERT INTO siparisler_logo_gonderim (tur, teklif_id, surum_no, siparis_id) VALUES ('siparis', $1, $2, $3)
     ON CONFLICT ON CONSTRAINT siparisler_logo_gonderim_tek DO NOTHING`,
    [teklifId, surumNo, siparisId],
  );
}

export interface LogoTeklifSirasi {
  id: number; teklif_id: number; no: string; surum_no: number; tarih: string; gecerlilik: string | null; para_birimi: string; firma_id: number;
  iskonto_orani: string; termin_tarihi: string | null;
}

// Bekleyen satır hatalıların önüne geçer: kalıcı reddedilen satırlar sınırı doldurup yeni teklifi bekletmez.
export function logoyaGidecekTeklifSiralari(db: Db, sinir: number): Promise<LogoTeklifSirasi[]> {
  return db.sorgu<LogoTeklifSirasi>(
    `SELECT g.id, g.teklif_id, t.no, g.surum_no, (v.olusturma AT TIME ZONE 'Europe/Istanbul')::date::text AS tarih, v.gecerlilik::text AS gecerlilik,
            t.para_birimi, t.firma_id, v.iskonto_orani, v.termin_tarihi::text AS termin_tarihi
       FROM siparisler_logo_gonderim g
       JOIN siparisler_teklif t ON t.id = g.teklif_id
       JOIN siparisler_teklif_surumu v ON v.teklif_id = g.teklif_id AND v.surum_no = g.surum_no
      WHERE g.tur = 'teklif' AND g.durum <> 'gonderildi' ORDER BY g.durum = 'hata', g.id LIMIT $1`,
    [sinir],
  );
}

export interface LogoTeklifSatiri { satir_id: number; malzeme_no: number | null; miktar: string; birim_fiyat: string }

export function logoTeklifSatirlari(db: Db, teklifId: number, surumNo: number): Promise<LogoTeklifSatiri[]> {
  return db.sorgu<LogoTeklifSatiri>(
    `SELECT r.id AS satir_id, r.malzeme_no, r.miktar, f.birim_fiyat
       FROM siparisler_teklif_satiri r
       JOIN siparisler_teklif_surumu v ON v.teklif_id = r.teklif_id AND v.surum_no = $2
       JOIN siparisler_teklif_fiyati f ON f.surum_id = v.id AND f.satir_id = r.id
      WHERE r.teklif_id = $1 ORDER BY r.sira`,
    [teklifId, surumNo],
  );
}

export interface LogoSiparisSirasi { id: number; teklif_id: number; siparis_id: number; no: string; tarih: string; teklif_kayit_no: string; teklif_refleri: Record<string, unknown> }

// Sipariş onaylanınca ve teklifi Logo'da açıldıktan sonra gider; taslak sipariş düzenlenebilir ya da iptal edilebilir.
export function logoyaGidecekSiparisSiralari(db: Db, sinir: number): Promise<LogoSiparisSirasi[]> {
  return db.sorgu<LogoSiparisSirasi>(
    `SELECT g.id, g.teklif_id, g.siparis_id, s.no, s.siparis_tarihi::text AS tarih, t.logo_kayit_no AS teklif_kayit_no, t.satir_refleri AS teklif_refleri
       FROM siparisler_logo_gonderim g
       JOIN siparisler_siparis s ON s.id = g.siparis_id
       JOIN siparisler_logo_gonderim t ON t.tur = 'teklif' AND t.teklif_id = g.teklif_id AND t.surum_no = g.surum_no
      WHERE g.tur = 'siparis' AND g.durum <> 'gonderildi' AND t.durum = 'gonderildi' AND s.durum IN ('onayli', 'kapandi')
      ORDER BY g.durum = 'hata', g.id LIMIT $1`,
    [sinir],
  );
}

export interface LogoSiparisSatiri { satir_id: number; miktar: string; termin: string | null; teklif_satir_id: number | null }

// Tekliften açılan siparişin satırı teklif satırıyla aynı sırada ve aynı karttadır; sonradan değişen satır teklif satırına bağlanmaz.
export function logoSiparisSatirlari(db: Db, siparisId: number, teklifId: number): Promise<LogoSiparisSatiri[]> {
  return db.sorgu<LogoSiparisSatiri>(
    `SELECT s.id AS satir_id, s.miktar, s.termin::text AS termin, r.id AS teklif_satir_id
       FROM siparisler_siparis_satiri s
       LEFT JOIN siparisler_teklif_satiri r ON r.teklif_id = $2 AND r.sira = s.sira AND r.malzeme_no = s.malzeme_no
      WHERE s.siparis_id = $1 ORDER BY s.sira`,
    [siparisId, teklifId],
  );
}

// Başka bir Logo kaydıyla gönderilmiş satır yeniden yazılmaz.
export async function logoBasarisiYaz(db: Db, tur: 'teklif' | 'siparis', id: number, kayitNo: string, refler: Record<string, string>): Promise<boolean> {
  return (await db.sorgu<{ id: number }>(
    `UPDATE siparisler_logo_gonderim
        SET durum = 'gonderildi', logo_kayit_no = $3, satir_refleri = $4::jsonb, hata = NULL, gonderildi = now()
      WHERE id = $1 AND tur = $2 AND (logo_kayit_no IS NULL OR logo_kayit_no = $3)
      RETURNING id`,
    [id, tur, kayitNo, JSON.stringify(refler)],
  )).length > 0;
}

export async function logoHatasiYaz(db: Db, tur: 'teklif' | 'siparis', id: number, hata: string): Promise<void> {
  await db.sorgu(
    `UPDATE siparisler_logo_gonderim SET durum = 'hata', hata = left($3, 2000)
      WHERE id = $1 AND tur = $2 AND durum <> 'gonderildi' AND hata IS DISTINCT FROM left($3, 2000)`,
    [id, tur, hata],
  );
}
