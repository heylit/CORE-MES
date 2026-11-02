import assert from 'node:assert/strict';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { BEKLE, KOK, SOZ, SOZDIZIMI, SUNUCU, TIP_ITHALI, YANLIS_SOZ, deger, eslint, kurallar } from './lint-ortak.ts';

// Yalnız sunucu programı kurulur; istemci kuralları lint-istemci.test.ts'tedir (ayrı süreç, 1863).

test('lint: beklenmeyen söz kırmızı; await, void ve node:test çağrısı yeşil', async () => {
  assert.deepEqual(await kurallar(SUNUCU, `${BEKLE}bekle();`), [SOZ]);
  assert.deepEqual(await kurallar(SUNUCU, `${BEKLE}await bekle();\nvoid bekle();`), []);
  assert.deepEqual(await kurallar(SUNUCU, "import { test } from 'node:test';\ntest('a', async () => {});"), []);
  assert.deepEqual(await kurallar(SUNUCU, `${BEKLE}const test = bekle;\ntest();`), [SOZ]);
});

test('lint: söz, değer beklenen yere verilirse kırmızı', async () => {
  assert.deepEqual(await kurallar(SUNUCU, `${BEKLE}[1].forEach(async () => {\n  await bekle();\n});`), [YANLIS_SOZ]);
  assert.deepEqual(await kurallar(SUNUCU, `${BEKLE}if (bekle()) console.log(1);`), [YANLIS_SOZ]);
  assert.deepEqual(await kurallar(SUNUCU, `${BEKLE}if (await bekle()) console.log(1);`), []);
});

test('lint: yalnız tip olarak kullanılan ithal import type ister', async () => {
  assert.deepEqual(await kurallar(SUNUCU, "import { Db } from './cekirdek/db.ts';\nexport type A = Db;"), [TIP_ITHALI]);
  assert.deepEqual(await kurallar(SUNUCU, "import type { Db } from './cekirdek/db.ts';\nexport type A = Db;"), []);
  assert.deepEqual(await kurallar(SUNUCU, "import { type Db } from './cekirdek/db.ts';\nexport type A = Db;"), []);
});

test('lint: sunucu paylasilan sözleşmesinden değer ithal edebilir; node:crypto serbest; kapatma yorumu söz ihlalini gizlemez', async () => {
  const S = '#paylasilan/sozlesme/saglik.ts';
  assert.deepEqual(await kurallar(SUNUCU, deger(S)), []);
  assert.deepEqual(await kurallar(SUNUCU, `export const m = await import('${S}');`), []);
  assert.deepEqual(await kurallar(SUNUCU, "import { randomUUID } from 'node:crypto';\nexport const k = randomUUID();"), []);
  assert.ok((await kurallar(SUNUCU, `${BEKLE}bekle(); // eslint-disable-line`)).includes(SOZ));
});

test('lint: ajan çalışma ağacındaki dosya taranmaz; aynı ihlal depoda kırmızı', async () => {
  const ihlal = `${BEKLE}bekle();`;
  assert.deepEqual(await kurallar(SUNUCU, ihlal), [SOZ]);

  // Gerçek ağaç gibi kendi yapılandırmasını taşır: en yakın yapılandırma seçilse de kök taramaz.
  const agac = join(KOK, '.claude/worktrees', `lint-testi-${process.pid}`);
  await mkdir(join(agac, 'sunucu'), { recursive: true });
  try {
    await copyFile(join(KOK, 'eslint.config.js'), join(agac, 'eslint.config.js'));
    await writeFile(join(agac, 'sunucu/ana.ts'), ihlal);
    // Sabit önekli yol aramayı o klasörden başlatır ve kök yapılandırmayı atlar; `**` ile başlayan desen `eslint .` gibi kökten yürür.
    const taranan = await new ESLint({ cwd: KOK, errorOnUnmatchedPattern: false }).lintFiles([`**/${basename(agac)}/**`]);
    assert.deepEqual(taranan.map((s) => relative(KOK, s.filePath)), []);
  } finally {
    await rm(agac, { recursive: true, force: true });
  }
});

test('lint: sunucuda aynı db istemcisine Promise.all ile eşzamanlı sorgu uyarılır; sıralı bekleme ve db siz Promise.all yeşil', async () => {
  const DB = "import type { Db } from './cekirdek/db.ts';\ndeclare const db: Db;\ndeclare function oku(d: Db, n: number): Promise<number>;\n";
  const uyari = async (kod: string): Promise<Array<{ kural: string; agirlik: number }>> => {
    const [sonuc] = await eslint.lintText(`${DB}${kod}`, { filePath: join(KOK, SUNUCU) });
    assert.ok(sonuc);
    return sonuc.messages.map((m) => ({ kural: m.ruleId ?? m.message, agirlik: m.severity }));
  };
  for (const kod of [
    'export const a = await Promise.all([oku(db, 1), oku(db, 2)]);',
    'export const a = await Promise.all([1, 2].map((n) => oku(db, n)));',
    'export const a = await Promise.allSettled([oku(db, 1)]);',
  ]) assert.deepEqual(await uyari(kod), [{ kural: SOZDIZIMI, agirlik: 1 }], kod);
  assert.deepEqual(await uyari('export const a = await oku(db, 1);\nexport const b = await oku(db, 2);'), []);
  assert.deepEqual(await uyari('export const a = await Promise.all([Promise.resolve(1), Promise.resolve(2)]);'), []);
});
