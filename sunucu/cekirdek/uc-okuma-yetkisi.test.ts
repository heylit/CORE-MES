import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db, Veritabani } from './db.ts';
import { uc, ucEnvanteri, uclariKaydet, yetkiMetni } from './uc.ts';
import type { DenetimGirdisi, OkumaYetkisi, Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

const bos: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
const vt: Veritabani = { ...bos, tx: (is) => is(bos), okumaTx: (is) => is(bos), kapat: async () => undefined };

const KISILER: Record<string, Kullanici> = {
  sayfaGoren: { id: 1, ad: 'sayfaGoren', islemler: ['sayfa.istasyonlar'] },
  digerSayfa: { id: 2, ad: 'digerSayfa', islemler: ['sayfa.uretim-emirleri'] },
  veriOkuyan: { id: 3, ad: 'veriOkuyan', islemler: ['kisiler.oku'] },
  ilgisiz: { id: 4, ad: 'ilgisiz', islemler: ['sayfa.stok', 'malzemeler.yaz'] },
  islemsiz: { id: 5, ad: 'islemsiz', islemler: [] },
};

function kur(uclar: readonly Uc[]): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, kimlik: async (istek) => KISILER[String(istek.headers['x-kullanici'])] ?? null });
  return app;
}

const okuma = uc({
  yontem: 'GET', yol: '/istasyonlar', yetki: { biri: ['sayfa.istasyonlar', 'sayfa.uretim-emirleri', 'kisiler.oku'] },
  cevap: z.object({ kim: z.string() }),
  isle: ({ kullanici }) => ({ kim: kullanici.ad }),
});

test('okuma ucu listedeki sayfa ya da veri işlemlerinden birini ister: listedekiler 200, ötekiler 403, kimliksiz 401', async () => {
  const app = kur([okuma]);
  const dene = async (ad?: string) =>
    app.inject({ method: 'GET', url: '/api/istasyonlar', ...(ad ? { headers: { 'x-kullanici': ad } } : {}) });
  for (const ad of ['sayfaGoren', 'digerSayfa', 'veriOkuyan']) {
    const cevap = await dene(ad);
    assert.equal(cevap.statusCode, 200, ad);
    assert.deepEqual(cevap.json(), { kim: ad });
  }
  for (const ad of ['ilgisiz', 'islemsiz']) {
    const cevap = await dene(ad);
    assert.equal(cevap.statusCode, 403, ad);
    assert.equal(cevap.json().kod, 'YETKI_YOK', ad);
  }
  const kimliksiz = await dene();
  assert.equal(kimliksiz.statusCode, 401);
  assert.equal(kimliksiz.json().kod, 'OTURUM_YOK');
});

test('işlem listesi dolu, kayıtlı ve yinelenmeyen işlemlerle kurulur; okuma ve yazma ucunda verilebilir', () => {
  const ortak = { yol: '/x', cevap: z.object({}), isle: () => ({}) } as const;
  for (const yontem of ['POST', 'PUT', 'DELETE'] as const) {
    assert.deepEqual(uc({ ...ortak, yontem, yetki: { biri: ['sayfa.istasyonlar'] } }).yetki, { biri: ['sayfa.istasyonlar'] }, yontem);
  }
  assert.throws(() => uc({ ...ortak, yontem: 'GET', yetki: { biri: [] as unknown as OkumaYetkisi['biri'] } }), /boş olamaz/);
  // @ts-expect-error kayıtlı olmayan işlem derlenmez; çalışma anında da durur.
  assert.throws(() => uc({ ...ortak, yontem: 'GET', yetki: { biri: ['sayfa.yok'] } }), /kayıtlı olmayan işlem istiyor \(sayfa\.yok\)/);
  // @ts-expect-error rol adı işlem değildir.
  assert.throws(() => uc({ ...ortak, yontem: 'GET', yetki: { biri: ['sayfa.stok', 'yonetici'] } }), /kayıtlı olmayan işlem/);
  assert.throws(() => uc({ ...ortak, yontem: 'GET', yetki: { biri: ['sayfa.stok', 'sayfa.stok'] } }), /yinelenen/);
  assert.equal(yetkiMetni(uc({ ...ortak, yontem: 'GET', yetki: { biri: ['sayfa.stok', 'kisiler.oku'] } }).yetki), 'biri:sayfa.stok|kisiler.oku');
});

// Kart: Arkon yazma uçları 'oturum' yerine sayfa üçlüsüne bağlanacak (ADR 0007 madde 2 değişikliği).
const yazmaGirdileri: DenetimGirdisi[] = [];
const yazma = uc({
  yontem: 'POST', yol: '/istasyonlar/:id/not', yetki: { biri: ['sayfa.istasyonlar', 'sayfa.uretim-emirleri'] },
  parametre: z.object({ id: z.coerce.number().int() }), govde: z.object({ not: z.string() }),
  cevap: z.object({ kim: z.string() }),
  isle: ({ kullanici }) => ({ kim: kullanici.ad }),
});

test('yazma ucu listedeki işlemlerden birini ister: listedekiler 200 ve denetime yazılır, ötekiler 403, kimliksiz 401', async () => {
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, [yazma], {
    vt, kimlik: async (istek) => KISILER[String(istek.headers['x-kullanici'])] ?? null,
    denetle: async (_db, girdi) => { yazmaGirdileri.push(girdi); },
  });
  const dene = async (ad?: string) => app.inject({
    method: 'POST', url: '/api/istasyonlar/7/not', payload: { not: 'x' }, ...(ad ? { headers: { 'x-kullanici': ad } } : {}),
  });
  for (const ad of ['sayfaGoren', 'digerSayfa']) {
    const cevap = await dene(ad);
    assert.equal(cevap.statusCode, 200, ad);
    assert.deepEqual(cevap.json(), { kim: ad });
  }
  for (const ad of ['veriOkuyan', 'ilgisiz', 'islemsiz']) {
    const cevap = await dene(ad);
    assert.equal(cevap.statusCode, 403, ad);
    assert.equal(cevap.json().kod, 'YETKI_YOK', ad);
  }
  const kimliksiz = await dene();
  assert.equal(kimliksiz.statusCode, 401);
  assert.deepEqual(yazmaGirdileri.map((g) => [g.kisiId, g.yetki]), [
    [1, 'biri:sayfa.istasyonlar|sayfa.uretim-emirleri'], [2, 'biri:sayfa.istasyonlar|sayfa.uretim-emirleri'],
  ]);
});

test('kayıttan sonra değişen liste yetkiyi genişletmez', async () => {
  const liste: ['sayfa.istasyonlar', ...('sayfa.istasyonlar' | 'sayfa.stok')[]] = ['sayfa.istasyonlar'];
  const tanim = uc({ yontem: 'GET', yol: '/degisen', yetki: { biri: liste }, cevap: z.object({}), isle: () => ({}) });
  liste.push('sayfa.stok');
  const cevap = await kur([tanim]).inject({ method: 'GET', url: '/api/degisen', headers: { 'x-kullanici': 'ilgisiz' } });
  assert.equal(cevap.statusCode, 403);
});

test('envanter listeyi taşır; düz işlem ve işaretler aynen kalır', () => {
  const [ozet] = ucEnvanteri([okuma]);
  assert.deepEqual(ozet?.yetki, { biri: ['sayfa.istasyonlar', 'sayfa.uretim-emirleri', 'kisiler.oku'] });
  assert.equal(yetkiMetni('oturum'), 'oturum');
  assert.equal(yetkiMetni('kisiler.oku'), 'kisiler.oku');
});
