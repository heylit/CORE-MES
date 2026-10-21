import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { z } from 'zod';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { Db, Veritabani } from './db.ts';
import { UygulamaHatasi, cakisma, mesgul } from './hata.ts';
import { uc, ucEnvanteri, uclariKaydet } from './uc.ts';
import type { DenetimGirdisi, Kimlik, Uc } from './uc.ts';
import { GUVENILEN_VEKIL, hataYonetiminiKur, vekilUyarisiniKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

const KULLANICILAR: Record<string, Kullanici> = {
  okur: { id: 1, ad: 'okur', islemler: ['kisiler.oku', 'sayfa.personel'] },
  yazar: { id: 2, ad: 'yazar', islemler: ['kisiler.oku', 'kisiler.yaz'] },
};

const kimlik: Kimlik = async (istek) => {
  const ad = istek.headers['x-kullanici'];
  return typeof ad === 'string' ? (KULLANICILAR[ad] ?? null) : null;
};

function sahteVt(): { vt: Veritabani; txDb: Db; okumaDb: Db; gunluk: string[]; havuzSorgulari: string[] } {
  const gunluk: string[] = [];
  const havuzSorgulari: string[] = [];
  const bos = {
    sorgu: async <T>(): Promise<T[]> => [],
    tek: async <T>(): Promise<T | null> => null,
  };
  const txDb: Db = { ...bos };
  const okumaDb: Db = { ...bos };
  const kos = async <T>(baslangic: string, db: Db, is: (db: Db) => Promise<T>): Promise<T> => {
    gunluk.push(baslangic);
    try {
      const sonuc = await is(db);
      gunluk.push('COMMIT');
      return sonuc;
    } catch (hata) {
      gunluk.push('ROLLBACK');
      throw hata;
    }
  };
  const vt: Veritabani = {
    sorgu: async <T>(sql: string): Promise<T[]> => { havuzSorgulari.push(sql); return []; },
    tek: async <T>(sql: string): Promise<T | null> => { havuzSorgulari.push(sql); return null; },
    tx: (is) => kos('BEGIN', txDb, is),
    okumaTx: (is) => kos('BEGIN OKUMA', okumaDb, is),
    kapat: async () => undefined,
  };
  return { vt, txDb, okumaDb, gunluk, havuzSorgulari };
}

function kur(uclar: readonly Uc[], vt: Veritabani = sahteVt().vt): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, kimlik });
  return app;
}

const acikUc = uc({
  yontem: 'GET',
  yol: '/acik',
  yetki: 'acik',
  cevap: z.object({ tamam: z.boolean() }),
  isle: () => ({ tamam: true }),
});

const yazmaUcu = uc({
  yontem: 'POST',
  yol: '/stok/hareket',
  yetki: 'kisiler.yaz',
  govde: z.object({ adet: z.number().int().positive(), not: z.string().optional() }),
  cevap: z.object({ adet: z.number(), kim: z.string() }),
  isle: ({ govde, kullanici }) => ({ adet: govde.adet, kim: kullanici.ad }),
});

test('açık uç kimliksiz 200 döner', async () => {
  const cevap = await kur([acikUc]).inject({ method: 'GET', url: '/api/acik' });
  assert.equal(cevap.statusCode, 200);
  assert.deepEqual(cevap.json(), { tamam: true });
});

test('korumalı uç kimliksiz 401 OTURUM_YOK döner', async () => {
  const cevap = await kur([yazmaUcu]).inject({ method: 'POST', url: '/api/stok/hareket', payload: { adet: 1 } });
  assert.equal(cevap.statusCode, 401);
  assert.equal(cevap.json().kod, 'OTURUM_YOK');
});

test('yetkisi yetmeyen kullanıcı 403 YETKI_YOK alır; yetkili kullanıcı 200 alır', async () => {
  const app = kur([yazmaUcu]);
  const istek = { method: 'POST', url: '/api/stok/hareket', payload: { adet: 3 } } as const;

  const yetkisiz = await app.inject({ ...istek, headers: { 'x-kullanici': 'okur' } });
  assert.equal(yetkisiz.statusCode, 403);
  assert.equal(yetkisiz.json().kod, 'YETKI_YOK');

  const yetkili = await app.inject({ ...istek, headers: { 'x-kullanici': 'yazar' } });
  assert.equal(yetkili.statusCode, 200);
  assert.deepEqual(yetkili.json(), { adet: 3, kim: 'yazar' });
});

test('yetki denetimi doğrulamadan önce gelir: yetkisiz kullanıcı hatalı gövdeyle de 403 alır', async () => {
  const cevap = await kur([yazmaUcu]).inject({
    method: 'POST',
    url: '/api/stok/hareket',
    headers: { 'x-kullanici': 'okur' },
    payload: { adet: 'x' },
  });
  assert.equal(cevap.statusCode, 403);
});

test('hatalı gövde 400 DOGRULAMA ve ilk hatalı alanı döner; işleyici koşmaz', async () => {
  const { vt, gunluk } = sahteVt();
  const cevap = await kur([yazmaUcu], vt).inject({
    method: 'POST',
    url: '/api/stok/hareket',
    headers: { 'x-kullanici': 'yazar' },
    payload: { adet: -2 },
  });
  assert.equal(cevap.statusCode, 400);
  assert.equal(cevap.json().kod, 'DOGRULAMA');
  assert.equal(cevap.json().alan, 'adet');
  assert.deepEqual(gunluk, []);
});

