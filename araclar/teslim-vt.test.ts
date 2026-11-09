import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  denemeOrtami, initdbArgumanlari, istemciSarmalayicisi, pgBinBul, sarmalayiciyaYonelt, sonucMetni, sonucOku, testPlani, VT_ISTEMCI_YAPILANDIRMASI, vtDenetle,
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
