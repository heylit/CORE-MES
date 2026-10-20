import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { PgAyari } from './ayar.ts';
import { GOC_OTURUM_ADI, veritabaniAc } from './db.ts';
import type { Veritabani } from './db.ts';
import { bekleyenGocler, gocleriUygula } from './goc.ts';
import { izinYok, testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';

const GERCEK_KLASOR = fileURLToPath(new URL('../gocler/', import.meta.url));
const kod = (beklenen: string) => (hata: unknown): boolean => (hata as { code?: unknown }).code === beklenen;
const tabloVarMi = async (vt: Veritabani, ad: string): Promise<boolean> =>
  (await vt.tek<{ tablo: string | null }>('SELECT to_regclass($1)::text AS tablo', [ad]))?.tablo != null;

// Koşunun tabloya hiç ulaşamadığı durumda testi süresiz bekletmeyen üst sınırdır, beklenen süre değildir.
const ULASMA_SINIRI_MS = 45_000;

// Bu şemanın göç oturumunun beklediği kilit türleri. Oturum adını yalnız aynı kullanıcı görür: sahibin bağlantısıyla sorulur.
const bekleyenTurleri = async (ortam: TestVeritabani): Promise<string[]> =>
  (await ortam.sahip.sorgu<{ tur: string }>(
    `SELECT l.locktype::text AS tur FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid AND NOT l.granted
      WHERE a.application_name = $1 ORDER BY 1`,
    [`${GOC_OTURUM_ADI}:${ortam.sema}`],
  )).map((b) => b.tur);

interface Kosu {
  sonuc: Promise<string[]>;
  bitti(): boolean;
}

function kosuBaslat(is: Promise<string[]>): Kosu {
  let bitti = false;
  const sonuc = is.finally(() => { bitti = true; });
  // Sonuç daha sonra beklenir; o ana dek gelen ret sahipsiz kalmasın.
  sonuc.catch(() => undefined);
  return { sonuc, bitti: () => bitti };
}

// Koşul sağlanana dek yoklar; koşul gelmeden koşu biterse ya da üst sınır dolarsa döner (false).
async function olanaDek(kosul: () => Promise<boolean>, kosu: Kosu): Promise<boolean> {
  const son = performance.now() + ULASMA_SINIRI_MS;
  for (;;) {
    if (await kosul()) return true;
    if (kosu.bitti() || performance.now() >= son) return false;
    await new Promise((coz) => setTimeout(coz, 20));
  }
}

// Tabloyu en ağır kipte kilitli tutar: tabloya dokunan göç, bırakılana dek bekler. Tutan oturum beklerken
// boştadır; boş transaction sınırı onu kesmesin diye kaldırılır.
async function tabloyuTut(ortam: TestVeritabani, tablo: string): Promise<{ birak(): Promise<void> }> {
  const tutan = veritabaniAc({ pg: { ...ortam.ayar.pg, bosTxSureMs: 0 } }, { sema: ortam.sema, havuzBoyutu: 1 });
  let birak: () => void = () => undefined;
  const serbest = new Promise<void>((coz) => { birak = coz; });
  let tutuldu: () => void = () => undefined;
  const kilitlendi = new Promise<void>((coz) => { tutuldu = coz; });
  const tx = tutan.tx(async (db) => {
    await db.sorgu(`LOCK TABLE ${tablo} IN ACCESS EXCLUSIVE MODE`);
    tutuldu();
    await serbest;
  });
  try {
    await Promise.race([kilitlendi, tx]);
  } catch (hata) {
    await tutan.kapat();
    throw hata;
  }
  return {
    async birak(): Promise<void> {
      birak();
      try {
        await tx;
      } finally {
        await tutan.kapat();
      }
    },
  };
}

describe('goc (gerçek PostgreSQL)', () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  let klasor = '';
  let ayar: TestVeritabani['ayar'] | undefined;
  let sema = '';
  const uygula = (): Promise<string[]> => {
    if (!ayar) throw new Error('Test veritabanı açılamadı.');
    return gocleriUygula(ayar, klasor, { sema });
  };

  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return vt;
  };
  const say = async (): Promise<number | undefined> =>
    (await acik().tek<{ sayi: number }>('SELECT count(*) AS sayi FROM parca'))?.sayi;

  before(async () => {
    ({ vt, kaldir, ayar, sema } = await testSemasiAc('goc'));
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-goc-'));
    // Dosyalar ters sırada yazılır: ikinci göç birincinin tablosuna muhtaçtır, sıra ada göre olmalı.
    await writeFile(join(klasor, '002_ilk_satir.sql'), "INSERT INTO parca (ad) VALUES ('a');\nINSERT INTO parca (ad) VALUES ('b');\n");
    await writeFile(join(klasor, '001_tablo.sql'), 'CREATE TABLE parca (id serial PRIMARY KEY, ad text NOT NULL);\n');
    await writeFile(join(klasor, 'okunmaz.txt'), 'göç değil');
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await kaldir?.();
  });

  test('kayıt tablosu yokken bütün dosyalar bekler ve bekleyenGocler tablo kurmaz', async () => {
    assert.deepEqual(await bekleyenGocler(acik(), klasor), ['001_tablo.sql', '002_ilk_satir.sql']);
    const tablo = await acik().tek<{ tablo: string | null }>("SELECT to_regclass('goc_kaydi')::text AS tablo");
    assert.equal(tablo?.tablo, null);
  });

  test('göçler ada göre sırayla uygulanır ve kaydedilir', async () => {
    assert.deepEqual(await uygula(), ['001_tablo.sql', '002_ilk_satir.sql']);
    assert.equal(await say(), 2);
    const kayitlar = await acik().sorgu<{ ad: string; ozet: string }>('SELECT ad, ozet FROM goc_kaydi ORDER BY ad');
    assert.deepEqual(kayitlar.map((k) => k.ad), ['001_tablo.sql', '002_ilk_satir.sql']);
    assert.match(kayitlar[0]?.ozet ?? '', /^[0-9a-f]{64}$/);
    assert.deepEqual(await bekleyenGocler(acik(), klasor), []);
  });

  test('ikinci koşuda hiçbir göç uygulanmaz', async () => {
    assert.deepEqual(await uygula(), []);
    assert.equal(await say(), 2);
  });

  test('hatalı göç bütünüyle geri alınır, kaydedilmez ve beklemede kalır', async () => {
    const bozuk = join(klasor, '003_bozuk.sql');
    await writeFile(bozuk, "INSERT INTO parca (ad) VALUES ('c');\nSELECT olmayan_fonksiyon();\n");
    await assert.rejects(uygula());
    assert.equal(await say(), 2);
    assert.deepEqual(await bekleyenGocler(acik(), klasor), ['003_bozuk.sql']);

    await writeFile(bozuk, "INSERT INTO parca (ad) VALUES ('c');\n");
    assert.deepEqual(await uygula(), ['003_bozuk.sql']);
    assert.equal(await say(), 3);
  });

  test('yalnız satır sonu değişen dosya değişmiş sayılmaz', async () => {
    await writeFile(join(klasor, '001_tablo.sql'), 'CREATE TABLE parca (id serial PRIMARY KEY, ad text NOT NULL);\r\n');
    assert.deepEqual(await uygula(), []);
  });

  test('uygulanmış göçün içeriği değişirse koşu ve bekleyen sorgusu hata verir, yeni göç uygulanmaz', async () => {
    await writeFile(join(klasor, '001_tablo.sql'), 'CREATE TABLE parca (id serial PRIMARY KEY, ad text);\n');
    await writeFile(join(klasor, '004_yeni.sql'), "INSERT INTO parca (ad) VALUES ('d');\n");
    await assert.rejects(uygula(), /değiştirilmiş: 001_tablo\.sql/);
    await assert.rejects(bekleyenGocler(acik(), klasor), /değiştirilmiş: 001_tablo\.sql/);
    assert.equal(await say(), 3);
  });
});