test('parametre ve sorgu şemadan geçer, tipleri dönüşür; hatalı parametre 400 + alan', async () => {
  const okuma = uc({
    yontem: 'GET',
    yol: '/stok/:id',
    yetki: 'kisiler.oku',
    parametre: z.object({ id: z.coerce.number().int().positive() }),
    sorgu: z.object({ sayfa: z.coerce.number().int().default(1) }),
    cevap: z.object({ id: z.number(), sayfa: z.number() }),
    isle: ({ parametre, sorgu }) => ({ id: parametre.id, sayfa: sorgu.sayfa }),
  });
  const app = kur([okuma]);
  const basliklar = { 'x-kullanici': 'okur' };

  const iyi = await app.inject({ method: 'GET', url: '/api/stok/7?sayfa=3', headers: basliklar });
  assert.deepEqual(iyi.json(), { id: 7, sayfa: 3 });

  const kotu = await app.inject({ method: 'GET', url: '/api/stok/abc', headers: basliklar });
  assert.equal(kotu.statusCode, 400);
  assert.equal(kotu.json().alan, 'id');
});

test('cevap şemasında olmayan alan dışarı çıkmaz', async () => {
  const kayit = { ad: 'kalem', gizli: 'iç bilgi' };
  const sizdiran = uc({
    yontem: 'GET',
    yol: '/kayit',
    yetki: 'acik',
    cevap: z.object({ ad: z.string() }),
    isle: () => kayit,
  });
  const cevap = await kur([sizdiran]).inject({ method: 'GET', url: '/api/kayit' });
  assert.equal(cevap.statusCode, 200);
  assert.deepEqual(cevap.json(), { ad: 'kalem' });
  assert.equal(cevap.body.includes('gizli'), false);
});

test('GET okuma transaction içinde, txDisi GET doğrudan veritabanıyla, POST tek transaction içinde koşar', async () => {
  const { vt, txDb, okumaDb, gunluk, havuzSorgulari } = sahteVt();
  const gorulen: Db[] = [];
  const cevap = z.object({ tamam: z.boolean() });
  const oku = uc({
    yontem: 'GET', yol: '/is', yetki: 'acik', cevap,
    isle: ({ db }) => { gorulen.push(db); return { tamam: true }; },
  });
  const yaz = uc({
    yontem: 'POST', yol: '/is', yetki: 'acik', cevap,
    isle: ({ db }) => { gorulen.push(db); gunluk.push('isle'); return { tamam: true }; },
  });
  const dogrudan = uc({
    yontem: 'GET', yol: '/dogrudan', yetki: 'acik', txDisi: true, cevap,
    isle: async ({ db }) => {
      gorulen.push(db);
      await db.sorgu('SELECT 1');
      await db.tek('SELECT 2');
      return { tamam: true };
    },
  });
  const app = kur([oku, yaz, dogrudan], vt);

  const okuma = await app.inject({ method: 'GET', url: '/api/is' });
  assert.equal(okuma.statusCode, 200);
  assert.equal(gorulen[0], okumaDb);
  assert.deepEqual(gunluk, ['BEGIN OKUMA', 'COMMIT']);

  gunluk.length = 0;
  const txDisi = await app.inject({ method: 'GET', url: '/api/dogrudan' });
  assert.equal(txDisi.statusCode, 200);
  assert.deepEqual(gunluk, []);
  assert.deepEqual(havuzSorgulari, ['SELECT 1', 'SELECT 2']);
  // İşleyicinin eline veritabanının kendisi geçmez: transaction açamaz, havuzu kapatamaz.
  const eldeki = gorulen[1] as unknown as Record<string, unknown>;
  assert.notEqual(eldeki, vt);
  for (const ad of ['tx', 'okumaTx', 'kapat']) assert.equal(eldeki[ad], undefined, ad);
  assert.equal(typeof (vt as unknown as Record<string, unknown>).tx, 'function');

  const yazma = await app.inject({ method: 'POST', url: '/api/is' });
  assert.equal(yazma.statusCode, 200);
  assert.equal(gorulen[2], txDb);
  assert.deepEqual(gunluk, ['BEGIN', 'isle', 'COMMIT']);
});

test('GET işleyicisi hata fırlatınca okuma transaction geri alınır; yazilarKalir okumada kalıcı kılmaz', async () => {
  const { vt, gunluk } = sahteVt();
  const cevap = z.object({ tamam: z.boolean() });
  const app = kur([
    uc({ yontem: 'GET', yol: '/patla', yetki: 'acik', cevap, isle: () => { throw cakisma('Olmadı.'); } }),
    uc({
      yontem: 'GET', yol: '/kalir', yetki: 'acik', cevap,
      isle: () => { throw new UygulamaHatasi('OTURUM_YOK', 'Reddedildi.', { yazilarKalir: true }); },
    }),
  ], vt);

  assert.equal((await app.inject({ method: 'GET', url: '/api/patla' })).statusCode, 409);
  assert.equal((await app.inject({ method: 'GET', url: '/api/kalir' })).statusCode, 401);
  assert.deepEqual(gunluk, ['BEGIN OKUMA', 'ROLLBACK', 'BEGIN OKUMA', 'ROLLBACK']);
});

test('txDisi yalnız GET ucunda tanımlanabilir', () => {
  const ortak = { yol: '/x', yetki: 'acik', txDisi: true, cevap: z.object({}), isle: () => ({}) } as const;
  assert.throws(() => uc({ ...ortak, yontem: 'POST' }), /Yalnız GET ucu transaction dışında koşabilir: POST \/x/);
  assert.deepEqual(ucEnvanteri([uc({ ...ortak, yontem: 'GET' }), acikUc]).map((u) => u.txDisi), [true, false]);
});

