import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yedekAnahtariCoz } from '../sunucu/moduller/ayarlar/kurallar.ts';
import { yedekAl, yedekOrtamiOku, yedekSifresiniCoz } from '../sunucu/moduller/ayarlar/yedek.ts';
import type { YedekOrtami } from '../sunucu/moduller/ayarlar/yedek.ts';
import {
  DIS_KOPYA_KAYDI_DOSYASI, DIS_KOPYA_KLASORU, disKopyaAc, disKopyaKaydiEkle, disKopyaAl, gerekenWallar, geriYuklemeEngeli, sonTabanYedek, tabanBaslangicWal, uygulamaOturumuSay, yedekKlasoru,
} from './yedek.ts';

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

// Şifreli dış kopya (2290): sahte taban yedek ve WAL arşiviyle; PostgreSQL gerekmez. Gerçek pg_basebackup ve zaman noktasına
// dönüş tatbikatı kurulum/yedek.md'dedir.
describe('WAL arşivi ve taban yedeğin şifreli dış kopyası', () => {
  const W = (n: number, zc = 1): string => `${zc.toString(16).toUpperCase().padStart(8, '0')}00000000${n.toString(16).toUpperCase().padStart(8, '0')}`;
  const etiket = (dosya: string): string => `START WAL LOCATION: 0/2000028 (file ${dosya})\nCHECKPOINT LOCATION: 0/2000060\nBACKUP METHOD: streamed\n`;
  let kok = '';
  const anahtar = randomBytes(32);

  const tabanYaz = async (ad: string, baslangic: string, manifest = true): Promise<void> => {
    const yol = path.join(kok, 'taban', ad);
    await mkdir(path.join(yol, 'base', '1'), { recursive: true });
    await mkdir(path.join(yol, 'pg_notify'), { recursive: true });
    await writeFile(path.join(yol, 'backup_label'), etiket(baslangic));
    await writeFile(path.join(yol, 'base', '1', '1259'), `DUZ-VERI-${ad}`);
    await writeFile(path.join(yol, 'PG_VERSION'), '18\n');
    if (manifest) await writeFile(path.join(yol, 'backup_manifest'), '{}');
  };

  before(async () => {
    kok = await mkdtemp(path.join(tmpdir(), 'tmiv2-dis-kopya-'));
    await mkdir(path.join(kok, 'wal'), { recursive: true });
    await mkdir(path.join(kok, 'disk'), { recursive: true });
    for (const n of [1, 2, 3, 4]) await writeFile(path.join(kok, 'wal', W(n)), `DUZ-WAL-${String(n)}`);
    await writeFile(path.join(kok, 'wal', `${W(2)}.00000028.backup`), 'START WAL LOCATION');
    await writeFile(path.join(kok, 'wal', '00000002.history'), '1\t0/3000000\tbefore 2026-11-08\n');
    await writeFile(path.join(kok, 'wal', `${W(5)}.partial`), 'yarim');
    await tabanYaz('20261101', W(2));
    await tabanYaz('20261108', W(4), false);
  });
  after(async () => { if (kok !== '') await rm(kok, { recursive: true, force: true }); });

  const tumDosyalar = async (dizin: string): Promise<string[]> =>
    (await readdir(dizin, { recursive: true, withFileTypes: true })).filter((g) => g.isFile()).map((g) => path.join(g.parentPath, g.name));

  test('backup_label başlangıç dosyasını verir; gereken WAL başlangıçtan sonrası ve zaman çizgisi dosyalarıdır', () => {
    assert.equal(tabanBaslangicWal(etiket(W(2))), W(2));
    assert.equal(tabanBaslangicWal('START WAL LOCATION: 0/2 (file bozuk)\n'), null);
    const adlar = [W(1), W(2), `${W(2)}.00000028.backup`, W(3), '00000002.history', `${W(5)}.partial`, W(1, 2), 'notlar.txt'];
    assert.deepEqual(gerekenWallar(adlar, W(2)), ['00000002.history', W(2), `${W(2)}.00000028.backup`, W(3), W(1, 2)].sort());
  });

  test('en yeni tamamlanmış taban seçilir; manifest yazılmamış (süren) yedek atlanır', async () => {
    const t = await sonTabanYedek(path.join(kok, 'taban'));
    assert.equal(t.ad, '20261101');
    assert.equal(t.baslangic, W(2));
  });

  test('dış kopya her dosyayı şifreli yazar, boş klasörü korur, gerekmeyen WAL ve yarım dosyayı almaz', async () => {
    const s = await disKopyaAl(anahtar, { wal: path.join(kok, 'wal'), taban: path.join(kok, 'taban') }, path.join(kok, 'disk'));
    assert.deepEqual({ taban: s.taban, tabanDosyasi: s.tabanDosyasi, walAdet: s.walAdet, walYazilan: s.walYazilan, silinen: s.silinen },
      { taban: '20261101', tabanDosyasi: 4, walAdet: 5, walYazilan: 5, silinen: 0 });
    assert.ok(s.tabanBayt > 0 && s.walBayt > 0);
    const dk = path.join(kok, 'disk', DIS_KOPYA_KLASORU);
    assert.deepEqual((await readdir(path.join(dk, 'wal'))).sort(), ['00000002.history', W(2), `${W(2)}.00000028.backup`, W(3), W(4)].sort());
    assert.ok(existsSync(path.join(dk, 'taban', '20261101', 'pg_notify')));
    for (const dosya of await tumDosyalar(dk)) {
      if (path.basename(dosya) === '.tamam') continue;
      const icerik = await readFile(dosya);
      assert.equal(icerik.subarray(0, 8).toString('ascii'), 'TMIV2Y1\n', dosya);
      assert.ok(!icerik.includes(Buffer.from('DUZ-')), `düz içerik diske düştü: ${dosya}`);
    }
  });

  test('ikinci çalıştırma yalnız yeni WAL yazar; yeni taban tamamlanınca eski takım diskten silinir', async () => {
    const hedef = path.join(kok, 'disk');
    const kaynak = { wal: path.join(kok, 'wal'), taban: path.join(kok, 'taban') };
    await writeFile(path.join(kok, 'wal', W(6)), 'DUZ-WAL-6');
    const ikinci = await disKopyaAl(anahtar, kaynak, hedef);
    assert.deepEqual({ zatenVar: ikinci.tabanZatenVar, yazilan: ikinci.walYazilan, var: ikinci.walZatenVar }, { zatenVar: true, yazilan: 1, var: 5 });
    await writeFile(path.join(kok, 'taban', '20261108', 'backup_manifest'), '{}');
    const ucuncu = await disKopyaAl(anahtar, kaynak, hedef);
    const dk = path.join(hedef, DIS_KOPYA_KLASORU);
    assert.equal(ucuncu.taban, '20261108');
    assert.deepEqual(await readdir(path.join(dk, 'taban')), ['20261108']);
    assert.deepEqual((await readdir(path.join(dk, 'wal'))).sort(), ['00000002.history', W(4), W(6)].sort());
  });

  test('açma, diskteki takımı düz veri ve WAL klasörüne aynen geri yazar', async () => {
    const hedef = path.join(kok, 'geri');
    const s = await disKopyaAc(anahtar, path.join(kok, 'disk'), hedef);
    assert.equal(s.taban, '20261108');
    assert.equal(await readFile(path.join(s.veriKlasoru, 'base', '1', '1259'), 'utf8'), 'DUZ-VERI-20261108');
    assert.ok(existsSync(path.join(s.veriKlasoru, 'pg_notify')));
    assert.ok(!existsSync(path.join(s.veriKlasoru, '.tamam')));
    assert.equal(await readFile(path.join(s.walKlasoru, W(6)), 'utf8'), 'DUZ-WAL-6');
  });

  test('sunucunun okuduğu kayıt satır satır eklenir; dosya adı ve veri içeriği taşımaz', async () => {
    const dizin = path.join(kok, 'yedek-klasoru');
    const kayit = {
      zaman: '2026-11-08T05:30:00.000Z', sonuc: 'basarili' as const, hedef: 'F:\\', taban: '20261108', tabanBayt: 10, walAdet: 3, walBayt: 48, hata: null,
    };
    const dosya = await disKopyaKaydiEkle(dizin, kayit);
    await disKopyaKaydiEkle(dizin, { ...kayit, sonuc: 'basarisiz', taban: null, tabanBayt: null, walAdet: null, walBayt: null, hata: 'disk yok' });
    assert.equal(path.basename(dosya), DIS_KOPYA_KAYDI_DOSYASI);
    const satirlar = (await readFile(dosya, 'utf8')).trim().split('\n').map((x) => JSON.parse(x) as unknown);
    assert.deepEqual(satirlar[0], kayit);
    assert.equal((satirlar[1] as { sonuc: string }).sonuc, 'basarisiz');
  });

  test('reddedilen: yanlış anahtar, dolu hedef, tamamlanmış taban yok, arşivde başlangıç dosyası yok', async () => {
    await assert.rejects(disKopyaAc(randomBytes(32), path.join(kok, 'disk'), path.join(kok, 'yanlis')), /anahtar uymuyor ya da dosya bozuk/);
    await assert.rejects(disKopyaAc(anahtar, path.join(kok, 'disk'), path.join(kok, 'geri')), /boş değil/);
    await assert.rejects(disKopyaAc(anahtar, path.join(kok, 'wal'), path.join(kok, 'bos')), /tamamlanmış taban yedek yok/);
    const bosTaban = path.join(kok, 'bos-taban');
    await mkdir(bosTaban);
    await assert.rejects(disKopyaAl(anahtar, { wal: path.join(kok, 'wal'), taban: bosTaban }, path.join(kok, 'disk')), /Tamamlanmış taban yedek yok/);
    await rm(path.join(kok, 'wal', W(4)));
    await assert.rejects(disKopyaAl(anahtar, { wal: path.join(kok, 'wal'), taban: path.join(kok, 'taban') }, path.join(kok, 'disk')), /başlangıç dosyası yok/);
  });
});
