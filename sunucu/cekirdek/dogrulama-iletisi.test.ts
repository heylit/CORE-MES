import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import type { Veritabani } from './db.ts';
import { turkceIleti } from './dogrulama-iletisi.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

interface Sorun { alan: string; mesaj: string }

function sorunlar(sema: z.ZodTypeAny, deger: unknown): Sorun[] {
  const sonuc = sema.safeParse(deger, { errorMap: turkceIleti });
  assert.equal(sonuc.success, false, `Ret beklenirdi: ${JSON.stringify(deger)}`);
  return (sonuc.error?.issues ?? []).map((s) => ({ alan: s.path.join('.'), mesaj: s.message }));
}

const ileti = (sema: z.ZodTypeAny, deger: unknown): string | undefined => sorunlar(sema, deger)[0]?.mesaj;

test('zorunlu alan, boş bırakılan alan ve yanlış tür ayrı iletiyle söylenir', () => {
  const sema = z.object({ ad: z.string(), adet: z.number(), tam: z.number().int(), acik: z.boolean(), liste: z.array(z.string()), ic: z.object({}) });
  const tam = { ad: 'a', adet: 1, tam: 1, acik: true, liste: [], ic: {} };
  assert.equal(ileti(sema, { ...tam, ad: undefined }), 'Bu alan zorunlu.');
  assert.equal(ileti(sema, { ...tam, ad: null }), 'Bu alan boş bırakılamaz.');
  assert.equal(ileti(sema, { ...tam, ad: 5 }), 'Metin bekleniyor.');
  assert.equal(ileti(sema, { ...tam, adet: 'beş' }), 'Sayı bekleniyor.');
  assert.equal(ileti(sema, { ...tam, tam: 1.5 }), 'Tam sayı bekleniyor.');
  assert.equal(ileti(sema, { ...tam, acik: 'evet' }), 'Evet ya da hayır değeri bekleniyor.');
  assert.equal(ileti(sema, { ...tam, liste: 'a' }), 'Liste bekleniyor.');
  assert.equal(ileti(sema, { ...tam, ic: 3 }), 'Nesne bekleniyor.');
  assert.equal(ileti(z.coerce.number(), 'abc'), 'Sayı bekleniyor.');
});

test('metin uzunluğu: boş, kısa, uzun ve tam uzunluk', () => {
  assert.equal(ileti(z.string().min(1), ''), 'Bu alan boş bırakılamaz.');
  assert.equal(ileti(z.string().min(3), 'ab'), 'En az 3 karakter olmalı.');
  assert.equal(ileti(z.string().max(300), 'a'.repeat(301)), 'En çok 300 karakter olabilir.');
  assert.equal(ileti(z.string().length(4), 'abc'), 'Tam 4 karakter olmalı.');
  assert.equal(ileti(z.string().length(4), 'abcde'), 'Tam 4 karakter olmalı.');
});

test('sayı aralığı: sınır dahil ve hariç, alt ve üst; kat ve sonluluk', () => {
  assert.equal(ileti(z.number().min(1), 0), 'En az 1 olmalı.');
  assert.equal(ileti(z.number().positive(), 0), '0 değerinden büyük olmalı.');
  assert.equal(ileti(z.number().max(100), 101), 'En çok 100 olabilir.');
  assert.equal(ileti(z.number().lt(10), 10), '10 değerinden küçük olmalı.');
  assert.equal(ileti(z.number().multipleOf(5), 7), 'Değer 5 sayısının katı olmalı.');
  assert.equal(ileti(z.number().finite(), Number.POSITIVE_INFINITY), 'Sonlu bir sayı olmalı.');
});

test('liste uzunluğu: boş liste, az ve çok öğe', () => {
  assert.equal(ileti(z.array(z.number()).min(1), []), 'En az bir öğe olmalı.');
  assert.equal(ileti(z.array(z.number()).min(2), [1]), 'En az 2 öğe olmalı.');
  assert.equal(ileti(z.array(z.number()).max(2), [1, 2, 3]), 'En çok 2 öğe olabilir.');
});

test('geçersiz seçenek geçerli değerleri sayar; fazladan alan adıyla söylenir', () => {
  assert.equal(ileti(z.enum(['artan', 'azalan']), 'DESC'), 'Geçersiz seçenek. Geçerli değerler: artan, azalan.');
  assert.equal(ileti(z.object({ ad: z.string() }).strict(), { ad: 'a', x: 1, y: 2 }), 'Tanınmayan alan: x, y.');
  assert.equal(
    ileti(z.discriminatedUnion('tur', [z.object({ tur: z.literal('a') }), z.object({ tur: z.literal('b') })]), { tur: 'c' }),
    'Geçersiz seçenek. Geçerli değerler: a, b.',
  );
});

