import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { GIZLI_DEGER, gizli, semayaGoreGizle, taninmayanTurler } from './gizli.ts';
import { kendiParolaGovdesi, kendiPinGovdesi } from './sozlesme/oturum.ts';

test('izinli: işaretsiz alan aynen kalır; reddedilen: işaretli alanın değeri kayda girmez, adı kalır', () => {
  const sema = z.object({ ad: z.string(), eski: gizli(z.string()) });
  assert.deepEqual(semayaGoreGizle(sema, { ad: 'Ayşe', eski: 'Gizli123!' }), { ad: 'Ayşe', eski: GIZLI_DEGER });
});

test('adı bir şey söylemeyen alan da işaretiyle gizlenir: kendi PIN ve parola değiştirme gövdesi', () => {
  assert.deepEqual(semayaGoreGizle(kendiPinGovdesi, { eski: 'Gizli123!', yeniPin: '4821' }), { eski: GIZLI_DEGER, yeniPin: GIZLI_DEGER });
  assert.deepEqual(semayaGoreGizle(kendiParolaGovdesi, { eskiParola: 'a', yeniParola: 'b' }), { eskiParola: GIZLI_DEGER, yeniParola: GIZLI_DEGER });
});

test('işaret sarmalayıcıların ve iç içe yapının içinde de bulunur', () => {
  const ic = z.object({ pin: gizli(z.string()).optional(), not: z.string() });
  const sema = z
    .object({ satirlar: z.array(ic), sozluk: z.record(z.string(), ic), secenek: z.union([ic, z.number()]).nullable().default(null) })
    .refine(() => true);
  const deger = { satirlar: [{ pin: '1', not: 'a' }], sozluk: { x: { pin: '2', not: 'b' } }, secenek: { pin: '3', not: 'c' } };
  assert.deepEqual(semayaGoreGizle(sema, deger), {
    satirlar: [{ pin: GIZLI_DEGER, not: 'a' }], sozluk: { x: { pin: GIZLI_DEGER, not: 'b' } }, secenek: { pin: GIZLI_DEGER, not: 'c' },
  });
});

test('reddedilen: verilmemiş gizli alan uydurulmaz; şemasız uçta gövde olduğu gibi döner', () => {
  const sema = z.object({ pin: gizli(z.string()).optional() });
  assert.deepEqual(semayaGoreGizle(sema, {}), {});
  assert.deepEqual(semayaGoreGizle(null, { pin: '1' }), { pin: '1' });
});

test('sıralı dizi (tuple) öğelerindeki işaret de bulunur; fazladan öğe kalanın şemasıyla yürünür', () => {
  const sema = z.tuple([z.string(), gizli(z.string())]).rest(gizli(z.string()));
  assert.deepEqual(semayaGoreGizle(sema, ['ad', 'pin', 'ek']), ['ad', GIZLI_DEGER, GIZLI_DEGER]);
});

// Tanınmayan şema türü (zod sürümü değişince gelen yeni sarmalayıcı, Map, Set) içine bakılamaz: değer açık geçmez, gizlenir.
test('tanınmayan şema türünde değer gizlenir; yaprak türler aynen kalır', () => {
  class YeniSarmalayici extends z.ZodType<unknown> {
    _parse(girdi: z.ParseInput): z.ParseReturnType<unknown> { return z.OK(girdi.data); }
  }
  const sema = z.object({ yeni: new YeniSarmalayici({}), harita: z.map(z.string(), z.string()), ad: z.string(), adet: z.number(), tur: z.enum(['a', 'b']) });
  assert.deepEqual(
    semayaGoreGizle(sema, { yeni: { pin: '1' }, harita: { x: 'y' }, ad: 'x', adet: 2, tur: 'a' }),
    { yeni: GIZLI_DEGER, harita: GIZLI_DEGER, ad: 'x', adet: 2, tur: 'a' },
  );
  assert.deepEqual(taninmayanTurler(sema), ['YeniSarmalayici', 'ZodMap']);
  assert.deepEqual(taninmayanTurler(z.object({ ad: z.string(), satir: z.array(z.tuple([z.number()])) })), []);
});

// Geçiş kapısı (2162): her şema türünde işaretli alanın değeri kayda girmez, işaretsiz komşusu aynen kalır. Zod sürümü
// değişince bu liste aynı kalmalı ve yeşil olmalıdır; tür eklenirse buraya da eklenir.
test('her şema türünde gizli alan maskelenir, komşusu aynen kalır', () => {
  const ic = z.object({ pin: gizli(z.string()), not: z.string() });
  const deger = { pin: '1234', not: 'a' };
  const maskeli = { pin: GIZLI_DEGER, not: 'a' };
  const durumlar: [string, z.ZodTypeAny, unknown, unknown][] = [
    ['optional', ic.optional(), deger, maskeli],
    ['nullable', ic.nullable(), deger, maskeli],
    ['default', ic.default({ pin: '0', not: 'b' }), deger, maskeli],
    ['catch', ic.catch({ pin: '0', not: 'b' }), deger, maskeli],
    ['readonly', ic.readonly(), deger, maskeli],
    ['brand', ic.brand<'Kayit'>(), deger, maskeli],
    ['refine', ic.refine(() => true), deger, maskeli],
    ['superRefine', ic.superRefine(() => undefined), deger, maskeli],
    ['transform', ic.transform((d) => d), deger, maskeli],
    ['pipe', z.unknown().pipe(ic), deger, maskeli],
    ['preprocess', z.preprocess((d) => d, ic), deger, maskeli],
    ['union', z.union([ic, z.number()]), deger, maskeli],
    ['discriminatedUnion', z.discriminatedUnion('tur', [ic.extend({ tur: z.literal('a') }), z.object({ tur: z.literal('b') })]),
      { ...deger, tur: 'a' }, { ...maskeli, tur: 'a' }],
    ['intersection', z.intersection(z.object({ not: z.string() }), z.object({ pin: gizli(z.string()) })), deger, maskeli],
    ['tuple', z.tuple([z.string(), gizli(z.string())]), ['a', '1234'], ['a', GIZLI_DEGER]],
    ['array', z.array(ic), [deger], [maskeli]],
    ['record', z.record(z.string(), ic), { x: deger }, { x: maskeli }],
    ['lazy', z.lazy(() => ic), deger, maskeli],
    ['strict', ic.strict(), deger, maskeli],
    ['passthrough', ic.passthrough(), { ...deger, ek: 'e' }, { ...maskeli, ek: 'e' }],
    ['gizli optional', z.object({ pin: gizli(z.string().optional()), not: z.string() }), deger, maskeli],
    ['gizli nullable null', z.object({ pin: gizli(z.string()).nullable(), not: z.string() }), { pin: null, not: 'a' }, maskeli],
    ['gizli default', z.object({ pin: gizli(z.string()).default('0'), not: z.string() }), deger, maskeli],
  ];
  for (const [ad, sema, girdi, beklenen] of durumlar) {
    assert.deepEqual(semayaGoreGizle(sema, girdi), beklenen, ad);
    assert.deepEqual(taninmayanTurler(sema), [], ad);
  }
});
