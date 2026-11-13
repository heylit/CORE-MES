import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  anaDalYamaKimlikleri, dayanakDurumu, denemeOrtami, initdbArgumanlari, istemciSarmalayicisi, pgBinBul, sarmalayiciyaYonelt, sonucMetni, sonucOku, testPlani, istemciyeBakanSunucuTestleri, kararDosyalari, kisaYolKarari, veritabanisizMi, VT_ISTEMCI_YAPILANDIRMASI, vtDenetle, yamaKimlikleri,
} from './teslim-vt.ts';

const SHA = 'a'.repeat(64);

test('sonuç dosyası yazılan biçimle geri okunur; başlıksız metin null', () => {
  const metin = sonucMetni({ pg: 16, yamalar: [SHA, 'b'.repeat(64)], gecti: true }, ['satır']);
  assert.deepEqual(sonucOku(metin), { pg: 16, yamalar: [SHA, 'b'.repeat(64)], gecti: true });
  assert.deepEqual(sonucOku(sonucMetni({ pg: null, yamalar: [], gecti: false }, [])), { pg: null, yamalar: [], gecti: false });
  assert.equal(sonucOku('# başlıksız'), null);
});

test('vtDenetle: PG18 ve aynı yamalarla geçen deneme bulgu vermez', () => {
  assert.deepEqual(vtDenetle({ pg: 18, yamalar: [SHA], gecti: true }, [SHA]), []);
  assert.deepEqual(vtDenetle({ pg: 18, yamalar: [SHA, 'c'.repeat(64)], gecti: true }, [SHA]).map((b) => b.duzey), ['kirmizi']);
  assert.deepEqual(vtDenetle({ pg: null, yamalar: [SHA], gecti: true }, [SHA]).map((b) => b.etiket), ['vt-pg']);
});

test('pgBinBul: verilen klasör önce; yoksa en yeni sürüm; initdb yoksa atlanır', () => {
  const surumler: Record<string, string> = {
    '/usr/lib/postgresql/18/bin/initdb': 'initdb (PostgreSQL) 18.1',
    '/usr/lib/postgresql/16/bin/initdb': 'initdb (PostgreSQL) 16.10',
    '/opt/pg/bin/initdb': 'initdb (PostgreSQL) 17.2',
  };
  const oku = (y: string): string[] => (y === '/usr/lib/postgresql' ? ['16', '18', 'notlar'] : []);
  const varMi = (y: string): boolean => y in surumler;
  const surumOku = (y: string): string => surumler[y] ?? '';
  assert.deepEqual(pgBinBul({}, 'linux', oku, varMi, surumOku), { bin: '/usr/lib/postgresql/18/bin', ana: 18 });
  assert.deepEqual(pgBinBul({ TMIV2_TESLIM_PG_BIN: '/opt/pg/bin' }, 'linux', oku, varMi, surumOku), { bin: '/opt/pg/bin', ana: 17 });
  assert.equal(pgBinBul({ TMIV2_TESLIM_PG_BIN: '/yok/bin' }, 'linux', oku, varMi, surumOku), null);
  assert.deepEqual(pgBinBul({}, 'linux', oku, (y) => y.includes('/16/'), surumOku), { bin: '/usr/lib/postgresql/16/bin', ana: 16 });
  assert.equal(pgBinBul({}, 'linux', () => [], varMi, surumOku), null);
});

test('testPlani: modül iki tarafı, çekirdek, paylaşılan ve aracın yanındaki test; göç ve belge test eklemez', () => {
  const var_ = new Set(['sunucu/moduller/stok', 'istemci/src/moduller/stok', 'araclar/teslim-vt.test.ts']);
  const plan = testPlani([
    'sunucu/moduller/stok/servis.ts', 'istemci/src/moduller/stok/Sayfa.tsx', 'sunucu/cekirdek/db.ts', 'paylasilan/tarih.ts',
    'araclar/teslim-vt.ts', 'araclar/olmayan.ts', 'sunucu/gocler/20261108120000_x.sql', 'kurulum/devir.md',
  ], (y) => var_.has(y));
  assert.deepEqual(plan.map((a) => a.ad), [
    'test:modul stok (sunucu)', 'test:modul stok (istemci)', 'çekirdek testleri', 'paylaşılan testleri', 'araclar/teslim-vt.test.ts',
  ]);
  assert.deepEqual(testPlani(['sunucu/gocler/20261108120000_x.sql'], () => true), []);
});

