import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { VerilenDuzey } from '#paylasilan/sozlesme/ortak-dosyalar.ts';

export interface KlasorSatiri {
  id: number;
  ustId: number | null;
  ad: string;
  ozelYetki: boolean;
  surum: number;
  dosyaSayisi: number;
}

// Ağacın tamamı tek sorguda: yetki her istekte bütün zincirden çözülür (klasör sayısı yüzlerle sınırlı, VARSAYIM).
export function klasorleriOku(db: Db): Promise<KlasorSatiri[]> {
  return db.sorgu<KlasorSatiri>(
    `SELECT k.id, k.ust_id AS "ustId", k.ad, k.ozel_yetki AS "ozelYetki", k.surum,
            (SELECT count(*)::int FROM ortak_dosyalar_dosya d WHERE d.klasor_id = k.id AND NOT d.arsiv) AS "dosyaSayisi"
       FROM ortak_dosyalar_klasor k ORDER BY k.id`,
  );
}

export function yetkileriOku(db: Db): Promise<{ klasorId: number; rolId: number; duzey: VerilenDuzey }[]> {
  return db.sorgu('SELECT klasor_id AS "klasorId", rol_id AS "rolId", duzey FROM ortak_dosyalar_yetki ORDER BY klasor_id, rol_id');
}

export function klasorKilitle(db: Db, id: number): Promise<{ id: number } | null> {
  return db.tek('SELECT id FROM ortak_dosyalar_klasor WHERE id = $1 FOR UPDATE', [id]);
}

export async function klasorEkle(
  db: Db, k: { ustId: number | null; ad: string; adAnahtari: string; ozelYetki: boolean; kisiId: number },
): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    `INSERT INTO ortak_dosyalar_klasor (ust_id, ad, ad_anahtari, ozel_yetki, olusturan_kisi_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [k.ustId, k.ad, k.adAnahtari, k.ozelYetki, k.kisiId],
  );
  if (satir === null) throw new Error('Klasör eklenemedi.');
  return satir.id;
}

export function yetkiYaz(db: Db, id: number, surum: number, ozelYetki: boolean, kisiId: number): Promise<{ id: number } | null> {
  return db.tek(
    `UPDATE ortak_dosyalar_klasor SET ozel_yetki = $3, yetki_degistiren_kisi_id = $4, yetki_degisme_zamani = now(), surum = surum + 1
      WHERE id = $1 AND surum = $2 RETURNING id`,
    [id, surum, ozelYetki, kisiId],
  );
}

export async function klasorVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM ortak_dosyalar_klasor WHERE id = $1', [id])) !== null;
}

export async function yetkiSatirlariniYaz(db: Db, klasorId: number, satirlar: readonly { rolId: number; duzey: VerilenDuzey }[]): Promise<void> {
  await db.sorgu('DELETE FROM ortak_dosyalar_yetki WHERE klasor_id = $1', [klasorId]);
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO ortak_dosyalar_yetki (klasor_id, rol_id, duzey)
     SELECT $1, r, d FROM unnest($2::int[], $3::text[]) AS t(r, d)`,
    [klasorId, satirlar.map((s) => s.rolId), satirlar.map((s) => s.duzey)],
  );
}

export interface DosyaSatiri {
  id: number;
  klasorId: number;
  ad: string;
  arsiv: boolean;
  surum: number;
  surumSirasi: number;
  surumId: number;
  ozet: string;
  boyut: number;
  yukleyenId: number;
  zaman: string;
}

// Son sürüm yanal birleşimle; boyut bigint'tir, 200 MB tek dosya sınırı sayıya sığar.
const DOSYA_SECIMI = `SELECT d.id, d.klasor_id AS "klasorId", d.ad, d.arsiv, d.surum, s.sira AS "surumSirasi", s.id AS "surumId", s.ozet,
         s.boyut::int8::float8 AS boyut, s.yukleyen_kisi_id AS "yukleyenId", ${zamanMetni('s.zaman')} AS zaman
    FROM ortak_dosyalar_dosya d
    JOIN LATERAL (SELECT * FROM ortak_dosyalar_surum s WHERE s.dosya_id = d.id ORDER BY s.sira DESC LIMIT 1) s ON true`;