test('POST işleyicisi hata fırlatınca transaction geri alınır ve hata gövdesi döner', async () => {
  const { vt, gunluk } = sahteVt();
  const patlayan = uc({
    yontem: 'POST', yol: '/patla', yetki: 'acik',
    cevap: z.object({ tamam: z.boolean() }),
    isle: () => { throw cakisma('Kayıt başka biri tarafından değiştirildi.'); },
  });
  const cevap = await kur([patlayan], vt).inject({ method: 'POST', url: '/api/patla' });
  assert.equal(cevap.statusCode, 409);
  assert.equal(cevap.json().kod, 'CAKISMA');
  assert.deepEqual(gunluk, ['BEGIN', 'ROLLBACK']);
});

test('cevap şemasına uymayan sonuç yazıyı geri alır ve 500 SUNUCU döner', async () => {
  const { vt, gunluk } = sahteVt();
  const bozuk: unknown = { tamam: 'evet' };
  const uyumsuz = uc({
    yontem: 'POST', yol: '/bozuk', yetki: 'acik',
    cevap: z.object({ tamam: z.boolean() }),
    isle: () => bozuk as { tamam: boolean },
  });
  const cevap = await kur([uyumsuz], vt).inject({ method: 'POST', url: '/api/bozuk' });
  assert.equal(cevap.statusCode, 500);
  assert.equal(cevap.json().kod, 'SUNUCU');
  assert.deepEqual(gunluk, ['BEGIN', 'ROLLBACK']);
});

test('aynı yöntem ve yol iki kez kaydedilemez (aynı çağrıda ya da ayrı çağrılarda)', () => {
  assert.throws(() => kur([acikUc, acikUc]), /iki kez kaydedildi: GET \/acik/);
  const app = kur([acikUc]);
  assert.throws(() => uclariKaydet(app, [acikUc], { vt: sahteVt().vt, kimlik }), /iki kez kaydedildi/);
});

test('uç tanımı yalnız kayıtlı veri işlemini, açık ya da oturum işaretini kabul eder', () => {
  const ortak = { yontem: 'GET', yol: '/x', cevap: z.object({}), isle: () => ({}) } as const;
  for (const yetki of ['kisiler.oku', 'acik', 'oturum'] as const) assert.equal(uc({ ...ortak, yetki }).yetki, yetki);
  // @ts-expect-error kayıtlı olmayan işlem derlenmez; çalışma anında da durur.
  assert.throws(() => uc({ ...ortak, yetki: 'stok.yaz' }), /kayıtlı olmayan işlem istiyor \(stok\.yaz\): GET \/x/);
  // @ts-expect-error sayfa işlemi menü görünürlüğüdür, uç onu isteyemez.
  assert.throws(() => uc({ ...ortak, yetki: 'sayfa.stok' }), /kayıtlı olmayan işlem/);
  // @ts-expect-error kalkan modelin değerleri işlem değildir.
  assert.throws(() => uc({ ...ortak, yetki: 'yonetici' }), /kayıtlı olmayan işlem/);
  assert.throws(() => uc({ ...ortak, yol: 'x', yetki: 'acik' }), /'\/' ile başlamalı/);
});

test('uç envanteri yöntem, yol ve işlemi listeler', () => {
  assert.deepEqual(ucEnvanteri([acikUc, yazmaUcu]), [
    { yontem: 'GET', yol: '/acik', yetki: 'acik', txDisi: false },
    { yontem: 'POST', yol: '/stok/hareket', yetki: 'kisiler.yaz', txDisi: false },
  ]);
});

function kisilerleKur(uclar: readonly Uc[], kisiler: Record<string, Kullanici>): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, {
    vt: sahteVt().vt,
    kimlik: async (istek) => kisiler[String(istek.headers['x-kullanici'])] ?? null,
  });
  return app;
}

test('işlemler birbirini kapsamaz: sayfa işlemi de başka veri işlemi de okuma ucunu açmaz', async () => {
  const okuma = uc({ yontem: 'GET', yol: '/kisiler', yetki: 'kisiler.oku', cevap: z.object({ tamam: z.boolean() }), isle: () => ({ tamam: true }) });
  const app = kisilerleKur([okuma], {
    sayfaGoren: { id: 3, ad: 'sayfaGoren', islemler: ['sayfa.personel'] },
    yazabilen: { id: 4, ad: 'yazabilen', islemler: ['kisiler.yaz', 'kisiler.rol-yonet'] },
    okuyan: { id: 5, ad: 'okuyan', islemler: ['kisiler.oku'] },
  });
  const dene = async (ad: string): Promise<number> =>
    (await app.inject({ method: 'GET', url: '/api/kisiler', headers: { 'x-kullanici': ad } })).statusCode;
  assert.equal(await dene('sayfaGoren'), 403);
  assert.equal(await dene('yazabilen'), 403);
  // Menüde sayfayı görmeyen kişi veriyi işlemiyle okur.
  assert.equal(await dene('okuyan'), 200);
});

