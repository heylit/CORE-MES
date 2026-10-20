import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisiAdlari, yoneticiOlustur } from './disari.ts';
import { kisiEkle, kisiPasifeAl } from './servis.ts';

describe('kisiAdlari (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yonetici = 0;
  let ayse = 0;
  let mehmet = 0;
  let pasif = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  // Sorgu sayısı ölçülür: boş dizide veritabanına hiç gidilmemeli.
  const sayarak = async (idler: number[]): Promise<{ sonuc: Map<number, string>; sorgu: number }> => {
    let sorgu = 0;
    const sonuc = await vt().tx((db) => {
      const sarmal: Db = {
        sorgu: (sql, parametreler) => { sorgu += 1; return db.sorgu(sql, parametreler); },
        tek: (sql, parametreler) => { sorgu += 1; return db.tek(sql, parametreler); },
      };
      return kisiAdlari(sarmal, idler);
    });
    return { sonuc, sorgu };
  };

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_adlari');
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    ayse = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Ayşe Deneme' }));
    mehmet = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Mehmet Deneme' }));
    pasif = await ortam.vt.tx((db) => kisiEkle(db, { ad: 'Pasif Deneme' }));
    await ortam.vt.tx((db) => kisiPasifeAl(db, yonetici, pasif));
  });
  after(async () => {
    await ortam?.kaldir();
  });

  test('çok kimlik tek sorguda adlarıyla döner', async () => {
    const { sonuc, sorgu } = await sayarak([ayse, mehmet, yonetici]);
    assert.deepEqual([...sonuc].sort((a, b) => a[0] - b[0]), [[yonetici, 'Deneme Yönetici'], [ayse, 'Ayşe Deneme'], [mehmet, 'Mehmet Deneme']]);
    assert.equal(sorgu, 1);
  });

  test('boş dizi boş harita verir ve sorgu atılmaz', async () => {
    const { sonuc, sorgu } = await sayarak([]);
    assert.equal(sonuc.size, 0);
    assert.equal(sorgu, 0);
  });

  test('yinelenen kimlik tek kayıttır', async () => {
    const { sonuc } = await sayarak([ayse, ayse, mehmet, ayse]);
    assert.equal(sonuc.size, 2);
    assert.equal(sonuc.get(ayse), 'Ayşe Deneme');
  });

  test('olmayan kimlik haritada yoktur, hata verilmez; var olanlar yine gelir', async () => {
    const { sonuc } = await sayarak([ayse, 999999]);
    assert.deepEqual([...sonuc], [[ayse, 'Ayşe Deneme']]);
    assert.equal(sonuc.has(999999), false);
  });

  test('pasif kişi de adıyla döner', async () => {
    const aktifler = await vt().sorgu<{ id: number }>('SELECT id FROM kisi WHERE aktif AND id = $1', [pasif]);
    assert.equal(aktifler.length, 0, 'kurulum: kişi pasif olmalı');
    const { sonuc } = await sayarak([pasif]);
    assert.equal(sonuc.get(pasif), 'Pasif Deneme');
  });
});
