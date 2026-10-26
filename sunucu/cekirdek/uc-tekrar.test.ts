import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import type { Veritabani } from './db.ts';
import { istekOzeti, kararliJson } from './tekrar.ts';
import type { TekrarDeposu, TekrarIstegi } from './tekrar.ts';
import { UygulamaHatasi } from './hata.ts';
import { uc, uclariKaydet } from './uc.ts';
import type { Kimlik } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

const cevap = z.object({ tamam: z.boolean() });
const isle = () => ({ tamam: true });

const bosVt: Veritabani = {
  sorgu: async () => [],
  tek: async () => null,
  tx: (is) => is({ sorgu: async () => [], tek: async () => null }),
  okumaTx: (is) => is({ sorgu: async () => [], tek: async () => null }),
  kapat: async () => undefined,
};

const bosDepo: TekrarDeposu = {
  ayir: async () => null,
  sonucYaz: async () => undefined,
  birak: async () => undefined,
};

test('tekrar koruması yalnız yazma ucunda tanımlanabilir: GET tanım hatasıdır, POST/PUT/DELETE kabul edilir', () => {
  const ortak = { yol: '/x', yetki: 'oturum', tekrarKorumali: true, cevap, isle } as const;
  assert.throws(() => uc({ ...ortak, yontem: 'GET' }), /GET ucu tekrar korumalı olamaz: GET \/x/);
  for (const yontem of ['POST', 'PUT', 'DELETE'] as const) {
    assert.equal(uc({ ...ortak, yontem }).tekrarKorumali, true);
  }
  assert.equal(uc({ yontem: 'POST', yol: '/x', yetki: 'oturum', cevap, isle }).tekrarKorumali, false);
});

test('açık uç tekrar korumalı olamaz; oturumlu ve işlemli uç olabilir', () => {
  const ortak = { yontem: 'POST', yol: '/x', tekrarKorumali: true, cevap, isle } as const;
  assert.throws(() => uc({ ...ortak, yetki: 'acik' }), /Açık uç tekrar korumalı olamaz: POST \/x/);
  assert.equal(uc({ ...ortak, yetki: 'oturum' }).tekrarKorumali, true);
  assert.equal(uc({ ...ortak, yetki: 'kisiler.yaz' }).tekrarKorumali, true);
});

test('depo verilmeden kurulan uygulamada tekrar korumalı uç kaydedilir ama korumasız koşmaz: istek açık hatayla 500 alır; öbür uçlar ve depolu kurulum çalışır', async () => {
  let kosma = 0;
  const korumali = uc({
    yontem: 'POST', yol: '/korumali', yetki: 'oturum', tekrarKorumali: true, cevap,
    isle: () => { kosma += 1; return { tamam: true }; },
  });
  const duz = uc({ yontem: 'POST', yol: '/duz', yetki: 'oturum', cevap, isle });
  const kimlik: Kimlik = async (istek) => (istek.headers['x-kim'] === 'var' ? { id: 7, ad: 'deneme', islemler: [] } : null);
  const basliklar = { 'x-kim': 'var', 'istek-kimligi': '6f1b2c3d-0000-4000-8000-000000000002' };
  const hatalar: unknown[] = [];
  const kur = (tekrar?: TekrarDeposu) => {
    const app = Fastify();
    app.setErrorHandler((hata, _istek, yanit) => {
      hatalar.push(hata);
      const durum = hata instanceof UygulamaHatasi ? hata.durum : 500;
      return yanit.code(durum).send({});
    });
    uclariKaydet(app, [duz, korumali], { vt: bosVt, kimlik, ...(tekrar ? { tekrar } : {}) });
    return app;
  };

  const deposuz = kur();
  assert.equal((await deposuz.inject({ method: 'POST', url: '/api/duz', headers: basliklar })).statusCode, 200);
  const deposuzCevap = await deposuz.inject({ method: 'POST', url: '/api/korumali', headers: basliklar });
  assert.equal(deposuzCevap.statusCode, 500);
  assert.equal(kosma, 0);
  assert.match(String((hatalar.at(-1) as Error).message), /tekrar deposu verilmemiş: POST \/korumali/);
  // Kimlik denetimi önce gelir: oturumsuz istek kurulum eksiğini öğrenmez.
  assert.equal((await deposuz.inject({ method: 'POST', url: '/api/korumali' })).statusCode, 401);

  const depolu = await kur(bosDepo).inject({ method: 'POST', url: '/api/korumali', headers: basliklar });
  assert.equal(depolu.statusCode, 200);
  assert.equal(kosma, 1);
});

