import assert from 'node:assert/strict';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import stylelint from 'stylelint';

const KOK = fileURLToPath(new URL('../', import.meta.url));
// CI=true iken ayrıştırıcı tek koşu kipine geçer ve sanal kod yerine diskteki dosyayı tip denetler.
process.env.TSESTREE_SINGLE_RUN = 'false';
const eslint = new ESLint({ cwd: KOK });

// Tip bilgili kurallar dosyanın tsconfig kapsamında olmasını ister: kod sanaldır, yol var olan bir dosyanındır.
const SUNUCU = 'sunucu/ana.ts';
const EKRAN = 'istemci/src/App.tsx';
const EKRAN_TESTI = 'istemci/src/App.test.tsx';

const SOZ = '@typescript-eslint/no-floating-promises';
const YANLIS_SOZ = '@typescript-eslint/no-misused-promises';
const TIP_ITHALI = '@typescript-eslint/consistent-type-imports';
const ITHAL = '@typescript-eslint/no-restricted-imports';
const SOZDIZIMI = 'no-restricted-syntax';

async function ihlaller(dosya: string, kod: string): Promise<Array<{ kural: string; mesaj: string }>> {
  const [sonuc] = await eslint.lintText(kod, { filePath: join(KOK, dosya) });
  assert.ok(sonuc, `${dosya} lint kapsamında değil`);
  // Kuralsız ileti ayrıştırma hatası ya da yapılandırma uyarısıdır; metniyle görünür ki sessizce yeşil kalmasın.
  return sonuc.messages.map((m) => ({ kural: m.ruleId ?? m.message, mesaj: m.message }));
}

const kurallar = async (dosya: string, kod: string): Promise<string[]> => (await ihlaller(dosya, kod)).map((i) => i.kural);

async function cssKurallari(dosya: string, kod: string): Promise<string[]> {
  const { results } = await stylelint.lint({ code: kod, codeFilename: join(KOK, dosya), cwd: KOK });
  return results.flatMap((r) => r.warnings.map((u) => u.rule));
}

const BEKLE = 'const bekle = async (): Promise<number> => 1;\n';

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

const deger = (yol: string): string => `import { x } from '${yol}';\nexport const y = x;`;

test('lint: istemci paylasilan dan değer ithal edemez (sözleşme, listede olmayan dosya, takma ad, göreli ve düzgünleştirilmemiş yol)', async () => {
  const yollar = [
    '#paylasilan/sozlesme/saglik.ts',
    '#paylasilan/sozlesme/alt/derin.ts',
    '#paylasilan/kullanici.ts',
    '#paylasilan/kullanici',
    '../../paylasilan/sozlesme/oturum.ts',
    '../../paylasilan/kullanici.ts',
    './../../paylasilan/sozlesme/saglik.ts',
    '../../paylasilan/./sozlesme/saglik.ts',
    '../../istemci/../paylasilan/sozlesme/saglik.ts',
    '../../paylasilan//sozlesme/saglik.ts',
    '#paylasilan/yeni.ts',
    '#paylasilan/kullanici/index.ts',
    '#paylasilan/kullanici-yardimci.ts',
    '#paylasilan/sayfalar.ts/gizli.ts',
    '../../paylasilan/yeni.ts',
  ];
  for (const yol of yollar) {
    assert.deepEqual(await kurallar(EKRAN, deger(yol)), [ITHAL], yol);
    assert.deepEqual(await kurallar(EKRAN, `export const m = await import('${yol}');`), [SOZDIZIMI], yol);
  }
  assert.deepEqual(await kurallar(EKRAN_TESTI, deger('#paylasilan/sozlesme/saglik.ts')), [ITHAL]);
  assert.deepEqual(await kurallar('istemci/vite.config.ts', deger('../paylasilan/sozlesme/saglik.ts')), [ITHAL]);

  const S = '#paylasilan/sozlesme/saglik.ts';
  const bicimler = [
    `import { type X, x } from '${S}';\nexport const y: X = x;`,
    `import {} from '${S}';`,
    `import '${S}';`,
    `export * from '${S}';`,
    `export { x } from '${S}';`,
  ];
  for (const bicim of bicimler) assert.deepEqual(await kurallar(EKRAN, bicim), [ITHAL], bicim);
  assert.deepEqual(await kurallar(EKRAN, `declare const require: (yol: string) => unknown;\nexport const r = require('${S}');`), [SOZDIZIMI]);
  assert.match((await ihlaller(EKRAN, deger(S)))[0]?.mesaj ?? '', /zod.*istemci paketine.*import type/);
});

