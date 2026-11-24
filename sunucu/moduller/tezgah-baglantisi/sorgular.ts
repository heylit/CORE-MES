import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { TezgahDurumu } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import type { AlanTanimi, OmurDegeri, TezgahOgesi, TezgahOzeti, TezgahTanimi, TezgahVarligi } from './kurallar.ts';

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

// Servis cevap verdi: bilinen her tezgahın son okuma anı yenilenir (değişiklik yoksa da).
export async function okunduYenile(db: Db, zaman: Date): Promise<void> {
  await db.sorgu('UPDATE tezgah_okuma SET okundu = $1', [zaman]);
}

export async function ogeleriGetir(db: Db, cihazAdi: string): Promise<TezgahOgesi[] | null> {
  return (await db.tek<{ ogeler: TezgahOgesi[] }>('SELECT ogeler FROM tezgah_okuma WHERE cihaz_adi = $1', [cihazAdi]))?.ogeler ?? null;
}

export async function tanimlariYaz(db: Db, tanimlar: readonly TezgahTanimi[]): Promise<void> {
  for (const t of tanimlar) {
    await db.sorgu('DELETE FROM tezgah_alan_tanimi WHERE cihaz_adi = $1', [t.cihazAdi]);
    if (t.alanlar.length === 0) continue;
    await db.sorgu(
      `INSERT INTO tezgah_alan_tanimi (cihaz_adi, data_item_id, tur, alt_tur, bilesen, bilesen_adi, birim, kategori)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
       ON CONFLICT DO NOTHING`,
      [t.cihazAdi, t.alanlar.map((a) => a.kimlik), t.alanlar.map((a) => a.tur), t.alanlar.map((a) => a.altTur), t.alanlar.map((a) => a.bilesen),
        t.alanlar.map((a) => a.bilesenAdi), t.alanlar.map((a) => a.birim), t.alanlar.map((a) => a.kategori)],
    );
  }
}

export function tanimlariGetir(db: Db, cihazAdi: string): Promise<(AlanTanimi & { kimlik: string })[]> {
  return db.sorgu(
    `SELECT data_item_id AS kimlik, tur, alt_tur AS "altTur", bilesen, bilesen_adi AS "bilesenAdi", birim, kategori
     FROM tezgah_alan_tanimi WHERE cihaz_adi = $1 ORDER BY bilesen, bilesen_adi, tur`,
    [cihazAdi],
  );
}

export interface GecmisKaydi {
  cihazAdi: string;
  kimlik: string;
  sira: number;
  zaman: Date;
  deger: string | null;
  kosul: string | null;
}

