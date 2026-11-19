import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { AksiyonDurumu, ToplantiDurumu, ToplantiTuru } from '#paylasilan/sozlesme/toplantilar.ts';

// Ad alanları kişiler, projeler, üretim emirleri ve firmalar modülünden servis doldurur; burada yalnız kimlikler okunur.
export interface ToplantiSatiri {
  id: number;
  baslik: string;
  tur: ToplantiTuru;
  baslangic: string;
  bitis: string;
  yer: string | null;
  projeId: number | null;
  uretimEmriId: number | null;
  firmaId: number | null;
  duzenleyenKisiId: number;
  durum: ToplantiDurumu;
  iptalNedeni: string | null;
  surum: number;
}
const TOPLANTI_SUTUNLARI = `t.id, t.baslik, t.tur, ${zamanMetni('t.baslangic')} AS baslangic, ${zamanMetni('t.bitis')} AS bitis, t.yer,
  t.proje_id AS "projeId", t.uretim_emri_id AS "uretimEmriId", t.firma_id AS "firmaId", t.duzenleyen_kisi_id AS "duzenleyenKisiId",
  t.durum, t.iptal_nedeni AS "iptalNedeni", t.surum`;

export interface ToplantiYazisi {
  baslik: string; tur: ToplantiTuru; baslangic: string; bitis: string; yer: string | null;
  projeId: number | null; uretimEmriId: number | null; firmaId: number | null;
}

export async function simdi(db: Db): Promise<string> {
  return (await db.tek<{ simdi: string }>(`SELECT ${zamanMetni('now()')} AS simdi`))!.simdi;
}

export function toplantiGetir(db: Db, id: number): Promise<ToplantiSatiri | null> {
  return db.tek<ToplantiSatiri>(`SELECT ${TOPLANTI_SUTUNLARI} FROM toplantilar_toplanti t WHERE t.id = $1`, [id]);
}
export function toplantiKilitle(db: Db, id: number): Promise<ToplantiSatiri | null> {
  return db.tek<ToplantiSatiri>(`SELECT ${TOPLANTI_SUTUNLARI} FROM toplantilar_toplanti t WHERE t.id = $1 FOR UPDATE`, [id]);
}

// Liste: kişi verilirse yalnız düzenlediği ya da katıldığı toplantılar. Yaklaşan: bitişi şimdiden sonra; geçmiş: en yeni önce, son 200.
export interface ToplantiListeSatiri extends ToplantiSatiri { katilimciSayisi: number; acikAksiyon: number }
export function toplantiListesi(db: Db, s: { kisiId: number | null; gecmis: boolean }): Promise<ToplantiListeSatiri[]> {
  return db.sorgu<ToplantiListeSatiri>(
    `SELECT ${TOPLANTI_SUTUNLARI},
            (SELECT count(*)::int FROM toplantilar_katilimci k WHERE k.toplanti_id = t.id) AS "katilimciSayisi",
            (SELECT count(*)::int FROM toplantilar_aksiyon a WHERE a.toplanti_id = t.id AND a.durum = 'acik') AS "acikAksiyon"
       FROM toplantilar_toplanti t
      WHERE ($1::int IS NULL OR t.duzenleyen_kisi_id = $1
             OR EXISTS (SELECT 1 FROM toplantilar_katilimci k WHERE k.toplanti_id = t.id AND k.kisi_id = $1))
        AND (CASE WHEN $2 THEN t.bitis <= now() ELSE t.bitis > now() END)
      ORDER BY CASE WHEN $2 THEN t.baslangic END DESC, CASE WHEN NOT $2 THEN t.baslangic END, t.id
      LIMIT 200`,
    [s.kisiId, s.gecmis],
  );
}

