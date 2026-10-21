import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { Db } from '#cekirdek/db.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisiGorevi, kisiGorevleri, yoneticiOlustur } from './disari.ts';
import { kisiEkle, kisiPasifeAl } from './servis.ts';

describe('kisiGorevi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let gorevli = 0;
  let gorevsiz = 0;
  let pasif = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_gorevi');
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    gorevli = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Görevli Deneme', gorev: 'Satın alma sorumlusu' }));
    gorevsiz = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Görevsiz Deneme', gorev: '  ' }));
    pasif = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Pasif Deneme', gorev: 'Operatör' }));
    await ortam.vt.tx((db) => kisiPasifeAl(db, yonetici, pasif));
  });
  after(async () => {
    await ortam?.kaldir();
  });

  test('kişi kartındaki görev döner', async () => {
    assert.equal(await vt().tx((db) => kisiGorevi(db, gorevli)), 'Satın alma sorumlusu');
  });

  test('görevi boş kişide null döner', async () => {
    assert.equal(await vt().tx((db) => kisiGorevi(db, gorevsiz)), null);
  });

  test('olmayan kişide hata verilmez, null döner', async () => {
    assert.equal(await vt().tx((db) => kisiGorevi(db, 999999)), null);
  });

  test('pasif kişinin görevi de döner', async () => {
    assert.equal(await vt().tx((db) => kisiGorevi(db, pasif)), 'Operatör');
  });

  test('kisiGorevleri: toplu okuma tek tek okumayla aynı; yinelenen kimlik tek kayıt, olmayan kimlik haritada yok', async () => {
    const toplu = await vt().tx((db) => kisiGorevleri(db, [gorevli, gorevsiz, pasif, gorevli, 999999]));
    assert.deepEqual([...toplu.entries()].sort(([a], [b]) => a - b), [[gorevli, 'Satın alma sorumlusu'], [gorevsiz, null], [pasif, 'Operatör']]);
    for (const [id, gorev] of toplu) assert.equal(await vt().tx((db) => kisiGorevi(db, id)), gorev);
    assert.equal(toplu.has(999999), false);
  });

  test('kisiGorevleri: boş dizide sorgu atılmaz, boş harita döner', async () => {
    let sorgu = 0;
    const sonuc = await vt().tx((db) => {
      const sayan: Db = {
        sorgu: <T>(sql: string, p?: readonly unknown[]) => { sorgu++; return db.sorgu<T>(sql, p); },
        tek: <T>(sql: string, p?: readonly unknown[]) => { sorgu++; return db.tek<T>(sql, p); },
      };
      return kisiGorevleri(sayan, []);
    });
    assert.equal(sonuc.size, 0);
    assert.equal(sorgu, 0);
  });
});
