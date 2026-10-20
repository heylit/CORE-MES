import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { AZAMI_DEGISIKLIK, AZAMI_DEGISIKLIK_METNI, ortakAnahtar, paketBasliginiCoz } from '../sunucu/moduller/ayarlar/disari.ts';
import {
  degisiklikleriAyikla, onbellekListesi, ortakAnahtarMetni, paketKur, platformlariOku, sunucuKurulumu, surumAdi,
} from './paket.ts';

const kayit = (konu: string, govde: string): string => `${konu}\x1f${govde}\n\x1e\n`;

test('sürüm adı tesis gününden çıkar; aynı gün sonraki yayın sırayı artırır', () => {
  // UTC'de 11 Ekim, İstanbul'da 12 Ekim.
  const an = new Date('2026-10-11T22:30:00Z');
  assert.equal(surumAdi(an, []), '2026.10.12-1');
  assert.equal(surumAdi(an, ['yayin/2026.10.12-1', 'yayin/2026.10.12-3', 'yayin/2026.10.11-7', 'yayin/2026.10.12-x']), '2026.10.12-4');
});

test('değişiklik listesi yalnız PR birleşmelerinden ve başlığından çıkar', () => {
  const gunluk = kayit('Merge pull request #879 from heylit/162-satin-alma', 'satin-alma: dis islemler sayfasi')
    + kayit('Merge #840 into batch', '')
    + kayit('Merge pull request #12 from heylit/x', '');
  assert.deepEqual(degisiklikleriAyikla(gunluk), ['#879: satin-alma: dis islemler sayfasi', '#12']);
});

test('değişiklik listesi bildirim sınırlarını aşmaz', () => {
  const uzun = kayit('Merge pull request #1 from x/y', 'a'.repeat(AZAMI_DEGISIKLIK_METNI + 50));
  const [ilk] = degisiklikleriAyikla(uzun);
  assert.equal(ilk?.length, AZAMI_DEGISIKLIK_METNI);
  const cok = Array.from({ length: AZAMI_DEGISIKLIK + 5 }, (_, i) => kayit(`Merge pull request #${i + 1} from x/y`, 'b')).join('');
  const liste = degisiklikleriAyikla(cok);
  assert.equal(liste.length, AZAMI_DEGISIKLIK);
  assert.equal(liste.at(-1), 've 6 değişiklik daha');
});

test('üretilen paket sunucunun çözücüsünden geçer; başka anahtarla geçmez', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const yuk = Buffer.from('deneme yuku');
  const girdi = {
    surum: '2026.10.12-1', commit: 'a'.repeat(40), tarih: '2026-10-12T10:00:00.000Z',
    gocler: ['20261012100000_ornek.sql'], not: null, degisiklikler: ['#1: deneme'],
  };
  const paket = paketKur(girdi, yuk, privateKey);
  const anahtar = ortakAnahtar(ortakAnahtarMetni(createPublicKey(privateKey)));
  assert.ok(anahtar);
  const cozum = paketBasliginiCoz(paket, anahtar);
  assert.ok(!('red' in cozum));
  assert.deepEqual(cozum.bildirim, {
    bicim: 1, ...girdi, yukBoyut: yuk.length, yukSha256: createHash('sha256').update(yuk).digest('hex'),
  });
  assert.deepEqual(paket.subarray(cozum.yukBasi), yuk);

  const baska = ortakAnahtar(ortakAnahtarMetni(createPublicKey(generateKeyPairSync('ed25519').privateKey)));
  assert.ok(baska);
  assert.deepEqual(paketBasliginiCoz(paket, baska), { red: 'imzaGecersiz' });
});

