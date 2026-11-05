// 2133-4 a: ayar değeri gerçekten değişince ayar değişti olayı aynı işlemde verilir; aynı değer olay vermez.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ayarDegistiDinle } from './disari.ts';
import type { AyarDegistiOlayi } from './disari.ts';
import { ayarDegistir } from './servis.ts';

let ortam: TestVeritabani;
let vt: Veritabani;
let kisiId = 0;
const tx = <T>(is: (db: Db) => Promise<T>) => vt.tx(is);
const gelen: AyarDegistiOlayi[] = [];
let birak = () => {};

before(async () => {
  ortam = await testVeritabaniKur('ayarlar_olay');
  vt = ortam.vt;
  kisiId = await tx(async (db) => (await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Ayar Olay') RETURNING id"))!.id);
  birak = ayarDegistiDinle(async (_db, o) => { gelen.push(o); });
});
after(async () => {
  birak();
  await ortam.kaldir();
});

test('2133-4 a: değişen değer olay verir, aynı değer ve geçersiz değer vermez; dinleyicinin reddi yazmayı geri alır', async () => {
  await tx((db) => ayarDegistir(db, kisiId, 'sevkiyat.fabrika-adres', 'Ornek Cad. 1'));
  assert.deepEqual(gelen.splice(0), [{ anahtar: 'sevkiyat.fabrika-adres', kisiId }]);
  await tx((db) => ayarDegistir(db, kisiId, 'sevkiyat.fabrika-adres', 'Ornek Cad. 1'));
  assert.deepEqual(gelen.splice(0), []);
  await assert.rejects(tx((db) => ayarDegistir(db, kisiId, 'sevkiyat.fabrika-enlem', 200)));
  assert.deepEqual(gelen.splice(0), []);

  const red = ayarDegistiDinle(() => Promise.reject(new Error('dinleyici reddetti')));
  try {
    await assert.rejects(tx((db) => ayarDegistir(db, kisiId, 'sevkiyat.fabrika-adres', 'Ornek Cad. 2')), /dinleyici reddetti/);
  } finally {
    red();
    gelen.splice(0);
  }
  const satir = await tx((db) => db.tek<{ deger: unknown }>("SELECT deger FROM ayar WHERE anahtar = 'sevkiyat.fabrika-adres'"));
  assert.equal(satir!.deger, 'Ornek Cad. 1');
});