test('yalnız oturum isteyen uç: kimliksiz 401; hiç işlemi olmayan kullanıcı 200 ve işleyici kullanıcıyı alır', async () => {
  const kendi = uc({
    yontem: 'POST', yol: '/ben/ayar', yetki: 'oturum',
    cevap: z.object({ kim: z.string() }),
    isle: ({ kullanici }) => ({ kim: kullanici.ad }),
  });
  const app = kisilerleKur([kendi], { yetkisiz: { id: 6, ad: 'yetkisiz', islemler: [] } });
  const kimliksiz = await app.inject({ method: 'POST', url: '/api/ben/ayar' });
  assert.equal(kimliksiz.statusCode, 401);
  assert.equal(kimliksiz.json().kod, 'OTURUM_YOK');
  const kabul = await app.inject({ method: 'POST', url: '/api/ben/ayar', headers: { 'x-kullanici': 'yetkisiz' } });
  assert.equal(kabul.statusCode, 200);
  assert.deepEqual(kabul.json(), { kim: 'yetkisiz' });
});

test('yazilarKalir hatası transactionı kalıcı kılar, yine de hata gövdesi döner', async () => {
  const { vt, gunluk } = sahteVt();
  const reddeden = uc({
    yontem: 'POST', yol: '/reddet', yetki: 'acik',
    cevap: z.object({ tamam: z.boolean() }),
    isle: () => { throw new UygulamaHatasi('OTURUM_YOK', 'Reddedildi.', { yazilarKalir: true }); },
  });
  const cevap = await kur([reddeden], vt).inject({ method: 'POST', url: '/api/reddet' });
  assert.equal(cevap.statusCode, 401);
  assert.equal(cevap.json().mesaj, 'Reddedildi.');
  assert.deepEqual(gunluk, ['BEGIN', 'COMMIT']);
});

test('denetim: başarılı yazma komutu aynı transactionda kaydedilir; okuma ve reddedilen komut kaydedilmez', async () => {
  const { vt, txDb } = sahteVt();
  const kayitlar: { db: Db; girdi: DenetimGirdisi }[] = [];
  const cevap = z.object({ tamam: z.boolean() });
  const uclar = [
    uc({ yontem: 'GET', yol: '/stok/:id', yetki: 'kisiler.oku', cevap, isle: () => ({ tamam: true }) }),
    uc({
      yontem: 'POST', yol: '/stok/:id/duzelt', yetki: 'kisiler.yaz',
      parametre: z.object({ id: z.coerce.number() }),
      govde: z.object({ adet: z.number() }),
      cevap,
      isle: ({ govde }) => { if (govde.adet < 0) throw cakisma('Eksiye düşemez.'); return { tamam: true }; },
    }),
  ];
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, kimlik, denetle: async (db, girdi) => { kayitlar.push({ db, girdi }); } });
  const basliklar = { 'x-kullanici': 'yazar' };

  await app.inject({ method: 'GET', url: '/api/stok/5', headers: basliklar });
  await app.inject({ method: 'POST', url: '/api/stok/5/duzelt', headers: basliklar, payload: { adet: -1 } });
  assert.equal(kayitlar.length, 0);

  await app.inject({ method: 'POST', url: '/api/stok/5/duzelt', headers: basliklar, payload: { adet: 2 } });
  assert.equal(kayitlar.length, 1);
  assert.equal(kayitlar[0]?.db, txDb);
  assert.deepEqual(kayitlar[0]?.girdi, {
    kisiId: 2, yontem: 'POST', yol: '/stok/:id/duzelt', parametre: { id: 5 }, govde: { adet: 2 }, yetki: 'kisiler.yaz',
  });
});

test('çerez: işleyici okur ve yazar; geri alınan komutun çerezi cevaba girmez', async () => {
  const cevap = z.object({ gelen: z.string().nullable() });
  const uclar = [
    uc({
      yontem: 'POST', yol: '/cerez', yetki: 'acik', cevap,
      isle: ({ istek }) => { istek.cerezYaz('deneme', 'abc-1', 60); return { gelen: istek.cerez('deneme') }; },
    }),
    uc({
      yontem: 'POST', yol: '/cerez-patla', yetki: 'acik', cevap,
      isle: ({ istek }) => { istek.cerezSil('deneme'); throw cakisma('Olmadı.'); },
    }),
  ];
  const app = kur(uclar);

  const iyi = await app.inject({ method: 'POST', url: '/api/cerez', headers: { cookie: 'baska=1; deneme=eski' } });
  assert.deepEqual(iyi.json(), { gelen: 'eski' });
  assert.deepEqual(iyi.headers['set-cookie'], ['deneme=abc-1; Path=/; Max-Age=60; HttpOnly; SameSite=Strict']);

  const kotu = await app.inject({ method: 'POST', url: '/api/cerez-patla' });
  assert.equal(kotu.statusCode, 409);
  assert.equal(kotu.headers['set-cookie'], undefined);
});