export function klasorDosyalari(db: Db, klasorId: number, ara: string | null): Promise<DosyaSatiri[]> {
  return db.sorgu<DosyaSatiri>(
    `${DOSYA_SECIMI} WHERE d.klasor_id = $1 AND NOT d.arsiv AND ($2::text IS NULL OR strpos(d.ad_anahtari, $2) > 0) ORDER BY d.ad_anahtari, d.id`,
    [klasorId, ara],
  );
}

// Görünür klasörlerdeki son yüklenen sürümler (Son eklenenler).
export function sonDosyalar(db: Db, klasorIdleri: readonly number[], ara: string | null, sinir: number): Promise<DosyaSatiri[]> {
  return db.sorgu<DosyaSatiri>(
    `${DOSYA_SECIMI} WHERE d.klasor_id = ANY($1::int[]) AND NOT d.arsiv AND ($2::text IS NULL OR strpos(d.ad_anahtari, $2) > 0)
      ORDER BY s.zaman DESC, d.id DESC LIMIT $3`,
    [[...klasorIdleri], ara, sinir],
  );
}

export function arsivDosyalari(db: Db, klasorIdleri: readonly number[]): Promise<DosyaSatiri[]> {
  return db.sorgu<DosyaSatiri>(
    `${DOSYA_SECIMI} WHERE d.klasor_id = ANY($1::int[]) AND d.arsiv ORDER BY d.arsiv_zamani DESC, d.id DESC`,
    [[...klasorIdleri]],
  );
}

export async function arsivSayisi(db: Db, klasorIdleri: readonly number[]): Promise<number> {
  const s = await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM ortak_dosyalar_dosya WHERE arsiv AND klasor_id = ANY($1::int[])', [[...klasorIdleri]]);
  return s?.n ?? 0;
}

export function dosyaOku(db: Db, klasorId: number, dosyaId: number): Promise<DosyaSatiri | null> {
  return db.tek<DosyaSatiri>(`${DOSYA_SECIMI} WHERE d.id = $1 AND d.klasor_id = $2`, [dosyaId, klasorId]);
}

// Aynı adlı etkin dosya; yeni sürüm eklenirken satır kilitlenir (aynı anda iki yükleme aynı sırayı almasın).
export function etkinDosyaKilitle(db: Db, klasorId: number, adAnahtari: string): Promise<{ id: number } | null> {
  return db.tek('SELECT id FROM ortak_dosyalar_dosya WHERE klasor_id = $1 AND ad_anahtari = $2 AND NOT arsiv FOR UPDATE', [klasorId, adAnahtari]);
}

export async function dosyaEkle(db: Db, d: { klasorId: number; ad: string; adAnahtari: string }): Promise<number> {
  const satir = await db.tek<{ id: number }>(
    'INSERT INTO ortak_dosyalar_dosya (klasor_id, ad, ad_anahtari) VALUES ($1, $2, $3) RETURNING id',
    [d.klasorId, d.ad, d.adAnahtari],
  );
  if (satir === null) throw new Error('Dosya eklenemedi.');
  return satir.id;
}

export async function surumEkle(db: Db, s: { dosyaId: number; ozet: string; boyut: number; kisiId: number }): Promise<{ id: number; sira: number }> {
  const satir = await db.tek<{ id: number; sira: number }>(
    `INSERT INTO ortak_dosyalar_surum (dosya_id, sira, ozet, boyut, yukleyen_kisi_id)
     SELECT $1, COALESCE(max(sira), 0) + 1, $2, $3, $4 FROM ortak_dosyalar_surum WHERE dosya_id = $1
     RETURNING id, sira`,
    [s.dosyaId, s.ozet, s.boyut, s.kisiId],
  );
  if (satir === null) throw new Error('Sürüm eklenemedi.');
  return satir;
}

export function dosyaSurumunuArtir(db: Db, dosyaId: number): Promise<unknown> {
  return db.sorgu('UPDATE ortak_dosyalar_dosya SET surum = surum + 1 WHERE id = $1', [dosyaId]);
}