test('lint: paylasilan tip ithali, zod taşımadığı bilinen dosyalar ve istemci dışı değer ithali yeşil', async () => {
  const S = '#paylasilan/sozlesme/saglik.ts';
  const yesil = [
    `import type { X } from '${S}';\nexport type Y = X;`,
    `import { type X } from '${S}';\nexport type Y = X;`,
    `import type { X } from './../../paylasilan/sozlesme/saglik.ts';\nexport type Y = X;`,
    `export type { X } from '${S}';`,
    `import type { X } from '#paylasilan/yeni.ts';\nexport type Y = X;`,
    `import { type X } from '#paylasilan/kullanici/index.ts';\nexport type Y = X;`,
    deger('#paylasilan/sayfalar.ts'),
    deger('#paylasilan/hata.ts'),
    deger('#paylasilan/islemler.ts'),
    deger('#paylasilan/ortam.ts'),
    deger('../../paylasilan/hata.ts'),
    deger('#baska/yeni.ts'),
    deger('./sozlesme/saglik.ts'),
  ];
  for (const kod of yesil) assert.deepEqual(await kurallar(EKRAN, kod), [], kod);
  assert.deepEqual(await kurallar(SUNUCU, deger(S)), []);
  assert.deepEqual(await kurallar(SUNUCU, `export const m = await import('${S}');`), []);
});

test('lint: tsx içinde style özniteliği ve renk özniteliğinde hex kırmızı; test dosyası muaf', async () => {
  const stil = 'export const A = () => <div style={{ margin: 0 }} />;';
  assert.deepEqual(await kurallar(EKRAN, stil), [SOZDIZIMI]);
  assert.match((await ihlaller(EKRAN, stil))[0]?.mesaj ?? '', /^inline stil/);
  assert.deepEqual(await kurallar(EKRAN, 'export const A = ({ s }: { s: object }) => <div style={s} />;'), [SOZDIZIMI]);

  const hexler = [
    'export const A = () => <path fill="#fff" />;',
    'export const A = () => <path stroke={`#1a2b3c`} />;',
    "export const A = ({ a }: { a: boolean }) => <path color={a ? '#1a2b3c80' : 'none'} />;",
  ];
  for (const kod of hexler) {
    assert.deepEqual(await kurallar(EKRAN, kod), [SOZDIZIMI], kod);
    assert.match((await ihlaller(EKRAN, kod))[0]?.mesaj ?? '', /^hex renk/, kod);
  }

  const yesil = [
    'export const A = () => <div className="tc-kart" />;',
    'export const A = () => <a href="#abc" id="#fff">a</a>;',
    "export const A = ({ a }: { a: boolean }) => <path fill={a ? 'currentColor' : 'none'} stroke=\"url(#abc)\" d=\"#fff\" />;",
    "export const style = { color: '#fff' };",
  ];
  for (const kod of yesil) assert.deepEqual(await kurallar(EKRAN, kod), [], kod);

  const ikisi = 'export const A = () => <path style={{ margin: 0 }} fill="#fff" />;';
  assert.deepEqual(await kurallar(EKRAN, ikisi), [SOZDIZIMI, SOZDIZIMI]);
  assert.deepEqual(await kurallar(EKRAN_TESTI, ikisi), []);
});

