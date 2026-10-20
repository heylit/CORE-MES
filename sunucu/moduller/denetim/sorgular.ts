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
}

// Gün sınırı veritabanı oturumunun saat dilimindedir; bitiş günü dahildir.
const SUZGEC = `FROM denetim_kaydi d
  WHERE ($1::int IS NULL OR d.kisi_id = $1)
    AND ($2::date IS NULL OR d.zaman >= $2::date)
    AND ($3::date IS NULL OR d.zaman < $3::date + 1)
    AND ($4::text IS NULL OR d.yontem = $4)
    AND ($5::text IS NULL OR d.yol = $5)`;

const suzgecDegerleri = (s: KayitSuzgeci) => [s.kisi, s.baslangic, s.bitis, s.yontem, s.yol];

export async function kayitSay(db: Db, s: KayitSuzgeci): Promise<number> {
  return (await db.tek<{ toplam: number }>(`SELECT count(*)::int AS toplam ${SUZGEC}`, suzgecDegerleri(s)))?.toplam ?? 0;
}

export interface KayitSatiriHam {
  id: number;
  zaman: string;
  kisi_id: number | null;
  yontem: string;
  yol: string;
  parametre: unknown;
}

// Gövde bu sorguda seçilmez: liste onu hiçbir yoldan taşımaz.
export function kayitlar(db: Db, s: KayitSuzgeci, dilim: Dilim): Promise<KayitSatiriHam[]> {
  return db.sorgu<KayitSatiriHam>(
    `SELECT d.id, ${zamanMetni('d.zaman')} AS zaman, d.kisi_id, d.yontem, d.yol, d.parametre ${SUZGEC}
      ORDER BY d.zaman DESC, d.id DESC LIMIT $6 OFFSET $7`,
    [...suzgecDegerleri(s), dilim.sinir, dilim.atla],
  );
}

export async function kayitliKisiler(db: Db): Promise<number[]> {
  return (await db.sorgu<{ kisi_id: number }>('SELECT DISTINCT kisi_id FROM denetim_kaydi WHERE kisi_id IS NOT NULL')).map((s) => s.kisi_id);
}

export function kayitliKomutlar(db: Db): Promise<{ yontem: string; yol: string }[]> {
  return db.sorgu<{ yontem: string; yol: string }>('SELECT DISTINCT yontem, yol FROM denetim_kaydi ORDER BY yol, yontem');
}

export function kayitIcerigi(db: Db, id: number): Promise<{ id: number; parametre: unknown; govde: unknown } | null> {
  return db.tek<{ id: number; parametre: unknown; govde: unknown }>('SELECT id, parametre, govde FROM denetim_kaydi WHERE id = $1', [id]);
}
