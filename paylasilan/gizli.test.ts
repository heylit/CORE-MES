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
