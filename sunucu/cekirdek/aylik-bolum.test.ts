import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Veritabani } from './db.ts';
import { gocleriUygula } from './goc.ts';
import { izinYok, testVeritabaniKur } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';

const GOC_KLASORU = fileURLToPath(new URL('../gocler/', import.meta.url));

// Ay adı UTC'dir: göçteki bölüm adıyla aynı hesap.
const ayAdi = (tablo: string, kayma: number): string => {
  const simdi = new Date();
  const ay = new Date(Date.UTC(simdi.getUTCFullYear(), simdi.getUTCMonth() + kayma, 1));
  return `${tablo}_y${String(ay.getUTCFullYear())}m${String(ay.getUTCMonth() + 1).padStart(2, '0')}`;
};

const bolumler = async (vt: Veritabani, tablo: string): Promise<string[]> =>
  (await vt.sorgu<{ ad: string }>(
    'SELECT inhrelid::regclass::text AS ad FROM pg_inherits WHERE inhparent = $1::regclass ORDER BY 1', [tablo],
  )).map((b) => b.ad);

const tetikler = async (vt: Veritabani, tablo: string): Promise<string[]> =>
  (await vt.sorgu<{ ad: string }>(
    "SELECT tgname::text || ':' || tgenabled::text AS ad FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal ORDER BY 1", [tablo],
  )).map((t) => t.ad);

// Deneme defteri: kimlikli, kişiye bağlı, CHECK'li, ikincil dizinli ve yalnız eklemeli; göçteki defterlerin kalıbı.
const DEFTER_DDL = `
  CREATE TABLE deneme_defter (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zaman timestamptz NOT NULL DEFAULT now(),
    kisi_id int REFERENCES kisi,
    tur text NOT NULL CONSTRAINT deneme_defter_tur CHECK (tur IN ('a', 'b'))
  );
  CREATE INDEX deneme_defter_kisi ON deneme_defter (kisi_id, zaman DESC);
  CREATE INDEX deneme_defter_b ON deneme_defter (zaman) WHERE tur = 'b';
  CREATE TRIGGER deneme_defter_degismez BEFORE UPDATE OR DELETE ON deneme_defter FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
  CREATE TRIGGER deneme_defter_bosaltilmaz BEFORE TRUNCATE ON deneme_defter FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();`;

