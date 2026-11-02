import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db, Veritabani } from './db.ts';
import { TELEFON_MODULLERI, ikiliCevap, telefondaYasakDosyaMi, uc, uclariKaydet } from './uc.ts';
import type { Denetle, Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';
import type { Kullanici } from './yetki.ts';

// Kart #1358 (1339 a, 1347 a, 1355 a): telefon profili modül kapısı ve dosya türü kapısı. Profili oturum modülü kimlikte koyar.
const bos: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
const vt: Veritabani = { ...bos, tx: (is) => is(bos), okumaTx: (is) => is(bos), kapat: async () => undefined };

const ISLEMLER = ['kisiler.oku'] as Kullanici['islemler'];
const KISILER: Record<string, Kullanici> = {
  profilsiz: { id: 1, ad: 'profilsiz', islemler: ISLEMLER },
  tam: { id: 2, ad: 'tam', islemler: ISLEMLER, cihazProfili: 'tam' },
  istasyon: { id: 3, ad: 'istasyon', islemler: ISLEMLER, cihazProfili: 'istasyon' },
  telefon: { id: 4, ad: 'telefon', islemler: ISLEMLER, cihazProfili: 'telefon' },
};

const cevap = z.object({ tamam: z.literal(true) });
const ucKur = (yol: string, yontem: 'GET' | 'POST' = 'GET'): Uc => uc({ yontem, yol, yetki: 'kisiler.oku', cevap, isle: () => ({ tamam: true as const }) });
const dosyaUcu = (yol: string, tur: string): Uc => uc({
  yontem: 'GET', yol, yetki: 'kisiler.oku', cevap: ikiliCevap,
  isle: () => ({ tur, ad: 'deneme', boyut: 3, akis: async function* () { yield Buffer.from('abc'); } }),
});

function uygulama(denetle?: Denetle): FastifyInstance {
  const app = Fastify();
  hataYonetiminiKur(app);
  const kur = (uclar: readonly Uc[], modul?: string): void => uclariKaydet(app, uclar, {
    vt, kimlik: async (istek) => KISILER[String(istek.headers['x-kullanici'])] ?? null,
    ...(modul === undefined ? {} : { modul }), ...(denetle === undefined ? {} : { denetle }),
  });
  kur([ucKur('/arkon/oku'), ucKur('/arkon/yaz', 'POST'),
    dosyaUcu('/arkon/pdf', 'application/pdf'), dosyaUcu('/arkon/step', 'model/step'), dosyaUcu('/arkon/glb', 'model/gltf-binary'),
    dosyaUcu('/arkon/dxf', 'image/vnd.dxf'), dosyaUcu('/arkon/ag', 'application/octet-stream'),
    dosyaUcu('/arkon/foto', 'image/jpeg'), dosyaUcu('/arkon/video', 'video/mp4')], 'arkon');
  kur([ucKur('/finans/oku'), ucKur('/finans/yaz', 'POST')], 'finans');
  kur([ucKur('/cizimler/onizleme')], 'belge-merkezi');
  kur([ucKur('/modulsuz')]);
  return app;
}

const dene = (app: FastifyInstance, yontem: 'GET' | 'POST', yol: string, ad: string) =>
  app.inject({ method: yontem, url: `/api${yol}`, headers: { 'x-kullanici': ad } });

test('telefon yalnız listedeki modüllere girer; listede olmayan ve modülü bilinmeyen uç 403, öteki profiller etkilenmez', async () => {
  const app = uygulama();
  for (const [yontem, yol] of [['GET', '/finans/oku'], ['POST', '/finans/yaz'], ['GET', '/cizimler/onizleme'], ['GET', '/modulsuz']] as const) {
    const ret = await dene(app, yontem, yol, 'telefon');
    assert.equal(ret.statusCode, 403, yol);
    assert.equal(ret.json().kod, 'YETKI_YOK', yol);
    for (const ad of ['profilsiz', 'tam', 'istasyon']) assert.equal((await dene(app, yontem, yol, ad)).statusCode, 200, `${ad} ${yol}`);
  }
  assert.equal((await dene(app, 'GET', '/arkon/oku', 'telefon')).statusCode, 200);
  assert.equal((await dene(app, 'POST', '/arkon/yaz', 'telefon')).statusCode, 200);
});

test('telefona PDF, 3B, DXF ve imzasız ağ dizisi verilmez, içerik akmaz ve deftere yazılmaz; fotoğraf ve video açılır (1355 a)', async () => {
  const defter: string[] = [];
  const app = uygulama(async (_db, g) => { defter.push(g.yol); });
  for (const yol of ['/arkon/pdf', '/arkon/step', '/arkon/glb', '/arkon/dxf', '/arkon/ag']) {
    const ret = await dene(app, 'GET', yol, 'telefon');
    assert.equal(ret.statusCode, 403, yol);
    assert.equal(ret.json().kod, 'YETKI_YOK', yol);
    assert.equal(ret.body.includes('abc'), false, yol);
    for (const ad of ['tam', 'istasyon', 'profilsiz']) assert.equal((await dene(app, 'GET', yol, ad)).statusCode, 200, `${ad} ${yol}`);
  }
  assert.deepEqual(defter.filter((y) => y === '/arkon/pdf').length, 3, 'yalnız verilen dosya deftere girer');
  for (const yol of ['/arkon/foto', '/arkon/video']) assert.equal((await dene(app, 'GET', yol, 'telefon')).statusCode, 200, yol);
});

test('kapı listeleri: telefon modülleri sabit; yasak türler kayıtlı çizim ve 3B türlerini kapsar', () => {
  assert.ok(TELEFON_MODULLERI.includes('oturum'), 'telefonda giriş ve çıkış açık kalmalı');
  for (const yasak of ['belge-merkezi', 'dosya', 'cnc-kurulum']) assert.equal(TELEFON_MODULLERI.includes(yasak), false, `telefona açılmamalı: ${yasak}`);
  // Yanlış yazılmış ad telefona hiçbir şey açmaz ve terminali sessizce kırar: her ad uçlu bir modül klasörüdür.
  for (const modul of TELEFON_MODULLERI) assert.ok(existsSync(new URL(`../moduller/${modul}/uclar.ts`, import.meta.url)), modul);
  for (const tur of ['application/pdf', 'model/step', 'model/stl', 'model/iges', 'model/gltf-binary', 'model/gltf+json', 'image/vnd.dxf', 'application/octet-stream']) {
    assert.equal(telefondaYasakDosyaMi(tur), true, tur);
  }
  for (const tur of ['image/png', 'image/jpeg', 'image/webp', 'video/mp4']) assert.equal(telefondaYasakDosyaMi(tur), false, tur);
});
