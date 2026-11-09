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

test('ci-kapsam: ana dalda belge dışı tek dosya her işi koşturur, elle koşu ve boş fark daraltılmaz', () => {
  assert.deepEqual(kapsam('push', ['istemci/src/moduller/stok/NOT.md', 'belgeler/a.md']), HICBIRI);
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
