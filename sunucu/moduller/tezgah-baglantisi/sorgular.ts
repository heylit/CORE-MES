import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { TezgahDurumu } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import type { TezgahOgesi, TezgahOzeti } from './kurallar.ts';

export interface OkumaSatiri extends TezgahOzeti {
  cihazAdi: string;
  okundu: string;
}

const SUTUNLAR = `cihaz_adi AS "cihazAdi", durum, calisma, mod, program, sayac, takim, is_mili_hizi::float8 AS "isMiliHizi",
  is_mili_yuku::float8 AS "isMiliYuku", ilerleme::float8 AS ilerleme, alarm, ${zamanMetni('okundu')} AS okundu`;

export function okumalar(db: Db): Promise<OkumaSatiri[]> {
  return db.sorgu<OkumaSatiri>(`SELECT ${SUTUNLAR} FROM tezgah_okuma ORDER BY cihaz_adi`);
}

export function okumaGetir(db: Db, cihazAdi: string): Promise<(OkumaSatiri & { ogeler: TezgahOgesi[] }) | null> {
  return db.tek(`SELECT ${SUTUNLAR}, ogeler FROM tezgah_okuma WHERE cihaz_adi = $1`, [cihazAdi]);
}

export async function oncekiDurum(db: Db, cihazAdi: string): Promise<TezgahDurumu | null> {
  return (await db.tek<{ durum: TezgahDurumu }>('SELECT durum FROM tezgah_okuma WHERE cihaz_adi = $1', [cihazAdi]))?.durum ?? null;
}

export async function okumaYaz(db: Db, cihazAdi: string, o: TezgahOzeti, ogeler: readonly TezgahOgesi[], zaman: Date): Promise<void> {
  await db.sorgu(
    `INSERT INTO tezgah_okuma (cihaz_adi, durum, calisma, mod, program, sayac, takim, is_mili_hizi, is_mili_yuku, ilerleme, alarm, ogeler, okundu)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
     ON CONFLICT (cihaz_adi) DO UPDATE SET durum = EXCLUDED.durum, calisma = EXCLUDED.calisma, mod = EXCLUDED.mod, program = EXCLUDED.program,
       sayac = EXCLUDED.sayac, takim = EXCLUDED.takim, is_mili_hizi = EXCLUDED.is_mili_hizi, is_mili_yuku = EXCLUDED.is_mili_yuku,
       ilerleme = EXCLUDED.ilerleme, alarm = EXCLUDED.alarm, ogeler = EXCLUDED.ogeler, okundu = EXCLUDED.okundu`,
    [cihazAdi, o.durum, o.calisma, o.mod, o.program, o.sayac, o.takim, o.isMiliHizi, o.isMiliYuku, o.ilerleme, o.alarm, JSON.stringify(ogeler), zaman],
  );
}

export async function ornekYaz(db: Db, cihazAdi: string, zaman: Date, durum: TezgahDurumu, sayac: number | null): Promise<void> {
  await db.sorgu('INSERT INTO tezgah_ornek (cihaz_adi, zaman, durum, sayac) VALUES ($1, $2, $3, $4)', [cihazAdi, zaman, durum, sayac]);
}

export async function eskiOrnekleriSil(db: Db, sinir: Date): Promise<void> {
  await db.sorgu('DELETE FROM tezgah_ornek WHERE zaman < $1', [sinir]);
}

export async function sonOkuma(db: Db): Promise<string | null> {
  return (await db.tek<{ z: string | null }>(`SELECT ${zamanMetni('max(okundu)')} AS z FROM tezgah_okuma`))?.z ?? null;
}
