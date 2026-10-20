import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { istasyonAdlari } from './disari.ts';

describe('IS10: istasyonAdlari (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let torna = 0;
  let freze = 0;
  let pasif = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  // Sorgu sayısı ölçülür: boş dizide veritabanına hiç gidilmemeli, doluda tek sorgu.
  const sayarak = async (idler: number[]): Promise<{ sonuc: Map<number, string>; sorgu: number }> => {
    let sorgu = 0;
    const sonuc = await vt().tx((db) => {
      const sarmal: Db = {
        sorgu: (sql, parametreler) => { sorgu += 1; return db.sorgu(sql, parametreler); },
        tek: (sql, parametreler) => { sorgu += 1; return db.tek(sql, parametreler); },
      };
      return istasyonAdlari(sarmal, idler);
    });
    return { sonuc, sorgu };
  };

  const istasyonEkle = async (isMerkeziId: number, kod: string, ad: string, aktif: boolean): Promise<number> => {
    const satir = await vt().tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, $4) RETURNING id', [kod, ad, isMerkeziId, aktif],
    );
    if (!satir) throw new Error('istasyon eklenemedi');
    return satir.id;
  };

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_adlari');
    const merkez = await ortam.vt.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad, aktif) VALUES ('AD-IM', 'Ad Merkezi', false) RETURNING id");
    if (!merkez) throw new Error('iş merkezi eklenemedi');
    torna = await istasyonEkle(merkez.id, 'AD-T', 'Torna Bir', true);
    freze = await istasyonEkle(merkez.id, 'AD-F', 'Freze Bir', true);
    pasif = await istasyonEkle(merkez.id, 'AD-P', 'Eski Tezgah', false);
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('boş dizide sorgu atılmaz, boş harita döner', async () => {
    const { sonuc, sorgu } = await sayarak([]);
    assert.equal(sorgu, 0);
    assert.equal(sonuc.size, 0);
  });

  test('tek sorguda adlar gelir; yinelenen kimlik tek kayıt, olmayan kimlik haritada yok', async () => {
    const { sonuc, sorgu } = await sayarak([torna, freze, torna, 999999]);
    assert.equal(sorgu, 1);
    assert.deepEqual(sonuc, new Map([[torna, 'Torna Bir'], [freze, 'Freze Bir']]));
  });

  test('pasif istasyon ve pasif iş merkezinin istasyonu da adıyla döner', async () => {
    const { sonuc } = await sayarak([pasif, torna]);
    assert.equal(sonuc.get(pasif), 'Eski Tezgah');
    assert.equal(sonuc.get(torna), 'Torna Bir');
  });
});
