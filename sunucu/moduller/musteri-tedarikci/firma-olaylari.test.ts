// 2133-1 b: firma kartı ve adresleri yazılınca firma değişti olayı aynı işlemde verilir; adres kaldırmada olay silmeden önce gelir.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { adresEkleGovdesi, firmaEkleGovdesi, firmaGuncelleGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { firmaDegistiDinle } from './disari.ts';
import type { FirmaDegistiOlayi } from './disari.ts';
import * as servis from './servis.ts';

let ortam: TestVeritabani;
let vt: Veritabani;
let kullanici: Kullanici;
const tx = <T>(is: (db: Db) => Promise<T>) => vt.tx(is);
const gelen: (FirmaDegistiOlayi & { adresVar: boolean | null })[] = [];
let birak = () => {};

before(async () => {
  ortam = await testVeritabaniKur('musteri_tedarikci_olay');
  vt = ortam.vt;
  const id = await tx(async (db) => (await db.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Olay Deneme') RETURNING id"))!.id);
  kullanici = { id, ad: 'Olay Deneme', islemler: new Set() } as unknown as Kullanici;
  // Adres kaldırmada olay geldiğinde adres hâlâ durmalı: dinleyici bağını silmeden önce taşır.
  birak = firmaDegistiDinle(async (db, o) => {
    const adresVar = o.kaldirilanAdresId === null ? null
      : (await db.tek<{ var: boolean }>('SELECT EXISTS (SELECT 1 FROM musteri_tedarikci_adres WHERE id = $1) AS "var"', [o.kaldirilanAdresId]))!.var;
    gelen.push({ ...o, adresVar });
  });
});
after(async () => {
  birak();
  await ortam.kaldir();
});

test('2133-1 b: ekleme, düzeltme, durum ve adres yazmaları firma değişti olayı verir; reddedilen yazma olay vermez', async () => {
  const firma = await tx((db) => servis.firmaEkle(db, kullanici, firmaEkleGovdesi.parse({ ad: 'Olay Firma', tur: 'musteri' })));
  assert.deepEqual(gelen.splice(0), [{ firmaId: firma.id, kaldirilanAdresId: null, adresVar: null }]);

  const duzeltilen = await tx((db) => servis.firmaGuncelle(db, kullanici, firma.id,
    firmaGuncelleGovdesi.parse({ ad: 'Olay Firma', tur: 'musteri', surum: firma.surum, enlem: 39.9, boylam: 32.8 }), () => {}));
  assert.deepEqual(gelen.splice(0), [{ firmaId: firma.id, kaldirilanAdresId: null, adresVar: null }]);

  await assert.rejects(tx((db) => servis.firmaGuncelle(db, kullanici, firma.id,
    firmaGuncelleGovdesi.parse({ ad: 'Olay Firma', tur: 'musteri', surum: firma.surum }), () => {})));
  assert.deepEqual(gelen.splice(0), [], 'eski sürümle gelen düzeltme olay vermez');

  const pasif = await tx((db) => servis.firmaDurumuDegistir(db, kullanici.id, firma.id, duzeltilen.surum, 'pasif'));
  const aktif = await tx((db) => servis.firmaDurumuDegistir(db, kullanici.id, firma.id, pasif.surum, 'aktif'));
  assert.equal(gelen.splice(0).length, 2);

  const eklendi = await tx((db) => servis.adresEkle(db, kullanici, firma.id,
    adresEkleGovdesi.parse({ surum: aktif.surum, tur: 'teslim', ad: 'Depo', adres: 'Depo yolu', enlem: 39.8, boylam: 32.7 })));
  const adres = eklendi.adresler.find((a) => a.ad === 'Depo')!;
  const guncellendi = await tx((db) => servis.adresGuncelle(db, kullanici, firma.id, adres.id,
    adresEkleGovdesi.parse({ surum: eklendi.firma.surum, tur: 'teslim', ad: 'Depo', adres: 'Depo yolu 2', enlem: 39.81, boylam: 32.71 }), () => {}));
  assert.deepEqual(gelen.splice(0).map((o) => o.kaldirilanAdresId), [null, null]);

  await assert.rejects(tx((db) => servis.adresKaldir(db, kullanici, firma.id, adres.id + 1000, guncellendi.firma.surum)));
  assert.deepEqual(gelen.splice(0), [], 'olmayan adres olay vermez');
  await tx((db) => servis.adresKaldir(db, kullanici, firma.id, adres.id, guncellendi.firma.surum));
  assert.deepEqual(gelen.splice(0), [{ firmaId: firma.id, kaldirilanAdresId: adres.id, adresVar: true }]);
});

test('2133-1 b: dinleyicinin reddi firma yazmasını geri alır', async () => {
  const red = firmaDegistiDinle(() => Promise.reject(new Error('dinleyici reddetti')));
  try {
    await assert.rejects(tx((db) => servis.firmaEkle(db, kullanici, firmaEkleGovdesi.parse({ ad: 'Olay Reddedilen', tur: 'musteri' }))), /dinleyici reddetti/);
  } finally {
    red();
    gelen.splice(0);
  }
  const satir = await tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM musteri_tedarikci_firma WHERE ad = 'Olay Reddedilen'"));
  assert.equal(satir!.n, 0);
});