test('denemeOrtami: yazarın TMIV2_ ve PG değişkenleri geçmez; port denemenin kümesidir', () => {
  const o = denemeOrtami(6543, { PATH: '/bin', TMIV2_PG_DATABASE: 'gercek', TMIV2_YEDEK_ANAHTARI: 'x', PGPASSWORD: 'p', tmiv2_port: '1' });
  assert.equal(o['PATH'], '/bin');
  assert.equal(o['TMIV2_PG_PORT'], '6543');
  assert.equal(o['TMIV2_PG_DATABASE'], 'tmiv2');
  assert.equal(o['TMIV2_YEDEK_ANAHTARI'], undefined);
  assert.equal(o['PGPASSWORD'], undefined);
  assert.equal(o['tmiv2_port'], undefined);
});

test('istemci testi klondaki sarmalayıcı yapılandırmayla koşar; izinli yollar kaçışlı yazılır', () => {
  const plan = testPlani(['istemci/src/moduller/stok/Sayfa.tsx'], () => true).find((a) => a.ad.endsWith('(istemci)'));
  assert.ok(plan);
  const argv = sarmalayiciyaYonelt(plan.argv);
  assert.equal(argv[argv.indexOf('--config') + 1], VT_ISTEMCI_YAPILANDIRMASI);
  assert.equal(argv.length, plan.argv.length);
  assert.deepEqual(sarmalayiciyaYonelt(['node', 'istemci/vite.config.ts']), ['node', 'istemci/vite.config.ts']);
  const metin = istemciSarmalayicisi(['/k/agac', 'C:\\a\\node_modules']);
  assert.match(metin, /^import taban from '\.\/vite\.config\.ts';$/m);
  assert.ok(metin.includes(JSON.stringify(['/k/agac', 'C:\\a\\node_modules'])));
});

test('initdbArgumanlari (2457): Linux ve macOS kümesi C.UTF-8 ile açılır, Windows sistem yerel ayarıyla', () => {
  // Yerel ayarsız küme kabuğun LANG'ından C olur; C'de lower('Ç') = 'Ç' ve Türkçe harf tekillik testleri (VRD-7) yanlış kırmızı verir.
  const temel = ['-D', '/k/veri', '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-instructions'];
  assert.deepEqual(initdbArgumanlari('/k/veri', 'linux'), [...temel, '--locale=C.UTF-8']);
  assert.deepEqual(initdbArgumanlari('/k/veri', 'darwin'), [...temel, '--locale=C.UTF-8']);
  assert.deepEqual(initdbArgumanlari('/k/veri', 'win32'), temel);
});

test('dayanak (3046 a): sonuç dosyasına yazılır ve okunur; dayanılan teslim değişince ya da deneme dayanaksız koştuysa kırmızı', () => {
  const s = { pg: 18, yamalar: ['a'.repeat(64)], gecti: true, dayanak: ['b'.repeat(64)] };
  assert.deepEqual(sonucOku(sonucMetni(s, [])), s);
  assert.deepEqual(vtDenetle(s, ['a'.repeat(64)], ['b'.repeat(64)]), []);
  assert.deepEqual(vtDenetle(s, ['a'.repeat(64)], ['c'.repeat(64)]).map((b) => b.etiket), ['vt-dayanak']);
  const dayanaksiz = { pg: 18, yamalar: ['a'.repeat(64)], gecti: true };
  assert.deepEqual(vtDenetle(dayanaksiz, ['a'.repeat(64)], ['b'.repeat(64)]).map((b) => b.etiket), ['vt-dayanak']);
  assert.deepEqual(vtDenetle(dayanaksiz, ['a'.repeat(64)]), []);
  // Dayanılan teslimden yama çıkarıldıysa da yeniden koşulur.
  assert.deepEqual(vtDenetle({ ...s, dayanak: ['b'.repeat(64), 'c'.repeat(64)] }, ['a'.repeat(64)], ['b'.repeat(64)]).map((b) => b.etiket), ['vt-dayanak']);
  assert.ok(!sonucMetni(dayanaksiz, []).includes('dayanak:'), 'dayanaksız teslimde satır yazılmaz');
});

test('dayanakDurumu: bütün yamalar ana dalda ise birleşmiş, hiçbiri değilse birleşmemiş, bir kısmı ise kısmen', () => {
  const ana = new Set(['p1', 'p2']);
  assert.equal(dayanakDurumu([['p1'], ['p2']], ana), 'birlesmis');
  assert.equal(dayanakDurumu([['p3'], ['p4']], ana), 'birlesmemis');
  assert.equal(dayanakDurumu([['p1'], ['p4']], ana), 'kismen');
  // Kimliği çıkarılamayan yama birleşmiş sayılmaz.
  assert.equal(dayanakDurumu([[]], ana), 'birlesmemis');
  assert.equal(dayanakDurumu([], ana), 'birlesmemis');
});