test('biçim, sabit değer, birleşim ve iletisiz özel denetim', () => {
  assert.equal(ileti(z.string().regex(/^[a-z]+$/), 'A1'), 'Biçim geçersiz.');
  assert.equal(ileti(z.string().email(), 'a'), 'Geçerli bir e-posta adresi girin.');
  assert.equal(ileti(z.string().startsWith('TM'), 'XX'), '"TM" ile başlamalı.');
  assert.equal(ileti(z.literal('evet'), 'hayir'), 'Geçersiz değer.');
  assert.equal(ileti(z.union([z.string(), z.number()]), true), 'Geçersiz değer.');
  assert.equal(ileti(z.string().refine((m) => m === 'a'), 'b'), 'Geçersiz değer.');
  assert.equal(ileti(z.date(), new Date('yok')), 'Geçerli bir tarih girin.');
});

test('şemada elle yazılmış ileti kazanır: denetimde, özel denetimde ve tür iletisinde', () => {
  assert.equal(ileti(z.string().min(1, 'Ad boş olamaz.'), ''), 'Ad boş olamaz.');
  assert.equal(ileti(z.string().max(5, { message: 'Kod en çok 5 harf.' }), 'abcdef'), 'Kod en çok 5 harf.');
  assert.equal(ileti(z.string().regex(/^\d+$/, 'Yalnız rakam.'), 'a'), 'Yalnız rakam.');
  assert.equal(ileti(z.string().refine(() => false, 'Kural tutmadı.'), 'a'), 'Kural tutmadı.');
  assert.equal(ileti(z.number().int('Adet tam sayı olmalı.'), 1.5), 'Adet tam sayı olmalı.');
  assert.equal(ileti(z.object({ ad: z.string({ required_error: 'Ad gerekli.' }) }), {}), 'Ad gerekli.');
  assert.equal(ileti(z.number({ invalid_type_error: 'Adet sayı olmalı.' }), 'x'), 'Adet sayı olmalı.');
  assert.equal(ileti(z.enum(['a', 'b'], { message: 'Tür seçin.' }), 'c'), 'Tür seçin.');
  // Elle yazılmış ileti olan şemada öbür denetimler çevrilmeye devam eder.
  assert.equal(ileti(z.string().min(1, 'Ad boş olamaz.').max(3), 'abcd'), 'En çok 3 karakter olabilir.');
  assert.equal(ileti(z.object({ ad: z.string({ required_error: 'Ad gerekli.' }) }), { ad: 5 }), 'Metin bekleniyor.');
});

test('iç içe alanlarda her sorun kendi yoluyla ve Türkçe iletiyle gelir', () => {
  const sema = z.object({ adimlar: z.array(z.object({ aciklama: z.string().max(300), sure: z.number().min(0) })) });
  assert.deepEqual(sorunlar(sema, { adimlar: [{ aciklama: 'a'.repeat(301), sure: -1 }] }), [
    { alan: 'adimlar.0.aciklama', mesaj: 'En çok 300 karakter olabilir.' },
    { alan: 'adimlar.0.sure', mesaj: 'En az 0 olmalı.' },
  ]);
});

test('uç: doğrulama hatası 400 ile Türkçe ileti, ilk hatalı alan ve bütün sorunları döner', async () => {
  const vt = { tx: async () => { throw new Error('İşleyici koşmamalıydı'); } } as unknown as Veritabani;
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, [
    uc({
      yontem: 'POST', yol: '/emir', yetki: 'acik',
      sorgu: z.object({ sayfa: z.coerce.number().int().min(1).default(1) }),
      govde: z.object({ adimlar: z.array(z.object({ aciklama: z.string().max(300), ad: z.string().min(1, 'Adım adı boş olamaz.') })) }),
      cevap: z.object({}),
      isle: () => ({}),
    }),
  ], { vt, kimlik: async () => null });

  const govde = await app.inject({ method: 'POST', url: '/api/emir', payload: { adimlar: [{ aciklama: 'a'.repeat(301), ad: '' }] } });
  assert.equal(govde.statusCode, 400);
  assert.deepEqual(govde.json(), {
    kod: 'DOGRULAMA',
    mesaj: 'En çok 300 karakter olabilir.',
    alan: 'adimlar.0.aciklama',
    ayrinti: [
      { alan: 'adimlar.0.aciklama', mesaj: 'En çok 300 karakter olabilir.' },
      { alan: 'adimlar.0.ad', mesaj: 'Adım adı boş olamaz.' },
    ],
  });

  const sorgu = await app.inject({ method: 'POST', url: '/api/emir?sayfa=0', payload: { adimlar: [] } });
  assert.deepEqual(sorgu.json(), { kod: 'DOGRULAMA', mesaj: 'En az 1 olmalı.', alan: 'sayfa', ayrinti: [{ alan: 'sayfa', mesaj: 'En az 1 olmalı.' }] });

  const govdesiz = await app.inject({ method: 'POST', url: '/api/emir' });
  assert.equal(govdesiz.statusCode, 400);
  assert.equal(govdesiz.json().mesaj, 'Bu alan zorunlu.');
  assert.equal(govdesiz.json().alan, 'govde');
});
