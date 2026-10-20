import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db, Veritabani } from './db.ts';
import { UygulamaHatasi } from './hata.ts';
import { DENETIM_EKI_SATIR_SINIRI, uc, uclariKaydet } from './uc.ts';
import type { DenetimGirdisi, DenetimSecimi, Kimlik, Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

const kimlik: Kimlik = async () => ({ id: 2, ad: 'yazar', islemler: ['kisiler.yaz', 'kisiler.oku'] });

function kur(uclar: readonly Uc[]): { app: FastifyInstance; kayitlar: DenetimGirdisi[]; gunluk: string[] } {
  const gunluk: string[] = [];
  const kayitlar: DenetimGirdisi[] = [];
  const db: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
  const sar = async <T>(is: (db: Db) => Promise<T>): Promise<T> => {
    try {
      const sonuc = await is(db);
      gunluk.push('COMMIT');
      return sonuc;
    } catch (hata) {
      gunluk.push('ROLLBACK');
      throw hata;
    }
  };
  const vt: Veritabani = { ...db, tx: sar, okumaTx: sar, kapat: async () => undefined };
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, kimlik, denetle: async (_db, girdi) => { kayitlar.push(girdi); } });
  return { app, kayitlar, gunluk };
}

const cevap = z.object({ tamam: z.boolean() });
const ekleyen = (yol: string, ek: () => unknown, ek2?: () => unknown): Uc =>
  uc({
    yontem: 'POST', yol, yetki: 'kisiler.yaz', cevap,
    isle: ({ denetimEki }) => {
      denetimEki(ek() as readonly DenetimSecimi[]);
      if (ek2) denetimEki(ek2() as readonly DenetimSecimi[]);
      return { tamam: true };
    },
  });
const satir = (i: number): DenetimSecimi => ({ teklif: i, kalem: `K-${i}`, onceki: '10.50', yeni: '11.00', paraBirimi: 'TRY', miktar: 3, tedarikci: 7, onayli: null });
const gonder = (app: FastifyInstance, yol: string, yontem: 'POST' | 'GET' = 'POST') => app.inject({ method: yontem, url: `/api${yol}` });

test('sınırdaki ek geçer: 100 satır, satır başına 8 alan; kayda kopya olarak iletilir', async () => {
  const liste = Array.from({ length: DENETIM_EKI_SATIR_SINIRI }, (_, i) => satir(i));
  const { app, kayitlar, gunluk } = kur([ekleyen('/ekli', () => liste), uc({ yontem: 'POST', yol: '/eksiz', yetki: 'kisiler.yaz', cevap, isle: () => ({ tamam: true }) })]);
  assert.equal((await gonder(app, '/ekli')).statusCode, 200);
  assert.equal((await gonder(app, '/eksiz')).statusCode, 200);
  assert.deepEqual(gunluk, ['COMMIT', 'COMMIT']);
  assert.deepEqual(kayitlar[0]?.ek, liste);
  assert.notEqual(kayitlar[0]?.ek, liste);
  assert.equal('ek' in (kayitlar[1] ?? {}), false);
});

test('sınırı aşan ya da biçimsiz ek komutu 500 ile düşürür: yazı geri alınır, denetim çağrılmaz', async () => {
  const dokuzAlan = { ...satir(1), fazla: 1 };
  const buyuk = { metin: 'x'.repeat(520) };
  const durumlar: [string, () => unknown][] = [
    ['dokuz-alan', () => [dokuzAlan]],
    ['buyuk', () => [buyuk]],
    ['fazla-satir', () => Array.from({ length: DENETIM_EKI_SATIR_SINIRI + 1 }, (_, i) => satir(i))],
    ['ic-ice', () => [{ a: { b: 1 } }]],
    ['liste-degil', () => satir(1)],
    ['bos', () => []],
  ];
  const { app, kayitlar, gunluk } = kur(durumlar.map(([ad, ek]) => ekleyen(`/${ad}`, ek)));
  for (const [ad] of durumlar) {
    const cevabi = await gonder(app, `/${ad}`);
    assert.equal(cevabi.statusCode, 500, ad);
    assert.equal(cevabi.body.includes('xxxx'), false, ad);
  }
  assert.deepEqual(gunluk, durumlar.map(() => 'ROLLBACK'));
  assert.deepEqual(kayitlar, []);
});

test('ek okuma ucunda, denetimsiz uçta ve ikinci çağrıda komutu düşürür; işleyici hatayı yakalayıp yazıları koruyan ret fırlatsa da geri alınır', async () => {
  const { app, kayitlar, gunluk } = kur([
    uc({ yontem: 'GET', yol: '/okuma', yetki: 'kisiler.oku', cevap, isle: ({ denetimEki }) => { denetimEki([satir(1)]); return { tamam: true }; } }),
    uc({ yontem: 'POST', yol: '/denetimsiz', yetki: 'kisiler.yaz', denetim: 'yok', cevap, isle: ({ denetimEki }) => { denetimEki([satir(1)]); return { tamam: true }; } }),
    ekleyen('/iki-kez', () => [satir(1)], () => [satir(2)]),
    uc({
      yontem: 'POST', yol: '/yutan', yetki: 'kisiler.yaz', cevap,
      isle: ({ denetimEki }) => {
        try { denetimEki([{ a: [1] }] as unknown as readonly DenetimSecimi[]); } catch { /* yutulur */ }
        throw new UygulamaHatasi('CAKISMA', 'ret', { yazilarKalir: true });
      },
    }),
  ]);
  assert.equal((await gonder(app, '/okuma', 'GET')).statusCode, 500);
  assert.equal((await gonder(app, '/denetimsiz')).statusCode, 500);
  assert.equal((await gonder(app, '/iki-kez')).statusCode, 500);
  assert.equal((await gonder(app, '/yutan')).statusCode, 500);
  assert.deepEqual(gunluk, ['ROLLBACK', 'ROLLBACK', 'ROLLBACK', 'ROLLBACK']);
  assert.deepEqual(kayitlar, []);
});