// Takvim kaynağı: aralıkla kesişen toplantılar (iptal edilen dahil, takvimde iptal diye görünür); kişi verilirse yalnız onunkiler.
export function aralikToplantilari(db: Db, baslangic: string, bitis: string, kisiId: number | null): Promise<ToplantiSatiri[]> {
  return db.sorgu<ToplantiSatiri>(
    `SELECT ${TOPLANTI_SUTUNLARI}
       FROM toplantilar_toplanti t
      WHERE t.baslangic < ($2::date + 1)::timestamptz AND t.bitis >= $1::date::timestamptz
        AND ($3::int IS NULL OR t.duzenleyen_kisi_id = $3
             OR EXISTS (SELECT 1 FROM toplantilar_katilimci k WHERE k.toplanti_id = t.id AND k.kisi_id = $3))
      ORDER BY t.baslangic, t.id`,
    [baslangic, bitis, kisiId],
  );
}

export async function katiliyorMu(db: Db, toplantiId: number, kisiId: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM toplantilar_katilimci WHERE toplanti_id = $1 AND kisi_id = $2', [toplantiId, kisiId])) !== null;
}

export async function toplantiEkle(db: Db, t: ToplantiYazisi, kisiId: number): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO toplantilar_toplanti (baslik, tur, baslangic, bitis, yer, proje_id, uretim_emri_id, firma_id, duzenleyen_kisi_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [t.baslik, t.tur, t.baslangic, t.bitis, t.yer, t.projeId, t.uretimEmriId, t.firmaId, kisiId],
  );
  if (satir === null) throw new Error('Toplantı eklenemedi');
  return satir.id;
}

export function toplantiGuncelle(db: Db, id: number, t: ToplantiYazisi, surum: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE toplantilar_toplanti
        SET baslik = $2, tur = $3, baslangic = $4, bitis = $5, yer = $6, proje_id = $7, uretim_emri_id = $8, firma_id = $9,
            guncelleyen_kisi_id = $10, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $11 AND durum = 'planlandi' RETURNING id`,
    [id, t.baslik, t.tur, t.baslangic, t.bitis, t.yer, t.projeId, t.uretimEmriId, t.firmaId, kisiId, surum],
  );
}

export function toplantiIptal(db: Db, id: number, neden: string, surum: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE toplantilar_toplanti
        SET durum = 'iptal', iptal_nedeni = $2, iptal_eden_kisi_id = $3, durum_zamani = now(), guncelleyen_kisi_id = $3, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $4 AND durum = 'planlandi' RETURNING id`,
    [id, neden, kisiId, surum],
  );
}

export function toplantiYapildi(db: Db, id: number, surum: number, kisiId: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    `UPDATE toplantilar_toplanti
        SET durum = 'yapildi', durum_zamani = now(), guncelleyen_kisi_id = $2, guncelleme = now(), surum = surum + 1
      WHERE id = $1 AND surum = $3 AND durum = 'planlandi' RETURNING id`,
    [id, kisiId, surum],
  );
}

export async function toplantiVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM toplantilar_toplanti WHERE id = $1', [id])) !== null;
}

export interface KatilimciSatiri { kisiId: number; zorunlu: boolean }
export function katilimcilar(db: Db, toplantiId: number): Promise<KatilimciSatiri[]> {
  return db.sorgu<KatilimciSatiri>(
    'SELECT kisi_id AS "kisiId", zorunlu FROM toplantilar_katilimci WHERE toplanti_id = $1 ORDER BY zorunlu DESC, kisi_id',
    [toplantiId],
  );
}
// Katılımcılar bütünüyle yeniden yazılır (toplantının sürümünü çağıran yazma artırır).
export async function katilimcilariYaz(db: Db, toplantiId: number, liste: readonly KatilimciSatiri[]): Promise<void> {
  await db.sorgu('DELETE FROM toplantilar_katilimci WHERE toplanti_id = $1', [toplantiId]);
  if (liste.length === 0) return;
  await db.sorgu(
    `INSERT INTO toplantilar_katilimci (toplanti_id, kisi_id, zorunlu)
     SELECT $1, k.kisi_id, k.zorunlu FROM jsonb_to_recordset($2::jsonb) AS k(kisi_id int, zorunlu boolean)`,
    [toplantiId, JSON.stringify(liste.map((k) => ({ kisi_id: k.kisiId, zorunlu: k.zorunlu })))],
  );
}

