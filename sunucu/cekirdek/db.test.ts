import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ondalikMetinSemasi } from '#paylasilan/ondalik.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/tesis-zamani.ts';
import { uygulamaHavuzuAc, uygulamaKimliginiDogrula, veritabaniAc, vtSureDoldu } from './db.ts';
import type { Db, Veritabani } from './db.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';

describe('db (gerçek PostgreSQL)', () => {
  let sema = '';
  let ayar: TestVeritabani['ayar'];
  let vt: Veritabani | undefined;
  let sahip: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;

  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return vt;
  };

  before(async () => {
    const ortam = await testSemasiAc('db');
    ({ ayar, sema, kaldir } = ortam);
    await ortam.sahip.sorgu('CREATE TABLE kalem (id int PRIMARY KEY, ad text NOT NULL)');
    await ortam.sahip.sorgu('CREATE TABLE olcum (sira int PRIMARY KEY, tutar numeric(10,2))');
    vt = ortam.vt;
    sahip = ortam.sahip;
  });

  after(async () => {
    await kaldir?.();
  });

  test('test veritabanına ve koşuya özel şemaya bağlanır', async () => {
    const satir = await acik().tek<{ veritabani: string; sema: string; tablo_semasi: string }>(
      `SELECT current_database() AS veritabani, current_schema() AS sema,
              (SELECT schemaname FROM pg_tables WHERE tablename = 'kalem' AND schemaname = $1) AS tablo_semasi`,
      [sema],
    );
    assert.equal(satir?.veritabani, ayar.pg.veritabani);
    assert.notEqual(satir?.veritabani, 'tmi');
    assert.equal(satir?.sema, sema);
    assert.equal(satir?.tablo_semasi, sema);
  });

  test('tip ayrıştırıcıları: date ve numeric metin, int8 number, NULL null kalır', async () => {
    const satir = await acik().tek(
      `SELECT DATE '2026-03-05' AS gun, 9007199254740991::int8 AS buyuk, count(*) AS sayim,
              1.50::numeric AS oran, NULL::numeric AS bos, NULL::date AS bos_gun`,
    );
    assert.deepEqual(satir, { gun: '2026-03-05', buyuk: 9007199254740991, sayim: 1, oran: '1.50', bos: null, bos_gun: null });
  });

  test('numeric(10,2) tablo sütunu ölçeğiyle metin döner ve ondalık şemasından geçer', async () => {
    await acik().sorgu('INSERT INTO olcum VALUES (1, -0.004), (2, 1.5), (3, 12345678.999), (4, NULL)');
    const satirlar = await acik().sorgu<{ tutar: unknown }>('SELECT tutar FROM olcum ORDER BY sira');
    assert.deepEqual(satirlar.map((satir) => satir.tutar), ['0.00', '1.50', '12345679.00', null]);
    for (const { tutar } of satirlar.slice(0, 3)) assert.equal(ondalikMetinSemasi.parse(tutar), tutar);
  });

  test('numeric[] öğeleri metin, int8[] öğeleri number döner; NULL öğe null, iç içe ve boş dizi biçimini korur', async () => {
    const satir = await acik().tek(
      `SELECT ARRAY[1.50, 12345678901234567.891, NULL]::numeric[] AS ondaliklar,
              ARRAY[1, 9007199254740991, NULL]::int8[] AS tamlar,
              ARRAY[[1, 2], [3, 4]]::int8[] AS ic_ice, ARRAY[[1.10], [2.20]]::numeric[] AS ic_ondalik,
              '{}'::int8[] AS bos, NULL::numeric[] AS yok`,
    );
    assert.deepEqual(satir, {
      ondaliklar: ['1.50', '12345678901234567.891', null],
      tamlar: [1, 9007199254740991, null],
      ic_ice: [[1, 2], [3, 4]],
      ic_ondalik: [['1.10'], ['2.20']],
      bos: [],
      yok: null,
    });
  });

  test('date[] öğeleri metin döner: gün JSON\'da kaymaz, NULL öğe null kalır', async () => {
    const satir = await acik().tek<{ gunler: unknown; yok: unknown }>(
      "SELECT ARRAY['2026-10-05'::date, NULL, '2026-01-01'::date] AS gunler, NULL::date[] AS yok",
    );
    assert.deepEqual(satir, { gunler: ['2026-10-05', null, '2026-01-01'], yok: null });
    assert.equal(JSON.stringify(satir.gunler), '["2026-10-05",null,"2026-01-01"]');
  });

  test('güvenli aralığı aşan int8[] öğesi sessizce metin ya da yuvarlanmış sayı dönmez, hata verir', async () => {
    assert.deepEqual(await acik().tek('SELECT ARRAY[9007199254740991]::int8[] AS a'), { a: [9007199254740991] });
    await assert.rejects(acik().tek('SELECT ARRAY[1, 9007199254740993]::int8[] AS a'), /güvenli tam sayı/);
  });

  test('numeric hassasiyetini yitirmez: parametreden ve toplamdan geçen değer basamağı basamağına döner', async () => {
    const UZUN = '12345678901234567.891';
    const satir = await acik().tek<Record<string, unknown>>(
      `SELECT $1::numeric AS deger, -$1::numeric AS eksi, sum(x) AS toplam, avg(y) AS ortalama
         FROM (VALUES ($1::numeric, 1::int8), (0.009, 2)) AS t(x, y)`,
      [UZUN],
    );
    assert.equal(satir?.deger, UZUN);
    assert.equal(satir.eksi, `-${UZUN}`);
    assert.equal(satir.toplam, '12345678901234567.900');
    assert.equal(typeof satir.ortalama, 'string');
    assert.equal(ondalikMetinSemasi.parse(satir.deger), UZUN);
    assert.equal(ondalikMetinSemasi.safeParse(satir.eksi).success, true);
    assert.equal(ondalikMetinSemasi.safeParse(satir.toplam).success, true);
    assert.equal(ondalikMetinSemasi.safeParse(satir.ortalama).success, true);
  });

  test('numeric NaN ve Infinity sürücüden metin gelir, ondalık şeması reddeder', async () => {
    const satir = await acik().tek<Record<string, unknown>>(
      `SELECT 'NaN'::numeric AS sayi_degil, 'Infinity'::numeric AS sonsuz, '-Infinity'::numeric AS eksi_sonsuz,
              1e-7::numeric AS kucuk, 1e20::numeric AS buyuk`,
    );
    assert.deepEqual(satir, {
      sayi_degil: 'NaN', sonsuz: 'Infinity', eksi_sonsuz: '-Infinity', kucuk: '0.0000001', buyuk: '100000000000000000000',
    });
    for (const ad of ['sayi_degil', 'sonsuz', 'eksi_sonsuz'] as const) {
      assert.equal(ondalikMetinSemasi.safeParse(satir[ad]).success, false, ad);
    }
    for (const ad of ['kucuk', 'buyuk'] as const) assert.equal(ondalikMetinSemasi.safeParse(satir[ad]).success, true, ad);
  });

  test('güvenli aralığı aşan int8 sessizce yuvarlanmaz, hata verir', async () => {
    await assert.rejects(acik().tek('SELECT 9007199254740993::int8 AS buyuk'), /güvenli tam sayı/);
  });

  test('sorgu süre sınırı ayardan gelir: sunucudaki statement_timeout ayardaki değerdir', async () => {
    const ozel = veritabaniAc({ pg: { ...ayar.pg, sorguSureMs: 54_321 } }, { sema });
    try {
      const satir = await ozel.tek<{ sure: string }>("SELECT current_setting('statement_timeout') AS sure");
      assert.equal(satir?.sure, '54321ms');
    } finally {
      await ozel.kapat();
    }
  });

  test('okuma transaction\'ı kendi süre sınırıyla açılır; yazma transaction\'ı ve tek sorgu genel sınırda kalır', async () => {
    const ozel = veritabaniAc({ pg: { ...ayar.pg, sorguSureMs: 54_321, okumaSureMs: 4321 } }, { sema });
    const sure = "SELECT current_setting('statement_timeout') AS sure";
    try {
      assert.equal((await ozel.okumaTx((db) => db.tek<{ sure: string }>(sure)))?.sure, '4321ms');
      assert.equal((await ozel.tx((db) => db.tek<{ sure: string }>(sure)))?.sure, '54321ms');
      // SET LOCAL transaction'la biter: aynı bağlantıdaki sonraki iş genel sınırı görür.
      assert.equal((await ozel.tek<{ sure: string }>(sure))?.sure, '54321ms');
    } finally {
      await ozel.kapat();
    }
  });

  test('boştaki bağlantı koparsa bildirim çağrılır, süreç düşmez; havuz yeni bağlantıyla sürer', { timeout: 20_000 }, async () => {
    const bildirilen: Error[] = [];
    const ozel = veritabaniAc(ayar, { sema, havuzBoyutu: 2, baglantiHatasiBildir: (hata) => { bildirilen.push(hata); } });
    try {
      await ozel.tx(async (db) => {
        // İkinci bağlantı işini bitirip havuza boşta döner; tx bağlantısı onu sunucuda keser.
        const bos = await ozel.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        assert.notEqual(bos, null);
        await db.sorgu('SELECT pg_terminate_backend($1)', [bos?.pid]);
      });
      const son = Date.now() + 5000;
      while (bildirilen.length === 0 && Date.now() < son) await new Promise((coz) => setTimeout(coz, 20));
      assert.equal(bildirilen.length, 1);
      assert.equal((await ozel.tek<{ bir: number }>('SELECT 1 AS bir'))?.bir, 1);
    } finally {
      await ozel.kapat();
    }
  });

  test('kilitli tabloyu okuyanlar okuma süresinde düşer ve bağlantıyı bırakır; ilgisiz okuma havuz sırasında beklemez', { timeout: 20_000 }, async () => {
    const OKUMA_MS = 300;
    const ozel = veritabaniAc({ pg: { ...ayar.pg, okumaSureMs: OKUMA_MS } }, { sema, havuzBoyutu: 2 });
    let birak: () => void = () => undefined;
    const tutuluyor = new Promise<void>((coz) => { birak = coz; });
    let kilitlendi: () => void = () => undefined;
    const kilitAlindi = new Promise<void>((coz) => { kilitlendi = coz; });
    if (!sahip) throw new Error('Sahip bağlantısı açılamadı.');
    const kilit = sahip.tx(async (db) => {
      await db.sorgu('LOCK TABLE kalem IN ACCESS EXCLUSIVE MODE');
      kilitlendi();
      await tutuluyor;
    });
    try {
      await kilitAlindi;
      const baslangic = performance.now();
      const kilitliler = Array.from({ length: 4 }, () => ozel.okumaTx((db) => db.sorgu('SELECT * FROM kalem')).then(() => null, (hata: unknown) => hata));
      const ilgisiz = ozel.okumaTx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM olcum'));
      const hatalar = await Promise.all(kilitliler);
      assert.deepEqual(hatalar.map((h) => vtSureDoldu(h)), [true, true, true, true]);
      assert.equal(typeof (await ilgisiz)?.n, 'number');
      // Dört kilitli okuma iki bağlantıda iki tur sürer; genel sorgu sınırına (saniyeler) yaklaşmaz.
      assert.ok(performance.now() - baslangic < ayar.pg.baglantiSureMs, `${Math.round(performance.now() - baslangic)} ms`);
    } finally {
      birak();
      await kilit;
      await ozel.kapat();
    }
  });

  test('oturum tesisin saat dilimindedir: gün sınırı ve zaman çıktısı sunucu kurulumunun saat dilimine bağlı değildir', async () => {
    const satir = await acik().tek<{ dilim: string; gun: string; an: string }>(
      `SELECT current_setting('TimeZone') AS dilim, ('2026-10-10T21:30:00Z'::timestamptz)::date AS gun,
              to_json('2026-10-10T21:30:00Z'::timestamptz) #>> '{}' AS an`);
    assert.deepEqual(satir, { dilim: TESIS_SAAT_DILIMI, gun: '2026-10-11', an: '2026-10-11T00:30:00+03:00' });
  });

  test('tx içinde sunucunun süre aşımı iptali geri alınır; aynı bağlantı havuza temiz döner', { timeout: 20_000 }, async () => {
    const onceki = await acik().tek<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await assert.rejects(
      acik().tx(async (db) => {
        await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [50, 'geçici']);
        // Kısa sınır yalnız yavaş sorguya uygulanır; hızlı sorgular havuzun bol sınırıyla koşar.
        await db.sorgu("SET LOCAL statement_timeout = '150ms'");
        await db.sorgu('SELECT pg_sleep(30)');
      }),
      // 57014: query_canceled. İleti sunucu diline göre değişir, kod değişmez.
      (hata: unknown) => (hata as { code?: unknown }).code === '57014',
    );
    const sonra = await acik().tek<{ pid: number; sayi: number }>(
      'SELECT pg_backend_pid() AS pid, (SELECT count(*) FROM kalem WHERE id = 50) AS sayi',
    );
    assert.equal(sonra?.sayi, 0);
    assert.equal(sonra?.pid, onceki?.pid);
  });

  test('SQL hatasından sonra bağlantı kapatılmaz: aynı sunucu süreci yeniden kullanılır', async () => {
    const pid = async (): Promise<number | undefined> =>
      (await acik().tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))?.pid;
    const onceki = await pid();
    assert.equal(typeof onceki, 'number');
    // 22012: division_by_zero
    await assert.rejects(acik().sorgu('SELECT 1 / 0'), (hata: unknown) => (hata as { code?: unknown }).code === '22012');
    assert.equal(await pid(), onceki);
    await assert.rejects(
      acik().tx(async (db) => { await db.sorgu('SELECT 1 / 0'); }),
      (hata: unknown) => (hata as { code?: unknown }).code === '22012',
    );
    assert.equal(await pid(), onceki);
  });

  test('biten sorgu ardında bekleyen zamanlayıcı bırakmaz', async () => {
    const bekleyen = (): number => process.getActiveResourcesInfo().filter((tur) => tur === 'Timeout').length;
    await acik().tek('SELECT 1');
    const once = bekleyen();
    for (let i = 0; i < 5; i += 1) await acik().tek('SELECT 1');
    await acik().tx(async (db) => { await db.sorgu('SELECT 1'); });
    await assert.rejects(acik().sorgu('SELECT 1 / 0'));
    assert.equal(bekleyen(), once);
  });

  test('tx başarılıysa kalıcıdır', async () => {
    const donen = await acik().tx(async (db) => {
      await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [1, 'kalıcı']);
      return 'bitti';
    });
    assert.equal(donen, 'bitti');
    assert.deepEqual(await acik().sorgu('SELECT id, ad FROM kalem ORDER BY id'), [{ id: 1, ad: 'kalıcı' }]);
  });

  test('tx içinde hata olursa yazılanlar geri alınır ve hata yeniden fırlatılır', async () => {
    await assert.rejects(
      acik().tx(async (db) => {
        await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [2, 'geçici']);
        const icerde = await db.tek<{ sayi: number }>('SELECT count(*) AS sayi FROM kalem');
        assert.equal(icerde?.sayi, 2);
        throw new Error('iş kuralı reddetti');
      }),
      /iş kuralı reddetti/,
    );
    const sonra = await acik().tek<{ sayi: number }>('SELECT count(*) AS sayi FROM kalem');
    assert.equal(sonra?.sayi, 1);
  });

  test('tx içindeki SQL hatası da geri alır; bağlantı havuza temiz döner', async () => {
    await assert.rejects(
      acik().tx(async (db) => {
        await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [3, 'geçici']);
        await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [1, 'çakışan']);
      }),
    );
    const sonra = await acik().tek<{ sayi: number }>('SELECT count(*) AS sayi FROM kalem');
    assert.equal(sonra?.sayi, 1);
  });

  const kalemSayisi = async (id: number): Promise<number | undefined> =>
    (await acik().tek<{ sayi: number }>('SELECT count(*) AS sayi FROM kalem WHERE id = $1', [id]))?.sayi;

  test('COMMIT ile biten tx\'in saklanan db\'si sorguyu reddeder; yazısı hiçbir bağlantıda koşmaz', async () => {
    let sakli: Db | undefined;
    const icerde = await acik().tx(async (db) => {
      sakli = db;
      return db.tek<{ n: number }>('SELECT 1 AS n');
    });
    assert.deepEqual(icerde, { n: 1 });
    assert.ok(sakli);
    await assert.rejects(sakli.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [60, 'sızan']), /Transaction bitti/);
    await assert.rejects(sakli.tek('INSERT INTO kalem (id, ad) VALUES ($1, $2) RETURNING id', [61, 'sızan']), /Transaction bitti/);
    assert.equal(await kalemSayisi(60), 0);
    assert.equal(await kalemSayisi(61), 0);
  });

  test('ROLLBACK ile biten tx\'in saklanan db\'si sorguyu reddeder; yazısı hiçbir bağlantıda koşmaz', async () => {
    let sakli: Db | undefined;
    await assert.rejects(
      acik().tx(async (db) => {
        sakli = db;
        await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [62, 'geçici']);
        throw new Error('iş kuralı reddetti');
      }),
      /iş kuralı reddetti/,
    );
    assert.ok(sakli);
    await assert.rejects(sakli.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [63, 'sızan']), /Transaction bitti/);
    assert.equal(await kalemSayisi(62), 0);
    assert.equal(await kalemSayisi(63), 0);
  });

  test('işleyicinin beklemeden bıraktığı sorgu COMMIT\'in ardına sıralanamaz: hata alır, yazısı kalıcı olmaz', async () => {
    let geciken: Promise<unknown> | undefined;
    await acik().tx(async (db) => {
      await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [64, 'beklenen']);
      // setImmediate, COMMIT gönderildikten sonra ama cevabı okunmadan önce koşar. Sonuç hemen
      // yakalanır ki ret, test onu beklemeye başlamadan yakalanmamış söz reddi olmasın.
      geciken = new Promise((coz) => { setImmediate(coz); })
        .then(() => db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [65, 'sızan']))
        .then(() => 'koştu', (hata: unknown) => hata);
    });
    const sonuc = await geciken;
    assert.ok(sonuc instanceof Error, `geciken sorgu reddedilmedi: ${String(sonuc)}`);
    assert.match(sonuc.message, /Transaction bitti/);
    assert.equal(await kalemSayisi(64), 1);
    assert.equal(await kalemSayisi(65), 0);
    await acik().sorgu('DELETE FROM kalem WHERE id = 64');
  });

  test('işleyici beklenmemiş sorgu bırakıp dönerse tx reddeder ve yazı kalıcı olmaz; beklenen eşzamanlı sorgular etkilenmez', async () => {
    await assert.rejects(
      acik().tx(async (db) => {
        void db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [66, 'beklenmemiş']);
        return Promise.resolve();
      }),
      /beklenmemiş sorgu bıraktı/,
    );
    assert.equal(await kalemSayisi(66), 0);

    const adlar = await acik().tx(async (db) => {
      const [ilk, ikinci] = await Promise.all([
        db.tek<{ ad: string }>('INSERT INTO kalem (id, ad) VALUES ($1, $2) RETURNING ad', [67, 'eşzamanlı']),
        db.tek<{ ad: string }>('INSERT INTO kalem (id, ad) VALUES ($1, $2) RETURNING ad', [68, 'eşzamanlı']),
      ]);
      return [ilk?.ad, ikinci?.ad];
    });
    assert.deepEqual(adlar, ['eşzamanlı', 'eşzamanlı']);
    assert.equal(await kalemSayisi(67), 1);
    assert.equal(await kalemSayisi(68), 1);
    await acik().sorgu('DELETE FROM kalem WHERE id IN (67, 68)');
  });

  test('bırakılan sorgu hata verse de yakalanmamış söz reddi olmaz; işleyicinin kendi hatası korunur', async () => {
    const yakalanmayanlar: unknown[] = [];
    const dinle = (hata: unknown): void => { yakalanmayanlar.push(hata); };
    process.on('unhandledRejection', dinle);
    try {
      await assert.rejects(
        acik().tx(async (db) => {
          void db.sorgu('SELECT 1 / 0');
          return Promise.resolve();
        }),
        /beklenmemiş sorgu bıraktı/,
      );
      await assert.rejects(
        acik().tx(async (db) => {
          void db.sorgu('SELECT 1 / 0');
          return Promise.reject(new Error('iş kuralı reddetti'));
        }),
        /iş kuralı reddetti/,
      );
      // Yakalanmamış ret, sözün reddinden sonraki turda bildirilir.
      await new Promise((coz) => { setTimeout(coz, 20); });
      assert.deepEqual(yakalanmayanlar, []);
    } finally {
      process.off('unhandledRejection', dinle);
    }
    assert.equal((await acik().tek<{ n: number }>('SELECT 1 AS n'))?.n, 1);
  });

  test('işleyici SQL hatasını yutup normal dönerse tx başarı bildirmez: reddeder, yazı kalıcı olmaz', async () => {
    await assert.rejects(
      acik().tx(async (db) => {
        await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [69, 'yutulan']);
        await db.sorgu('SELECT 1 / 0').catch(() => undefined);
      }),
      /iptal durumundaydı/,
    );
    assert.equal(await kalemSayisi(69), 0);

    await acik().tx(async (db) => { await db.sorgu('INSERT INTO kalem (id, ad) VALUES ($1, $2)', [70, 'sağlam']); });
    assert.equal(await kalemSayisi(70), 1);
    await acik().sorgu('DELETE FROM kalem WHERE id = 70');
  });

  test('tek: satır yoksa null, birden fazla satırda hata', async () => {
    assert.equal(await acik().tek('SELECT id FROM kalem WHERE id = $1', [999]), null);
    await assert.rejects(acik().tek('SELECT generate_series(1, 2) AS n'), /birden fazla satır/);
  });

  test('uygulama kimliği doğrulaması: uygulama kullanıcısı geçer; tabloların sahibi ve olmayan şema reddedilir', async () => {
    const RED = /şemayı değiştirebilen kullanıcıyla açılamaz/;
    await uygulamaKimliginiDogrula(acik());
    assert.deepEqual(await acik().tek('SELECT current_user::text AS ad'), { ad: ayar.pg.kullanici });
    if (!sahip) throw new Error('Sahip bağlantısı açılamadı.');
    await assert.rejects(uygulamaKimliginiDogrula(sahip), RED);

    const semasiz = veritabaniAc(ayar, { sema: 't_olmayan_sema' });
    try {
      assert.deepEqual(await semasiz.tek('SELECT current_schema() AS sema'), { sema: null });
      await assert.rejects(uygulamaKimliginiDogrula(semasiz), RED);
    } finally {
      await semasiz.kapat();
    }
  });

  test('uygulama kimliği doğrulaması üç olguya ayrı ayrı bakar: tablo açma hakkı, tablo sahipliği, şema sahipliği', async () => {
    const RED = /şemayı değiştirebilen kullanıcıyla açılamaz/;
    const yeni = await testSemasiAc('db_kimlik');
    const rol = (ad: string): string => `"${ad.replaceAll('"', '""')}"`;
    const uygulama = rol(yeni.ayar.pg.kullanici);
    const acabilir = (kim: Veritabani): Promise<unknown> => kim.tek("SELECT has_schema_privilege(current_schema(), 'CREATE') AS acar");
    try {
      await yeni.sahip.sorgu('CREATE TABLE kalem (id int)');
      await uygulamaKimliginiDogrula(yeni.vt);

      // Yalnız tablo açma hakkı: uygulama kullanıcısı hiçbir şeyin sahibi değildir.
      await yeni.sahip.sorgu(`GRANT CREATE ON SCHEMA ${yeni.sema} TO ${uygulama}`);
      await assert.rejects(uygulamaKimliginiDogrula(yeni.vt), RED);

      // Yalnız tablo sahipliği: hak geri alınır, açtığı tablo kalır; sahibi onu düşürebilir ve değiştirebilir.
      await yeni.vt.sorgu('CREATE TABLE uygulamanin (id int)');
      await yeni.sahip.sorgu(`REVOKE CREATE ON SCHEMA ${yeni.sema} FROM ${uygulama}`);
      assert.deepEqual(await acabilir(yeni.vt), { acar: false });
      await assert.rejects(uygulamaKimliginiDogrula(yeni.vt), RED);
      await yeni.sahip.sorgu('DROP TABLE uygulamanin');
      await uygulamaKimliginiDogrula(yeni.vt);

      // Yalnız şema sahipliği: sahip kendi hakkını bırakır, şemada tablo kalmaz; şemayı yine düşürebilir.
      await yeni.sahip.sorgu(`REVOKE CREATE ON SCHEMA ${yeni.sema} FROM ${rol(yeni.ayar.goc.kullanici)}`);
      await yeni.sahip.sorgu('DROP TABLE kalem');
      assert.deepEqual(await acabilir(yeni.sahip), { acar: false });
      await assert.rejects(uygulamaKimliginiDogrula(yeni.sahip), RED);
    } finally {
      await yeni.kaldir();
    }
  });

  test('uygulama havuzu açılışı: uygulama kimliğiyle açılır; sahip kimliğiyle ya da göç kimliği süreçteyken açılmaz', async () => {
    const havuz = await uygulamaHavuzuAc(ayar, { sema }, {});
    try {
      assert.deepEqual(await havuz.tek('SELECT current_user::text AS ad'), { ad: ayar.pg.kullanici });
    } finally {
      await havuz.kapat();
    }
    await assert.rejects(uygulamaHavuzuAc({ pg: { ...ayar.pg, ...ayar.goc } }, { sema }, {}), /şemayı değiştirebilen kullanıcıyla açılamaz/);
    for (const ad of ['TMIV2_PG_GOC_USER', 'TMIV2_PG_GOC_PASSWORD']) {
      await assert.rejects(uygulamaHavuzuAc(ayar, { sema }, { [ad]: 'x' }), /Göç kimliği bu süreçte tanımlı \(TMIV2_PG_GOC_USER, TMIV2_PG_GOC_PASSWORD\)/, ad);
    }
  });

  test('geçersiz şema adı reddedilir', () => {
    assert.throws(() => veritabaniAc(ayar, { sema: 'x; DROP SCHEMA public' }), /Geçersiz şema adı/);
  });
});
