import type { Db } from '#cekirdek/db.ts';
import type { Dilim } from '#cekirdek/liste.ts';
import type { DenetimGirdisi } from '#cekirdek/uc.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';

const json = (deger: unknown): string | null => (deger === undefined ? null : JSON.stringify(deger));

export async function denetimEkle(db: Db, girdi: DenetimGirdisi): Promise<void> {
  await db.sorgu(
    'INSERT INTO denetim_kaydi (kisi_id, yontem, yol, parametre, govde, modul, yetki) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)',
    [girdi.kisiId, girdi.yontem, girdi.yol, json(girdi.parametre), json(girdi.govde), girdi.modul ?? null, girdi.yetki ?? null],
  );
}

export interface KayitSuzgeci {
  kisi: number | null;
  baslangic: string | null;
  bitis: string | null;
  yontem: string | null;
  yol: string | null;
  modul: string | null;
}

// Gün sınırı veritabanı oturumunun saat dilimindedir; bitiş günü dahildir.
const SUZGEC = `FROM denetim_kaydi d
  WHERE ($1::int IS NULL OR d.kisi_id = $1)
    AND ($2::date IS NULL OR d.zaman >= $2::date)
    AND ($3::date IS NULL OR d.zaman < $3::date + 1)
    AND ($4::text IS NULL OR d.yontem = $4)
    AND ($5::text IS NULL OR d.yol = $5)
    AND ($6::text IS NULL OR d.modul = $6)`;

const suzgecDegerleri = (s: KayitSuzgeci) => [s.kisi, s.baslangic, s.bitis, s.yontem, s.yol, s.modul];

export async function kayitSay(db: Db, s: KayitSuzgeci): Promise<number> {
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${SUZGEC}`, suzgecDegerleri(s)))?.toplam ?? 0;
}

export interface KayitSatiriHam {
  id: number;
  zaman: string;
  kisi_id: number | null;
  yontem: string;
  yol: string;
  modul: string | null;
  yetki: string | null;
  parametre: unknown;
}

// Gövde bu sorguda seçilmez: liste onu hiçbir yoldan taşımaz.
export function kayitlar(db: Db, s: KayitSuzgeci, dilim: Dilim): Promise<KayitSatiriHam[]> {
  return db.sorgu<KayitSatiriHam>(
    `SELECT d.id, ${zamanMetni('d.zaman')} AS zaman, d.kisi_id, d.yontem, d.yol, d.modul, d.yetki, d.parametre ${SUZGEC}
      ORDER BY d.zaman DESC, d.id DESC LIMIT $7 OFFSET $8`,
    [...suzgecDegerleri(s), dilim.sinir, dilim.atla],
  );
}

export async function kayitliKisiler(db: Db): Promise<number[]> {
  return (await db.sorgu<{ kisi_id: number }>('SELECT DISTINCT kisi_id FROM denetim_kaydi WHERE kisi_id IS NOT NULL')).map((s) => s.kisi_id);
}

// 8 Ekim öncesi satırlarda modül boştur (göç 20261008082740); süzgeç yalnız dolu olanları sunar.
export async function kayitliModuller(db: Db): Promise<string[]> {
  return (await db.sorgu<{ modul: string }>('SELECT DISTINCT modul FROM denetim_kaydi WHERE modul IS NOT NULL ORDER BY modul')).map((s) => s.modul);
}

export function kayitliKomutlar(db: Db): Promise<{ yontem: string; yol: string }[]> {
  return db.sorgu<{ yontem: string; yol: string }>('SELECT DISTINCT yontem, yol FROM denetim_kaydi ORDER BY yol, yontem');
}

export function kayitIcerigi(db: Db, id: number): Promise<{ id: number; parametre: unknown; govde: unknown } | null> {
  return db.tek<{ id: number; parametre: unknown; govde: unknown }>('SELECT id, parametre, govde FROM denetim_kaydi WHERE id = $1', [id]);
}

export interface DenetimDurumuSatiri { yazilir: boolean; degismez: boolean; sonKayit: string | null }

// Uygulama kullanıcısı ekleyebiliyor mu; değiştirme ve boşaltma tetikleyicileri etkin mi; son kaydın zamanı (zaman dizini).
export async function denetimDurumu(db: Db): Promise<DenetimDurumuSatiri> {
  const satir = await db.tek<DenetimDurumuSatiri>(
    `SELECT has_table_privilege(current_user, 'denetim_kaydi', 'INSERT') AS yazilir,
            (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'denetim_kaydi'::regclass AND tgenabled <> 'D'
                AND tgname IN ('denetim_kaydi_degismez', 'denetim_kaydi_bosaltilmaz')) = 2 AS degismez,
            (SELECT ${zamanMetni('max(zaman)')} FROM denetim_kaydi) AS "sonKayit"`,
  );
  return satir ?? { yazilir: false, degismez: false, sonKayit: null };
}

export interface DegisiklikSuzgeci {
  kisi: number | null;
  baslangic: string | null;
  bitis: string | null;
  tablo: string | null;
  kayitlar: readonly { tablo: string; anahtar: Record<string, unknown> }[] | null;
}

// Kayıt çifti tablo eşitliği ve anahtar kapsamasıyla eşleşir; tablo dizini önce daraltır.
const DEGISIKLIK_SUZGECI = `FROM denetim_degisiklik d
  WHERE ($1::int IS NULL OR d.kisi_id = $1)
    AND ($2::date IS NULL OR d.zaman >= $2::date)
    AND ($3::date IS NULL OR d.zaman < $3::date + 1)
    AND ($4::text IS NULL OR d.tablo = $4)
    AND ($5::jsonb IS NULL OR EXISTS (
      SELECT 1 FROM jsonb_array_elements($5::jsonb) k WHERE d.tablo = k ->> 'tablo' AND d.anahtar @> (k -> 'anahtar')))`;

const degisiklikSuzgecDegerleri = (s: DegisiklikSuzgeci) => [s.kisi, s.baslangic, s.bitis, s.tablo, s.kayitlar === null ? null : JSON.stringify(s.kayitlar)];

export async function degisiklikSay(db: Db, s: DegisiklikSuzgeci): Promise<number> {
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${DEGISIKLIK_SUZGECI}`, degisiklikSuzgecDegerleri(s)))?.toplam ?? 0;
}