test('vekil: yalnız aynı makinedeki vekilin X-Forwarded-* başlığı okunur; HTTPS ile gelen çerez Secure taşır', async () => {
  const cevap = z.object({ ip: z.string() });
  const app = Fastify({ trustProxy: GUVENILEN_VEKIL });
  hataYonetiminiKur(app);
  uclariKaydet(app, [
    uc({
      yontem: 'POST', yol: '/vekil', yetki: 'acik', cevap,
      isle: ({ istek }) => { istek.cerezYaz('deneme', 'abc', 60); return { ip: istek.ip }; },
    }),
  ], { vt: sahteVt().vt, kimlik });

  // Vekil istemcinin yolladığı başlığın sonuna gerçek adresi ve kendi protokolünü ekler; öndeki uydurma değer okunmaz.
  const vekilden = await app.inject({
    method: 'POST', url: '/api/vekil', remoteAddress: '127.0.0.1',
    headers: { 'x-forwarded-for': '10.9.9.9, 10.0.0.5', 'x-forwarded-proto': 'http,https' },
  });
  assert.deepEqual(vekilden.json(), { ip: '10.0.0.5' });
  assert.deepEqual(vekilden.headers['set-cookie'], ['deneme=abc; Path=/; Max-Age=60; HttpOnly; SameSite=Strict; Secure']);

  const duzHttp = await app.inject({
    method: 'POST', url: '/api/vekil', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-for': '10.0.0.5', 'x-forwarded-proto': 'http' },
  });
  assert.deepEqual(duzHttp.headers['set-cookie'], ['deneme=abc; Path=/; Max-Age=60; HttpOnly; SameSite=Strict']);

  const dogrudan = await app.inject({
    method: 'POST', url: '/api/vekil', remoteAddress: '10.0.0.7',
    headers: { 'x-forwarded-for': '10.0.0.99', 'x-forwarded-proto': 'https' },
  });
  assert.deepEqual(dogrudan.json(), { ip: '10.0.0.7' });
  assert.deepEqual(dogrudan.headers['set-cookie'], ['deneme=abc; Path=/; Max-Age=60; HttpOnly; SameSite=Strict']);
});

test('vekil uyarısı: güvenilmeyen eşten X-Forwarded-For gelince bir kez uyarır; aynı makinedeki ve tanımlı vekil uyarmaz', async () => {
  const kur = (guvenilen: string[]) => {
    const uyarilar: string[] = [];
    const app = Fastify({ trustProxy: guvenilen });
    vekilUyarisiniKur(app, guvenilen, (ileti) => { uyarilar.push(ileti); });
    hataYonetiminiKur(app);
    uclariKaydet(app, [uc({ yontem: 'GET', yol: '/vekil-ip', yetki: 'acik', cevap: z.object({ ip: z.string() }), isle: ({ istek }) => ({ ip: istek.ip }) })], {
      vt: sahteVt().vt, kimlik,
    });
    return { app, uyarilar };
  };
  const istek = (remoteAddress: string, xff?: string) => ({
    method: 'GET' as const, url: '/api/vekil-ip', remoteAddress, headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
  });

  const bos = kur(GUVENILEN_VEKIL);
  await bos.app.inject(istek('127.0.0.1', '10.0.0.5'));
  await bos.app.inject(istek('::ffff:127.0.0.1', '10.0.0.5'));
  await bos.app.inject(istek('10.0.0.8'));
  assert.deepEqual(bos.uyarilar, []);
  const uzak = await bos.app.inject(istek('10.0.9.5', '10.0.0.5'));
  assert.deepEqual(uzak.json(), { ip: '10.0.9.5' });
  await bos.app.inject(istek('10.0.9.6', '10.0.0.6'));
  assert.equal(bos.uyarilar.length, 1);
  assert.match(bos.uyarilar[0] ?? '', /10\.0\.9\.5.*TMIV2_VEKIL_ADRESI.*kurulum\/canli\.md/);

  const tanimli = kur([...GUVENILEN_VEKIL, '10.0.9.5']);
  assert.deepEqual((await tanimli.app.inject(istek('10.0.9.5', '10.0.0.5'))).json(), { ip: '10.0.0.5' });
  assert.deepEqual(tanimli.uyarilar, []);
});

test('canlı: çerez düz HTTP ile gelen istekte de Secure taşır (HTTPS\'i ters vekil bitirir, kart #175)', async () => {
  const kur = (guvenliCerez: boolean) => {
    const app = Fastify({ trustProxy: GUVENILEN_VEKIL });
    hataYonetiminiKur(app);
    uclariKaydet(app, [
      uc({ yontem: 'POST', yol: '/cerez-yaz', yetki: 'acik', cevap: z.object({}), isle: ({ istek }) => { istek.cerezYaz('deneme', 'abc', 60); return {}; } }),
    ], { vt: sahteVt().vt, kimlik, guvenliCerez });
    return app;
  };
  const istek = { method: 'POST' as const, url: '/api/cerez-yaz', remoteAddress: '127.0.0.1', headers: { 'x-forwarded-proto': 'http' } };
  assert.deepEqual((await kur(true).inject(istek)).headers['set-cookie'], ['deneme=abc; Path=/; Max-Age=60; HttpOnly; SameSite=Strict; Secure']);
  assert.deepEqual((await kur(false).inject(istek)).headers['set-cookie'], ['deneme=abc; Path=/; Max-Age=60; HttpOnly; SameSite=Strict']);
});

const AYRINTI_ISLEMI = 'saglik.ayrinti-oku';

const islemUcu = uc({
  yontem: 'GET',
  yol: '/sistem/ayrinti',
  yetki: AYRINTI_ISLEMI,
  cevap: z.object({ kim: z.string() }),
  isle: ({ kullanici }) => ({ kim: kullanici.ad }),
});

test('işlem isteyen uç: kimliksiz 401; o işlem dışında her işlemi olan 403; yalnız o işlemi olan 200', async () => {
  const app = kisilerleKur([islemUcu], {
    ...KULLANICILAR,
    gerisi: { id: 5, ad: 'gerisi', islemler: ISLEMLER.filter((i) => i !== AYRINTI_ISLEMI) },
    tekIslem: { id: 4, ad: 'tekIslem', islemler: [AYRINTI_ISLEMI] },
  });
  const dene = (ad?: string) =>
    app.inject({ method: 'GET', url: '/api/sistem/ayrinti', ...(ad ? { headers: { 'x-kullanici': ad } } : {}) });

  const kimliksiz = await dene();
  assert.equal(kimliksiz.statusCode, 401);
  assert.equal(kimliksiz.json().kod, 'OTURUM_YOK');

  for (const ad of ['yazar', 'gerisi']) {
    const cevap = await dene(ad);
    assert.equal(cevap.statusCode, 403, ad);
    assert.equal(cevap.json().kod, 'YETKI_YOK', ad);
  }

  const kabul = await dene('tekIslem');
  assert.equal(kabul.statusCode, 200);
  assert.deepEqual(kabul.json(), { kim: 'tekIslem' });
});