test('patch-id: ana dal birleşen yamanın satırlarını sonradan değiştirse de yama birleşmiş tanınır (ters uygulama tanımaz)', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'core-vt-patchid-'));
  try {
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: kok, encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    writeFileSync(join(kok, 'a.txt'), 'bir\niki\nuc\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'ilk');
    writeFileSync(join(kok, 'a.txt'), 'bir\nIKI\nuc\n');
    git('commit', '-q', '-am', 'dayanak');
    const yama = git('format-patch', '-1', '--stdout', 'HEAD');
    writeFileSync(join(kok, 'a.txt'), 'bir\nsonra\nuc\n');
    git('commit', '-q', '-am', 'ana dal ayni satiri degistirdi');
    writeFileSync(join(kok, 'dayanak.patch'), yama);
    assert.notEqual(spawnSync('git', ['apply', '--check', '-R', 'dayanak.patch'], { cwd: kok }).status, 0, 'ters uygulama birleşmiş yamayı tanımaz');
    const ana = await anaDalYamaKimlikleri(kok, 'HEAD');
    assert.equal(dayanakDurumu([yamaKimlikleri(yama, kok)], ana), 'birlesmis');
    const birlesmemis = yama.replace('+IKI', '+BASKA');
    assert.equal(dayanakDurumu([yamaKimlikleri(birlesmemis, kok)], ana), 'birlesmemis');
  } finally {
    rmSync(kok, { recursive: true, force: true });
  }
});

test('veritabanisizMi (3221 a): yalnız her dosya istemci/src altındaysa; tanınmayan her yol tam denemeye düşer', () => {
  assert.equal(veritabanisizMi(['istemci/src/moduller/stok/Liste.tsx', 'istemci/src/moduller/stok/Liste.test.tsx', 'istemci/src/ortak/arayuz/tablo.css']), true);
  for (const yol of [
    'ekran-testleri/stok.spec.ts', 'sunucu/moduller/stok/servis.ts', 'sunucu/moduller/stok/servis.test.ts', 'paylasilan/sozlesme/stok.ts',
    'sunucu/gocler/20261113000000_x.sql', 'istemci/vite.config.ts', 'istemci/package.json', 'istemci/index.html', 'package.json', 'package-lock.json',
    'tsconfig.json', 'araclar/teslim-vt.ts', '.github/workflows/kontrol.yml', 'arkon/src/a.ts', 'belgeler/a.md', 'istemci/src/../vite.config.ts', 'istemci/srcx/a.ts',
  ]) {
    assert.equal(veritabanisizMi(['istemci/src/a.tsx', yol]), false, yol);
  }
  // Yeniden adlandırma: yama eski ve yeni yolu birlikte verir; biri dışarıdaysa tam deneme.
  assert.equal(veritabanisizMi(['istemci/src/a.ts', 'paylasilan/a.ts']), false);
  assert.equal(veritabanisizMi([]), false, 'dosyası okunamayan yama kısa yola düşmez');
  // Kısa yolda modülün sunucu testleri plana girmez: veritabanı ister.
  const dosyalar = ['istemci/src/moduller/stok/Liste.tsx'];
  assert.deepEqual(testPlani(dosyalar, () => true).map((x) => x.ad), ['test:modul stok (sunucu)', 'test:modul stok (istemci)']);
  assert.deepEqual(testPlani(dosyalar, () => true, true).map((x) => x.ad), ['test:modul stok (istemci)']);
});

test('kısa deneme (3221 a): sonuç dosyasına yazılır ve okunur; PostgreSQL sürümü uyarısı verilmez, sha ve sonuç denetimi aynı kalır', () => {
  const s = { pg: null, yamalar: [SHA], gecti: true, kisa: true };
  const metin = sonucMetni(s, ['--vt atlandı: yalnız istemci/src']);
  assert.match(metin, /^kisa: evet$/m);
  assert.deepEqual(sonucOku(metin), s);
  assert.deepEqual(vtDenetle(s, [SHA]), []);
  assert.deepEqual(vtDenetle(s, ['c'.repeat(64)]).map((b) => b.etiket), ['vt']);
  assert.deepEqual(vtDenetle({ ...s, gecti: false }, [SHA]).map((b) => b.duzey), ['kirmizi']);
  assert.ok(!sonucMetni({ pg: 16, yamalar: [SHA], gecti: true }, []).includes('kisa:'), 'tam denemede satır yazılmaz');
});

