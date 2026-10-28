import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import type { Ayar } from '#cekirdek/ayar.ts';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { uc, uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import { KAPALI_MODULLER } from '#paylasilan/kapali-moduller.ts';
import { uygulamaSecenekleri } from './uygulama-secenekleri.ts';

const AYAR: Ayar = {
  ortam: 'test',
  port: 4100,
  pg: { host: '127.0.0.1', port: 5432, kullanici: 'k', parola: 'p', veritabani: 'sahte', baglantiSureMs: 5000, sorguSureMs: 20000, okumaSureMs: 20000, havuzBoyutu: 10, kilitSureMs: 5000, bosTxSureMs: 30000 },
  pgTestVeritabani: null,
  commit: null,
};

test('sunucunun kablolaması denetimi ve tekrar deposunu verir: korumalı uç anahtar ayırır, komut denetime yazılır', async () => {
  const sorgular: string[] = [];
  const db: Db = {
    sorgu: async <T>(sql: string): Promise<T[]> => { sorgular.push(sql); return []; },
    // Anahtar eklemesi satır döndürür: kimlik yenidir, işleyici koşar.
    tek: async <T>(sql: string): Promise<T | null> => { sorgular.push(sql); return { kisi_id: 7 } as T; },
  };
  const vt: Veritabani = { ...db, tx: (is) => is(db), okumaTx: (is) => is(db), kapat: async () => undefined };
  const secenek = uygulamaSecenekleri(vt, AYAR);
  assert.equal(secenek.vt, vt);
  assert.equal(secenek.ayar, AYAR);

  let kosma = 0;
  const korumali = uc({
    yontem: 'POST', yol: '/korumali', yetki: 'oturum', tekrarKorumali: true, cevap: z.object({ tamam: z.boolean() }),
    isle: () => { kosma += 1; return { tamam: true }; },
  });
  const app = Fastify();
  hataYonetiminiKur(app);
  // Kimlik çözücü gerçek oturum ister; kablolamanın geri kalanı olduğu gibi alınır.
  uclariKaydet(app, [korumali], { ...secenek, kimlik: async () => ({ id: 7, ad: 'deneme', islemler: [] }) });
  const cevap = await app.inject({
    method: 'POST', url: '/api/korumali', headers: { 'istek-kimligi': '6f1b2c3d-0000-4000-8000-000000000003' },
  });

  assert.equal(cevap.statusCode, 200, cevap.body);
  assert.equal(kosma, 1);
  assert.ok(sorgular.some((s) => s.includes('INSERT INTO istek_kimligi')), sorgular.join('\n'));
  assert.ok(sorgular.some((s) => s.includes('INSERT INTO denetim_kaydi')), sorgular.join('\n'));
  assert.equal(typeof secenek.kimlik, 'function');
});

test('sunucunun kablolaması kapalı modüllerin uçlarını kaydetmez; açık modülün ucu durur', async () => {
  const vt: Veritabani = {
    sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null,
    tx: (is) => is(vt), okumaTx: (is) => is(vt), kapat: async () => undefined,
  };
  const secenek = uygulamaSecenekleri(vt, AYAR);
  assert.deepEqual(secenek.kapaliModuller, KAPALI_MODULLER);
  assert.equal(KAPALI_MODULLER.length > 0, true);
  const app = await uygulamaKur(secenek);
  for (const ad of KAPALI_MODULLER) assert.equal((await app.inject({ method: 'GET', url: `/api/${ad}/ben` })).statusCode, 404, ad);
  assert.notEqual((await app.inject({ method: 'GET', url: '/api/saglik' })).statusCode, 404);
  await app.close();
});
