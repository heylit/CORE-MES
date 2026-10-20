import type { Db } from '#cekirdek/db.ts';
import type { Sonuc } from '#paylasilan/sozlesme/kalibrasyon.ts';

export interface AletSatiri {
  id: number;
  no: string;
  tur_id: number;
  tur: string;
  ad: string | null;
  olcme_araligi: string | null;
  yer: string | null;
  periyot_gun: number;
  kullanim_disi: boolean;
  kullanim_disi_nedeni: string | null;
  son_uygun: string | null;
  bugun: string;
  surum: number;
}

export interface AletSuzgeci {
  id?: number;
  turId?: number;
}

export function aletleriGetir(db: Db, suzgec: AletSuzgeci = {}): Promise<AletSatiri[]> {
  return db.sorgu<AletSatiri>(
    `SELECT a.id, a.no, a.tur_id, t.ad AS tur, a.ad, a.olcme_araligi, a.yer, a.periyot_gun,
            a.kullanim_disi, a.kullanim_disi_nedeni, a.surum,
            (SELECT max(k.tarih) FROM kalibrasyon_kaydi k WHERE k.alet_id = a.id AND k.sonuc = 'uygun')::text AS son_uygun,
            current_date::text AS bugun
       FROM olcu_aleti a JOIN olcu_aleti_turu t ON t.id = a.tur_id
      WHERE ($1::int IS NULL OR a.id = $1) AND ($2::int IS NULL OR a.tur_id = $2)`,
    [suzgec.id ?? null, suzgec.turId ?? null],
  );
}

export async function aletiKilitle(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM olcu_aleti WHERE id = $1 FOR UPDATE', [id])) !== null;
}

export interface AletAlanlari {
  no: string;
  turId: number;
  ad: string | null;
  olcmeAraligi: string | null;
  yer: string | null;
  periyotGun: number;
}

export async function aletEkle(db: Db, a: AletAlanlari): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO olcu_aleti (no, tur_id, ad, olcme_araligi, yer, periyot_gun)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [a.no, a.turId, a.ad, a.olcmeAraligi, a.yer, a.periyotGun],
  );
  if (satir === null) throw new Error('Alet eklenemedi');
  return satir.id;
}

// Sürüm tutmazsa satır dönmez; çağıran çekirdeğin surumluGuncelle'si ile 404/409 ayırır.
export function aletGuncelle(db: Db, id: number, a: AletAlanlari, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE olcu_aleti SET no = $2, tur_id = $3, ad = $4, olcme_araligi = $5, yer = $6, periyot_gun = $7, surum = surum + 1
      WHERE id = $1 AND surum = $8 RETURNING id`,
    [id, a.no, a.turId, a.ad, a.olcmeAraligi, a.yer, a.periyotGun, surum],
  );
}

export async function aletVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 AS var FROM olcu_aleti WHERE id = $1', [id])) !== null;
}

export async function kullanimDurumuYaz(db: Db, id: number, kullanimDisi: boolean, neden: string | null): Promise<void> {
  // Elle yazılmış neden uygunsuz sonuçla ezilmez; kullanıma dönüşte neden her zaman silinir.
  await db.sorgu(
    `UPDATE olcu_aleti
        SET kullanim_disi = $2,
            kullanim_disi_nedeni = CASE WHEN $2 THEN COALESCE(kullanim_disi_nedeni, $3) ELSE NULL END,
            surum = surum + 1
      WHERE id = $1`,
    [id, kullanimDisi, neden],
  );
}

export async function kullanimDisiMi(db: Db, id: number): Promise<boolean | null> {
  const satir = await db.tek<{ kullanim_disi: boolean }>('SELECT kullanim_disi FROM olcu_aleti WHERE id = $1', [id]);
  return satir === null ? null : satir.kullanim_disi;
}

export async function aletSil(db: Db, id: number): Promise<boolean> {
  return (await db.sorgu('DELETE FROM olcu_aleti WHERE id = $1 RETURNING id', [id])).length > 0;
}

export async function kayitSayisi(db: Db, aletId: number): Promise<number> {
  const satir = await db.tek<{ sayi: number }>('SELECT count(*) AS sayi FROM kalibrasyon_kaydi WHERE alet_id = $1', [aletId]);
  return satir?.sayi ?? 0;
}

export interface KayitSatiri {
  id: number;
  tarih: string;
  sonuc: Sonuc;
  sertifika_no: string | null;
  aciklama: string | null;
  kisi_id: number;
}

export function sonKayitlariGetir(db: Db, aletId: number, adet: number): Promise<KayitSatiri[]> {
  return db.sorgu<KayitSatiri>(
    `SELECT k.id, k.tarih::text AS tarih, k.sonuc, k.sertifika_no, k.aciklama, k.kisi_id
       FROM kalibrasyon_kaydi k
      WHERE k.alet_id = $1 ORDER BY k.tarih DESC, k.id DESC LIMIT $2`,
    [aletId, adet],
  );
}

// Arkon'un alet listesi için: alet başına en yeni `adet` kayıt, tek sorguda.
export function sonKayitlarHepsi(db: Db, adet: number): Promise<(KayitSatiri & { alet_id: number })[]> {
  return db.sorgu<KayitSatiri & { alet_id: number }>(
    `SELECT id, alet_id, tarih, sonuc, sertifika_no, aciklama, kisi_id
       FROM (SELECT k.id, k.alet_id, k.tarih::text AS tarih, k.sonuc, k.sertifika_no, k.aciklama, k.kisi_id,
                    row_number() OVER (PARTITION BY k.alet_id ORDER BY k.tarih DESC, k.id DESC) AS sira
               FROM kalibrasyon_kaydi k) s
      WHERE sira <= $1 ORDER BY alet_id, tarih, id`,
    [adet],
  );
}

export interface KayitGirdisi {
  aletId: number;
  tarih: string | null;
  kisiId: number;
  sonuc: Sonuc;
  sertifikaNo: string | null;
  aciklama: string | null;
}

// Tarih verilmezse veritabanının bugünü: hesaplanan vade ile aynı saat dilimi.
export async function kayitEkle(db: Db, k: KayitGirdisi): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc, sertifika_no, aciklama)
     VALUES ($1, COALESCE($2::date, current_date), $3, $4, $5, $6) RETURNING id`,
    [k.aletId, k.tarih, k.kisiId, k.sonuc, k.sertifikaNo, k.aciklama],
  );
  if (satir === null) throw new Error('Kalibrasyon kaydı eklenemedi');
  return satir.id;
}