export interface DegisiklikSatiriHam {
  id: number;
  zaman: string;
  kisi_id: number | null;
  tablo: string;
  anahtar: Record<string, number | string | boolean>;
  islem: 'ekle' | 'guncelle' | 'sil';
  alan_adlari: string[];
}

// Değerler bu sorguda seçilmez: liste yalnız alan adlarını taşır.
export function degisiklikler(db: Db, s: DegisiklikSuzgeci, dilim: Dilim): Promise<DegisiklikSatiriHam[]> {
  return db.sorgu<DegisiklikSatiriHam>(
    `SELECT d.id, ${zamanMetni('d.zaman')} AS zaman, d.kisi_id, d.tablo, d.anahtar, d.islem,
            ARRAY(SELECT k FROM jsonb_object_keys(d.alanlar) AS k ORDER BY k) AS alan_adlari ${DEGISIKLIK_SUZGECI}
      ORDER BY d.zaman DESC, d.id DESC LIMIT $6 OFFSET $7`,
    [...degisiklikSuzgecDegerleri(s), dilim.sinir, dilim.atla],
  );
}

export async function degisiklikKisileri(db: Db): Promise<number[]> {
  return (await db.sorgu<{ kisi_id: number }>('SELECT DISTINCT kisi_id FROM denetim_degisiklik WHERE kisi_id IS NOT NULL')).map((s) => s.kisi_id);
}

export async function degisiklikTablolari(db: Db): Promise<string[]> {
  return (await db.sorgu<{ tablo: string }>('SELECT DISTINCT tablo FROM denetim_degisiklik ORDER BY tablo')).map((s) => s.tablo);
}

export function degisiklikIcerigi(db: Db, id: number): Promise<{ id: number; alanlar: Record<string, { eski?: unknown; yeni?: unknown }> } | null> {
  return db.tek<{ id: number; alanlar: Record<string, { eski?: unknown; yeni?: unknown }> }>(
    'SELECT id, alanlar FROM denetim_degisiklik WHERE id = $1', [id],
  );
}
