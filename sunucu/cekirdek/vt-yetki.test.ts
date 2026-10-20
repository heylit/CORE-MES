import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { bekleyenGocler, gocleriUygula } from './goc.ts';
import { izinYok, testSemasiAc, testVeritabaniKur } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';

const GOC_KLASORU = fileURLToPath(new URL('../gocler/', import.meta.url));

describe('veritabanı kullanıcıları: uygulama okur ve yazar, şemayı yalnız göç kullanıcısı değiştirir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = async (vt: TestVeritabani['vt']): Promise<{ ad: string; super: boolean } | null> =>
    vt.tek<{ ad: string; super: boolean }>('SELECT current_user::text AS ad, rolsuper AS super FROM pg_roles WHERE rolname = current_user');
  const denetimSayisi = async (): Promise<number | undefined> =>
    (await acik().sahip.tek<{ sayi: number }>('SELECT count(*) AS sayi FROM denetim_kaydi'))?.sayi;

  before(async () => {
    ortam = await testVeritabaniKur('yetki');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('iki bağlantı ayrı kullanıcıdır ve ikisi de süper kullanıcı değildir; tabloların sahibi göç kullanıcısıdır', async () => {
    const { vt, sahip, ayar, sema } = acik();
    assert.deepEqual(await kim(vt), { ad: ayar.pg.kullanici, super: false });
    assert.deepEqual(await kim(sahip), { ad: ayar.goc.kullanici, super: false });
    const sahipler = await sahip.sorgu<{ sahip: string }>('SELECT DISTINCT tableowner::text AS sahip FROM pg_tables WHERE schemaname = $1', [sema]);
    assert.deepEqual(sahipler, [{ sahip: ayar.goc.kullanici }]);
  });

  test('uygulama kullanıcısı açılıştaki bekleyen göç denetimini koşar: uygulanmış şemada bekleyen yoktur', async () => {
    assert.deepEqual(await bekleyenGocler(acik().vt, GOC_KLASORU), []);
    const bos = await testSemasiAc('yetki_bos');
    try {
      assert.equal((await bekleyenGocler(bos.vt, GOC_KLASORU)).length > 0, true);
    } finally {
      await bos.kaldir();
    }
  });

  test('göç kaydını uygulama kullanıcısı yalnız okur, sahibi yazar; sonradan verilen yazma hakkını bir sonraki göç koşusu geri alır', async () => {
    const { vt, sahip, ayar, sema } = acik();
    const YAZMALAR = [
      "INSERT INTO goc_kaydi (ad, ozet) VALUES ('zzz_uygulamanin_kaydi.sql', 'x')",
      "UPDATE goc_kaydi SET ozet = 'x'",
      'DELETE FROM goc_kaydi',
    ];
    const kayitSayisi = async (): Promise<number | undefined> =>
      (await vt.tek<{ sayi: number }>('SELECT count(*) AS sayi FROM goc_kaydi'))?.sayi;
    const yazamaz = async (): Promise<void> => {
      for (const sql of YAZMALAR) await assert.rejects(vt.sorgu(sql), izinYok, sql);
    };
    const baslangic = (await kayitSayisi()) ?? 0;
    assert.equal(baslangic > 0, true);
    await yazamaz();

    await sahip.sorgu("INSERT INTO goc_kaydi (ad, ozet) VALUES ('zzz_sahibin_kaydi.sql', 'x')");
    await sahip.sorgu("UPDATE goc_kaydi SET ozet = 'y' WHERE ad = 'zzz_sahibin_kaydi.sql'");
    assert.equal(await kayitSayisi(), baslangic + 1);
    await sahip.sorgu("DELETE FROM goc_kaydi WHERE ad = 'zzz_sahibin_kaydi.sql'");

    // Var olan kurulumdaki durum: tablo, yazma hakkı verilmişken açılmış ya da taşıma betiği hakkı yeniden vermiş.
    await sahip.sorgu(`GRANT INSERT, UPDATE, DELETE ON goc_kaydi TO "${ayar.pg.kullanici.replaceAll('"', '""')}"`);
    await vt.sorgu("INSERT INTO goc_kaydi (ad, ozet) VALUES ('zzz_uygulamanin_kaydi.sql', 'x')");
    await vt.sorgu("DELETE FROM goc_kaydi WHERE ad = 'zzz_uygulamanin_kaydi.sql'");
    assert.deepEqual(await gocleriUygula(ayar, GOC_KLASORU, { sema }), []);
    await yazamaz();
    assert.equal(await kayitSayisi(), baslangic);
    assert.deepEqual(await bekleyenGocler(vt, GOC_KLASORU), []);
    assert.deepEqual(await gocleriUygula(ayar, GOC_KLASORU, { sema }), []);
    await yazamaz();
  });

  test('göçün kurduğu tabloda uygulama kullanıcısı SELECT, INSERT, UPDATE ve DELETE yapar', async () => {
    const { vt } = acik();
    const eklenen = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Yetki Deneme') RETURNING id");
    assert.equal(typeof eklenen?.id, 'number');
    await vt.sorgu("UPDATE kisi SET ad = 'Yetki Deneme 2' WHERE id = $1", [eklenen?.id]);
    assert.deepEqual(await vt.sorgu('SELECT ad FROM kisi WHERE id = $1', [eklenen?.id]), [{ ad: 'Yetki Deneme 2' }]);
    await vt.sorgu('DELETE FROM kisi WHERE id = $1', [eklenen?.id]);
    assert.deepEqual(await vt.sorgu('SELECT ad FROM kisi WHERE id = $1', [eklenen?.id]), []);
  });

  test('uygulama kullanıcısı tabloyu düşüremez, değiştiremez, boşaltamaz; tetikleyiciyi kapatamaz ve düşüremez', async () => {
    const { vt, sahip } = acik();
    await vt.sorgu("INSERT INTO denetim_kaydi (yontem, yol) VALUES ('POST', '/yetki')");
    const yasaklar = [
      'DROP TABLE denetim_kaydi',
      'DROP TABLE denetim_kaydi CASCADE',
      'ALTER TABLE denetim_kaydi DISABLE TRIGGER denetim_kaydi_degismez',
      'ALTER TABLE denetim_kaydi DISABLE TRIGGER ALL',
      'DROP TRIGGER denetim_kaydi_degismez ON denetim_kaydi',
      'DROP TRIGGER denetim_kaydi_bosaltilmaz ON denetim_kaydi',
      'TRUNCATE denetim_kaydi',
      'ALTER TABLE denetim_kaydi ADD COLUMN ek int',
      'ALTER TABLE denetim_kaydi RENAME TO baska_ad',
      'CREATE TABLE uygulamanin_tablosu (id int)',
      "CREATE TRIGGER uygulamanin_tetikleyicisi BEFORE INSERT ON denetim_kaydi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme()",
      'CREATE OR REPLACE FUNCTION yalniz_ekleme() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$',
      'DROP FUNCTION yalniz_ekleme() CASCADE',
      `DROP SCHEMA ${acik().sema} CASCADE`,
      'CREATE SCHEMA uygulamanin_semasi',
    ];
    for (const sql of yasaklar) await assert.rejects(vt.sorgu(sql), izinYok, sql);

    // Hiçbiri yarım iş bırakmadı: tetikleyiciler yerinde ve açık, satır duruyor, defter hâlâ yalnız ekleme alıyor.
    assert.deepEqual(
      await sahip.sorgu("SELECT tgname::text AS ad, tgenabled::text AS durum FROM pg_trigger WHERE tgrelid = 'denetim_kaydi'::regclass AND NOT tgisinternal ORDER BY tgname"),
      [{ ad: 'denetim_kaydi_bosaltilmaz', durum: 'O' }, { ad: 'denetim_kaydi_degismez', durum: 'O' }],
    );
    assert.equal(await denetimSayisi(), 1);
    await assert.rejects(vt.sorgu("UPDATE denetim_kaydi SET yol = '/baska'"), /yalnız ekleme/);
    await assert.rejects(vt.sorgu('DELETE FROM denetim_kaydi'), /yalnız ekleme/);
  });

  test('tetikleyici sahibi de durdurur; sahip tetikleyiciyi kapatabilir, tabloyu değiştirebilir, boşaltabilir ve düşürebilir', async () => {
    const { sahip } = acik();
    await assert.rejects(sahip.sorgu("UPDATE denetim_kaydi SET yol = '/baska'"), /yalnız ekleme/);
    await assert.rejects(sahip.sorgu('DELETE FROM denetim_kaydi'), /yalnız ekleme/);
    await assert.rejects(sahip.sorgu('TRUNCATE denetim_kaydi'), /yalnız ekleme/);
    assert.equal(await denetimSayisi(), 1);

    // Geri alınan transaction: kabul ölçülür, şema sonraki testlere değişmeden kalır.
    const geriAl = new Error('geri al');
    await assert.rejects(sahip.tx(async (db) => {
      await db.sorgu('ALTER TABLE denetim_kaydi DISABLE TRIGGER denetim_kaydi_bosaltilmaz');
      await db.sorgu('TRUNCATE denetim_kaydi');
      assert.deepEqual(await db.sorgu('SELECT 1 FROM denetim_kaydi'), []);
      await db.sorgu('DROP TRIGGER denetim_kaydi_degismez ON denetim_kaydi');
      await db.sorgu('ALTER TABLE denetim_kaydi ADD COLUMN ek int');
      await db.sorgu('DROP TABLE denetim_kaydi');
      assert.deepEqual(await db.tek("SELECT to_regclass('denetim_kaydi')::text AS tablo"), { tablo: null });
      throw geriAl;
    }), geriAl);
    assert.equal(await denetimSayisi(), 1);
  });

  test('göç kullanıcısının sonradan açtığı tablo, dizi ve şemada uygulama kullanıcısı kendiliğinden okur ve yazar; hak verilmez', async () => {
    const { vt, sahip, sema } = acik();
    await sahip.sorgu('CREATE TABLE yeni_kalem (id serial PRIMARY KEY, ad text NOT NULL)');
    await sahip.sorgu('CREATE SEQUENCE yeni_sayac');
    await sahip.sorgu("CREATE FUNCTION yeni_islev() RETURNS text LANGUAGE sql AS $$ SELECT 'tamam' $$");

    assert.deepEqual(await vt.sorgu("INSERT INTO yeni_kalem (ad) VALUES ('a'), ('b') RETURNING id"), [{ id: 1 }, { id: 2 }]);
    await vt.sorgu("UPDATE yeni_kalem SET ad = 'c' WHERE id = 1");
    await vt.sorgu('DELETE FROM yeni_kalem WHERE id = 2');
    assert.deepEqual(await vt.sorgu('SELECT id, ad FROM yeni_kalem'), [{ id: 1, ad: 'c' }]);
    assert.deepEqual(await vt.tek("SELECT nextval('yeni_sayac') AS sira, yeni_islev() AS cevap"), { sira: 1, cevap: 'tamam' });
    for (const sql of ['DROP TABLE yeni_kalem', 'TRUNCATE yeni_kalem', 'ALTER TABLE yeni_kalem ADD COLUMN ek int', 'DROP SEQUENCE yeni_sayac']) {
      await assert.rejects(vt.sorgu(sql), izinYok, sql);
    }

    // Verilen haklar tam bu kadardır: boşaltma, yabancı anahtar ve tetikleyici hakkı yoktur.
    const haklar = await sahip.sorgu<{ hak: string }>(
      `SELECT privilege_type::text AS hak FROM information_schema.role_table_grants
       WHERE table_schema = $1 AND table_name = 'yeni_kalem' AND grantee = $2 ORDER BY 1`,
      [sema, acik().ayar.pg.kullanici],
    );
    assert.deepEqual(haklar.map((h) => h.hak), ['DELETE', 'INSERT', 'SELECT', 'UPDATE']);

    // Yeni şema (her test dosyasının şeması böyle açılır): kullanım hakkı da kendiliğinden gelir.
    const yeni = await testSemasiAc('yetki_yeni');
    try {
      await yeni.sahip.sorgu('CREATE TABLE kalem (id int PRIMARY KEY)');
      await yeni.vt.sorgu('INSERT INTO kalem VALUES (7)');
      assert.deepEqual(await yeni.vt.sorgu('SELECT id FROM kalem'), [{ id: 7 }]);
      await assert.rejects(yeni.vt.sorgu('DROP TABLE kalem'), izinYok);
      await assert.rejects(yeni.vt.sorgu('CREATE TABLE baska (id int)'), izinYok);
    } finally {
      await yeni.kaldir();
    }
  });
});