export function kayitSiralari(db: Db, aletId: number): Promise<{ id: number; tarih: string }[]> {
  return db.sorgu<{ id: number; tarih: string }>('SELECT id, tarih::text AS tarih FROM kalibrasyon_kaydi WHERE alet_id = $1', [aletId]);
}

export async function bugunuGetir(db: Db): Promise<string> {
  const satir = await db.tek<{ bugun: string }>('SELECT current_date::text AS bugun');
  if (satir === null) throw new Error('Bugünün tarihi okunamadı');
  return satir.bugun;
}

export interface TurSatiri {
  id: number;
  ad: string;
  aktif: boolean;
  alet_sayisi: number;
  surum: number;
}

export function turleriGetir(db: Db): Promise<TurSatiri[]> {
  return db.sorgu<TurSatiri>(
    `SELECT t.id, t.ad, t.aktif, t.surum, count(a.id) AS alet_sayisi
       FROM olcu_aleti_turu t LEFT JOIN olcu_aleti a ON a.tur_id = t.id
      GROUP BY t.id ORDER BY lower(t.ad), t.id`,
  );
}

export function turBul(db: Db, id: number): Promise<{ id: number; aktif: boolean } | null> {
  return db.tek<{ id: number; aktif: boolean }>('SELECT id, aktif FROM olcu_aleti_turu WHERE id = $1', [id]);
}

export function aktifTurleriGetir(db: Db): Promise<{ id: number; ad: string }[]> {
  return db.sorgu<{ id: number; ad: string }>('SELECT id, ad FROM olcu_aleti_turu WHERE aktif ORDER BY lower(ad), id');
}

export async function turEkle(db: Db, ad: string): Promise<void> {
  await db.sorgu('INSERT INTO olcu_aleti_turu (ad) VALUES ($1)', [ad]);
}

export function turGuncelle(db: Db, id: number, ad: string, aktif: boolean, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE olcu_aleti_turu SET ad = $2, aktif = $3, surum = surum + 1 WHERE id = $1 AND surum = $4 RETURNING id',
    [id, ad, aktif, surum],
  );
}

export async function aletinTuru(db: Db, aletId: number): Promise<number | null> {
  const satir = await db.tek<{ tur_id: number }>('SELECT tur_id FROM olcu_aleti WHERE id = $1', [aletId]);
  return satir === null ? null : satir.tur_id;
}

// Örnek veri numaraları `ORN-` önekiyle başlar; gerçek aletle karışmaz.
export async function ornekAletVarMi(db: Db): Promise<boolean> {
  return (await db.tek("SELECT 1 FROM olcu_aleti WHERE no LIKE 'ORN-%' LIMIT 1")) !== null;
}