test('lint: istemcide crypto.randomUUID kırmızı; ortak kimlik üreticisi, test ve sunucu muaf (S-03)', async () => {
  const ISTEMCI_TS = 'istemci/src/ortak/veri/api.ts';
  const kirmizi = [
    'export const k = crypto.randomUUID();',
    'export const k = globalThis.crypto.randomUUID();',
    "export const k = window.crypto['randomUUID']();",
    'const { randomUUID } = crypto;\nexport const k = randomUUID();',
  ];
  for (const kod of kirmizi) {
    assert.deepEqual(await kurallar(ISTEMCI_TS, kod), [SOZDIZIMI], kod);
    assert.match((await ihlaller(ISTEMCI_TS, kod))[0]?.mesaj ?? '', /^crypto\.randomUUID düz http/, kod);
  }
  assert.deepEqual(await kurallar(EKRAN, 'export const A = () => <div id={crypto.randomUUID()} />;'), [SOZDIZIMI]);

  const cagri = 'export const k = crypto.randomUUID();';
  assert.deepEqual(await kurallar('istemci/src/ortak/veri/istek-kimligi.ts', cagri), []);
  assert.deepEqual(await kurallar(EKRAN_TESTI, cagri), []);
  assert.deepEqual(await kurallar(SUNUCU, "import { randomUUID } from 'node:crypto';\nexport const k = randomUUID();"), []);
  assert.deepEqual(await kurallar(ISTEMCI_TS, 'export const k = crypto.getRandomValues(new Uint8Array(16));'), []);
});

test('lint: dosya içi kapatma yorumu ihlali gizlemez', async () => {
  const stil = 'export const A = () => <div style={{ margin: 0 }} />;';
  for (const yorum of ['// eslint-disable-next-line no-restricted-syntax', '// eslint-disable-next-line', '/* eslint-disable */']) {
    const sonuc = await kurallar(EKRAN, `${yorum}\n${stil}`);
    assert.ok(sonuc.includes(SOZDIZIMI), yorum);
  }
  assert.ok((await kurallar(SUNUCU, `${BEKLE}bekle(); // eslint-disable-line`)).includes(SOZ));

  const CSS = 'istemci/src/moduller/stok/liste.css';
  assert.deepEqual(await cssKurallari(CSS, '.a { color: #fff; /* stylelint-disable-line */ }'), ['color-no-hex']);
  assert.deepEqual(await cssKurallari(CSS, '/* stylelint-disable */\n.a { color: #fff; }'), ['color-no-hex']);
  assert.deepEqual(await cssKurallari(CSS, '/* stylelint-disable-next-line color-no-hex */\n.a { color: #fff; }'), ['color-no-hex']);
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

test('lint: css içinde hex istemcinin her yerinde kırmızı; yalnız tasarım değişkenleri dosyası ve dist dışarıda', async () => {
  const hex = '.a { color: #fff; }';
  assert.deepEqual(await cssKurallari('istemci/src/moduller/stok/liste.css', hex), ['color-no-hex']);
  assert.deepEqual(await cssKurallari('istemci/zzdis.css', hex), ['color-no-hex']);
  assert.deepEqual(await cssKurallari('istemci/src/moduller/stok/tokens.css', ':root { --ink: #101418; }'), ['color-no-hex']);
  assert.deepEqual(await cssKurallari('istemci/src/ortak/tasarim/renkler.css', ':root { --ink: #101418; }'), ['color-no-hex']);

  assert.deepEqual(await cssKurallari('istemci/src/ortak/tasarim/tokens.css', ':root { --ink: #101418; }'), []);
  assert.deepEqual(await cssKurallari('istemci/dist/assets/x.css', hex), []);
  assert.deepEqual(await cssKurallari('istemci/src/dist/a.css', hex), ['color-no-hex']);
  const yesil = ['.a { color: var(--ink); }', '#abc { display: grid; }', ".a { background: url(simge.svg#abc); content: '#abc'; }", '/* #fff */'];
  for (const kod of yesil) assert.deepEqual(await cssKurallari('istemci/src/moduller/stok/liste.css', kod), [], kod);
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