test('saklı cevap işleyiciyi koşturmadan döner; cevapsız kalmış satır saklı cevap sayılmaz (500)', async () => {
  let kosma = 0;
  const korumali = uc({
    yontem: 'POST', yol: '/korumali', yetki: 'oturum', tekrarKorumali: true, cevap,
    isle: () => { kosma += 1; return { tamam: true }; },
  });
  const kimlik = async () => ({ id: 7, ad: 'deneme', islemler: [] });
  const gorulen: TekrarIstegi[] = [];
  const kur = (durumKodu: number | null) => {
    const app = Fastify();
    hataYonetiminiKur(app);
    const depo: TekrarDeposu = {
      ...bosDepo,
      ayir: async (_db, istek) => { gorulen.push(istek); return { govdeOzeti: istek.govdeOzeti, durumKodu, cevap: { tamam: false } }; },
    };
    uclariKaydet(app, [korumali], { vt: bosVt, kimlik, tekrar: depo });
    return app;
  };
  const istek = { method: 'POST', url: '/api/korumali', headers: { 'istek-kimligi': '6f1b2c3d-0000-4000-8000-000000000001' } } as const;

  const sakli = await kur(200).inject(istek);
  assert.equal(sakli.statusCode, 200);
  assert.deepEqual(sakli.json(), { tamam: false });
  assert.deepEqual(gorulen.map(({ kisiId, istekKimligi, uc: ad }) => ({ kisiId, istekKimligi, ad })), [
    { kisiId: 7, istekKimligi: '6f1b2c3d-0000-4000-8000-000000000001', ad: 'POST /korumali' },
  ]);

  const cevapsiz = await kur(null).inject(istek);
  assert.equal(cevapsiz.statusCode, 500);
  assert.equal(kosma, 0);
});

test('istek özeti alan sırasına bakmaz; yöntem, yol, parametre, sorgu ve gövdenin her biri özeti değiştirir', () => {
  assert.equal(kararliJson({ b: 1, a: [{ d: 2, c: null }] }), '{"a":[{"c":null,"d":2}],"b":1}');
  assert.equal(kararliJson(undefined), 'null');

  const taban = { yontem: 'POST', yol: '/a/:id', parametre: { id: 1 }, sorgu: undefined, govde: { adet: 2, not: 'x' } };
  const ozet = istekOzeti(taban);
  assert.match(ozet, /^[0-9a-f]{64}$/);
  assert.equal(istekOzeti({ ...taban, govde: { not: 'x', adet: 2 } }), ozet);
  for (const baska of [
    { ...taban, yontem: 'PUT' },
    { ...taban, yol: '/b/:id' },
    { ...taban, parametre: { id: 2 } },
    { ...taban, sorgu: { zorla: true } },
    { ...taban, govde: { adet: 3, not: 'x' } },
    { ...taban, govde: { adet: 2 } },
  ]) {
    assert.notEqual(istekOzeti(baska), ozet, JSON.stringify(baska));
  }
});

test('korumasız yazma ucuna istek kimliği gelirse uç adıyla günlüğe uyarı yazılır, istek reddedilmez; kimliksiz istek, korumalı uç ve GET uyarı yazmaz', async () => {
  let kosma = 0;
  const duz = uc({ yontem: 'POST', yol: '/duz', yetki: 'oturum', cevap, isle: () => { kosma += 1; return { tamam: true }; } });
  const korumali = uc({ yontem: 'POST', yol: '/korumali', yetki: 'oturum', tekrarKorumali: true, cevap, isle });
  const okuma = uc({ yontem: 'GET', yol: '/oku', yetki: 'oturum', cevap, isle });
  const satirlar: string[] = [];
  const app = Fastify({ logger: { level: 'warn', stream: { write: (s: string) => { satirlar.push(s); } } } });
  hataYonetiminiKur(app);
  uclariKaydet(app, [duz, korumali, okuma], { vt: bosVt, kimlik: async () => ({ id: 7, ad: 'deneme', islemler: [] }), tekrar: bosDepo });
  const kimlikli = { 'istek-kimligi': '6f1b2c3d-0000-4000-8000-000000000003' };
  const uyarilar = () => satirlar
    .map((s) => JSON.parse(s) as { level: number; msg: string; uc?: string })
    .filter((s) => s.msg === 'Korumasız uca istek kimliği geldi; yineleme koruması yok');

  assert.equal((await app.inject({ method: 'POST', url: '/api/duz', headers: kimlikli })).statusCode, 200);
  assert.equal(kosma, 1);
  assert.deepEqual(uyarilar().map(({ level, uc: ad }) => ({ level, ad })), [{ level: 40, ad: 'POST /duz' }]);

  satirlar.length = 0;
  assert.equal((await app.inject({ method: 'POST', url: '/api/duz' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/korumali', headers: kimlikli })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/oku', headers: kimlikli })).statusCode, 200);
  assert.deepEqual(uyarilar(), []);
  await app.close();
});
