import assert from 'node:assert/strict';
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AZAMI_GUNCELLEME, GUNCELLEME_PARCASI } from '#paylasilan/sozlesme/ayarlar.ts';
import { AZAMI_DEGISIKLIK, AZAMI_DEGISIKLIK_METNI, calisanSurumSemasi, ortakAnahtar, paketBasliginiCoz } from '../sunucu/moduller/ayarlar/disari.ts';
import {
  SUNUCUDA_KURULMAYAN, degisiklikleriAyikla, kartNoVarMi, paketBoyuDurumu, onbellekListesi, ortakAnahtarMetni, paketKur, paketTaramasi, platformlariOku, sunucuKurulumu, surumAdi, surumDosyasi,
  surumNotu, taramaSayilari,
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

test('PR başlığı sonundaki parantezde kart numarası taşır', () => {
  for (const b of ['Fix stock search (1501)', 'Rounds (1527, 1518, 1520)', 'Type fixes (1443 A-E)', 'Old views (1418, round 1)', 'Split jobs (#1219)']) {
    assert.equal(kartNoVarMi(b), true, b);
  }
  for (const b of ['Fix stock search', 'Fix (12)', 'Fix (abc)', 'Card 1501 fix', 'Fix (1501) stock', 'Fix (123456)', '']) {
    assert.equal(kartNoVarMi(b), false, b);
  }
});

test('sürüm notu bütün birleşmeleri, yeni göçleri ve elle adımı taşır; kartsız başlığı söyler', () => {
  const cok = Array.from({ length: AZAMI_DEGISIKLIK + 5 }, (_, i) => kayit(`Merge pull request #${i + 1} from x/y`, `Is ${i + 1} (1565)`)).join('');
  const gunluk = cok + kayit('Merge pull request #999 from x/y', 'Kartsiz is') + kayit('Merge #840 into batch', '');
  const metin = surumNotu({
    surum: '2026.11.01-1', commit: 'b'.repeat(40), tarih: '2026-11-01T10:00:00.000Z', oncekiYayin: '2026.10.28-3',
    yeniGocler: ['20261101100000_ornek.sql'], not: '.env dosyasina yeni satir', gunluk,
  });
  assert.match(metin, /^# Yayın 2026\.11\.01-1\n/);
  assert.match(metin, /Önceki yayın: 2026\.10\.28-3/);
  assert.match(metin, /## Elle adım\n\n\.env dosyasina yeni satir\n/);
  assert.match(metin, /## Göçler \(1\)\n\n- 20261101100000_ornek\.sql\n/);
  assert.match(metin, new RegExp(`## Değişiklikler \\(${String(AZAMI_DEGISIKLIK + 6)}\\)`));
  assert.match(metin, /- #999: Kartsiz is\n/);
  assert.doesNotMatch(metin, /değişiklik daha/);
  assert.match(metin, /Kart numarası olmayan başlık: #999\n$/);
});

test('sürüm notu ilk yayında ve boş listede "yok" yazar', () => {
  const metin = surumNotu({ surum: '2026.11.01-1', commit: 'c'.repeat(40), tarih: '2026-11-01T10:00:00.000Z', oncekiYayin: null, yeniGocler: [], not: null, gunluk: '' });
  assert.match(metin, /Önceki yayın: yok/);
  assert.match(metin, /## Elle adım\n\nYok\.\n/);
  assert.match(metin, /## Göçler \(0\)\n\nYok\.\n/);
  assert.doesNotMatch(metin, /Kart numarası olmayan/);
});

test('üretilen paket sunucunun çözücüsünden geçer; başka anahtarla geçmez', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const yuk = Buffer.from('deneme yuku');
  const girdi = {
    surum: '2026.10.12-1', commit: 'a'.repeat(40), tarih: '2026-10-12T10:00:00.000Z',
    gocler: ['20261012100000_ornek.sql'], not: null, degisiklikler: ['#1: deneme'], oncekiYayin: '2026.10.11-1',
    tarama: { durum: 'tamam' as const, zaman: '2026-10-12T09:59:00.000Z', canli: { kritik: 0, yuksek: 1, orta: 0, dusuk: 0 }, tum: { kritik: 0, yuksek: 1, orta: 11, dusuk: 0 } },
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

// Bildirime yeni alan eklemek eski sunucuyu kırmamalı: çözücü bilinmeyen alanı atar. Eski paketin bildiriminde oncekiYayin yoktur.
test('bildirimde bilinmeyen alan atılır; oncekiYayin taşımayan eski paket null okunur', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const anahtar = ortakAnahtar(ortakAnahtarMetni(createPublicKey(privateKey)));
  assert.ok(anahtar);
  const temel = { surum: '2026.10.12-1', commit: 'a'.repeat(40), tarih: '2026-10-12T10:00:00.000Z', gocler: [], not: null, degisiklikler: [] };
  const yeni = paketBasliginiCoz(paketKur({ ...temel, oncekiYayin: null, tarama: null, gelecekAlan: 1 } as Parameters<typeof paketKur>[0], Buffer.from('y'), privateKey), anahtar);
  assert.ok(!('red' in yeni));
  assert.equal('gelecekAlan' in yeni.bildirim, false);
  const eski = paketBasliginiCoz(paketKur(temel as unknown as Parameters<typeof paketKur>[0], Buffer.from('y'), privateKey), anahtar);
  assert.ok(!('red' in eski));
  assert.equal(eski.bildirim.oncekiYayin, null);
  assert.equal(eski.bildirim.tarama, null);
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

test('sürüm dosyası güncelleyicinin çalışan sürüm biçimindedir (1876)', () => {
  const kimlik = { commit: 'c'.repeat(40), surum: '2026.11.02-1', tarih: '2026-11-02T08:00:00.000Z' };
  assert.deepEqual(calisanSurumSemasi.parse(JSON.parse(surumDosyasi(kimlik).toString('utf8'))), kimlik);
});

// 2163: npm audit çıktısından yalnız seviye sayıları alınır; okunamayan çıktıda sayı uydurulmaz.
test('tarama sayıları npm audit özetinden okunur; paket ve açık adı alınmaz', () => {
  const cikti = JSON.stringify({
    vulnerabilities: { ornek: { severity: 'high', via: ['x'] } },
    metadata: { vulnerabilities: { info: 0, low: 2, moderate: 11, high: 1, critical: 0, total: 14 } },
  });
  assert.deepEqual(taramaSayilari(cikti), { kritik: 0, yuksek: 1, orta: 11, dusuk: 2 });
  const tarama = paketTaramasi('2026-11-06T10:00:00.000Z', cikti, cikti);
  assert.equal(JSON.stringify(tarama).includes('ornek'), false);
});

test('tarama çıktısı yoksa, bozuksa ya da sayı eksikse "yapılamadı" olur; paket durmaz', () => {
  const tamam = JSON.stringify({ metadata: { vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0 } } });
  assert.equal(taramaSayilari(null), null);
  assert.equal(taramaSayilari('kayıt sunucusuna ulaşılamadı'), null);
  assert.equal(taramaSayilari(JSON.stringify({ error: { code: 'ENOTFOUND' } })), null);
  assert.equal(taramaSayilari(JSON.stringify({ metadata: { vulnerabilities: { low: 0, moderate: 0, high: -1, critical: 0 } } })), null);
  assert.deepEqual(paketTaramasi('2026-11-06T10:00:00.000Z', tamam, null), { durum: 'yapilamadi', zaman: '2026-11-06T10:00:00.000Z' });
  assert.deepEqual(paketTaramasi('2026-11-06T10:00:00.000Z', null, tamam), { durum: 'yapilamadi', zaman: '2026-11-06T10:00:00.000Z' });
});

test('yapılamadı taraması bildirimden geçer; bilinmeyen durum bildirimi bozar', () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  const anahtar = ortakAnahtar(ortakAnahtarMetni(createPublicKey(privateKey)));
  assert.ok(anahtar);
  const temel = { surum: '2026.11.06-1', commit: 'a'.repeat(40), tarih: '2026-11-06T10:00:00.000Z', gocler: [], not: null, degisiklikler: [], oncekiYayin: null };
  const yapilamadi = paketBasliginiCoz(paketKur({ ...temel, tarama: { durum: 'yapilamadi', zaman: '2026-11-06T09:59:00.000Z' } }, Buffer.from('y'), privateKey), anahtar);
  assert.ok(!('red' in yapilamadi));
  assert.deepEqual(yapilamadi.bildirim.tarama, { durum: 'yapilamadi', zaman: '2026-11-06T09:59:00.000Z' });
  const bozuk = { ...temel, tarama: { durum: 'belki', zaman: '2026-11-06T09:59:00.000Z' } } as unknown as Parameters<typeof paketKur>[0];
  assert.deepEqual(paketBasliginiCoz(paketKur(bozuk, Buffer.from('y'), privateKey), anahtar), { red: 'bildirimBozuk' });
});

test('paket boyu: sınırı aşan durur, %80 üstü uyarır (2419)', () => {
  assert.equal(paketBoyuDurumu(80, 100), 'tamam');
  assert.equal(paketBoyuDurumu(81, 100), 'uyari');
  assert.equal(paketBoyuDurumu(100, 100), 'uyari');
  assert.equal(paketBoyuDurumu(101, 100), 'asti');
});

test('sunucuya kurulmayanlar depodaki package.json\'da var; derleme ve çalışma paketleri kalır (2419)', () => {
  const oku = (ad: string): unknown => JSON.parse(readFileSync(new URL(`../${ad}`, import.meta.url), 'utf8'));
  const { kilit } = sunucuKurulumu(oku('package.json') as never, oku('package-lock.json') as never, SUNUCUDA_KURULMAYAN);
  for (const ad of ['vite', '@vitejs/plugin-react', 'typescript', 'three-147', 'tesseract.js-core', '@tesseract.js-data/eng', 'exceljs', 'jsqr', 'fastify', 'pg', 'zod']) {
    assert.ok(kilit.packages[`node_modules/${ad}`] !== undefined, `${ad} pakette kalmalı`);
  }
  for (const ad of SUNUCUDA_KURULMAYAN) assert.equal(kilit.packages[`node_modules/${ad}`], undefined, `${ad} pakete girmemeli`);
});

// Ekran paylaşılandan değer ithal edemez (zod, eslint kuralı); kopyası metinden okunup sözleşmeyle karşılaştırılır (2419).
test('ekrandaki paket sınırı ve parça boyu sunucunun sözleşmesiyle aynı (2419)', () => {
  const metin = readFileSync(new URL('../istemci/src/moduller/ayarlar/Guncelleme.tsx', import.meta.url), 'utf8');
  const sayi = (ad: string): number => {
    const e = new RegExp(`const ${ad} = (\\d+) \\* 1024(?: \\* 1024)?;`).exec(metin);
    assert.ok(e !== null, `${ad} Guncelleme.tsx'te bulunamadı`);
    return Number(e[1]) * (e[0].includes('1024 * 1024') ? 1024 * 1024 : 1024);
  };
  assert.equal(sayi('AZAMI_BAYT'), AZAMI_GUNCELLEME);
  assert.equal(sayi('PARCA_BAYT'), GUNCELLEME_PARCASI);
});
