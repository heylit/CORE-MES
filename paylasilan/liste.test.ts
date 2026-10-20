import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { AZAMI_SAYFA, listeCevapSemasi, listeSorguAlanlari, sayfaSorguAlanlari } from './liste.ts';
import type { SayfaliListe, SiralamaYonu } from './liste.ts';

const sorguSemasi = z.object({ ...listeSorguAlanlari(['ad', 'kod']), metin: z.string().optional() });
const cevapSemasi = listeCevapSemasi(z.object({ id: z.number() }));

// İstemcinin liste durumu kancasının ürettiği sorgu biçimi (`ListeDurumuSorgusu`): sözleşmenin girdi tipine atanabilmeli.
interface KancaSorgusu { metin?: string; sayfa: number; sayfaBoyu?: number; sirala?: 'ad' | 'kod'; yon?: SiralamaYonu }
const kancadan: KancaSorgusu = { sayfa: 2, sayfaBoyu: 25, sirala: 'kod', yon: 'azalan' };
const girdi: z.input<typeof sorguSemasi> = kancadan;
const cevapTipi: SayfaliListe<{ id: number }> = { satirlar: [], toplam: null, sayfa: 1, sayfaBoyu: 50 } satisfies z.output<typeof cevapSemasi>;

const gecer = (sema: z.ZodTypeAny, deger: unknown): boolean => sema.safeParse(deger).success;

test('liste sorgusu: boş sorguda sayfa 1 ve artan yön; sayfa boyu ile sıralama alanı verilmemiş kalır', () => {
  assert.deepEqual(sorguSemasi.parse({}), { sayfa: 1, yon: 'artan' });
});

test('liste sorgusu: sorgu dizgesinden gelen metin sayıya çevrilir; kancanın gönderdiği biçim aynen geçer', () => {
  assert.deepEqual(
    sorguSemasi.parse({ sayfa: '3', sayfaBoyu: '25', sirala: 'kod', yon: 'azalan', metin: 'a' }),
    { sayfa: 3, sayfaBoyu: 25, sirala: 'kod', yon: 'azalan', metin: 'a' },
  );
  assert.deepEqual(sorguSemasi.parse(girdi), { sayfa: 2, sayfaBoyu: 25, sirala: 'kod', yon: 'azalan' });
});

test('liste sorgusu: sayfa en az 1 dir; üst sınırı aşan sayfa reddedilmez, üst sınıra çekilir; kesirli, boş ve sayı olmayan değer reddedilir', () => {
  const sayfa = z.object(sayfaSorguAlanlari);
  for (const deger of ['1', '2', String(AZAMI_SAYFA)]) assert.equal(sayfa.parse({ sayfa: deger }).sayfa, Number(deger));
  // İstemci kancası adresten dokuz haneye kadar sayfa okur ve gönderir.
  for (const deger of [String(AZAMI_SAYFA + 1), '999999999', '100000000000000000000']) assert.equal(sayfa.parse({ sayfa: deger }).sayfa, AZAMI_SAYFA, deger);
  for (const deger of ['0', '-1', '1.5', '', 'abc', '1e400', ['1', '2']]) {
    assert.equal(gecer(sayfa, { sayfa: deger }), false, JSON.stringify(deger));
  }
});

test('liste sorgusu: sayfa boyu en az 1 tam sayıdır; üst sınırı şema değil sunucu uygular', () => {
  const sayfa = z.object(sayfaSorguAlanlari);
  assert.equal(sayfa.parse({ sayfaBoyu: '1' }).sayfaBoyu, 1);
  assert.equal(sayfa.parse({ sayfaBoyu: '100000' }).sayfaBoyu, 100000);
  for (const deger of ['0', '-5', '2.5', '', 'on', '2147483648']) assert.equal(gecer(sayfa, { sayfaBoyu: deger }), false, deger);
});

test('liste sorgusu: sıralama alanı yalnız modülün saydıklarından biridir; yön iki değerden biridir', () => {
  assert.equal(sorguSemasi.parse({ sirala: 'ad' }).sirala, 'ad');
  for (const deger of ['id', 'AD', '', 'ad; DROP TABLE x', 'ad,kod', 'constructor']) {
    assert.equal(gecer(sorguSemasi, { sirala: deger }), false, deger);
  }
  assert.equal(sorguSemasi.parse({ yon: 'azalan' }).yon, 'azalan');
  for (const deger of ['DESC', 'asc', '', 'Artan']) assert.equal(gecer(sorguSemasi, { yon: deger }), false, deger);
});

test('liste cevabı: sayılmamış toplam null, kayıtsız liste 0 taşır; eksik ya da eksi toplam reddedilir', () => {
  const taban = { satirlar: [{ id: 1 }], sayfa: 1, sayfaBoyu: 50 };
  assert.deepEqual(cevapSemasi.parse({ ...taban, toplam: null }), { ...taban, toplam: null });
  assert.equal(cevapSemasi.parse({ ...taban, satirlar: [], toplam: 0 }).toplam, 0);
  assert.equal(cevapSemasi.parse(cevapTipi).toplam, null);
  assert.equal(gecer(cevapSemasi, taban), false);
  assert.equal(gecer(cevapSemasi, { ...taban, toplam: -1 }), false);
  assert.equal(gecer(cevapSemasi, { ...taban, toplam: 1.5 }), false);
});

test('liste cevabı: uygulanan sayfa ve sayfa boyu zorunludur ve en az 1 dir; satır şemasına uymayan satır reddedilir', () => {
  const taban = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
  assert.equal(gecer(cevapSemasi, taban), true);
  assert.equal(gecer(cevapSemasi, { ...taban, sayfa: 0 }), false);
  assert.equal(gecer(cevapSemasi, { ...taban, sayfaBoyu: 0 }), false);
  assert.equal(gecer(cevapSemasi, { satirlar: [], toplam: 0, sayfaBoyu: 50 }), false);
  assert.equal(gecer(cevapSemasi, { satirlar: [], toplam: 0, sayfa: 1 }), false);
  assert.equal(gecer(cevapSemasi, { ...taban, satirlar: [{ id: 'bir' }] }), false);
});
