import assert from 'node:assert/strict';
import { existsSync, globSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { kosuArgv, modulTestKomutlari, sunucuTestDosyalari } from './test-modul.ts';

const kok = fileURLToPath(new URL('../', import.meta.url));

// Kabuksuz koşuda desen olduğu gibi node'a gider: tırnaklı desen hiçbir dosyayla eşleşmez ve koşu sıfır testle yeşil biterdi.
test('sunucu test deseni kabuksuz koşuda modülün test dosyalarıyla eşleşir', () => {
  const sunucu = modulTestKomutlari('saglik').find((k) => k.taraf === 'sunucu');
  const desen = sunucu?.argumanlar.at(-1) ?? '';
  assert.doesNotMatch(desen, /["']/);
  assert.equal(globSync(desen, { cwd: kok }).length > 0, true, desen);
});

test('modül testi iki platformda da node ile kabuksuz koşar; istemci komutu kurulu vitest giriş dosyasıdır', () => {
  for (const k of modulTestKomutlari('saglik')) {
    const argv = kosuArgv(k, kok);
    assert.equal(argv[0], process.execPath, k.taraf);
    assert.equal(argv.some((a) => a === 'npx' || a.endsWith('.cmd')), false, argv.join(' '));
    if (k.taraf === 'istemci') assert.equal(existsSync(argv[1] ?? ''), true, argv.join(' '));
    else assert.equal(argv[1], '--import', argv.join(' '));
  }
});

test('sunucu deseni modülün bütün test dosyalarını, alt klasörler dahil, bulur; eşleşmeyen desen boş döner', () => {
  const sunucu = modulTestKomutlari('uretim-emirleri').find((k) => k.taraf === 'sunucu');
  assert.ok(sunucu);
  const dosyalar = sunucuTestDosyalari(sunucu, kok).map((d) => d.replaceAll('\\', '/'));
  assert.equal(dosyalar.includes('sunucu/moduller/uretim-emirleri/kurallar.test.ts'), true, dosyalar.join(' '));
  assert.equal(dosyalar.includes('sunucu/moduller/uretim-emirleri/arama/arama.test.ts'), true, dosyalar.join(' '));
  assert.deepEqual(sunucuTestDosyalari({ ...sunucu, argumanlar: [...sunucu.argumanlar.slice(0, -1), "'sunucu/moduller/uretim-emirleri/**/*.test.ts'"] }, kok), []);
});