describe('aylık bölüm (1765): dolu defter aynı adla aylık bölümlü tabloya çevrilir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testVeritabaniKur('aylik_bolum');
    const { sahip } = ortam;
    await sahip.sorgu(DEFTER_DDL);
    await sahip.sorgu("INSERT INTO kisi (ad) VALUES ('Bolum Deneme')");
    // Eski ay, bu ay ve iki kimlik boşluğu: kimlik dizisi değerini korumalı.
    await sahip.sorgu(`INSERT INTO deneme_defter (zaman, kisi_id, tur)
      SELECT t, (SELECT max(id) FROM kisi), 'a' FROM unnest(ARRAY['2025-03-10T10:00:00Z', '2025-03-31T23:59:59Z', '2025-05-01T00:00:00Z']::timestamptz[]) t`);
    await sahip.sorgu("INSERT INTO deneme_defter (tur) VALUES ('b')");
    await sahip.sorgu("SELECT setval(pg_get_serial_sequence('deneme_defter', 'id'), 40)");
    await sahip.sorgu("SELECT cekirdek_aylik_bolume_cevir('deneme_defter', 'zaman', 2)");
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('satırlar ve kimlikleri korunur, sıradaki kimlik diziden devam eder; ay sınırı UTC', async () => {
    const { sahip, vt } = acik();
    assert.deepEqual(
      await sahip.sorgu("SELECT id::int, tableoid::regclass::text AS bolum FROM deneme_defter WHERE zaman < '2026-01-01' ORDER BY id"),
      [{ id: 1, bolum: 'deneme_defter_y2025m03' }, { id: 2, bolum: 'deneme_defter_y2025m03' }, { id: 3, bolum: 'deneme_defter_y2025m05' }],
    );
    const yeni = await vt.tek<{ id: number; bolum: string }>(
      "INSERT INTO deneme_defter (tur) VALUES ('a') RETURNING id::int, tableoid::regclass::text AS bolum");
    assert.deepEqual(yeni, { id: 41, bolum: ayAdi('deneme_defter', 0) });
  });

  test('geçen ay, bu ay ve ileri_ay kadar gelecek ay açılır; arada veri olmayan ay ve uzak ay varsayılana düşer', async () => {
    const { sahip, vt } = acik();
    assert.deepEqual(await bolumler(sahip, 'deneme_defter'), [
      'deneme_defter_varsayilan', 'deneme_defter_y2025m03', 'deneme_defter_y2025m05',
      ayAdi('deneme_defter', -1), ayAdi('deneme_defter', 0), ayAdi('deneme_defter', 1), ayAdi('deneme_defter', 2),
    ].sort());
    const uzak = await vt.tek<{ bolum: string }>(
      "INSERT INTO deneme_defter (zaman, tur) VALUES (now() + interval '2 years', 'a') RETURNING tableoid::regclass::text AS bolum");
    assert.deepEqual(uzak, { bolum: 'deneme_defter_varsayilan' });
  });

  test('birincil anahtar bölüm sütununu taşır; dizinler, CHECK, yabancı anahtar ve kayıt aynı kalır', async () => {
    const { sahip, vt } = acik();
    assert.deepEqual(
      await sahip.sorgu("SELECT conname::text AS ad, pg_get_constraintdef(oid) AS tanim FROM pg_constraint WHERE conrelid = 'deneme_defter'::regclass ORDER BY 1"),
      [
        { ad: 'deneme_defter_kisi_id_fkey', tanim: 'FOREIGN KEY (kisi_id) REFERENCES kisi(id)' },
        { ad: 'deneme_defter_pkey', tanim: 'PRIMARY KEY (id, zaman)' },
        { ad: 'deneme_defter_tur', tanim: "CHECK ((tur = ANY (ARRAY['a'::text, 'b'::text])))" },
      ],
    );
    assert.deepEqual(
      (await sahip.sorgu<{ ad: string }>("SELECT indexrelid::regclass::text AS ad FROM pg_index WHERE indrelid = 'deneme_defter'::regclass ORDER BY 1")).map((d) => d.ad),
      ['deneme_defter_b', 'deneme_defter_kisi', 'deneme_defter_pkey'],
    );
    await assert.rejects(vt.sorgu("INSERT INTO deneme_defter (tur) VALUES ('c')"), /deneme_defter_tur/);
    await assert.rejects(vt.sorgu("INSERT INTO deneme_defter (tur, kisi_id) VALUES ('a', -1)"), /deneme_defter_kisi_id_fkey/);
    assert.deepEqual(await sahip.sorgu("SELECT tablo, sutun, ileri_ay FROM cekirdek_aylik_bolum WHERE tablo = 'deneme_defter'"),
      [{ tablo: 'deneme_defter', sutun: 'zaman', ileri_ay: 2 }]);
  });

  test('yalnız ekleme: ana tabloda ve her bölümde güncelleme, silme ve boşaltma reddedilir; uygulama bölümü ayıramaz', async () => {
    const { sahip, vt } = acik();
    for (const bolum of await bolumler(sahip, 'deneme_defter')) {
      assert.deepEqual(await tetikler(sahip, bolum), ['deneme_defter_bosaltilmaz:O', 'deneme_defter_degismez:O'], bolum);
      await assert.rejects(sahip.sorgu(`TRUNCATE ${bolum}`), /deneme_defter tablosuna yalnız ekleme/, bolum);
    }
    assert.deepEqual(await tetikler(sahip, 'deneme_defter'), ['deneme_defter_bosaltilmaz:O', 'deneme_defter_degismez:O']);
    // Ret iletisi bölümü değil defteri adlandırır.
    await assert.rejects(vt.sorgu("UPDATE deneme_defter SET tur = 'b'"), /deneme_defter tablosuna yalnız ekleme/);
    await assert.rejects(vt.sorgu('DELETE FROM deneme_defter'), /yalnız ekleme/);
    await assert.rejects(sahip.sorgu('TRUNCATE deneme_defter'), /yalnız ekleme/);
    await assert.rejects(vt.sorgu('ALTER TABLE deneme_defter DETACH PARTITION deneme_defter_y2025m03'), izinYok);
    await assert.rejects(vt.sorgu("SELECT cekirdek_aylik_bolum_ac('deneme_defter', '2030-01-01')"), izinYok);
    assert.equal((await sahip.tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM deneme_defter'))?.sayi, 6);
  });

  test('varsayılan bölümde o aya düşen satır varsa ay açılmaz, satır yerinde kalır; açık ay ikinci kez açılmaz', async () => {
    const { sahip } = acik();
    const uzakAy = "(date_trunc('month', (now() + interval '2 years') AT TIME ZONE 'UTC'))::date";
    assert.equal((await sahip.tek<{ acildi: boolean }>(`SELECT cekirdek_aylik_bolum_ac('deneme_defter', ${uzakAy}) AS acildi`))?.acildi, false);
    assert.equal((await sahip.tek<{ yok: boolean }>(
      `SELECT to_regclass('deneme_defter_y' || to_char(${uzakAy}, 'YYYY"m"MM')) IS NULL AS yok`))?.yok, true);
    assert.equal((await sahip.tek<{ sayi: number }>("SELECT count(*)::int AS sayi FROM ONLY deneme_defter_varsayilan"))?.sayi, 1);
    assert.equal((await sahip.tek<{ sayi: number }>('SELECT cekirdek_aylik_bolumleri_hazirla() AS sayi'))?.sayi, 0);
  });

  test('göç koşusu, göç olmasa da, kayıtlı tabloların eksik gelecek ayını açar', async () => {
    const { sahip, ayar, sema } = acik();
    const gelecek = ayAdi('deneme_defter', 2);
    await sahip.sorgu(`DROP TABLE ${gelecek}`);
    assert.deepEqual(await gocleriUygula(ayar, GOC_KLASORU, { sema }), []);
    assert.equal((await bolumler(sahip, 'deneme_defter')).includes(gelecek), true);
    assert.deepEqual(await tetikler(sahip, gelecek), ['deneme_defter_bosaltilmaz:O', 'deneme_defter_degismez:O']);
  });

  test('ek tekil dizin, gelen yabancı anahtar ya da zaten bölümlü tablo çevrilmez; tablo yerinde kalır', async () => {
    const { sahip } = acik();
    const cevir = (tablo: string): Promise<unknown> => sahip.sorgu(`SELECT cekirdek_aylik_bolume_cevir('${tablo}', 'zaman', 1)`);
    const duzMu = async (tablo: string): Promise<string | undefined> =>
      (await sahip.tek<{ tur: string }>('SELECT relkind::text AS tur FROM pg_class WHERE oid = $1::regclass', [tablo]))?.tur;
    await sahip.sorgu('CREATE TABLE deneme_kok (id bigint PRIMARY KEY, zaman timestamptz NOT NULL, kod text CONSTRAINT deneme_kok_kod UNIQUE)');
    await assert.rejects(cevir('deneme_kok'), /tekil dizin/);
    await sahip.sorgu('ALTER TABLE deneme_kok DROP CONSTRAINT deneme_kok_kod');
    await sahip.sorgu('CREATE TABLE deneme_cocuk (kok_id bigint REFERENCES deneme_kok)');
    await assert.rejects(cevir('deneme_kok'), /gelen yabancı anahtar/);
    assert.equal(await duzMu('deneme_kok'), 'r');
    await assert.rejects(cevir('deneme_defter'), /düz tablo değil/);
    assert.equal(await duzMu('deneme_defter'), 'p');
    await sahip.sorgu('DROP TABLE deneme_cocuk, deneme_kok');
  });
});