describe('göç bağlantısı ve damga sırası (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const uygula = (pg: Partial<PgAyari> = {}): Promise<string[]> =>
    gocleriUygula({ pg: { ...acik().ayar.pg, ...pg }, goc: acik().ayar.goc }, klasor, { sema: acik().sema });
  const yaz = (ad: string, sql: string): Promise<void> => writeFile(join(klasor, ad), sql);

  before(async () => {
    ortam = await testSemasiAc('gocb');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocb-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('göç oturumunda kilit sınırı ayardan gelir, sorgu sınırı yoktur; uygulama oturumunda sorgu ve boş transaction sınırı vardır', async () => {
    const pg = { sorguSureMs: 54_321, kilitSureMs: 4321, bosTxSureMs: 65_432 };
    const AYARLAR = `current_setting('lock_timeout') AS kilit, current_setting('statement_timeout') AS sorgu,
      current_setting('idle_in_transaction_session_timeout') AS bos_tx`;
    await yaz('100_iz.sql', `CREATE TABLE iz AS SELECT ${AYARLAR};\n`);
    assert.deepEqual(await uygula(pg), ['100_iz.sql']);
    assert.deepEqual(await acik().vt.tek('SELECT kilit, sorgu, bos_tx FROM iz'), { kilit: '4321ms', sorgu: '0', bos_tx: '65432ms' });

    const uygulama = veritabaniAc({ pg: { ...acik().ayar.pg, ...pg } }, { sema: acik().sema });
    try {
      const oturum = await uygulama.tek<{ kilit: string; sorgu: string; bos_tx: string }>(`SELECT ${AYARLAR}`);
      assert.equal(oturum?.sorgu, '54321ms');
      assert.equal(oturum.bos_tx, '65432ms');
      assert.notEqual(oturum.kilit, '4321ms');
    } finally {
      await uygulama.kapat();
    }
  });

  test('uygulama sorgu sınırından uzun süren göç kesilmez; aynı sorgu uygulama oturumunda kesilir', { timeout: 60_000 }, async () => {
    // Bağlantı sınırı kısaltılmaz: yüklü makinede gerçek sunucuya bağlanmak saniyeler sürer. Göç, uygulamanın
    // iki sınırından da (sunucudaki sorgu sınırı; istemcideki sorgu + bağlantı sınırı) uzun sürer.
    const pg = { sorguSureMs: 200 };
    const uykuSn = (pg.sorguSureMs + acik().ayar.pg.baglantiSureMs + 500) / 1000;
    const uygulama = veritabaniAc({ pg: { ...acik().ayar.pg, ...pg } }, { sema: acik().sema });
    try {
      // 57014: query_canceled.
      await assert.rejects(uygulama.sorgu(`SELECT pg_sleep(${uykuSn})`), kod('57014'));
    } finally {
      await uygulama.kapat();
    }
    await yaz('110_uzun.sql', `SELECT pg_sleep(${uykuSn});\nCREATE TABLE uzun (id int);\n`);
    assert.deepEqual(await uygula(pg), ['110_uzun.sql']);
    assert.equal(await tabloVarMi(acik().vt, 'uzun'), true);
  });

  test('kilitli tabloda göç kilit süresi dolunca hata verir ve uygulanmaz; kilit kalkınca uygulanır', { timeout: 90_000 }, async () => {
    await yaz('120_kilitli.sql', 'ALTER TABLE iz ADD COLUMN ek int;\n');
    const kilit = await tabloyuTut(acik(), 'iz');
    const kosu = kosuBaslat(uygula({ kilitSureMs: 300 }));
    let kilitliyken = 'tabloya ulaşmadı';
    try {
      // Süre, koşu tabloyu beklemeye başlayınca işler: bağlanmak ve göç sırasına girmek yüklü makinede
      // saniyeler sürer, o süre kilit süre sınırının ölçtüğü şey değildir.
      if (await olanaDek(async () => (await bekleyenTurleri(acik())).includes('relation'), kosu)) {
        const son = performance.now() + 8000;
        while (!kosu.bitti() && performance.now() < son) await new Promise((coz) => setTimeout(coz, 20));
        kilitliyken = 'hâlâ bekliyor';
      }
      if (kosu.bitti()) kilitliyken = 'bitti';
    } finally {
      // Kilit bırakılır: süresiz bekleyen koşu varsa burada biter, şemayı açık transaction ile bırakmaz.
      await kilit.birak();
    }
    const sonuc = await kosu.sonuc.then(() => 'uygulandı', (hata: unknown) => hata);
    assert.equal(kilitliyken, 'bitti');
    // 55P03: lock_not_available.
    assert.equal(kod('55P03')(sonuc), true, `beklenen kilit süre aşımı, gelen: ${String(sonuc)}`);
    const sutun = (): Promise<unknown> =>
      acik().vt.tek("SELECT 1 AS var FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'iz' AND column_name = 'ek'");
    assert.equal(await sutun(), null);
    assert.deepEqual(await uygula({ kilitSureMs: 300 }), ['120_kilitli.sql']);
    assert.deepEqual(await sutun(), { var: 1 });
  });

  test('uygulanmış son göçten eski damgalı yeni göç reddedilir, hiçbiri uygulanmaz; damga yenilenince hepsi uygulanır', async () => {
    await yaz('105_eski.sql', 'CREATE TABLE eski (id int);\n');
    await yaz('130_yeni.sql', 'CREATE TABLE yeni (id int);\n');
    await assert.rejects(uygula(), (hata: unknown) => {
      const mesaj = hata instanceof Error ? hata.message : '';
      assert.match(mesaj, /105_eski\.sql/);
      assert.match(mesaj, /120_kilitli\.sql/);
      assert.match(mesaj, /Damgayı yenile/);
      assert.match(mesaj, /Hiçbir göç uygulanmadı/);
      return true;
    });
    assert.deepEqual([await tabloVarMi(acik().vt, 'eski'), await tabloVarMi(acik().vt, 'yeni')], [false, false]);
    assert.deepEqual(await bekleyenGocler(acik().vt, klasor), ['105_eski.sql', '130_yeni.sql']);

    await rename(join(klasor, '105_eski.sql'), join(klasor, '140_eski.sql'));
    assert.deepEqual(await uygula(), ['130_yeni.sql', '140_eski.sql']);
    assert.deepEqual([await tabloVarMi(acik().vt, 'eski'), await tabloVarMi(acik().vt, 'yeni')], [true, true]);
  });

  test('transaction açıp susan uygulama oturumunu sunucu keser: yazılan geri alınır, havuz çalışmayı sürdürür', { timeout: 20_000 }, async () => {
    const uygulama = veritabaniAc({ pg: { ...acik().ayar.pg, bosTxSureMs: 200 } }, { sema: acik().sema });
    try {
      await acik().sahip.sorgu('CREATE TABLE bos_tx_izi (id int)');
      await assert.rejects(uygulama.tx(async (db) => {
        await db.sorgu('INSERT INTO bos_tx_izi VALUES (1)');
        await new Promise((coz) => setTimeout(coz, 1200));
        await db.sorgu('INSERT INTO bos_tx_izi VALUES (2)');
      }));
      assert.deepEqual(await uygulama.sorgu('SELECT id FROM bos_tx_izi'), []);
      // Sınırın altında kalan transaction etkilenmez.
      await uygulama.tx(async (db) => { await db.sorgu('INSERT INTO bos_tx_izi VALUES (3)'); });
      assert.deepEqual(await uygulama.sorgu('SELECT id FROM bos_tx_izi'), [{ id: 3 }]);
    } finally {
      await uygulama.kapat();
    }
  });
});

describe('yalniz_ekleme göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => {
    ortam = await testSemasiAc('gocv');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocv-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  const DEFTERLER = [
    { tablo: 'denetim_kaydi', ekle: "INSERT INTO denetim_kaydi (yontem, yol) VALUES ('POST', '/ornek')", degistir: "UPDATE denetim_kaydi SET yol = '/baska'" },
  ];

  async function yalnizEklemeyiSina(beklenenSatir: number): Promise<void> {
    const { vt, sahip } = acik();
    for (const { tablo, ekle, degistir } of DEFTERLER) {
      await vt.sorgu(ekle);
      const ret = new RegExp(`${tablo} tablosuna yalnız ekleme`);
      await assert.rejects(vt.sorgu(degistir), ret, `${tablo} UPDATE`);
      await assert.rejects(vt.sorgu(`DELETE FROM ${tablo}`), ret, `${tablo} DELETE`);
      // Uygulama kullanıcısını boşaltmadan yetki alıkoyar; tetikleyici, hakkı olan sahibi de durdurur.
      await assert.rejects(vt.sorgu(`TRUNCATE ${tablo}`), izinYok, `${tablo} TRUNCATE (uygulama)`);
      await assert.rejects(sahip.sorgu(`TRUNCATE ${tablo}`), ret, `${tablo} TRUNCATE (sahip)`);
      assert.deepEqual(await vt.tek(`SELECT count(*) AS sayi FROM ${tablo}`), { sayi: beklenenSatir }, tablo);
    }
  }

  test('göçleri önceden uygulanmış veritabanında yeni göç sorunsuz uygulanır; defterler UPDATE, DELETE ve TRUNCATE reddetmeyi sürdürür', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_cekirdek_yalniz_ekleme.sql'));
    assert.equal(sira > 0, true, 'yalniz_ekleme göçü bulunamadı ya da öncesinde göç yok');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));

    const { ayar, sema } = acik();
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), hepsi.slice(0, sira));
    await yalnizEklemeyiSina(1);

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));
    await yalnizEklemeyiSina(2);
    assert.deepEqual(await bekleyenGocler(acik().vt, GERCEK_KLASOR), []);
  });
});

