import type { Db } from '#cekirdek/db.ts';
import { zamanMetni } from '#cekirdek/zaman.ts';
import type { TezgahDurumu } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import type { AlanTanimi, GecmisKaydi, GecmisKategorisi, Lsv2ProgramDosyasi, Lsv2TakimSatiri, OmurDegeri, TezgahOgesi, TezgahOzeti, TezgahTanimi, TezgahVarligi } from './kurallar.ts';

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

// Servis cevap verdi: bilinen her tezgahın son okuma anı yenilenir (değişiklik yoksa da). Heidenhain makineleri kendi turlarında yenilenir.
export async function okunduYenile(db: Db, zaman: Date, haric: readonly string[] = []): Promise<void> {
  await db.sorgu('UPDATE tezgah_okuma SET okundu = $1 WHERE NOT (lower(cihaz_adi) = ANY($2::text[]))', [zaman, haric.map((a) => a.toLowerCase())]);
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

export async function kategorileriGetir(db: Db, cihazAdi: string): Promise<Map<string, GecmisKategorisi>> {
  const satirlar = await db.sorgu<{ kimlik: string; kategori: GecmisKategorisi }>('SELECT data_item_id AS kimlik, kategori FROM tezgah_alan_tanimi WHERE cihaz_adi = $1', [cihazAdi]);
  return new Map(satirlar.map((r) => [r.kimlik, r.kategori]));
}

// Aynı (cihaz, öğe, sıra, zaman) ikinci kez yazılmaz: /current tekrarı ve yeniden denenen tur çift satır üretmez. Gerçekten eklenen satır sayısı döner.
export async function gecmisYaz(db: Db, kayitlar: readonly GecmisKaydi[]): Promise<number> {
  if (kayitlar.length === 0) return 0;
  const r = await db.tek<{ n: number }>(
    `WITH eklenen AS (
       INSERT INTO tezgah_deger_gecmisi (cihaz_adi, data_item_id, sira, zaman, deger, kosul)
       SELECT * FROM unnest($1::text[], $2::text[], $3::bigint[], $4::timestamptz[], $5::text[], $6::text[])
       ON CONFLICT ON CONSTRAINT tezgah_deger_gecmisi_tekil DO NOTHING RETURNING 1)
     SELECT count(*)::int AS n FROM eklenen`,
    [kayitlar.map((k) => k.cihazAdi), kayitlar.map((k) => k.kimlik), kayitlar.map((k) => k.sira), kayitlar.map((k) => k.zaman),
      kayitlar.map((k) => k.deger), kayitlar.map((k) => k.kosul)],
  );
  return r?.n ?? 0;
}

export async function boslukYaz(db: Db, zaman: Date, neden: 'tampon-asildi' | 'servis-yeniden-basladi' | 'satir-siniri', istenen: number | null, ilk: number | null): Promise<void> {
  await db.sorgu('INSERT INTO tezgah_veri_boslugu (zaman, neden, istenen_sira, ilk_sira) VALUES ($1, $2, $3, $4)', [zaman, neden, istenen, ilk]);
}

export async function bosluklariTemizle(db: Db, sinir: Date): Promise<void> {
  await db.sorgu('DELETE FROM tezgah_veri_boslugu WHERE zaman < $1', [sinir]);
}

// Temizlik parçası: en çok `parca` satır silinir, silinen sayı döner (parçadan azsa iş bitmiştir).
export async function eskiGecmisParcasiniSil(db: Db, sinir: Date, parca: number): Promise<number> {
  const r = await db.tek<{ n: number }>(
    `WITH silinen AS (DELETE FROM tezgah_deger_gecmisi WHERE id IN (SELECT id FROM tezgah_deger_gecmisi WHERE zaman < $1 LIMIT $2) RETURNING 1)
     SELECT count(*)::int AS n FROM silinen`,
    [sinir, parca],
  );
  return r?.n ?? 0;
}

// Satır sınırı: en eski satırlar silinir; silinenlerin en yenisinin zamanı döner (veri boşluğu o ana yazılır).
export async function enEskiGecmisParcasiniSil(db: Db, parca: number): Promise<{ silinen: number; sonZaman: string | null }> {
  const r = await db.tek<{ n: number; son: string | null }>(
    `WITH silinen AS (DELETE FROM tezgah_deger_gecmisi WHERE id IN (SELECT id FROM tezgah_deger_gecmisi ORDER BY zaman, id LIMIT $1) RETURNING zaman)
     SELECT count(*)::int AS n, ${zamanMetni('max(zaman)')} AS son FROM silinen`,
    [parca],
  );
  return { silinen: r?.n ?? 0, sonZaman: r?.son ?? null };
}

export async function gecmisSatirSay(db: Db): Promise<number> {
  return (await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM tezgah_deger_gecmisi'))?.n ?? 0;
}

export async function gecmisBoyutu(db: Db): Promise<{ diskBayt: number | null; enEski: string | null }> {
  const r = await db.tek<{ bayt: number | null; eski: string | null }>(
    `SELECT pg_total_relation_size(to_regclass('tezgah_deger_gecmisi'))::float8 AS bayt, (SELECT ${zamanMetni('min(zaman)')} FROM tezgah_deger_gecmisi) AS eski`,
  );
  return { diskBayt: r?.bayt ?? null, enEski: r?.eski ?? null };
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

export function bosluklar(db: Db, sinir: Date): Promise<{ zaman: string; neden: 'tampon-asildi' | 'servis-yeniden-basladi' | 'satir-siniri' }[]> {
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

// ---- Heidenhain takım tablosu (kart 3790) ----
const TAKIM_SUTUNLARI = 'takim_no AS no, ad, boy, yaricap, omur, kullanilan, kilitli';

export function lsv2TakimlariGetir(db: Db, cihazAdi: string): Promise<Lsv2TakimSatiri[]> {
  return db.sorgu<Lsv2TakimSatiri>(`SELECT ${TAKIM_SUTUNLARI} FROM tezgah_lsv2_takim WHERE cihaz_adi = $1 ORDER BY takim_no`, [cihazAdi]);
}

// Son durum makine başına bütünüyle yenilenir: tablodan çıkan takım son durumdan da çıkar.
export async function lsv2TakimlariYaz(db: Db, cihazAdi: string, satirlar: readonly Lsv2TakimSatiri[], zaman: Date): Promise<void> {
  await db.sorgu('DELETE FROM tezgah_lsv2_takim WHERE cihaz_adi = $1', [cihazAdi]);
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO tezgah_lsv2_takim (cihaz_adi, takim_no, ad, boy, yaricap, omur, kullanilan, kilitli, okundu)
     SELECT $1, * , $9 FROM unnest($2::int[], $3::text[], $4::float8[], $5::float8[], $6::float8[], $7::float8[], $8::bool[])
     ON CONFLICT DO NOTHING`,
    [cihazAdi, satirlar.map((s) => s.no), satirlar.map((s) => s.ad?.slice(0, 100) ?? null), satirlar.map((s) => s.boy), satirlar.map((s) => s.yaricap),
      satirlar.map((s) => s.omur), satirlar.map((s) => s.kullanilan), satirlar.map((s) => s.kilitli), zaman],
  );
}

export async function lsv2TakimGecmisiYaz(db: Db, cihazAdi: string, satirlar: readonly Lsv2TakimSatiri[], zaman: Date): Promise<void> {
  if (satirlar.length === 0) return;
  await db.sorgu(
    `INSERT INTO tezgah_lsv2_takim_gecmisi (cihaz_adi, takim_no, zaman, omur, kullanilan, kilitli)
     SELECT $1, n, $2, o, k, l FROM unnest($3::int[], $4::float8[], $5::float8[], $6::bool[]) AS u(n, o, k, l)`,
    [cihazAdi, zaman, satirlar.map((s) => s.no), satirlar.map((s) => s.omur), satirlar.map((s) => s.kullanilan), satirlar.map((s) => s.kilitli)],
  );
}

export async function lsv2TakimGecmisiSay(db: Db, cihazAdi: string): Promise<number> {
  return (await db.tek<{ n: number }>('SELECT count(*)::int AS n FROM tezgah_lsv2_takim_gecmisi WHERE cihaz_adi = $1', [cihazAdi]))?.n ?? 0;
}

export async function lsv2SeyrekYaz(db: Db, cihazAdi: string, zaman: Date, takimTani: string | null, programTani: string | null): Promise<void> {
  await db.sorgu(
    `INSERT INTO tezgah_lsv2_seyrek (cihaz_adi, okundu, takim_tani, program_tani) VALUES ($1, $2, $3, $4)
     ON CONFLICT (cihaz_adi) DO UPDATE SET okundu = EXCLUDED.okundu, takim_tani = EXCLUDED.takim_tani, program_tani = EXCLUDED.program_tani`,
    [cihazAdi, zaman, takimTani?.slice(0, 200) ?? null, programTani?.slice(0, 200) ?? null],
  );
}

export function lsv2SeyrekGetir(db: Db, cihazAdi: string): Promise<{ okundu: string; takimTani: string | null; programTani: string | null } | null> {
  return db.tek(
    `SELECT ${zamanMetni('okundu')} AS okundu, takim_tani AS "takimTani", program_tani AS "programTani" FROM tezgah_lsv2_seyrek WHERE cihaz_adi = $1`,
    [cihazAdi],
  );
}

// Program listesi son durumu makine başına bütünüyle yenilenir (geçmiş tutulmaz).
export async function lsv2ProgramlariYaz(db: Db, cihazAdi: string, dosyalar: readonly Lsv2ProgramDosyasi[], zaman: Date): Promise<void> {
  await db.sorgu('DELETE FROM tezgah_lsv2_program WHERE cihaz_adi = $1', [cihazAdi]);
  if (dosyalar.length === 0) return;
  await db.sorgu(
    `INSERT INTO tezgah_lsv2_program (cihaz_adi, ad, boyut, tarih, okundu)
     SELECT $1, * , $5 FROM unnest($2::text[], $3::bigint[], $4::timestamptz[])
     ON CONFLICT DO NOTHING`,
    [cihazAdi, dosyalar.map((d) => d.ad), dosyalar.map((d) => d.boyut), dosyalar.map((d) => d.tarih), zaman],
  );
}

export function lsv2ProgramlariGetir(db: Db, cihazAdi: string): Promise<Lsv2ProgramDosyasi[]> {
  return db.sorgu<Lsv2ProgramDosyasi>(
    `SELECT ad, boyut::float8 AS boyut, ${zamanMetni('tarih')} AS tarih FROM tezgah_lsv2_program WHERE cihaz_adi = $1 ORDER BY ad`,
    [cihazAdi],
  );
}

/* ---------------- deneme sayfası (kart 3811) ---------------- */
export interface EslemeSatiri {
  cihazAdi: string;
  makineId: number | null;
  cevrimdeParca: number;
  durusEsigiDk: number;
  degistirenKisiId: number;
  degisti: string;
}

export function eslemeleriGetir(db: Db): Promise<EslemeSatiri[]> {
  return db.sorgu<EslemeSatiri>(
    `SELECT cihaz_adi AS "cihazAdi", makine_id AS "makineId", cevrimde_parca AS "cevrimdeParca", durus_esigi_dk AS "durusEsigiDk",
            degistiren_kisi_id AS "degistirenKisiId", ${zamanMetni('degisti')} AS degisti
       FROM tezgah_makine_esleme ORDER BY cihaz_adi`,
  );
}

export async function eslemeYaz(
  db: Db, cihazAdi: string, e: { makineId: number | null; cevrimdeParca: number; durusEsigiDk: number }, kisiId: number,
): Promise<void> {
  await db.sorgu(
    `INSERT INTO tezgah_makine_esleme (cihaz_adi, makine_id, cevrimde_parca, durus_esigi_dk, degistiren_kisi_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cihaz_adi) DO UPDATE SET makine_id = EXCLUDED.makine_id, cevrimde_parca = EXCLUDED.cevrimde_parca,
       durus_esigi_dk = EXCLUDED.durus_esigi_dk, degistiren_kisi_id = EXCLUDED.degistiren_kisi_id, degisti = now()`,
    [cihazAdi, e.makineId, e.cevrimdeParca, e.durusEsigiDk, kisiId],
  );
}

export async function makineninEslemesi(db: Db, makineId: number): Promise<string | null> {
  return (await db.tek<{ cihazAdi: string }>('SELECT cihaz_adi AS "cihazAdi" FROM tezgah_makine_esleme WHERE makine_id = $1', [makineId]))?.cihazAdi ?? null;
}

export function acikAlarmlar(db: Db, cihazAdi: string): Promise<{ oge: string; kod: string | null; metin: string }[]> {
  return db.sorgu('SELECT oge, kod, metin FROM tezgah_alarm_olayi WHERE cihaz_adi = $1 AND bitis IS NULL', [cihazAdi]);
}

export async function alarmlariKapat(db: Db, cihazAdi: string, ogeler: readonly string[], zaman: Date): Promise<void> {
  if (ogeler.length === 0) return;
  await db.sorgu('UPDATE tezgah_alarm_olayi SET bitis = GREATEST($3, baslangic) WHERE cihaz_adi = $1 AND oge = ANY($2::text[]) AND bitis IS NULL', [cihazAdi, [...ogeler], zaman]);
}

export async function alarmlariAc(db: Db, cihazAdi: string, alarmlar: readonly { oge: string; kod: string | null; metin: string }[], zaman: Date, isEmriNo: string | null): Promise<void> {
  for (const a of alarmlar) {
    await db.sorgu(
      'INSERT INTO tezgah_alarm_olayi (cihaz_adi, oge, kod, metin, baslangic, is_emri_no) VALUES ($1, $2, $3, left($4, 1000), $5, $6)',
      [cihazAdi, a.oge, a.kod, a.metin, zaman, isEmriNo],
    );
  }
}

export async function eskiAlarmlariSil(db: Db, sinir: Date): Promise<void> {
  await db.sorgu('DELETE FROM tezgah_alarm_olayi WHERE bitis IS NOT NULL AND bitis < $1', [sinir]);
}

export interface AlarmOlayiSatiri { cihazAdi: string; kod: string | null; metin: string; baslangic: string; bitis: string | null; isEmriNo: string | null }
export function alarmOlaylari(db: Db, baslangic: Date, bitis: Date): Promise<AlarmOlayiSatiri[]> {
  return db.sorgu<AlarmOlayiSatiri>(
    `SELECT cihaz_adi AS "cihazAdi", kod, metin, ${zamanMetni('baslangic')} AS baslangic, ${zamanMetni('bitis')} AS bitis, is_emri_no AS "isEmriNo"
       FROM tezgah_alarm_olayi WHERE baslangic < $2 AND COALESCE(bitis, $2) > $1 ORDER BY baslangic, id`,
    [baslangic, bitis],
  );
}
