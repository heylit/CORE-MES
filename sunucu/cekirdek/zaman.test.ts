import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { tarihSemasi, zamanSemasi } from '#paylasilan/zaman.ts';
import type { Db } from './db.ts';
import { testSemasiAc } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { zamanMetni } from './zaman.ts';

interface Satir { id: number; an: string | null; gun: string | null }

// Kış ve yaz saatinde aynı UTC saati; üçüncü satır mikrosaniye taşır, dördüncü boştur.
const KIS = '2026-01-15T12:00:00Z';
const YAZ = '2026-07-15T12:00:00Z';

describe('zaman ve tarih çıktısı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  // Oturumun saat dilimi yalnız bu transaction için değişir.
  const dilimde = <T>(dilim: string, is: (db: Db) => Promise<T>): Promise<T> =>
    vt().tx(async (db) => {
      await db.sorgu(`SET LOCAL TIME ZONE '${dilim}'`);
      return is(db);
    });

  const satirlar = (db: Db): Promise<Satir[]> =>
    db.sorgu<Satir>(`SELECT id, ${zamanMetni('k.an')} AS an, k.gun FROM zaman_kalem k ORDER BY id`);

  before(async () => {
    ortam = await testSemasiAc('zaman');
    await ortam.sahip.sorgu('CREATE TABLE zaman_kalem (id int PRIMARY KEY, an timestamptz, gun date)');
    await ortam.sahip.sorgu(
      `INSERT INTO zaman_kalem (id, an, gun) VALUES
         (1, $1, '2026-01-15'), (2, $2, '2026-03-29'), (3, '2026-10-07T21:30:00.123456+00', '2026-12-31'), (4, NULL, NULL)`,
      [KIS, YAZ],
    );
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('zaman saat dilimi bilgili ISO metni döner; saat farkı oturumun saat dilimini ve yaz/kış saatini izler, an değişmez', async () => {
    const berlin = await dilimde('Europe/Berlin', satirlar);
    assert.equal(berlin[0]?.an, '2026-01-15T13:00:00+01:00');
    assert.equal(berlin[1]?.an, '2026-07-15T14:00:00+02:00');

    const utc = await dilimde('UTC', satirlar);
    assert.equal(utc[0]?.an, '2026-01-15T12:00:00+00:00');
    assert.equal(utc[1]?.an, '2026-07-15T12:00:00+00:00');

    const yarimSaat = await dilimde('Asia/Kolkata', satirlar);
    assert.equal(yarimSaat[1]?.an, '2026-07-15T17:30:00+05:30');

    for (const liste of [berlin, utc, yarimSaat]) {
      assert.equal(new Date(zamanSemasi.parse(liste[0]?.an)).toISOString(), '2026-01-15T12:00:00.000Z');
      assert.equal(new Date(zamanSemasi.parse(liste[1]?.an)).toISOString(), '2026-07-15T12:00:00.000Z');
    }
  });

  test('zaman mikrosaniyeyi yitirmez, gün sınırını saat dilimiyle birlikte taşır; boş zaman null kalır', async () => {
    const istanbul = await dilimde('Europe/Istanbul', satirlar);
    assert.equal(istanbul[2]?.an, '2026-10-08T00:30:00.123456+03:00');
    assert.equal(zamanSemasi.safeParse(istanbul[2]?.an).success, true);
    assert.equal(istanbul[3]?.an, null);
  });

  test('veritabanının sonlu her zaman çıktısı zaman şemasından geçer (eski yılın saniyeli saat farkı, beş basamaklı yıl, milattan önce); sonsuz değer geçmez', async () => {
    const cikti = (deger: string): Promise<string | undefined> =>
      dilimde('Europe/Istanbul', async (db) => (await db.tek<{ an: string }>(`SELECT ${zamanMetni('$1::timestamptz')} AS an`, [deger]))?.an);
    assert.equal(await cikti('1900-06-01 12:00:00+00'), '1900-06-01T13:56:56+01:56:56');
    assert.equal(await cikti('10000-06-01 12:00:00+00'), '10000-06-01T15:00:00+03:00');
    assert.equal(await cikti('0044-03-15 12:00:00+00 BC'), '0044-03-15T13:55:52+01:55:52 BC');
    for (const deger of ['1900-06-01 12:00:00+00', '10000-06-01 12:00:00+00', '0044-03-15 12:00:00+00 BC', '294276-12-31 23:59:59.999999+00', '4713-01-01 00:00:00+00 BC', '0001-01-01 00:00:00+00']) {
      const an = await cikti(deger);
      assert.equal(zamanSemasi.safeParse(an).success, true, `${deger} -> ${String(an)}`);
    }
    for (const deger of ['infinity', '-infinity']) {
      assert.equal(await cikti(deger), deger);
      assert.equal(zamanSemasi.safeParse(deger).success, false, deger);
    }
  });

  test('veritabanı 0000 yılını tarih olarak kabul etmez; tarih şeması da etmez, 0001 yılını ikisi de eder', async () => {
    await assert.rejects(vt().tek("SELECT '0000-01-01'::date AS gun"), (hata: { code?: string }) => hata.code === '22008');
    assert.equal(tarihSemasi.safeParse('0000-01-01').success, false);
    const ilk = await vt().tek<{ gun: string }>("SELECT '0001-01-01'::date AS gun");
    assert.equal(tarihSemasi.parse(ilk?.gun), '0001-01-01');
  });

  test('sarılmamış zaman sütunu metin değildir ve zaman şemasından geçmez; düz metne çevrilen de geçmez', async () => {
    const ham = await vt().tek<{ an: unknown; duz: string }>('SELECT an, an::text AS duz FROM zaman_kalem WHERE id = 1');
    assert.notEqual(typeof ham?.an, 'string');
    assert.equal(zamanSemasi.safeParse(ham?.an).success, false);
    assert.equal(zamanSemasi.safeParse(ham?.duz).success, false);
  });

  test('json nesnesi içindeki zaman ve tarih sarılmadan aynı biçimde çıkar', async () => {
    const satir = await dilimde('Europe/Berlin', (db) =>
      db.tek<{ ic: { an: string; gun: string }; an: string }>(
        `SELECT json_build_object('an', k.an, 'gun', k.gun) AS ic, ${zamanMetni('k.an')} AS an FROM zaman_kalem k WHERE id = 2`,
      ));
    assert.equal(satir?.ic.an, '2026-07-15T14:00:00+02:00');
    assert.equal(satir?.ic.an, satir?.an);
    assert.equal(satir?.ic.gun, '2026-03-29');
  });

  test('tarih GGGG-AA-GG metni döner; oturumun saat dilimi günü kaydırmaz', async () => {
    // İlki UTC'nin 14 saat ilerisinde, ikincisi 8 saat gerisinde; 29 Mart Avrupa'da saatlerin ileri alındığı gündür.
    for (const dilim of ['Pacific/Kiritimati', 'America/Los_Angeles', 'Europe/Berlin', 'UTC']) {
      const liste = await dilimde(dilim, satirlar);
      assert.deepEqual(liste.map((s) => s.gun), ['2026-01-15', '2026-03-29', '2026-12-31', null], dilim);
      for (const s of liste.slice(0, 3)) assert.equal(tarihSemasi.parse(s.gun), s.gun, dilim);
    }
  });

  test('zamandan türetilen tarih oturumun saat dilimindeki gündür; tarih sütununun kendisi değişmez', async () => {
    const gunler = (dilim: string): Promise<{ turetilen: string; sutun: string } | null> =>
      dilimde(dilim, (db) => db.tek('SELECT (an AT TIME ZONE current_setting(\'TimeZone\'))::date AS turetilen, gun AS sutun FROM zaman_kalem WHERE id = 3'));
    assert.deepEqual(await gunler('UTC'), { turetilen: '2026-10-07', sutun: '2026-12-31' });
    assert.deepEqual(await gunler('Europe/Istanbul'), { turetilen: '2026-10-08', sutun: '2026-12-31' });
  });
});