test('GET işleyicisi durum kodunu belirler; gövde yine cevap şemasından geçer, kod verilmezse 200', async () => {
  const kayit = { durum: 'hata', gizli: 'iç bilgi' };
  const durumUcu = uc({
    yontem: 'GET',
    yol: '/durum',
    yetki: 'acik',
    sorgu: z.object({ bozuk: z.string().optional() }),
    cevap: z.object({ durum: z.string() }),
    isle: ({ sorgu, istek }) => {
      if (sorgu.bozuk === undefined) return { durum: 'ok' };
      istek.durumKoduYaz(503);
      return kayit;
    },
  });
  const app = kur([durumUcu]);

  const bozuk = await app.inject({ method: 'GET', url: '/api/durum?bozuk=1' });
  assert.equal(bozuk.statusCode, 503);
  assert.deepEqual(bozuk.json(), { durum: 'hata' });
  assert.equal(bozuk.body.includes('gizli'), false);

  const saglam = await app.inject({ method: 'GET', url: '/api/durum' });
  assert.equal(saglam.statusCode, 200);
  assert.deepEqual(saglam.json(), { durum: 'ok' });
});

test('durum kodu: yazma komutunda ve geçersiz kodda 500 SUNUCU; yazma geri alınır, kod cevaba geçmez', async () => {
  const { vt, gunluk } = sahteVt();
  const cevap = z.object({ tamam: z.boolean() });
  // Geçersiz kod çağrı anında reddedilir: işleyicinin devamı koşmaz.
  const kabulEdilen: number[] = [];
  const uclar = [
    uc({
      yontem: 'POST', yol: '/kod', yetki: 'acik', cevap,
      isle: ({ istek }) => { istek.durumKoduYaz(503); return { tamam: true }; },
    }),
    uc({
      yontem: 'GET', yol: '/kod/:kod', yetki: 'acik', cevap,
      parametre: z.object({ kod: z.coerce.number() }),
      isle: ({ parametre, istek }) => { istek.durumKoduYaz(parametre.kod); kabulEdilen.push(parametre.kod); return { tamam: true }; },
    }),
  ];
  const app = kur(uclar, vt);

  const yazma = await app.inject({ method: 'POST', url: '/api/kod' });
  assert.equal(yazma.statusCode, 500);
  assert.equal(yazma.json().kod, 'SUNUCU');
  assert.deepEqual(gunluk, ['BEGIN', 'ROLLBACK']);

  for (const kod of ['100', '199', '600', '200.5']) {
    const gecersiz = await app.inject({ method: 'GET', url: `/api/kod/${kod}` });
    assert.equal(gecersiz.statusCode, 500, kod);
    assert.equal(gecersiz.json().kod, 'SUNUCU', kod);
  }
  for (const kod of [200, 599]) {
    assert.equal((await app.inject({ method: 'GET', url: `/api/kod/${kod}` })).statusCode, kod);
  }
  assert.deepEqual(kabulEdilen, [200, 599]);
});

test('durum kodu ve gövde: gövdesiz dönüş yazılan kodla gider; gövdeyle 204 ya da 304 yazmak 500 SUNUCU', async () => {
  const kodParametresi = z.object({ kod: z.coerce.number() });
  const uclar = [
    uc({
      yontem: 'GET', yol: '/bos/:kod', yetki: 'acik', parametre: kodParametresi, cevap: z.undefined(),
      isle: ({ parametre, istek }) => { istek.durumKoduYaz(parametre.kod); return undefined; },
    }),
    uc({
      yontem: 'GET', yol: '/bos', yetki: 'acik', cevap: z.undefined(),
      isle: () => undefined,
    }),
    uc({
      yontem: 'GET', yol: '/dolu/:kod', yetki: 'acik', parametre: kodParametresi,
      cevap: z.object({ tamam: z.boolean() }),
      isle: ({ parametre, istek }) => { istek.durumKoduYaz(parametre.kod); return { tamam: true }; },
    }),
  ];
  const app = kur(uclar);

  for (const kod of [503, 204]) {
    const bos = await app.inject({ method: 'GET', url: `/api/bos/${kod}` });
    assert.equal(bos.statusCode, kod);
    assert.equal(bos.body, '');
  }
  assert.equal((await app.inject({ method: 'GET', url: '/api/bos' })).statusCode, 204);

  for (const kod of [204, 304]) {
    const dolu = await app.inject({ method: 'GET', url: `/api/dolu/${kod}` });
    assert.equal(dolu.statusCode, 500, String(kod));
    assert.equal(dolu.json().kod, 'SUNUCU', String(kod));
  }
  const gecerli = await app.inject({ method: 'GET', url: '/api/dolu/202' });
  assert.equal(gecerli.statusCode, 202);
  assert.deepEqual(gecerli.json(), { tamam: true });
});