describe('göç koşusu ve uygulama rolü (gerçek PostgreSQL)', () => {
  test('uygulama kullanıcısının rolü yoksa koşu değişkeni ve rolü söyleyerek durur, hiçbir şey kurmaz; rol varken uygular', async () => {
    const ortam = await testSemasiAc('gocr');
    const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gocr-'));
    try {
      await writeFile(join(klasor, '001_tablo.sql'), 'CREATE TABLE parca (id int);\n');
      const { ayar, sema, vt } = ortam;
      const olmayan = { pg: { ...ayar.pg, kullanici: 'tmiv2_olmayan_rol' }, goc: ayar.goc };
      await assert.rejects(
        gocleriUygula(olmayan, klasor, { sema }),
        (hata: unknown) => {
          assert.ok(hata instanceof Error);
          assert.match(hata.message, /Uygulama kullanıcısı veritabanında yok: TMIV2_PG_USER "tmiv2_olmayan_rol" rolünü gösteriyor/);
          assert.equal(hata.message.includes(ayar.goc.parola), false);
          assert.equal(hata.message.includes(ayar.pg.parola), false);
          return true;
        },
      );
      assert.deepEqual([await tabloVarMi(vt, 'goc_kaydi'), await tabloVarMi(vt, 'parca')], [false, false]);

      assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), ['001_tablo.sql']);
      assert.deepEqual([await tabloVarMi(vt, 'goc_kaydi'), await tabloVarMi(vt, 'parca')], [true, true]);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });
});

