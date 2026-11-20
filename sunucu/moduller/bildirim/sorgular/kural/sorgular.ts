import type { Db } from '#cekirdek/db.ts';
import type { KuralKosulu } from '#paylasilan/sozlesme/bildirim-kural.ts';

// 3478-3 a: bildirim kuralları (göç bildirim_kurali) ve ön izleme için olay izi (bildirim_olay_izi, 7 gün).

export interface KuralSatiri {
  id: number; tur: string; ad: string; acik: boolean; kosullar: KuralKosulu[]; rolIdleri: number[]; kisiIdleri: number[];
  ortada: boolean; eposta: boolean; telefon: boolean; sablonBaslik: string; sablonMetin: string | null; surum: number; degisti: string;
}
export interface KuralYazimi {
  ad: string; acik: boolean; kosullar: readonly KuralKosulu[]; rolIdleri: readonly number[]; kisiIdleri: readonly number[];
  ortada: boolean; eposta: boolean; telefon: boolean; sablonBaslik: string; sablonMetin: string | null;
}

const ALANLAR = `id, tur, ad, acik, kosullar, rol_idleri AS "rolIdleri", kisi_idleri AS "kisiIdleri", ortada, eposta, telefon,
  sablon_baslik AS "sablonBaslik", sablon_metin AS "sablonMetin", surum, to_char(degisti AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS degisti`;

export function kurallar(db: Db, tur: string | null): Promise<KuralSatiri[]> {
  return db.sorgu(`SELECT ${ALANLAR} FROM bildirim_kurali WHERE $1::text IS NULL OR tur = $1 ORDER BY tur, id`, [tur]);
}

export function acikKurallar(db: Db, tur: string): Promise<KuralSatiri[]> {
  return db.sorgu(`SELECT ${ALANLAR} FROM bildirim_kurali WHERE tur = $1 AND acik ORDER BY id`, [tur]);
}

export function kural(db: Db, id: number): Promise<KuralSatiri | null> {
  return db.tek(`SELECT ${ALANLAR} FROM bildirim_kurali WHERE id = $1`, [id]);
}

const degerler = (g: KuralYazimi) => [g.ad, g.acik, JSON.stringify(g.kosullar), [...g.rolIdleri], [...g.kisiIdleri], g.ortada, g.eposta, g.telefon, g.sablonBaslik, g.sablonMetin];

export async function kuralEkle(db: Db, tur: string, g: KuralYazimi, kisiId: number): Promise<number> {
  const r = await db.tek<{ id: number }>(
    `INSERT INTO bildirim_kurali (ad, acik, kosullar, rol_idleri, kisi_idleri, ortada, eposta, telefon, sablon_baslik, sablon_metin, tur, degistiren_id)
     VALUES ($1, $2, $3::jsonb, $4::int[], $5::int[], $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [...degerler(g), tur, kisiId]);
  if (r === null) throw new Error('Kural yazılamadı.');
  return r.id;
}

// Sürüm tutmazsa (yarışta kaybeden ya da kayıt yok) false.
export async function kuralDegistir(db: Db, id: number, g: KuralYazimi, surum: number, kisiId: number): Promise<boolean> {
  return (await db.tek(
    `UPDATE bildirim_kurali SET ad = $1, acik = $2, kosullar = $3::jsonb, rol_idleri = $4::int[], kisi_idleri = $5::int[], ortada = $6, eposta = $7,
       telefon = $8, sablon_baslik = $9, sablon_metin = $10, surum = surum + 1, degistiren_id = $13, degisti = now()
     WHERE id = $11 AND surum = $12 RETURNING id`,
    [...degerler(g), id, surum, kisiId])) !== null;
}

export async function kuralSil(db: Db, id: number, surum: number): Promise<boolean> {
  return (await db.tek('DELETE FROM bildirim_kurali WHERE id = $1 AND surum = $2 RETURNING id', [id, surum])) !== null;
}

export async function kuralVarMi(db: Db, id: number): Promise<boolean> {
  return (await db.tek('SELECT 1 FROM bildirim_kurali WHERE id = $1', [id])) !== null;
}

// İz yazılırken o türün süresi geçen izi silinir: ayrı temizlik işi gerekmez.
export async function olayIziYaz(db: Db, tur: string, d: Readonly<Record<string, string | number | null>>, gun: number): Promise<void> {
  await db.sorgu(`DELETE FROM bildirim_olay_izi WHERE tur = $1 AND zaman < now() - make_interval(days => $2)`, [tur, gun]);
  await db.sorgu('INSERT INTO bildirim_olay_izi (tur, degerler) VALUES ($1, $2::jsonb)', [tur, JSON.stringify(d)]);
}

export function olayIzleri(db: Db, tur: string, gun: number): Promise<{ degerler: Record<string, string | number | null> }[]> {
  return db.sorgu('SELECT degerler FROM bildirim_olay_izi WHERE tur = $1 AND zaman >= now() - make_interval(days => $2) ORDER BY id', [tur, gun]);
}

// Kuralın bugün (tesis günü başından beri) kişi başına açtığı satır sayısı; günlük üst sınır için.
export async function kuralBugunSayilari(db: Db, kuralId: number, gunBasi: string): Promise<Map<number, number>> {
  const r = await db.sorgu<{ kisiId: number; n: number }>(
    `SELECT kisi_id AS "kisiId", count(*)::int AS n FROM bildirim_kaydi
      WHERE tekil_anahtar LIKE '%#kural-' || $1::text AND olusturuldu >= $2::timestamptz GROUP BY kisi_id`,
    [kuralId, gunBasi]);
  return new Map(r.map((x) => [x.kisiId, x.n]));
}
