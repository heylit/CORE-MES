import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EKRAN, EKRAN_TESTI, ITHAL, SOZDIZIMI, cssKurallari, deger, ihlaller, kurallar } from './lint-ortak.ts';

// Yalnız istemci programları kurulur; sunucu kuralları lint-sunucu.test.ts'tedir (ayrı süreç, 1863).

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
  assert.deepEqual(await kurallar(ISTEMCI_TS, 'export const k = crypto.getRandomValues(new Uint8Array(16));'), []);
});

test('lint: dosya içi kapatma yorumu ihlali gizlemez', async () => {
  const stil = 'export const A = () => <div style={{ margin: 0 }} />;';
  for (const yorum of ['// eslint-disable-next-line no-restricted-syntax', '// eslint-disable-next-line', '/* eslint-disable */']) {
    const sonuc = await kurallar(EKRAN, `${yorum}\n${stil}`);
    assert.ok(sonuc.includes(SOZDIZIMI), yorum);
  }

  const CSS = 'istemci/src/moduller/stok/liste.css';
  assert.deepEqual(await cssKurallari(CSS, '.a { color: #fff; /* stylelint-disable-line */ }'), ['color-no-hex']);
  assert.deepEqual(await cssKurallari(CSS, '/* stylelint-disable */\n.a { color: #fff; }'), ['color-no-hex']);
  assert.deepEqual(await cssKurallari(CSS, '/* stylelint-disable-next-line color-no-hex */\n.a { color: #fff; }'), ['color-no-hex']);
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