describe('göç koşuları: sıra, bağlantı kapanışı ve kenarlar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const uygula = (pg: Partial<PgAyari> = {}): Promise<string[]> =>
    gocleriUygula({ pg: { ...acik().ayar.pg, ...pg }, goc: acik().ayar.goc }, klasor, { sema: acik().sema });
  const yaz = (ad: string, sql: string): Promise<void> => writeFile(join(klasor, ad), sql);
  const sil = (ad: string): Promise<void> => rm(join(klasor, ad));
  const acikGocBaglantisi = async (): Promise<number | undefined> =>
    (await acik().vt.tek<{ sayi: number }>(
      'SELECT count(*) AS sayi FROM pg_stat_activity WHERE application_name = $1',
      [`${GOC_OTURUM_ADI}:${acik().sema}`],
    ))?.sayi;
  // Sunucu kapanan bağlantıyı listeden biraz gecikmeyle düşürür. Kapatılmayan bağlantı havuzda bundan uzun yaşar.
  async function baglantiKapandi(yol: string): Promise<void> {
    const son = performance.now() + 4000;
    let sayi = await acikGocBaglantisi();
    while (sayi !== 0 && performance.now() < son) {
      await new Promise((coz) => setTimeout(coz, 50));
      sayi = await acikGocBaglantisi();
    }
    assert.equal(sayi, 0, `${yol}: göç bağlantısı açık kaldı`);
  }

  before(async () => {
    ortam = await testSemasiAc('gock');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-gock-'));
  });

  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('göç bağlantısı başarıda, göç SQL hatasında ve damga reddinde kapanır', { timeout: 30_000 }, async () => {
    // Önce bağlantının koşu sırasında bu adla göründüğü ölçülür; yoksa "kapandı" boş sayımda da geçerdi.
    await yaz('100_b.sql', 'CREATE TABLE bag_izi AS SELECT count(*) AS sayi FROM pg_stat_activity WHERE application_name = current_setting(\'application_name\');\n');
    assert.deepEqual(await uygula(), ['100_b.sql']);
    assert.deepEqual(await acik().vt.tek('SELECT sayi FROM bag_izi'), { sayi: 1 });
    await baglantiKapandi('başarı');

    await yaz('110_bozuk.sql', 'SELECT olmayan_fonksiyon();\n');
    await assert.rejects(uygula(), kod('42883'));
    await baglantiKapandi('göç SQL hatası');
    await sil('110_bozuk.sql');

    await yaz('050_eski.sql', 'CREATE TABLE eski (id int);\n');
    await assert.rejects(uygula(), /Göç damgası eski: 050_eski\.sql/);
    await baglantiKapandi('damga reddi');
    await sil('050_eski.sql');
  });

  test('aynı damgalı dosyalarda sıra tam addır: uygulanmış 100_b\'den sonra eklenen 100_a reddedilir, 100_c uygulanır', async () => {
    await yaz('100_a.sql', 'CREATE TABLE a (id int);\n');
    await yaz('100_c.sql', 'CREATE TABLE c (id int);\n');
    await assert.rejects(uygula(), /Göç damgası eski: 100_a\.sql, uygulanmış son göçten \(100_b\.sql\)/);
    assert.deepEqual([await tabloVarMi(acik().vt, 'a'), await tabloVarMi(acik().vt, 'c')], [false, false]);

    await sil('100_a.sql');
    assert.deepEqual(await uygula(), ['100_c.sql']);
    assert.deepEqual([await tabloVarMi(acik().vt, 'a'), await tabloVarMi(acik().vt, 'c')], [false, true]);
  });

  test('kaydı olup dosyası olmayan göç koşuyu durdurur, yeni göç uygulanmaz; dosya geri gelince uygulanır', async () => {
    const c = join(klasor, '100_c.sql');
    const sakli = join(klasor, '100_c.sakli');
    await rename(c, sakli);
    await yaz('200_yeni.sql', 'CREATE TABLE yeni (id int);\n');
    await assert.rejects(uygula(), /Uygulanmış göç dosyası bulunamadı: 100_c\.sql/);
    await assert.rejects(bekleyenGocler(acik().vt, klasor), /Uygulanmış göç dosyası bulunamadı: 100_c\.sql/);
    assert.equal(await tabloVarMi(acik().vt, 'yeni'), false);

    await rename(sakli, c);
    assert.deepEqual(await uygula(), ['200_yeni.sql']);
    assert.equal(await tabloVarMi(acik().vt, 'yeni'), true);
  });

  test('eşzamanlı iki koşu kilit süresinden uzun da olsa birbirini bekler: göç bir kez uygulanır, hiçbiri hata vermez', { timeout: 30_000 }, async () => {
    // Sayaç tablosu göçten önce vardır: göç iki kez uygulansaydı sayaç iki olurdu.
    await acik().sahip.sorgu('CREATE TABLE sayac (id int)');
    await yaz('300_uzun.sql', 'SELECT pg_sleep(1.5);\nINSERT INTO sayac VALUES (1);\n');
    const pg = { kilitSureMs: 300 };
    const ilk = uygula(pg);
    await new Promise((coz) => setTimeout(coz, 200));
    const sonuclar = await Promise.all([ilk, uygula(pg)]);
    assert.deepEqual(sonuclar.flat(), ['300_uzun.sql']);
    assert.deepEqual(await acik().vt.sorgu('SELECT id FROM sayac'), [{ id: 1 }]);
  });
});