const ulasilamadi = (): Error => Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), { code: 'ECONNREFUSED' });
const KIMLIK_YOK_GOVDESI = { kod: 'VERITABANI_YOK', mesaj: 'Veritabanına ulaşılamıyor, kimlik doğrulanamadı.' };
const SUNUCU_GOVDESI = { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' };

function gunlukluKur(uclar: readonly Uc[], cozucu: () => Kimlik): { app: FastifyInstance; satirlar: string[]; hatalar: () => Array<Record<string, unknown>> } {
  const satirlar: string[] = [];
  const app = Fastify({ logger: { level: 'info', stream: { write: (satir: string) => { satirlar.push(satir); } } } });
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt: sahteVt().vt, kimlik: (istek) => cozucu()(istek) });
  const hatalar = (): Array<Record<string, unknown>> =>
    satirlar.map((satir) => JSON.parse(satir) as Record<string, unknown>).filter((satir) => satir.level === 50);
  return { app, satirlar, hatalar };
}

test('kimlik çözücü veritabanına ulaşamayınca açık ve korumalı uç 503 VERITABANI_YOK döner; başka hatası 500 SUNUCU kalır', async () => {
  const DEGER = 'gizli-deger-503';
  let cozucu: Kimlik = kimlik;
  const { app, satirlar, hatalar } = gunlukluKur([acikUc, yazmaUcu], () => cozucu);
  const acik = () => app.inject({ method: 'GET', url: '/api/acik', headers: { 'x-kullanici': 'yazar' } });
  const yaz = () =>
    app.inject({ method: 'POST', url: '/api/stok/hareket', payload: { adet: 1 }, headers: { 'x-kullanici': 'yazar' } });
  const vtHatasi = (code: string): Error =>
    Object.assign(new pg.DatabaseError(`sunucu iletisi ${code}`, 0, 'error'), { code, detail: `satir (${DEGER})` });
  const ozet = (): unknown[] => hatalar().map((satir) => ({ msg: satir.msg, code: (satir.err as { code?: unknown }).code }));

  assert.equal((await acik()).statusCode, 200);
  assert.equal((await yaz()).statusCode, 200);
  assert.deepEqual(hatalar(), []);

  // Ağ hatası, sunucunun bağlantı sınıfı hatası ve "sunucu kapanıyor" ulaşılamamadır.
  for (const hata of [ulasilamadi(), vtHatasi('08006'), vtHatasi('57P01')]) {
    cozucu = async () => { throw hata; };
    satirlar.length = 0;
    for (const cevap of [await acik(), await yaz()]) {
      assert.equal(cevap.statusCode, 503, hata.message);
      assert.deepEqual(cevap.json(), KIMLIK_YOK_GOVDESI, hata.message);
    }
    const kod = (hata as { code?: string }).code;
    assert.deepEqual(ozet(), [{ msg: 'Kimlik çözülemedi', code: kod }, { msg: 'Kimlik çözülemedi', code: kod }]);
    // Veritabanı hatasının ayrıntı alanı satır değerini taşır; günlüğe geçmez.
    assert.equal(satirlar.join('').includes(DEGER), false, hata.message);
  }

  // Sunucunun cevap verip reddettiği sorgu (eksik tablo, bozuk değer, yanlış parola) ve çözücüdeki kod
  // kusuru ulaşılamama değildir: kullanıcı yanlış nedene bakmasın diye beklenmeyen hata olarak kalır.
  for (const hata of [vtHatasi('42P01'), vtHatasi('22P02'), vtHatasi('28P01'), new TypeError('okunamadi'), new Error('baska')]) {
    cozucu = async () => { throw hata; };
    satirlar.length = 0;
    for (const cevap of [await acik(), await yaz()]) {
      assert.equal(cevap.statusCode, 500, hata.message);
      assert.deepEqual(cevap.json(), SUNUCU_GOVDESI, hata.message);
    }
    assert.deepEqual(hatalar().map((satir) => satir.msg), ['Beklenmeyen hata', 'Beklenmeyen hata'], hata.message);
    assert.equal(satirlar.join('').includes(DEGER), false, hata.message);
  }

  // Çözücünün bilerek fırlattığı uygulama hatası çevrilmez: havuz doluluğu yine MESGUL görünür.
  cozucu = async () => { throw mesgul(); };
  const dolu = await yaz();
  assert.equal(dolu.statusCode, 503);
  assert.equal(dolu.json().kod, 'MESGUL');
});

