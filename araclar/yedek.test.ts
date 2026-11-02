import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yedekAnahtariCoz } from '../sunucu/moduller/ayarlar/kurallar.ts';
import { yedekAl, yedekOrtamiOku, yedekSifresiniCoz } from '../sunucu/moduller/ayarlar/yedek.ts';
import type { YedekOrtami } from '../sunucu/moduller/ayarlar/yedek.ts';
import { geriYuklemeEngeli, uygulamaOturumuSay, yedekKlasoru } from './yedek.ts';

test('yedek klasörü seçilmediyse deponun yanına düşer, içine değil; seçildiyse o kullanılır', () => {
  const depo = path.resolve('/kullanici/Desktop/TMICOREV2');
  const varsayilan = yedekKlasoru({}, depo);
  assert.equal(varsayilan, path.resolve('/kullanici/Desktop/TMIV2-YEDEK'));
  assert.ok(!varsayilan.startsWith(depo + path.sep));
  assert.equal(yedekKlasoru({ TMIV2_YEDEK_DIZINI: ' D:\\YEDEK ' }, depo), 'D:\\YEDEK');
  assert.equal(yedekKlasoru({ TMIV2_YEDEK_DIZINI: '  ' }, depo), varsayilan);
});

describe('geri yükleme sunucu açıkken durur (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  before(async () => { ortam = await testVeritabaniKur('yedek_oturum'); });
  after(async () => { await ortam?.kaldir(); });

  test('uygulama kullanıcısının açık oturumu sayılır; olmayan kullanıcıda sıfırdır', async () => {
    await acik().vt.tek('SELECT 1 AS bir');
    assert.ok((await uygulamaOturumuSay(acik().sahip, acik().ayar.pg.kullanici)) >= 1);
    assert.equal(await uygulamaOturumuSay(acik().sahip, 'boyle_bir_kullanici_yok'), 0);
  });

  test('açık oturum varsa geri yükleme iletiyle durur; yoksa sürer', () => {
    assert.match(geriYuklemeEngeli(2) ?? '', /Sunucu açık.*2 bağlantı.*kapatıp/);
    assert.equal(geriYuklemeEngeli(0), null);
  });
});

// `npm run yedek`, gece yedeği ve güncelleyicinin ön yedeği aynı işlevle, uygulama kullanıcısıyla alınır. pg_dump gerçektir ve
// yalnız bu koşunun şemasını alır (paralel test şemaları yedeğe girmez); şemada bütün göçler uygulanmıştır.
describe('yedek uygulama kullanıcısıyla gerçek pg_dump ile alınır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let dizin = '';
  let yedekOrtami: YedekOrtami | undefined;
  let surumEngeli: string | null = null;
  const anahtar = randomBytes(32);
  const acik = (): { ortam: TestVeritabani; yedekOrtami: YedekOrtami } => {
    if (!ortam || !yedekOrtami) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return { ortam, yedekOrtami };
  };

  before(async () => {
    ortam = await testVeritabaniKur('yedek_gercek');
    dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-yedek-'));
    const okunan = yedekOrtamiOku({ ...process.env, TMIV2_YEDEK_ANAHTARI: anahtar.toString('base64') });
    yedekOrtami = {
      ...okunan,
      dizin,
      pg: { ...okunan.pg, veritabani: ortam.ayar.pg.veritabani },
      pgDump: { dosya: okunan.pgDump.dosya, onEk: [`--schema=${ortam.sema}`] },
      anahtar: yedekAnahtariCoz(anahtar.toString('base64')),
    };
    // pg_dump sunucudan eski olamaz. Windows işinde PostgreSQL ve pg_dump aynı kurulumdandır ve orada atlanan test kırmızıdır;
    // Linux çalıştırıcısının istemci sürümü test veritabanı sunucusundan eski olabilir.
    const sunucu = Math.floor(Number((await ortam.sahip.tek<{ v: string }>('SELECT current_setting(\'server_version_num\') AS v'))?.v) / 10000);
    const istemci = Number(/(\d+)(?:\.\d+)?/.exec(execFileSync(okunan.pgDump.dosya, ['--version'], { encoding: 'utf8' }))?.[1]);
    if (process.platform !== 'win32' && istemci < sunucu) surumEngeli = `pg_dump ${String(istemci)} sunucu ${String(sunucu)}'den eski`;
  });
  after(async () => {
    await ortam?.kaldir();
    if (dizin !== '') await rm(dizin, { recursive: true, force: true });
  });

  const bosYerBilinmiyor = async (): Promise<null> => null;

  test('yedek alınır, şifresi çözülür; içinde ara toplam tablosu dahil şemanın tabloları vardır', async (t) => {
    if (surumEngeli !== null) { t.skip(surumEngeli); return; }
    const { yedekOrtami: yo } = acik();
    const dosya = await yedekAl(yo, dizin, 'elle', new Date(), bosYerBilinmiyor);
    const duz = path.join(dizin, 'duz.dump');
    await yedekSifresiniCoz(anahtar, path.join(dizin, dosya.ad), duz);
    const icerik = await readFile(duz);
    await rm(duz);
    assert.equal(icerik.subarray(0, 5).toString('latin1'), 'PGDMP');
    for (const tablo of ['stok_bakiye_defter_bekleyen', 'stok_bakiye', 'goc_kaydi']) assert.ok(icerik.includes(Buffer.from(tablo)), tablo);
  });

  test('uygulama kullanıcısının okuyamadığı tek tablo yedeği düşürür; yarım dosya kalmaz', async (t) => {
    if (surumEngeli !== null) { t.skip(surumEngeli); return; }
    const { ortam: o, yedekOrtami: yo } = acik();
    const rol = `"${o.ayar.pg.kullanici.replaceAll('"', '""')}"`;
    const once = await readdir(dizin);
    await o.sahip.sorgu(`REVOKE SELECT ON stok_bakiye_defter_bekleyen FROM ${rol}`);
    try {
      await assert.rejects(yedekAl(yo, dizin, 'elle', new Date(Date.now() + 1000), bosYerBilinmiyor), /permission denied for table stok_bakiye_defter_bekleyen/);
    } finally {
      await o.sahip.sorgu(`GRANT SELECT ON stok_bakiye_defter_bekleyen TO ${rol}`);
    }
    assert.deepEqual(await readdir(dizin), once);
  });
});