export async function gundem(db: Db, toplantiId: number): Promise<string[]> {
  return (await db.sorgu<{ metin: string }>('SELECT metin FROM toplantilar_gundem WHERE toplanti_id = $1 ORDER BY sira', [toplantiId])).map((r) => r.metin);
}
export async function gundemiYaz(db: Db, toplantiId: number, maddeler: readonly string[]): Promise<void> {
  await db.sorgu('DELETE FROM toplantilar_gundem WHERE toplanti_id = $1', [toplantiId]);
  if (maddeler.length === 0) return;
  await db.sorgu(
    `INSERT INTO toplantilar_gundem (toplanti_id, sira, metin)
     SELECT $1, m.sira::int, m.metin FROM unnest($2::text[]) WITH ORDINALITY AS m(metin, sira)`,
    [toplantiId, maddeler],
  );
}

export interface KararSatiri { id: number; metin: string; yazanKisiId: number; yazildi: string }
export function kararlar(db: Db, toplantiId: number): Promise<KararSatiri[]> {
  return db.sorgu<KararSatiri>(
    `SELECT id, metin, yazan_kisi_id AS "yazanKisiId", ${zamanMetni('yazildi')} AS yazildi FROM toplantilar_karar WHERE toplanti_id = $1 ORDER BY id`,
    [toplantiId],
  );
}
export async function kararEkle(db: Db, toplantiId: number, metin: string, kisiId: number): Promise<void> {
  await db.sorgu('INSERT INTO toplantilar_karar (toplanti_id, metin, yazan_kisi_id) VALUES ($1, $2, $3)', [toplantiId, metin, kisiId]);
}

export interface AksiyonSatiri { id: number; toplantiId: number; metin: string; sorumluKisiId: number; sonTarih: string; durum: AksiyonDurumu; surum: number }
const AKSIYON_SUTUNLARI = 'id, toplanti_id AS "toplantiId", metin, sorumlu_kisi_id AS "sorumluKisiId", son_tarih AS "sonTarih", durum, surum';
export function aksiyonlar(db: Db, toplantiId: number): Promise<AksiyonSatiri[]> {
  return db.sorgu<AksiyonSatiri>(`SELECT ${AKSIYON_SUTUNLARI} FROM toplantilar_aksiyon WHERE toplanti_id = $1 ORDER BY id`, [toplantiId]);
}
export function aksiyonKilitle(db: Db, toplantiId: number, aksiyonId: number): Promise<AksiyonSatiri | null> {
  return db.tek<AksiyonSatiri>(`SELECT ${AKSIYON_SUTUNLARI} FROM toplantilar_aksiyon WHERE id = $1 AND toplanti_id = $2 FOR UPDATE`, [aksiyonId, toplantiId]);
}
export async function aksiyonEkle(db: Db, toplantiId: number, a: { metin: string; sorumluKisiId: number; sonTarih: string }, kisiId: number): Promise<void> {
  await db.sorgu(
    'INSERT INTO toplantilar_aksiyon (toplanti_id, metin, sorumlu_kisi_id, son_tarih, yazan_kisi_id) VALUES ($1, $2, $3, $4, $5)',
    [toplantiId, a.metin, a.sorumluKisiId, a.sonTarih, kisiId],
  );
}
export function aksiyonDurumYaz(db: Db, aksiyonId: number, durum: AksiyonDurumu, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE toplantilar_aksiyon SET durum = $2, guncelleme = now(), surum = surum + 1 WHERE id = $1 AND surum = $3 RETURNING id',
    [aksiyonId, durum, surum],
  );
}
// Göreve çevirme aksiyonun sürümünü artırır: aynı anda iki çevirme ikinci görevi açmaz (projelerdeki tekil dizin de tutar).
export function aksiyonSurumArtir(db: Db, aksiyonId: number, surum: number): Promise<{ id: number } | null> {
  return db.tek<{ id: number }>(
    'UPDATE toplantilar_aksiyon SET guncelleme = now(), surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id',
    [aksiyonId, surum],
  );
}
