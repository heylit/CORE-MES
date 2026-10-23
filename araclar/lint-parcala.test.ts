import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PARCA_SAYISI, grubu, lintDosyalari, parcaArgumani, parcala, programi } from './lint-parcala.ts';

const KOK = fileURLToPath(new URL('../', import.meta.url));

const ORNEK = [
  ...Array.from({ length: 40 }, (_, i) => `istemci/src/moduller/alfa/a${String(i)}.tsx`),
  ...Array.from({ length: 30 }, (_, i) => `istemci/src/moduller/beta/b${String(i)}.ts`),
  ...Array.from({ length: 20 }, (_, i) => `istemci/src/ortak/o${String(i)}.ts`),
  ...Array.from({ length: 35 }, (_, i) => `sunucu/moduller/gama/g${String(i)}.ts`),
  ...Array.from({ length: 25 }, (_, i) => `sunucu/cekirdek/c${String(i)}.ts`),
  ...Array.from({ length: 20 }, (_, i) => `paylasilan/p${String(i)}.ts`),
  'araclar/x.ts',
  'arkon/sun.ts',
  'eslint.config.js',
  'ekran-testleri/e.spec.ts',
];

function kapsamaDenetle(dosyalar: readonly string[], parcalar: string[][]): void {
  const hepsi = parcalar.flat();
  assert.equal(hepsi.length, dosyalar.length, 'bir dosya iki parçada ya da hiçbirinde');
  assert.deepEqual([...hepsi].sort(), [...dosyalar].sort());
}

test('lint-parcala: dosyanın programı eslint.config.js sırasıyla, paylasilan sunucuda', () => {
  assert.equal(programi('istemci/src/App.tsx'), 'istemci');
  assert.equal(programi('arkon/vite.config.ts'), 'istemci');
  assert.equal(programi('ekran-testleri/x.spec.ts'), 'ekran');
  assert.equal(programi('paylasilan/sayfalar.ts'), 'sunucu');
  assert.equal(programi('araclar/harita.ts'), 'sunucu');
  assert.equal(programi('eslint.config.js'), 'sunucu');
});

test('lint-parcala: modül klasörü tek grup, modül dışı programın ortak grubu', () => {
  assert.equal(grubu('sunucu/moduller/stok/a/b.ts'), 'sunucu/moduller/stok/');
  assert.equal(grubu('istemci/src/moduller/stok/c.tsx'), 'istemci/src/moduller/stok/');
  assert.equal(grubu('sunucu/cekirdek/db.ts'), 'sunucu:ortak');
  assert.equal(grubu('istemci/src/ortak/x.ts'), 'istemci:ortak');
});

test('lint-parcala: her dosya tam bir parçada, modül bölünmez, büyük programlar karışmaz', () => {
  for (let n = 1; n <= 8; n++) {
    const parcalar = parcala(ORNEK, n);
    assert.equal(parcalar.length, n);
    kapsamaDenetle(ORNEK, parcalar);
    for (const grup of new Set(ORNEK.map(grubu))) {
      assert.equal(parcalar.filter((p) => p.some((d) => grubu(d) === grup)).length, 1, `${grup} bölündü (n=${String(n)})`);
    }
  }
  const dort = parcala(ORNEK, 4);
  for (const parca of dort) {
    const buyuk = new Set(parca.map(programi).filter((p) => p !== 'ekran'));
    assert.ok(buyuk.size <= 1, `parçada iki büyük program: ${[...buyuk].join(', ')}`);
  }
  assert.deepEqual(parcala(ORNEK, 4), parcala([...ORNEK].reverse(), 4), 'sonuç girdi sırasına bağlı');
});

test('lint-parcala: boş liste ve geçersiz parça sayısı', () => {
  assert.deepEqual(parcala([], 3), [[], [], []]);
  assert.throws(() => parcala(ORNEK, 0));
  assert.deepEqual(parcaArgumani('2/4'), { sira: 2, n: 4 });
  for (const yanlis of ['0/4', '5/4', '1/0', '2', 'a/b', undefined]) assert.equal(parcaArgumani(yanlis), null, String(yanlis));
});

test('lint-parcala: depodaki bütün lint dosyaları parçalara dağılır, yok sayılan klasörler girmez', async () => {
  const dosyalar = await lintDosyalari(KOK);
  assert.ok(dosyalar.includes('sunucu/ana.ts') && dosyalar.includes('istemci/src/App.tsx') && dosyalar.includes('eslint.config.js'));
  assert.ok(!dosyalar.some((d) => /^(node_modules|istemci\/dist|arkon\/web|arkon\/shared|deneme|\.claude)\//.test(d)));
  const parcalar = parcala(dosyalar, PARCA_SAYISI);
  kapsamaDenetle(dosyalar, parcalar);
  assert.ok(parcalar.every((p) => p.length > 0), 'boş parça var');
});

test('lint-parcala: CI matrisi PARCA_SAYISI kadar parça koşar, hepsi aynı bölmeyle', () => {
  const akis = readFileSync(new URL('../.github/workflows/kontrol.yml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const is = /\n  lint:\n[\s\S]*?(?=\n  [a-z-]+:\n)/.exec(akis)?.[0] ?? '';
  const matris = /parca: \[([^\]]*)\]/.exec(is)?.[1]?.split(',').map((s) => Number(s.trim()));
  assert.deepEqual(matris, Array.from({ length: PARCA_SAYISI }, (_, i) => i + 1));
  assert.match(is, new RegExp(`--parca \\$\\{\\{ matrix\\.parca \\}\\}/${String(PARCA_SAYISI)}\\b`));
  assert.match(akis, /needs: \[[^\]]*\blint\b[^\]]*\]/, 'kontrol toplayıcısı lint işini beklemiyor');
});