test('veritabanına ulaşılamayınca yalnız transaction dışı açık uç kimliksiz koşar; öbür açık uç ve transaction dışı işlem ucu 503 alır', async () => {
  let cozucu: Kimlik = kimlik;
  const cagrilar: string[] = [];
  const kimUcu = (yol: string, yetki: 'acik' | typeof AYRINTI_ISLEMI, txDisi: boolean) => uc({
    yontem: 'GET',
    yol,
    yetki,
    ...(txDisi ? { txDisi: true as const } : {}),
    cevap: z.object({ kim: z.string().nullable() }),
    isle: ({ kullanici }) => { cagrilar.push(yol); return { kim: kullanici?.ad ?? null }; },
  });
  const { app, hatalar } = gunlukluKur(
    [kimUcu('/disarida', 'acik', true), kimUcu('/iceride', 'acik', false), kimUcu('/yonetim', AYRINTI_ISLEMI, true)],
    () => cozucu,
  );
  const iste = (yol: string) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { 'x-kullanici': 'yonetici' } });
  const YONETICI: Kullanici = { id: 4, ad: 'yonetici', islemler: [AYRINTI_ISLEMI] };

  // Çözücü sağlıklıyken üç uç da kullanıcıyı görür: null sonucu ya da ret ucun kimliğe hiç bakmamasından gelmiyor.
  cozucu = async () => YONETICI;
  for (const yol of ['/disarida', '/iceride', '/yonetim']) assert.deepEqual((await iste(yol)).json(), { kim: 'yonetici' }, yol);

  cozucu = async () => { throw ulasilamadi(); };
  cagrilar.length = 0;
  const disarida = await iste('/disarida');
  assert.equal(disarida.statusCode, 200);
  assert.deepEqual(disarida.json(), { kim: null });
  assert.deepEqual(hatalar().map((satir) => satir.msg), ['Kimlik çözülemedi']);

  for (const yol of ['/iceride', '/yonetim']) {
    const cevap = await iste(yol);
    assert.equal(cevap.statusCode, 503, yol);
    assert.deepEqual(cevap.json(), KIMLIK_YOK_GOVDESI, yol);
  }
  assert.deepEqual(cagrilar, ['/disarida']);

  // Yutulan yalnız ulaşılamamadır: bu uçta da kod kusuru 500, bilerek fırlatılan uygulama hatası kendi kodudur.
  cozucu = async () => { throw new TypeError('okunamadi'); };
  const kusur = await iste('/disarida');
  assert.equal(kusur.statusCode, 500);
  assert.deepEqual(kusur.json(), SUNUCU_GOVDESI);
  cozucu = async () => { throw mesgul(); };
  assert.equal((await iste('/disarida')).json().kod, 'MESGUL');
  assert.deepEqual(cagrilar, ['/disarida']);
});

test('denetim kipi yalnız oturumlu yazma ucunda tanımlanabilir: GET (transaction dışı dahil), açık uç ve bilinmeyen kip tanım hatasıdır', () => {
  const ortak = { yol: '/x', yetki: 'oturum', cevap: z.object({}), isle: () => ({}) } as const;
  for (const denetim of ['govdesiz', 'yok'] as const) {
    assert.throws(() => uc({ ...ortak, yontem: 'GET', denetim }), /GET ucu denetim kipi alamaz \(okuma denetlenmez\): GET \/x/);
    assert.throws(() => uc({ ...ortak, yontem: 'GET', txDisi: true, denetim }), /GET ucu denetim kipi alamaz/);
    assert.throws(() => uc({ ...ortak, yontem: 'POST', yetki: 'acik', denetim }), /Açık uç denetim kipi alamaz: POST \/x/);
    for (const yontem of ['POST', 'PUT', 'DELETE'] as const) {
      assert.equal(uc({ ...ortak, yontem, denetim }).denetim, denetim);
      assert.equal(uc({ ...ortak, yontem, yetki: 'kisiler.yaz', denetim }).denetim, denetim);
    }
  }
  assert.equal(uc({ ...ortak, yontem: 'POST' }).denetim, 'tam');
  assert.equal(uc({ ...ortak, yontem: 'POST', yetki: 'acik' }).denetim, 'tam');
  // @ts-expect-error tanımda yalnız 'govdesiz' ve 'yok' yazılır; yanlış yazılmış kip sessizce tam sayılmaz.
  assert.throws(() => uc({ ...ortak, yontem: 'POST', denetim: 'govdesz' }), /Bilinmeyen denetim kipi \(govdesz\): POST \/x/);
});

test('denetim kipi: gövdesiz uç kipi denetime iletir, denetimsiz uç denetimi çağırmaz, kipsiz uçta girdi kip taşımaz; envanter tam olmayanı gösterir', async () => {
  const kayitlar: DenetimGirdisi[] = [];
  const ortak = { yontem: 'POST', yetki: 'kisiler.yaz', govde: z.object({ adet: z.number() }), cevap: z.object({ tamam: z.boolean() }) } as const;
  let kosma = 0;
  const isle = (): { tamam: boolean } => { kosma += 1; return { tamam: true }; };
  const uclar = [
    uc({ ...ortak, yol: '/tam', isle }),
    uc({ ...ortak, yol: '/govdesiz', denetim: 'govdesiz', isle }),
    uc({ ...ortak, yol: '/yok', denetim: 'yok', isle }),
  ];
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt: sahteVt().vt, kimlik, denetle: async (_db, girdi) => { kayitlar.push(girdi); } });

  for (const yol of ['/tam', '/govdesiz', '/yok']) {
    const cevap = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { 'x-kullanici': 'yazar' }, payload: { adet: 2 } });
    assert.equal(cevap.statusCode, 200, yol);
  }
  assert.equal(kosma, 3);
  assert.deepEqual(kayitlar, [
    { kisiId: 2, yontem: 'POST', yol: '/tam', parametre: undefined, govde: { adet: 2 }, yetki: 'kisiler.yaz' },
    { kisiId: 2, yontem: 'POST', yol: '/govdesiz', parametre: undefined, govde: { adet: 2 }, yetki: 'kisiler.yaz', kip: 'govdesiz' },
  ]);
  assert.equal('kip' in (kayitlar[0] ?? {}), false);

  assert.deepEqual(ucEnvanteri(uclar), [
    { yontem: 'POST', yol: '/tam', yetki: 'kisiler.yaz', txDisi: false },
    { yontem: 'POST', yol: '/govdesiz', yetki: 'kisiler.yaz', txDisi: false, denetim: 'govdesiz' },
    { yontem: 'POST', yol: '/yok', yetki: 'kisiler.yaz', txDisi: false, denetim: 'yok' },
  ]);
});