test('kisaYolKarari (3221 a): modülün sunucu testi istemci kaynağına bakıyorsa tam deneme; bakmıyorsa ve modül dışı istemci dosyasında kısa yol', () => {
  const bakan = (modul: string): string[] => (modul === 'stok' ? ['sunucu/moduller/stok/stok.test.ts'] : []);
  assert.deepEqual(kisaYolKarari(['istemci/src/moduller/arkon/A.tsx', 'istemci/src/moduller/plan/alt/B.test.tsx'], bakan), { kisa: true, neden: null });
  // Modül dışı istemci dosyasının (ortak, kabuk) modül testi yoktur; kısa yol testsiz yeşil demesin diye tam denemeye düşer.
  for (const yol of ['istemci/src/ortak/arayuz/tablo.css', 'istemci/src/App.tsx', 'istemci/src/moduller/Ortak.tsx']) {
    const k = kisaYolKarari(['istemci/src/moduller/arkon/A.tsx', yol], bakan);
    assert.equal(k.kisa, false, yol);
    assert.ok(k.neden?.includes(yol), yol);
  }
  const stok = kisaYolKarari(['istemci/src/moduller/arkon/A.tsx', 'istemci/src/moduller/stok/Liste.tsx'], bakan);
  assert.equal(stok.kisa, false);
  assert.match(stok.neden ?? '', /stok modülünün sunucu testi.*stok\.test\.ts/);
  // İzin listesi dışındaki yamada modüllere hiç bakılmaz, neden yazılmaz: zaten tam denemedir.
  assert.deepEqual(kisaYolKarari(['istemci/src/moduller/stok/Liste.tsx', 'sunucu/moduller/stok/servis.ts'], () => { throw new Error('bakılmamalı'); }), { kisa: false, neden: null });
});

test('istemciyeBakanSunucuTestleri: ana daldaki modül testlerinden istemci kaynak yolu geçenler; test olmayan dosya ve başka modül sayılmaz; git okuyamazsa boş dönmez', () => {
  const depo = mkdtempSync(join(tmpdir(), 'tmiv2-vt-bakan-'));
  try {
    const git = (...a: string[]): string => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@yerel', ...a], { cwd: depo, encoding: 'utf8' });
    git('init', '-q', '-b', 'ana');
    for (const [yol, icerik] of [
      ['sunucu/moduller/stok/stok.test.ts', "readFileSync('istemci/src/moduller/stok/kural.ts');\n"],
      ['sunucu/moduller/stok/servis.ts', "// istemci/src yolu test olmayan dosyada\n"],
      ['sunucu/moduller/stok/baska.test.ts', 'assert.ok(true);\n'],
      ['sunucu/moduller/plan/plan.test.ts', 'assert.ok(true);\n'],
    ] as const) {
      execFileSync('mkdir', ['-p', join(depo, yol, '..')]);
      writeFileSync(join(depo, yol), icerik);
    }
    git('add', '-A');
    git('commit', '-q', '-m', 'ilk');
    assert.deepEqual(istemciyeBakanSunucuTestleri(depo, 'ana', 'stok'), ['sunucu/moduller/stok/stok.test.ts']);
    assert.deepEqual(istemciyeBakanSunucuTestleri(depo, 'ana', 'plan'), []);
    assert.deepEqual(istemciyeBakanSunucuTestleri(depo, 'ana', 'yok-modul'), []);
    assert.equal(istemciyeBakanSunucuTestleri(depo, 'olmayan-dal', 'stok').length, 1, 'okunamayan dal tam denemeye düşürür');
  } finally {
    rmSync(depo, { recursive: true, force: true });
  }
});

test('kararDosyalari (3221 a): dayanılan teslimlerin dosyaları da karara girer; istemci teslimi sunucuya dokunan teslimin üstündeyse kısa yol yok', () => {
  const yama = (ad: string, dosyalar: string[]) => ({ ad, sha256: 'a'.repeat(64), dosyalar });
  const istemci = [yama('0001.patch', ['istemci/src/moduller/arkon/A.tsx'])];
  assert.deepEqual(kararDosyalari({ yamalar: istemci }), ['istemci/src/moduller/arkon/A.tsx']);
  const zincirli = kararDosyalari({ yamalar: istemci, dayanaklar: [{ ad: '3155', klasor: '/x/3155', yamalar: [yama('0001.patch', ['sunucu/moduller/arkon/servis.ts', 'istemci/src/moduller/arkon/A.tsx'])] }] });
  assert.deepEqual(zincirli, ['sunucu/moduller/arkon/servis.ts', 'istemci/src/moduller/arkon/A.tsx']);
  assert.equal(kisaYolKarari(zincirli, () => []).kisa, false);
  assert.equal(kisaYolKarari(kararDosyalari({ yamalar: istemci, dayanaklar: [{ ad: '3155', klasor: '/x/3155', yamalar: istemci }] }), () => []).kisa, true);
});