// Aynı (cihaz, öğe, sıra, zaman) ikinci kez yazılmaz: /current tekrarı ve yeniden denenen tur çift satır üretmez.
export async function gecmisYaz(db: Db, kayitlar: readonly GecmisKaydi[]): Promise<void> {
  if (kayitlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO tezgah_deger_gecmisi (cihaz_adi, data_item_id, sira, zaman, deger, kosul)
     SELECT * FROM unnest($1::text[], $2::text[], $3::bigint[], $4::timestamptz[], $5::text[], $6::text[])
     ON CONFLICT ON CONSTRAINT tezgah_deger_gecmisi_tekil DO NOTHING`,
    [kayitlar.map((k) => k.cihazAdi), kayitlar.map((k) => k.kimlik), kayitlar.map((k) => k.sira), kayitlar.map((k) => k.zaman),
      kayitlar.map((k) => k.deger), kayitlar.map((k) => k.kosul)],
  );
}

export async function boslukYaz(db: Db, zaman: Date, neden: 'tampon-asildi' | 'servis-yeniden-basladi', istenen: number | null, ilk: number | null): Promise<void> {
  await db.sorgu('INSERT INTO tezgah_veri_boslugu (zaman, neden, istenen_sira, ilk_sira) VALUES ($1, $2, $3, $4)', [zaman, neden, istenen, ilk]);
}

export async function gecmisiTemizle(db: Db, sinir: Date): Promise<void> {
  await db.sorgu('DELETE FROM tezgah_deger_gecmisi WHERE zaman < $1', [sinir]);
  await db.sorgu('DELETE FROM tezgah_veri_boslugu WHERE zaman < $1', [sinir]);
}

export async function varliklariYaz(db: Db, varliklar: readonly TezgahVarligi[], zaman: Date): Promise<void> {
  await db.sorgu('DELETE FROM tezgah_varlik');
  for (const v of varliklar) {
    await db.sorgu(
      `INSERT INTO tezgah_varlik (asset_id, tur, takim_no, omurler, zaman, okundu) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (asset_id) DO UPDATE SET tur = EXCLUDED.tur, takim_no = EXCLUDED.takim_no, omurler = EXCLUDED.omurler, zaman = EXCLUDED.zaman, okundu = EXCLUDED.okundu`,
      [v.kimlik, v.tur, v.takimNo, JSON.stringify(v.omurler), v.zaman === null || Number.isNaN(Date.parse(v.zaman)) ? null : new Date(v.zaman), zaman],
    );
  }
}

export interface VarlikSatiri {
  kimlik: string;
  tur: string;
  takimNo: string | null;
  omurler: OmurDegeri[];
  zaman: string | null;
}

export function varliklar(db: Db): Promise<VarlikSatiri[]> {
  return db.sorgu(`SELECT asset_id AS kimlik, tur, takim_no AS "takimNo", omurler, ${zamanMetni('zaman')} AS zaman FROM tezgah_varlik ORDER BY takim_no NULLS LAST, asset_id`);
}

export async function sonVarlikOkuma(db: Db): Promise<string | null> {
  return (await db.tek<{ z: string | null }>(`SELECT ${zamanMetni('max(okundu)')} AS z FROM tezgah_varlik`))?.z ?? null;
}

export function bosluklar(db: Db, sinir: Date): Promise<{ zaman: string; neden: 'tampon-asildi' | 'servis-yeniden-basladi' }[]> {
  return db.sorgu(`SELECT ${zamanMetni('zaman')} AS zaman, neden FROM tezgah_veri_boslugu WHERE zaman >= $1 ORDER BY zaman`, [sinir]);
}

const SAYI_KALIBI = '^-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?$';

// Son bir saatin değerleri dakikalık ortalamaya indirilir (en çok 60 nokta); sayı olmayan değer atlanır.
export function egriler(db: Db, cihazAdi: string, baslangic: Date): Promise<{ kimlik: string; zaman: string; deger: number }[]> {
  return db.sorgu(
    `SELECT data_item_id AS kimlik, ${zamanMetni('date_bin(\'1 minute\', zaman, $2::timestamptz)')} AS zaman, avg(deger::float8)::float8 AS deger
     FROM tezgah_deger_gecmisi WHERE cihaz_adi = $1 AND zaman >= $2 AND kosul IS NULL AND deger ~ '${SAYI_KALIBI}'
     GROUP BY 1, date_bin('1 minute', zaman, $2::timestamptz) ORDER BY 1, 2`,
    [cihazAdi, baslangic],
  );
}

export interface KosulSatiri {
  kimlik: string;
  hal: string;
  ileti: string | null;
  baslangic: string;
  bitis: string | null;
}

// Her kayıt bir sonraki kaydın zamanında biter; son kayıt sürüyordur (bitis null).
export function kosullar(db: Db, cihazAdi: string, baslangic: Date): Promise<KosulSatiri[]> {
  return db.sorgu(
    `SELECT kimlik, hal, ileti, ${zamanMetni('zaman')} AS baslangic, ${zamanMetni('bitis')} AS bitis FROM (
       SELECT data_item_id AS kimlik, kosul AS hal, deger AS ileti, zaman,
              lead(zaman) OVER (PARTITION BY data_item_id ORDER BY zaman, sira) AS bitis
       FROM tezgah_deger_gecmisi WHERE cihaz_adi = $1 AND kosul IS NOT NULL AND zaman >= $2
     ) k ORDER BY zaman DESC LIMIT 100`,
    [cihazAdi, baslangic],
  );
}

export async function sonOkuma(db: Db): Promise<string | null> {
  return (await db.tek<{ z: string | null }>(`SELECT ${zamanMetni('max(okundu)')} AS z FROM tezgah_okuma`))?.z ?? null;
}

export async function turGetir(db: Db, cihazAdi: string): Promise<string | null> {
  return (await db.sorgu<{ tur: string }>('SELECT tur FROM tezgah_turu WHERE cihaz_adi = $1', [cihazAdi]))[0]?.tur ?? null;
}

export async function turYaz(db: Db, cihazAdi: string, tur: string | null): Promise<void> {
  if (tur === null) {
    await db.sorgu('DELETE FROM tezgah_turu WHERE cihaz_adi = $1', [cihazAdi]);
    return;
  }
  await db.sorgu(
    'INSERT INTO tezgah_turu (cihaz_adi, tur) VALUES ($1, $2) ON CONFLICT (cihaz_adi) DO UPDATE SET tur = EXCLUDED.tur, guncellendi = now()',
    [cihazAdi, tur],
  );
}
