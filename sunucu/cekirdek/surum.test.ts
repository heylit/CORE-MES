import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { z } from 'zod';
import { ESKI_SURUM_ILETISI, ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import { beklenenSurum, surumSemasi } from '#paylasilan/surum.ts';
import type { Db, Veritabani } from './db.ts';
import { UygulamaHatasi } from './hata.ts';
import { surumluGuncelle } from './surum.ts';
import { testSemasiAc } from './test-vt.ts';

interface Belge {
  id: number;
  ad: string;
  surum: number;
}

// Bir modülün `sorgular.ts` dosyasında duracak iki sorgu: koşullu yazma ve varlık yoklaması.
const belgeGuncelle = (db: Db, id: number, surum: number, ad: string): Promise<Belge | null> =>
  db.tek<Belge>('UPDATE belge SET ad = $3, surum = surum + 1 WHERE id = $1 AND surum = $2 RETURNING id, ad, surum', [id, surum, ad]);

const belgeVarMi = async (db: Db, id: number): Promise<boolean> =>
  (await db.tek('SELECT 1 AS var FROM belge WHERE id = $1', [id])) !== null;

// Bir modülün `servis.ts` dosyasında duracak çağrı.
const belgeDuzenle = (db: Db, id: number, surum: number, ad: string): Promise<Belge> =>
  surumluGuncelle({
    guncelle: () => belgeGuncelle(db, id, surum, ad),
    varMi: () => belgeVarMi(db, id),
    bulunamadiIletisi: 'Belge bulunamadı.',
  });

async function hatayiAl(is: Promise<unknown>): Promise<UygulamaHatasi> {
  const hata = await is.then(() => null, (h: unknown) => h);
  assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi beklenirdi: ${String(hata)}`);
  return hata;
}

describe('surumluGuncelle (gerçek PostgreSQL)', () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  let sonId = 0;

  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return vt;
  };

  const belgeAc = async (ad: string): Promise<number> => {
    sonId += 1;
    await acik().sorgu('INSERT INTO belge (id, ad) VALUES ($1, $2)', [sonId, ad]);
    return sonId;
  };

  const belge = (id: number): Promise<Belge | null> => acik().tek<Belge>('SELECT id, ad, surum FROM belge WHERE id = $1', [id]);

  before(async () => {
    const ortam = await testSemasiAc('surum');
    ({ kaldir } = ortam);
    await ortam.sahip.sorgu('CREATE TABLE belge (id int PRIMARY KEY, ad text NOT NULL, surum integer NOT NULL DEFAULT 1)');
    vt = ortam.vt;
  });

  after(async () => {
    await kaldir?.();
  });

  test('doğru sürüm: güncellenir, sürüm bir artar ve yeni sürüm döner', async () => {
    const id = await belgeAc('ilk');
    assert.deepEqual(await belge(id), { id, ad: 'ilk', surum: 1 });

    assert.deepEqual(await acik().tx((db) => belgeDuzenle(db, id, 1, 'ikinci')), { id, ad: 'ikinci', surum: 2 });
    assert.deepEqual(await acik().tx((db) => belgeDuzenle(db, id, 2, 'üçüncü')), { id, ad: 'üçüncü', surum: 3 });
    assert.deepEqual(await belge(id), { id, ad: 'üçüncü', surum: 3 });
  });

  test('eski sürüm: 409, tek ileti ve neden; satır değişmez', async () => {
    const id = await belgeAc('ilk');
    await acik().tx((db) => belgeDuzenle(db, id, 1, 'ikinci'));

    const hata = await hatayiAl(acik().tx((db) => belgeDuzenle(db, id, 1, 'geç kalan')));
    assert.equal(hata.durum, 409);
    assert.deepEqual(hata.govde(), { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: ESKI_SURUM_NEDENI } });
    assert.deepEqual(await belge(id), { id, ad: 'ikinci', surum: 2 });
  });

  test('ileri sürüm de reddedilir: istemci okumadığı sürümle yazamaz', async () => {
    const id = await belgeAc('ilk');
    const hata = await hatayiAl(acik().tx((db) => belgeDuzenle(db, id, 2, 'uydurma')));
    assert.equal(hata.durum, 409);
    assert.deepEqual(await belge(id), { id, ad: 'ilk', surum: 1 });
  });

  test('olmayan kayıt: 404, modülün iletisiyle; ileti verilmezse çekirdeğin iletisiyle', async () => {
    // Önce var olan kayıt yazılır: yoksa her çağrıyı 404 ile reddeden yardımcıda da geçerdi.
    const id = await belgeAc('var');
    assert.equal((await acik().tx((db) => belgeDuzenle(db, id, 1, 'yazıldı'))).surum, 2);

    const hata = await hatayiAl(acik().tx((db) => belgeDuzenle(db, 999_999, 1, 'yok')));
    assert.equal(hata.durum, 404);
    assert.deepEqual(hata.govde(), { kod: 'BULUNAMADI', mesaj: 'Belge bulunamadı.' });

    const iletisiz = await hatayiAl(acik().tx((db) => surumluGuncelle({
      guncelle: () => belgeGuncelle(db, 999_999, 1, 'yok'),
      varMi: () => belgeVarMi(db, 999_999),
    })));
    assert.deepEqual(iletisiz.govde(), { kod: 'BULUNAMADI', mesaj: 'Kayıt bulunamadı.' });
  });

  test('yazma satır döndürdüyse varlık yoklaması koşmaz', async () => {
    const id = await belgeAc('ilk');
    let yoklama = 0;
    await acik().tx((db) => surumluGuncelle({
      guncelle: () => belgeGuncelle(db, id, 1, 'ikinci'),
      varMi: () => { yoklama += 1; return belgeVarMi(db, id); },
    }));
    assert.equal(yoklama, 0);
  });

  test('aynı sürümle eşzamanlı iki yazma: ikincisi birincinin kilidini bekler ve 409 alır', async () => {
    const id = await belgeAc('ilk');
    let birak: () => void = () => undefined;
    const tutulan = new Promise<void>((coz) => { birak = coz; });
    let hazirOl: () => void = () => undefined;
    const hazir = new Promise<void>((coz) => { hazirOl = coz; });
    const birinci = acik().tx(async (db) => {
      const sonuc = await belgeDuzenle(db, id, 1, 'birinci');
      hazirOl();
      await tutulan;
      return sonuc;
    });
    // Birinci yazma başarısız olursa `hazir` hiç çözülmez; hatası burada görünsün.
    await Promise.race([hazir, birinci]);
    let ikinciPid = 0;
    const ikinci = acik().tx(async (db) => {
      ikinciPid = (await db.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))?.pid ?? 0;
      return belgeDuzenle(db, id, 1, 'ikinci');
    }).then(() => null, (hata: unknown) => hata);
    try {
      // Olay beklenir: ikinci yazma bu tablonun satır kilidinde bekler (sabit süre yok).
      const sinir = Date.now() + 10000;
      let bekliyor = false;
      while (!bekliyor && Date.now() < sinir) {
        const satir = await acik().tek<{ sayi: number }>(
          "SELECT count(*)::int AS sayi FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock' AND query LIKE 'UPDATE belge SET%'",
          [ikinciPid],
        );
        bekliyor = (satir?.sayi ?? 0) > 0;
        if (!bekliyor) await new Promise((coz) => setTimeout(coz, 25));
      }
      assert.equal(bekliyor, true, 'ikinci yazma kilitte beklemedi');
    } finally {
      birak();
    }
    assert.deepEqual(await birinci, { id, ad: 'birinci', surum: 2 });
    const hata = await ikinci;
    assert.ok(hata instanceof UygulamaHatasi, `ikinci yazma reddedilmedi: ${String(hata)}`);
    assert.equal(hata.durum, 409);
    assert.deepEqual(hata.govde(), { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: ESKI_SURUM_NEDENI } });
    assert.deepEqual(await belge(id), { id, ad: 'birinci', surum: 2 });
  });

  test('sözleşme parçası: gövdede beklenen sürüm zorunludur; cevaptaki sürüm aynı şemadan geçer', async () => {
    const govde = z.object({ ...beklenenSurum, ad: z.string() });
    assert.deepEqual(govde.parse({ surum: 3, ad: 'x' }), { surum: 3, ad: 'x' });
    for (const bozuk of [{ ad: 'x' }, { surum: 0, ad: 'x' }, { surum: 1.5, ad: 'x' }, { surum: '2', ad: 'x' }, { surum: null, ad: 'x' }, { surum: 2147483648, ad: 'x' }]) {
      assert.equal(govde.safeParse(bozuk).success, false, JSON.stringify(bozuk));
    }
    assert.equal(govde.safeParse({ surum: 2147483647, ad: 'x' }).success, true);
    const id = await belgeAc('ilk');
    const okunan = surumSemasi.parse((await belge(id))?.surum);
    const yazilan = await acik().tx((db) => belgeDuzenle(db, id, okunan, 'ikinci'));
    assert.equal(surumSemasi.parse(yazilan.surum), 2);
  });
});
