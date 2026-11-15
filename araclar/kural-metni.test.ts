import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// Kural metni her oturumda okunur; uzadıkça okunmaz olur. Araçla denetlenebilen kural metne değil araca yazılır.
const KOK = join(import.meta.dirname, '..');
const KURAL_METINLERI = ['CLAUDE.md', 'kurulum/proje-talimati.md', 'kurulum/birlestirici.md', 'kurulum/sahiplik.md'];
const SINIR_BAYT = 15_000;

const oku = (yol: string): string => readFileSync(join(KOK, yol), 'utf8');

test('kural metni: her dosya 15 KB altında', () => {
  const asan = KURAL_METINLERI.map((y) => [y, Buffer.byteLength(oku(y))] as const).filter(([, b]) => b >= SINIR_BAYT);
  assert.deepEqual(asan, [], 'kural metni sınırı aştı: kuralı araca taşı ya da tekrarını kaldır');
});

test('kural metni: adıyla anılan npm komutu ve araç dosyası vardır', () => {
  const komutlar = new Set(Object.keys((JSON.parse(oku('package.json')) as { scripts: Record<string, string> }).scripts));
  const eksik: string[] = [];
  for (const yol of KURAL_METINLERI) {
    const metin = oku(yol);
    for (const m of metin.matchAll(/npm run (?:-s )?([a-z][a-z:-]*)/g)) if (!komutlar.has(m[1] ?? '')) eksik.push(`${yol}: npm run ${m[1]}`);
    for (const m of metin.matchAll(/`(araclar\/[\w./-]+\.ts)`/g)) {
      try { oku(m[1] ?? ''); } catch { eksik.push(`${yol}: ${m[1]}`); }
    }
  }
  assert.deepEqual(eksik, []);
});