// Ekran testi paketi ve yalnız onun getirdikleri düşer; başkasının da kullandığı kalır (ortak), iç içe kopya da düşer.
const KILIT = {
  name: 'x', lockfileVersion: 3, requires: true,
  packages: {
    '': { name: 'x', dependencies: { a: '^1.0.0' }, devDependencies: { '@playwright/test': '1.0.0', vite: '^6.0.0' } },
    'node_modules/a': { version: '1.0.0', resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz', integrity: 'sha512-a', dependencies: { ortak: '^1.0.0' } },
    'node_modules/vite': { version: '6.0.0', resolved: 'https://registry.npmjs.org/vite/-/vite-6.0.0.tgz', integrity: 'sha512-v', dev: true,
      optionalDependencies: { 'win-ikili': '1.0.0', 'linux-ikili': '1.0.0', fsevents: '2.0.0' } },
    'node_modules/win-ikili': { version: '1.0.0', resolved: 'https://registry.npmjs.org/win-ikili/-/win-ikili-1.0.0.tgz', integrity: 'sha512-w', dev: true, optional: true, os: ['win32'], cpu: ['x64'] },
    'node_modules/linux-ikili': { version: '1.0.0', resolved: 'https://registry.npmjs.org/linux-ikili/-/linux-ikili-1.0.0.tgz', integrity: 'sha512-l', dev: true, optional: true, os: ['linux'], cpu: ['x64'] },
    'node_modules/fsevents': { version: '2.0.0', resolved: 'https://registry.npmjs.org/fsevents/-/fsevents-2.0.0.tgz', integrity: 'sha512-f', dev: true, optional: true, os: ['darwin'] },
    'node_modules/@playwright/test': { version: '1.0.0', resolved: 'https://registry.npmjs.org/@playwright/test/-/test-1.0.0.tgz', integrity: 'sha512-pt', dev: true, dependencies: { playwright: '1.0.0', ortak: '^1.0.0' } },
    'node_modules/playwright': { version: '1.0.0', resolved: 'https://registry.npmjs.org/playwright/-/playwright-1.0.0.tgz', integrity: 'sha512-p', dev: true, optionalDependencies: { fsevents: '2.3.2' } },
    'node_modules/playwright/node_modules/fsevents': { version: '2.3.2', resolved: 'https://registry.npmjs.org/fsevents/-/fsevents-2.3.2.tgz', integrity: 'sha512-f2', dev: true, optional: true, os: ['darwin'] },
    'node_modules/ortak': { version: '1.0.0', resolved: 'https://registry.npmjs.org/ortak/-/ortak-1.0.0.tgz', integrity: 'sha512-o' },
  },
};
const PAKET = { name: 'x', dependencies: { a: '^1.0.0' }, devDependencies: { '@playwright/test': '1.0.0', vite: '^6.0.0' }, scripts: { ekran: 'playwright test' } };

test('sunucu kurulumu ekran testi paketini ve yalnız onun getirdiklerini çıkarır; başka paketin bağımlılığı kalır', () => {
  const { paketJson, kilit, cikan } = sunucuKurulumu(PAKET, KILIT, ['@playwright/test']);
  assert.deepEqual(paketJson.devDependencies, { vite: '^6.0.0' });
  assert.deepEqual(kilit.packages['']?.devDependencies, { vite: '^6.0.0' });
  assert.deepEqual(cikan.sort(), ['node_modules/@playwright/test', 'node_modules/playwright', 'node_modules/playwright/node_modules/fsevents']);
  assert.ok(kilit.packages['node_modules/ortak']);
  assert.ok(kilit.packages['node_modules/fsevents']);
  // Girdi değişmez: paket-yap aynı kilidi başka işte de okur.
  assert.ok(PAKET.devDependencies['@playwright/test']);
  assert.ok(KILIT.packages['node_modules/playwright']);
});

test('package.json\'da olmayan paketi çıkarmak istemek hatadır (ad yanlış yazılmış olabilir)', () => {
  assert.throws(() => sunucuKurulumu(PAKET, KILIT, ['@playwright/tset']), /package\.json'da yok/);
});

test('önbellek listesi hedef platformun ikililerini alır; başka işletim sistemi ve işlemcininkini almaz', () => {
  const liste = (p: string): string[] => onbellekListesi(KILIT, platformlariOku(p)).map((t) => t.yol).sort();
  const ortak = ['node_modules/@playwright/test', 'node_modules/a', 'node_modules/ortak', 'node_modules/playwright', 'node_modules/vite'];
  assert.deepEqual(liste('win32-x64'), [...ortak, 'node_modules/win-ikili'].sort());
  assert.deepEqual(liste('linux-x64'), [...ortak, 'node_modules/linux-ikili'].sort());
  assert.deepEqual(liste('win32-x64,linux-x64'), [...ortak, 'node_modules/linux-ikili', 'node_modules/win-ikili'].sort());
  assert.deepEqual(liste('win32-arm64'), ortak);
  const a = onbellekListesi(KILIT, platformlariOku('win32-x64')).find((t) => t.yol === 'node_modules/a');
  assert.deepEqual(a, { yol: 'node_modules/a', adres: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz', butunluk: 'sha512-a' });
});

test('olumsuz platform kaydı (!) dışlar', () => {
  const kilit = { packages: { '': {}, 'node_modules/b': { resolved: 'https://registry.npmjs.org/b/-/b-1.tgz', integrity: 'sha512-b', os: ['!win32'] } } };
  assert.deepEqual(onbellekListesi(kilit, platformlariOku('win32-x64')), []);
  assert.equal(onbellekListesi(kilit, platformlariOku('linux-x64')).length, 1);
});

test('kayıt adresi dışından gelen ya da bütünlüğü olmayan paket reddedilir', () => {
  const kilit = (k: Record<string, unknown>) => ({ packages: { '': {}, 'node_modules/b': k } });
  assert.throws(() => onbellekListesi(kilit({ resolved: 'git+https://example.invalid/b.git', integrity: 'sha512-b' }), platformlariOku('win32-x64')), /kayıt adresinden değil/);
  assert.throws(() => onbellekListesi(kilit({ resolved: 'https://registry.npmjs.org/b/-/b-1.tgz' }), platformlariOku('win32-x64')), /bütünlük/);
});

test('platform adı biçimi denetlenir', () => {
  assert.deepEqual(platformlariOku('win32-x64'), [{ os: 'win32', cpu: 'x64' }]);
  assert.throws(() => platformlariOku('windows'), /Platform/);
});
