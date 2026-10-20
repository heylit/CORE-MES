import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { isMerkeziGuncellemeGovdesi, istasyonGuncellemeGovdesi, makineGuncellemeGovdesi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { eskiKoddanKimlikCoz } from './disari.ts';
import type { TesisDuzeyi } from './disari.ts';
import * as servis from './servis.ts';

describe('AG2-2: eski kod geçmişi ve eskiKoddanKimlikCoz (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let merkez = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const kimlik = async (sql: string, parametreler: unknown[]): Promise<number> => {
    const satir = await vt().tek<{ id: number }>(sql, parametreler);
    if (!satir) throw new Error('satır eklenemedi');
    return satir.id;
  };
  const istasyonEkle = (kod: string): Promise<number> =>
    kimlik("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, 'Deneme', $2) RETURNING id", [kod, merkez]);
  const surum = async (tablo: string, id: number): Promise<number> =>
    (await vt().tek<{ surum: number }>(`SELECT surum FROM ${tablo} WHERE id = $1`, [id]))?.surum ?? 0;

  const istasyonKodla = async (id: number, kod: string): Promise<void> => {
    const govde = istasyonGuncellemeGovdesi.parse({ kod, ad: 'Deneme', isMerkeziId: merkez, surum: await surum('istasyon', id) });
    await vt().tx((db) => servis.istasyonGuncelle(db, id, govde));
  };
  const gecmis = (sutun: string, id: number): Promise<{ kod: string }[]> =>
    vt().sorgu<{ kod: string }>(`SELECT kod FROM istasyonlar_kod_gecmisi WHERE ${sutun} = $1 ORDER BY id`, [id]);
  const birakildiYaz = (sutun: string, id: number, kod: string, an: string): Promise<unknown> =>
    vt().sorgu(`UPDATE istasyonlar_kod_gecmisi SET birakildi = $3 WHERE ${sutun} = $1 AND kod = $2`, [id, kod, an]);

  const sayarak = async (duzey: TesisDuzeyi, kodlar: string[], zaman?: Date): Promise<{ sonuc: Map<string, number>; sorgu: number }> => {
    let sorgu = 0;
    const sonuc = await vt().tx((db) => {
      const sarmal: Db = {
        sorgu: (sql, parametreler) => { sorgu += 1; return db.sorgu(sql, parametreler); },
        tek: (sql, parametreler) => { sorgu += 1; return db.tek(sql, parametreler); },
      };
      return eskiKoddanKimlikCoz(sarmal, duzey, kodlar, zaman);
    });
    return { sonuc, sorgu };
  };

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_kod_gecmisi');
    merkez = await kimlik("INSERT INTO is_merkezi (kod, ad) VALUES ('KG-IM', 'Merkez') RETURNING id", []);
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('kod değişince eski kod üç düzeyde de geçmişe yazılır; aynı kodla güncellemede satır yazılmaz', async () => {
    const istasyon = await istasyonEkle('KG-A');
    await istasyonKodla(istasyon, 'KG-A');
    assert.deepEqual(await gecmis('istasyon_id', istasyon), []);
    await istasyonKodla(istasyon, 'kg-b');
    await istasyonKodla(istasyon, 'KG-C');
    assert.deepEqual((await gecmis('istasyon_id', istasyon)).map((g) => g.kod), ['KG-A', 'KG-B']);

    const im = await kimlik("INSERT INTO is_merkezi (kod, ad) VALUES ('KG-IM2', 'Merkez') RETURNING id", []);
    const imGovde = isMerkeziGuncellemeGovdesi.parse({ kod: 'KG-IM3', ad: 'Merkez', surum: await surum('is_merkezi', im) });
    await vt().tx((db) => servis.isMerkeziGuncelle(db, im, imGovde));
    assert.deepEqual((await gecmis('is_merkezi_id', im)).map((g) => g.kod), ['KG-IM2']);

    const makine = await kimlik("INSERT INTO makine (kod, ad) VALUES ('KG-M1', 'Tezgah') RETURNING id", []);
    const makineGovde = makineGuncellemeGovdesi.parse({ kod: 'KG-M2', ad: 'Tezgah', surum: await surum('makine', makine) });
    await vt().tx((db) => servis.makineGuncelle(db, makine, makineGovde));
    assert.deepEqual((await gecmis('makine_id', makine)).map((g) => g.kod), ['KG-M1']);
  });

  test('sürümü tutmayan güncelleme geçmişe satır yazmaz', async () => {
    const istasyon = await istasyonEkle('KG-S1');
    const govde = istasyonGuncellemeGovdesi.parse({ kod: 'KG-S2', ad: 'Deneme', isMerkeziId: merkez, surum: 99 });
    await assert.rejects(vt().tx((db) => servis.istasyonGuncelle(db, istasyon, govde)));
    assert.deepEqual(await gecmis('istasyon_id', istasyon), []);
  });

  test('toplu çözme tek sorgudur; bugünkü ve eski kod aynı kayda, kod kırpılıp büyük harfle eşlenir; boş dizide sorgu yok', async () => {
    const istasyon = await istasyonEkle('KG-T1');
    const diger = await istasyonEkle('KG-T9');
    await istasyonKodla(istasyon, 'KG-T2');
    const { sonuc, sorgu } = await sayarak('istasyon', ['KG-T2', ' kg-t1 ', 'KG-T9', 'KG-YOK']);
    assert.equal(sorgu, 1);
    assert.deepEqual(sonuc, new Map([['KG-T2', istasyon], [' kg-t1 ', istasyon], ['KG-T9', diger]]));

    const bos = await sayarak('istasyon', []);
    assert.equal(bos.sorgu, 0);
    assert.equal(bos.sonuc.size, 0);
    assert.equal((await sayarak('makine', ['KG-T2'])).sonuc.size, 0);
  });

  test('kod el değiştirince zaman o anki sahibi, zamansız çağrı bugünkü sahibi, sahibi yoksa en son bırakanı verir', async () => {
    const ilk = await istasyonEkle('KG-K');
    const ikinci = await istasyonEkle('KG-X');
    await istasyonKodla(ilk, 'KG-K2');
    await birakildiYaz('istasyon_id', ilk, 'KG-K', '2026-01-10T00:00:00Z');
    await istasyonKodla(ikinci, 'KG-K');
    await birakildiYaz('istasyon_id', ikinci, 'KG-X', '2026-01-05T00:00:00Z');

    assert.equal((await sayarak('istasyon', ['KG-K'], new Date('2026-01-08T00:00:00Z'))).sonuc.get('KG-K'), ilk);
    assert.equal((await sayarak('istasyon', ['KG-K'], new Date('2026-01-12T00:00:00Z'))).sonuc.get('KG-K'), ikinci);
    assert.equal((await sayarak('istasyon', ['KG-X'], new Date('2026-01-01T00:00:00Z'))).sonuc.get('KG-X'), ikinci);
    assert.equal((await sayarak('istasyon', ['KG-X'], new Date('2026-01-12T00:00:00Z'))).sonuc.has('KG-X'), false);
    assert.equal((await sayarak('istasyon', ['KG-K'])).sonuc.get('KG-K'), ikinci);

    await istasyonKodla(ikinci, 'KG-K3');
    await birakildiYaz('istasyon_id', ikinci, 'KG-K', '2026-02-01T00:00:00Z');
    assert.equal((await sayarak('istasyon', ['KG-K'])).sonuc.get('KG-K'), ikinci);
  });

  test('silinen kaydın geçmişi de silinir; eski kodu çözülmez', async () => {
    const istasyon = await istasyonEkle('KG-D1');
    await istasyonKodla(istasyon, 'KG-D2');
    await vt().tx((db) => servis.istasyonSil(db, istasyon));
    assert.deepEqual(await gecmis('istasyon_id', istasyon), []);
    assert.equal((await sayarak('istasyon', ['KG-D1', 'KG-D2'])).sonuc.size, 0);
  });

  test('geçmiş satırı tam bir düzeye bağlıdır', async () => {
    await assert.rejects(
      vt().sorgu("INSERT INTO istasyonlar_kod_gecmisi (kod) VALUES ('KG-Z')"),
      (hata: { constraint?: string }) => hata.constraint === 'istasyonlar_kod_gecmisi_tek_duzey',
    );
    const istasyon = await istasyonEkle('KG-Z1');
    await assert.rejects(
      vt().sorgu("INSERT INTO istasyonlar_kod_gecmisi (is_merkezi_id, istasyon_id, kod) VALUES ($1, $2, 'KG-Z')", [merkez, istasyon]),
      (hata: { constraint?: string }) => hata.constraint === 'istasyonlar_kod_gecmisi_tek_duzey',
    );
  });
});
