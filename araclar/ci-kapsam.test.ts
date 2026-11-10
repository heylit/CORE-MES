import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const KOK = fileURLToPath(new URL('../', import.meta.url));

interface Kapsam { sunucu: boolean; istemci: boolean; ekran: boolean }

function kapsam(olay: string, degisenler: readonly string[]): Kapsam {
  const r = spawnSync('bash', ['araclar/ci-kapsam.sh'], {
    cwd: KOK, input: degisenler.join('\n') + '\n', encoding: 'utf8', env: { ...process.env, OLAY: olay },
  });
  assert.equal(r.status, 0, r.stderr);
  const son = r.stdout.trim().split('\n').slice(-3);
  const deger = (ad: string): boolean => {
    const satir = son.find((s) => s.startsWith(`${ad}=`));
    assert.ok(satir, `${ad} satırı yok: ${r.stdout}`);
    return satir === `${ad}=true`;
  };
  return { sunucu: deger('sunucu'), istemci: deger('istemci'), ekran: deger('ekran') };
}

const HEPSI: Kapsam = { sunucu: true, istemci: true, ekran: true };
const HICBIRI: Kapsam = { sunucu: false, istemci: false, ekran: false };

test('ci-kapsam: ortak parça ve bilinmeyen yol her işi koşturur', () => {
  for (const yol of ['paylasilan/sayfalar.ts', 'istemci/src/ortak/Dugme.tsx', 'sunucu/cekirdek/db.ts', 'package.json',
    'package-lock.json', '.github/workflows/kontrol.yml', 'araclar/harita.ts', 'eslint.config.js', 'yeni-klasor/a.ts']) {
    assert.deepEqual(kapsam('pull_request', [yol]), HEPSI, yol);
  }
});

test('ci-kapsam: sunucunun ithal ettiği istemci klasörü sunucu testlerini de koşturur', () => {
  assert.deepEqual(kapsam('pull_request', ['istemci/src/moduller/recete-rota/kaynak-komutlari.ts']), HEPSI);
  assert.deepEqual(kapsam('pull_request', ['istemci/src/moduller/stok/StokSayfa.tsx']), { sunucu: false, istemci: true, ekran: true });
});

test('ci-kapsam: göç sunucu ve ekran işini her zaman koşturur', () => {
  assert.deepEqual(kapsam('pull_request', ['sunucu/gocler/20990101000000_x.sql']), { sunucu: true, istemci: false, ekran: true });
});

test('ci-kapsam: yalnız belge değişince ağır işler atlanır; modül klasöründeki .md çekme isteğinde koşturur', () => {
  assert.deepEqual(kapsam('pull_request', ['belgeler/a.md', 'kurulum/b.md', 'OKU.md']), HICBIRI);
  assert.deepEqual(kapsam('pull_request', ['istemci/src/moduller/stok/NOT.md']), { sunucu: false, istemci: true, ekran: true });
});

test('ci-kapsam: ana dal gönderimi yalnız belgeyle de daraltılmaz (2705 a), elle koşu ve boş fark daraltılmaz', () => {
  assert.deepEqual(kapsam('push', ['belgeler/a.md']), HEPSI);
  assert.deepEqual(kapsam('push', ['belgeler/a.md', 'istemci/src/moduller/stok/StokSayfa.tsx']), HEPSI);
  assert.deepEqual(kapsam('workflow_dispatch', ['belgeler/a.md']), HEPSI);
  assert.deepEqual(kapsam('pull_request', []), HEPSI);
});

test('ci-kapsam: taşımada eski ve yeni yol birlikte gelir, kontrol.yml farkı --no-renames ile alır', () => {
  assert.deepEqual(kapsam('pull_request', ['belgeler/a.ts', 'sunucu/a.ts']), { sunucu: true, istemci: false, ekran: true });
  assert.deepEqual(kapsam('pull_request', ['istemci/src/moduller/stok/X.tsx', 'istemci/src/ortak/X.tsx']), HEPSI);
  const is = readFileSync(`${KOK}.github/workflows/kontrol.yml`, 'utf8');
  assert.match(is, /degisenler=\$\(git diff --name-only --no-renames "\$taban" HEAD\)/);
});

test('kontrol.yml: ana dalda yalnız ağır test işleri iptal edilir, gruplar parçaya göre (2705 a)', () => {
  const is = readFileSync(`${KOK}.github/workflows/kontrol.yml`, 'utf8');
  assert.match(is, /^concurrency:\n {2}group: kontrol-\$\{\{ github\.ref == 'refs\/heads\/main' && github\.sha \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
  for (const [ad, matris] of [['istemci-test', true], ['sunucu-test', true], ['ekran', true], ['windows', false]] as const) {
    const parca = matris ? '-\\$\\{\\{ matrix\\.parca \\}\\}' : '';
    assert.match(is, new RegExp(`\\n {2}${ad}:\\n(?: {4}.*\\n)*? {4}concurrency:\\n {6}group: kontrol-${ad}${parca}-\\$\\{\\{ github\\.event_name == 'push' && github\\.ref \\|\\| github\\.run_id \\}\\}\\n {6}cancel-in-progress: \\$\\{\\{ github\\.event_name == 'push' \\}\\}\\n`), ad);
  }
  const blok = (ad: string): string => {
    const bas = is.indexOf(`\n  ${ad}:\n`);
    assert.ok(bas >= 0, `${ad} işi yok`);
    const sonraki = is.slice(bas + 1).search(/\n {2}[a-z-]+:\n/);
    return sonraki === -1 ? is.slice(bas) : is.slice(bas, bas + 1 + sonraki);
  };
  for (const ad of ['kapsam', 'tip', 'denetim', 'lint', 'kontrol']) assert.ok(!blok(ad).includes('concurrency:'), `${ad} iptal edilmemeli`);
});
