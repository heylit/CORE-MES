import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { yetkiYok } from './hata.ts';
import type { Db, Veritabani } from './db.ts';
import { uclarinYetkisiniDene } from './test-yetki.ts';
import type { BeklenenYetkiler, CerezAl } from './test-yetki.ts';
import { uc, uclariKaydet } from './uc.ts';
import type { Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

const bos: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
const vt: Veritabani = { ...bos, tx: (is) => is(bos), okumaTx: (is) => is(bos), kapat: async () => undefined };

// Çerez işlem listesini taşır; sahte kimlik onu okur. Gerçek giriş modül testlerindedir (rolluGiris).
const cerezAl: CerezAl = async (islemler) => `deneme=${islemler.join(',')}`;
const cerezdenKisi = (cerez: string | undefined): Kullanici | null => {
  const deger = /deneme=([^;]*)/.exec(cerez ?? '')?.[1];
  return deger === undefined ? null : ({ id: 1, ad: 'deneme', islemler: deger.split(',').filter(Boolean) } as Kullanici);
};

const gorulenTarihler: string[] = [];
const UCLAR: readonly Uc[] = [
  uc({ yontem: 'GET', yol: '/deneme/liste', yetki: { biri: ['sayfa.istasyonlar', 'kisiler.oku'] }, cevap: z.object({}), isle: () => ({}) }),
  uc({ yontem: 'GET', yol: '/deneme/ben', yetki: 'oturum', cevap: z.object({}), isle: () => ({}) }),
  uc({ yontem: 'GET', yol: '/deneme/acik', yetki: 'acik', cevap: z.object({}), isle: () => ({}) }),
  uc({
    yontem: 'POST', yol: '/deneme/:id/yaz', yetki: 'malzemeler.yaz',
    parametre: z.object({ id: z.coerce.number<number>().int() }), govde: z.object({ not: z.string() }), cevap: z.object({}), isle: () => ({}),
  }),
  uc({
    yontem: 'DELETE', yol: '/deneme/gun/:tarih', yetki: 'malzemeler.yaz',
    parametre: z.object({ tarih: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), cevap: z.object({}),
    isle: ({ parametre }) => { gorulenTarihler.push(parametre.tarih); return {}; },
  }),
];
const BEKLENEN: BeklenenYetkiler = {
  'GET /deneme/liste': { biri: ['sayfa.istasyonlar', 'kisiler.oku'] },
  'GET /deneme/ben': 'oturum',
  'GET /deneme/acik': 'acik',
  'POST /deneme/:id/yaz': 'malzemeler.yaz',
  'DELETE /deneme/gun/:tarih': 'malzemeler.yaz',
};
const ISLEMLER = ['sayfa.stok', 'malzemeler.yaz'] as const;

function kur(uclar: readonly Uc[], kimlik: (cerez: string | undefined) => Kullanici | null = cerezdenKisi): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, kimlik: async (istek) => kimlik(istek.headers.cookie) });
  return app;
}

test('izinli: tablo envanterle aynı ve her uç yalnız istediği işlemle geçerse sapma yok; yol parametresi verilen değeri alır', async () => {
  gorulenTarihler.length = 0;
  const sapmalar = await uclarinYetkisiniDene({
    uygulama: kur(UCLAR), uclar: UCLAR, beklenen: BEKLENEN, cerezAl, islemler: ISLEMLER, parametre: { tarih: '2026-10-08' },
  });
  assert.deepEqual(sapmalar, []);
  // Envanterde geçen başka modül işlemleri de denenir: dört işlemden yalnız malzemeler.yaz silme ucuna girer.
  assert.deepEqual(gorulenTarihler, ['2026-10-08']);
});

test('reddedilen: tabloda olmayan uç, tabloda kalan eski uç ve değişen yetki sapmadır', async () => {
  const { 'GET /deneme/ben': _, ...eksik } = BEKLENEN;
  const sapmalar = await uclarinYetkisiniDene({
    uygulama: kur(UCLAR), uclar: UCLAR, cerezAl, islemler: ISLEMLER, parametre: { tarih: '2026-10-08' },
    beklenen: { ...eksik, 'POST /deneme/:id/yaz': 'kisiler.oku', 'GET /deneme/eski': 'kisiler.oku' },
  });
  assert.deepEqual(sapmalar, [
    'GET /deneme/ben: beklenen tabloda yok (yetki "oturum")',
    'POST /deneme/:id/yaz: yetki "malzemeler.yaz", beklenen "kisiler.oku"',
    'GET /deneme/eski: uç yok',
  ]);
});

test('reddedilen: işlemi yok sayan kimlik her işlemli uçta 403 yerine geçtiği için yakalanır', async () => {
  const herSey = (cerez: string | undefined): Kullanici | null =>
    cerez === undefined ? null : ({ id: 1, ad: 'herkes', islemler: ['sayfa.istasyonlar', 'kisiler.oku', 'sayfa.stok', 'malzemeler.yaz'] } as Kullanici);
  const sapmalar = await uclarinYetkisiniDene({
    uygulama: kur(UCLAR, herSey), uclar: UCLAR, beklenen: BEKLENEN, cerezAl, islemler: ISLEMLER, parametre: { tarih: '2026-10-08' },
  });
  assert.ok(sapmalar.includes('POST /deneme/:id/yaz sayfa.stok -> 400, beklenen 403'), sapmalar.join('\n'));
  assert.ok(sapmalar.includes('GET /deneme/liste malzemeler.yaz -> 200, beklenen 403'), sapmalar.join('\n'));
  assert.equal(sapmalar.some((s) => s.includes('kimliksiz')), false);
});

test('reddedilen: doğru işlemle 403 veren uç ve kimliksiz isteği geçiren uç yakalanır', async () => {
  const reddeden = uc({ yontem: 'POST', yol: '/deneme/red', yetki: 'malzemeler.yaz', cevap: z.object({}), isle: () => { throw yetkiYok(); } });
  const app = kur([reddeden], (cerez) => cerezdenKisi(cerez ?? 'deneme='));
  const sapmalar = await uclarinYetkisiniDene({
    uygulama: app, uclar: [reddeden], beklenen: { 'POST /deneme/red': 'malzemeler.yaz' }, cerezAl, islemler: ['malzemeler.yaz'],
  });
  assert.deepEqual(sapmalar, ['POST /deneme/red kimliksiz -> 403, beklenen 401', 'POST /deneme/red malzemeler.yaz -> 403, yetki geçmeliydi']);
});
