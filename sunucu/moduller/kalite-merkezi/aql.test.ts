import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { aqlPlani as ekranPlani, gecisDurumu, SEVIYELER } from '../../../istemci/src/moduller/kalite-merkezi/yeni/aql.ts';
import type { Lot } from '../../../istemci/src/moduller/kalite-merkezi/yeni/tipler.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { lotKarariYaz, muayenePlaniOner } from './disari.ts';
import type { LotKarariIstegi } from './disari.ts';
import {
  AQL_DEGERLERI, AQL_NORMAL, AQL_SIKI, AQL_YUZDE_YUZ, aqlPlani, lotAnahtari, lotIstegiReddi, lotKarari, lotSikiligi, muayenePlani, siradakiLotNo, varsayilanAqlAyari,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// 564 4 a: sunucunun AQL tablosu Kalite Merkezi ekranınınkiyle aynı planı verir (iki taraf ayrı derlenir, tablo iki yerde durur).
describe('Kalite Merkezi AQL planı (564 2 a, 4 a)', () => {
  test('KM-K564a sunucu planı ekranın planıyla her parti, seviye, AQL ve sıkılıkta aynıdır', () => {
    const partiler = [2, 7, 8, 9, 15, 50, 51, 150, 281, 500, 501, 1200, 3201, 10000, 35001, 150001, 600000];
    for (const N of partiler) for (const seviye of SEVIYELER) for (const aql of [AQL_YUZDE_YUZ, ...AQL_DEGERLERI]) for (const siddet of [AQL_NORMAL, AQL_SIKI]) {
      const e = ekranPlani(N, seviye, aql, siddet);
      const s = aqlPlani(N, seviye, aql, siddet);
      const beklenen = e === null ? null : { kodK: e.kodK, n: e.n, ac: e.ac, re: e.re, yuzde100: e.yuzde100 === true };
      assert.deepEqual(s === null ? null : { kodK: s.kodK, n: s.n, ac: s.ac, re: s.re, yuzde100: s.yuzde100 }, beklenen, `${String(N)} ${seviye} ${aql} ${siddet}`);
    }
    assert.equal(aqlPlani(1, 'II', '1.0', AQL_NORMAL), null, 'parti en az 2');
    assert.equal(aqlPlani(100, 'IV', '1.0', AQL_NORMAL), null, 'bilinmeyen seviye');
    assert.equal(aqlPlani(100, 'II', '3.0', AQL_NORMAL), null, 'bilinmeyen AQL');
  });

  test('KM-K564a sıkılık ekranın geçiş kuralıyla aynıdır: 5 lotta 2 ret sıkılaştırır, 5 kabul döndürür, sıkıda 5 ret durdurur', () => {
    const lot = (karar: string, i: number, ek: Partial<Lot> = {}): Lot => ({ _id: `l${String(i)}`, anahtar: 'P1|IC', tarih: `2026-10-${String(10 + i)}`, no: `LOT-2026-${String(i).padStart(4, '0')}`, karar, ...ek });
    const diziler: string[][] = [
      [], ['Kabul', 'Kabul'], ['Ret', 'Kabul', 'Ret'], ['Ret', 'Ret', 'Kabul', 'Kabul', 'Kabul', 'Kabul', 'Kabul'],
      ['Ret', 'Ret', 'Ret', 'Ret', 'Ret', 'Ret', 'Ret'], ['Ret', 'Ret', 'Ret', 'Ret', 'Ret', 'Ret', 'Ret', 'reset'],
    ];
    for (const d of diziler) {
      const lotlar = d.map((k, i) => (k === 'reset' ? lot('', i, { tip: 'reset' }) : lot(k, i)));
      assert.equal(lotSikiligi(lotlar as unknown as Record<string, unknown>[], 'P1|IC'), gecisDurumu(lotlar, 'P1|IC').st, d.join(','));
    }
    const yenidenSunum = [lot('Ret', 1), lot('Ret', 2, { yenidenSunum: true })];
    assert.equal(lotSikiligi(yenidenSunum as unknown as Record<string, unknown>[], 'P1|IC'), AQL_NORMAL, 'yeniden sunum sayılmaz');
    assert.equal(lotAnahtari(' p-1 ', ''), 'P-1|IC');
  });

  test('KM-K564a muayene planı: numune örneklemeli sınıfların en büyüğü, karar yalnız sayısı verilen sınıflarda; sıfır uydurulmaz', () => {
    const ayar = varsayilanAqlAyari(null);
    assert.deepEqual(ayar, { seviye: 'II', kr: AQL_YUZDE_YUZ, mj: '1.0', mn: '2.5' });
    assert.deepEqual(varsayilanAqlAyari({ seviye: 'I', kritik: '0.065', major: '', minor: '4.0' }), { seviye: 'I', kr: '0.065', mj: '1.0', mn: '4.0' });
    const plan = muayenePlani(500, { ...ayar, kr: '0.065' }, AQL_NORMAL)!;
    assert.deepEqual(plan.siniflar.map((s) => [s.sinif, s.n, s.ac, s.re]), [['Kritik', 200, 0, 1], ['Majör', 50, 1, 2], ['Minör', 50, 3, 4]]);
    assert.equal(plan.n, 200);
    assert.equal(muayenePlani(500, ayar, AQL_NORMAL)!.n, 50, '%100 sınıf numuneyi büyütmez');
    assert.equal(muayenePlani(500, { ...ayar, mj: AQL_YUZDE_YUZ, mn: AQL_YUZDE_YUZ }, AQL_NORMAL)!.n, 500);
    assert.equal(lotKarari(plan, { Kritik: null, Majör: 1, Minör: null }), 'Kabul');
    assert.equal(lotKarari(plan, { Kritik: null, Majör: 2, Minör: null }), 'Ret');
    assert.equal(lotKarari(plan, { Kritik: 1, Majör: 0, Minör: 0 }), 'Ret', 'kritik sıfır kabul');
    assert.equal(lotKarari(plan, { Kritik: null, Majör: null, Minör: null }), null);
    assert.equal(muayenePlani(1, ayar, AQL_NORMAL), null);
    assert.equal(siradakiLotNo([{ no: 'LOT-2026-0007' }, { no: 'LOT-2025-0099' }, { no: 'x' }], 2026), 'LOT-2026-0008');
    assert.equal(siradakiLotNo([], 2026), 'LOT-2026-0001');
  });

  test('KM-K564b lot isteği: geçerli istek kabul; kaynak, parça, parti, ayar ve sayı hataları reddedilir', () => {
    const i: LotKarariIstegi = {
      kaynak: 'arkon', kaynakAnahtari: 'ie:1:1', uretimEmriId: 1, parcaNo: 'P1', parcaAdi: null, N: 100, ayar: null,
      bulunan: { Kritik: null, Majör: 0, Minör: null }, not: null,
    };
    assert.equal(lotIstegiReddi(i), null);
    assert.equal(lotIstegiReddi({ ...i, kaynak: 'stok' as 'arkon' }), 'lotKaynagi');
    assert.equal(lotIstegiReddi({ ...i, kaynakAnahtari: '' }), 'lotKaynagi');
    assert.equal(lotIstegiReddi({ ...i, parcaNo: ' ' }), 'lotParcasi');
    assert.equal(lotIstegiReddi({ ...i, N: 1 }), 'lotBuyuklugu');
    assert.equal(lotIstegiReddi({ ...i, ayar: { seviye: 'IV', kr: '1.0', mj: '1.0', mn: '1.0' } }), 'lotAyari');
    assert.equal(lotIstegiReddi({ ...i, ayar: { seviye: 'II', kr: '3.0', mj: '1.0', mn: '1.0' } }), 'lotAyari');
    assert.equal(lotIstegiReddi({ ...i, bulunan: { Kritik: null, Majör: null, Minör: null } }), 'lotSayisi');
    assert.equal(lotIstegiReddi({ ...i, bulunan: { Kritik: null, Majör: -1, Minör: null } }), 'lotSayisi');
    assert.equal(lotIstegiReddi({ ...i, bulunan: { Kritik: null, Majör: 101, Minör: null } }), 'lotSayisi');
  });
});

describe('Kalite Merkezi lot kararı (564 6 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let muayeneci: Kullanici;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (ek: Partial<LotKarariIstegi> = {}): LotKarariIstegi => ({
    kaynak: 'arkon', kaynakAnahtari: 'ie:10:1', uretimEmriId: 999999, parcaNo: 'P-500', parcaAdi: 'Deneme parça', N: 500, ayar: null,
    bulunan: { Kritik: null, Majör: 1, Minör: null }, not: 'istasyon muayenesi', ...ek,
  });

  before(async () => {
    ortam = await testVeritabaniKur('km_aql');
    muayeneci = (await ortam.vt.tx(async (db) => kullaniciYukle(db, await yoneticiOlustur(db, { ad: 'Deneme Muayeneci', kullaniciAdi: 'muayeneci', parola: 'dogru-parola-1' }))))!;
  });
  after(async () => { await ortam?.kaldir(); });

  test('KM-K564c plan uygulamanın AQL ayarından gelir; ayar yoksa varsayılan, Hazırlık ayarı verilirse o', async () => {
    const plan = (ayar: LotKarariIstegi['ayar']) => o().vt.tx((db) => muayenePlaniOner(db, { parcaNo: 'P-YOK', N: 500, ayar }));
    assert.deepEqual(await plan(null), { plan: muayenePlani(500, varsayilanAqlAyari(null), AQL_NORMAL) });
    await o().vt.tx((db) => sorgular.yaz(db, 'settings', 'genel', { seviye: 'I', kritik: '0.10', major: '0.65', minor: '1.5' }, muayeneci.id));
    assert.deepEqual(await plan(null), { plan: muayenePlani(500, { seviye: 'I', kr: '0.10', mj: '0.65', mn: '1.5' }, AQL_NORMAL) });
    const hazirlik = { seviye: 'III', kr: AQL_YUZDE_YUZ, mj: '2.5', mn: '4.0' };
    assert.deepEqual(await plan(hazirlik), { plan: muayenePlani(500, hazirlik, AQL_NORMAL) });
    await o().vt.tx((db) => sorgular.yaz(db, 'settings', 'genel', {}, muayeneci.id));
  });

  test('KM-K564d lot kararı kilitli lot kaydı yazar, kararı sunucu hesaplar; aynı kaynak ikinci kayıt açmaz', async () => {
    const ilk = await o().vt.tx((db) => lotKarariYaz(db, muayeneci, istek()));
    assert.equal(ilk.karar, 'Kabul');
    assert.equal(ilk.yeni, true);
    assert.match(ilk.no, /^LOT-\d{4}-0001$/);
    const govde = await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'lot', ilk.kimlik));
    assert.equal(govde?.['karar'], 'Kabul');
    assert.equal(govde?.['muayeneci'], 'Deneme Muayeneci');
    assert.equal(govde?.['bMj'], 1);
    assert.equal(govde?.['bKr'], null, 'sayılmayan sınıf null');
    assert.equal(govde?.['anahtar'], 'P-500|IC');
    assert.equal(govde?.['emir'], '', 'bilinmeyen emir numarası boş');
    assert.deepEqual(govde?.['plan'], {
      Kritik: { kod: '—', n: 500, ac: 0, re: 1, aql: AQL_YUZDE_YUZ }, Majör: { kod: 'H', n: 50, ac: 1, re: 2, aql: '1.0' }, Minör: { kod: 'H', n: 50, ac: 3, re: 4, aql: '2.5' },
    });
    assert.equal(ilk.plan.n, 50, '%100 kritik numuneyi büyütmez');

    const tekrar = await o().vt.tx((db) => lotKarariYaz(db, muayeneci, istek({ bulunan: { Kritik: null, Majör: 9, Minör: null } })));
    assert.deepEqual({ kimlik: tekrar.kimlik, no: tekrar.no, karar: tekrar.karar, yeni: tekrar.yeni }, { kimlik: ilk.kimlik, no: ilk.no, karar: 'Kabul', yeni: false });

    const ret = await o().vt.tx((db) => lotKarariYaz(db, muayeneci, istek({ kaynakAnahtari: 'ie:10:2', bulunan: { Kritik: null, Majör: 2, Minör: null } })));
    assert.equal(ret.karar, 'Ret');
    assert.match(ret.no, /^LOT-\d{4}-0002$/);
  });

  test('KM-K564e geçersiz istek 400; sıkılıkta durdurulmuş parçada lot kararı 409', async () => {
    await assert.rejects(o().vt.tx((db) => lotKarariYaz(db, muayeneci, istek({ kaynakAnahtari: 'x', N: 1 }))), { kod: 'DOGRULAMA' });
    for (let i = 0; i < 7; i++) {
      await o().vt.tx((db) => lotKarariYaz(db, muayeneci, istek({ kaynakAnahtari: `dur:${String(i)}`, parcaNo: 'P-DUR', bulunan: { Kritik: null, Majör: 50, Minör: null } })));
    }
    assert.deepEqual(await o().vt.tx((db) => muayenePlaniOner(db, { parcaNo: 'P-DUR', N: 500, ayar: null })), { durduruldu: true });
    await assert.rejects(o().vt.tx((db) => lotKarariYaz(db, muayeneci, istek({ kaynakAnahtari: 'dur:son', parcaNo: 'P-DUR' }))), { kod: 'CAKISMA' });
  });
});