export function arsivYaz(db: Db, dosyaId: number, surum: number, arsiv: boolean, kisiId: number): Promise<{ id: number } | null> {
  return db.tek(
    arsiv
      ? `UPDATE ortak_dosyalar_dosya SET arsiv = true, arsiv_kisi_id = $3, arsiv_zamani = now(), surum = surum + 1
          WHERE id = $1 AND surum = $2 AND NOT arsiv RETURNING id`
      : `UPDATE ortak_dosyalar_dosya SET arsiv = false, geri_alan_kisi_id = $3, geri_alma_zamani = now(), surum = surum + 1
          WHERE id = $1 AND surum = $2 AND arsiv RETURNING id`,
    [dosyaId, surum, kisiId],
  );
}

export function surumleriOku(db: Db, dosyaId: number): Promise<{ id: number; sira: number; ozet: string; boyut: number; yukleyenId: number; zaman: string }[]> {
  return db.sorgu(
    `SELECT id, sira, ozet, boyut::int8::float8 AS boyut, yukleyen_kisi_id AS "yukleyenId", ${zamanMetni('zaman')} AS zaman
       FROM ortak_dosyalar_surum WHERE dosya_id = $1 ORDER BY sira DESC`,
    [dosyaId],
  );
}

export function surumOku(db: Db, dosyaId: number, sira: number): Promise<{ id: number; ozet: string } | null> {
  return db.tek('SELECT id, ozet FROM ortak_dosyalar_surum WHERE dosya_id = $1 AND sira = $2', [dosyaId, sira]);
}

export interface GecmisHam {
  olay: 'klasor-acildi' | 'yuklendi' | 'yeni-surum' | 'arsivlendi' | 'geri-alindi' | 'yetki-degisti';
  kisiId: number | null;
  zaman: string;
  dosyaAdi: string | null;
  surumSirasi: number | null;
}

// Geçmiş, modülün kendi kayıtlarındaki kişi ve zamandan kurulur (ayrı tarihçe tablosu yok, ADR 0008). Arşiv ve yetkide yalnız son
// olay görünür; indirme ve önceki değişiklikler denetim kaydındadır, Geçmiş'e Aşama 2'de gelir (UYUM-BORCU).
export function gecmisOku(db: Db, klasorId: number, sinir: number): Promise<GecmisHam[]> {
  return db.sorgu<GecmisHam>(
    `SELECT o.olay, o."kisiId", ${zamanMetni('o.z')} AS zaman, o."dosyaAdi", o."surumSirasi" FROM (
       SELECT 'klasor-acildi' AS olay, olusturan_kisi_id AS "kisiId", olusturma_zamani AS z, NULL::text AS "dosyaAdi", NULL::int AS "surumSirasi"
         FROM ortak_dosyalar_klasor WHERE id = $1
       UNION ALL
       SELECT 'yetki-degisti', yetki_degistiren_kisi_id, yetki_degisme_zamani, NULL, NULL
         FROM ortak_dosyalar_klasor WHERE id = $1 AND yetki_degisme_zamani IS NOT NULL
       UNION ALL
       SELECT CASE WHEN s.sira = 1 THEN 'yuklendi' ELSE 'yeni-surum' END, s.yukleyen_kisi_id, s.zaman, d.ad, s.sira
         FROM ortak_dosyalar_surum s JOIN ortak_dosyalar_dosya d ON d.id = s.dosya_id WHERE d.klasor_id = $1
       UNION ALL
       SELECT 'arsivlendi', arsiv_kisi_id, arsiv_zamani, ad, NULL FROM ortak_dosyalar_dosya WHERE klasor_id = $1 AND arsiv_zamani IS NOT NULL
       UNION ALL
       SELECT 'geri-alindi', geri_alan_kisi_id, geri_alma_zamani, ad, NULL FROM ortak_dosyalar_dosya WHERE klasor_id = $1 AND geri_alma_zamani IS NOT NULL
     ) o ORDER BY o.z DESC LIMIT $2`,
    [klasorId, sinir],
  );
}

// Sürüm, bağın kaydı (sürüm kimliği) için önce açılır; boyut bağ kurulunca, aynı komutta yazılır.
export function surumBoyutuYaz(db: Db, surumId: number, boyut: number): Promise<unknown> {
  return db.sorgu('UPDATE ortak_dosyalar_surum SET boyut = $2 WHERE id = $1', [surumId, boyut]);
}
