import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { MrpIhtiyaciCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1472 M1 (1522 a): MRP ihtiyaç raporu gerçek PostgreSQL'de. Kartlar ve rotalar testte açılır; veriler uydurmadır.

describe('plan (gerçek PostgreSQL): MRP ihtiyaç raporu', () => {
  const { c, istek, tamam, kartAc, yeniAdim, yururlugeAlinmisRota, durum, kisiEkle, girisCerezi } = planTestOrtami();
  const yol = '/plan/mrp-ihtiyaci';

  test('açık emrin yarı mamulü ağacıyla hammaddeye açılır; yalnız okur; planlama ve müdür okur, operatör 403, oturumsuz 401', async () => {
    const hamY = await kartAc('hammadde');
    const hamM = await kartAc('hammadde');
    const yari = await kartAc('yarimamul');
    const mamul = await kartAc('mamul');
    // 1 yarı mamul = 3 hamY; 1 mamul = 2 yarı mamul + 1 hamM. Yarı mamulün stok kaydı yok: tamamı üretilecek gibi açılır.
    await yururlugeAlinmisRota(yari, [yeniAdim({ bilesenler: [{ malzemeId: hamY, miktar: 3, fireYuzde: 0 }] })]);
    const rota = await yururlugeAlinmisRota(mamul, [yeniAdim({ bilesenler: [{ malzemeId: yari, miktar: 2, fireYuzde: 0 }, { malzemeId: hamM, miktar: 1, fireYuzde: 0 }] })]);
    const bos = await tamam<MrpIhtiyaciCevabi>(c.planlama, 'GET', yol);
    assert.equal(bos.satirlar.find((x) => x.malzeme.id === yari), undefined, 'emir yokken ihtiyaç yok');

    await tamam(c.planlama, 'POST', `/rota/revizyonlar/${rota}/emre-kopyala`, { projeId: durum().denemeProjeId, adet: 5, teslim: null });
    const { ortam } = durum();
    const sayim = async () => (await ortam!.sahip.tek<{ n: number }>('SELECT (SELECT count(*) FROM rota_patlatma) + (SELECT count(*) FROM stok_hareketi) AS n'))!.n;
    const once = await sayim();

    const r = await tamam<MrpIhtiyaciCevabi>(c.planlama, 'GET', yol);
    const s = (id: number) => r.satirlar.find((x) => x.malzeme.id === id)!;
    assert.deepEqual([s(yari).brut, s(yari).serbest, s(yari).net, s(yari).acildi, s(yari).malzeme.tur], [10, null, null, true, 'yarimamul']);
    assert.deepEqual([s(hamY).brut, s(hamY).net, s(hamY).acilanlar.map((x) => x.id), s(hamY).acildi], [30, null, [yari], false]);
    assert.deepEqual([s(hamM).brut, s(hamM).acilanlar], [5, []]);
    assert.equal(s(hamM).emirler.length, 1);
    assert.deepEqual(s(hamY).emirler, s(hamM).emirler, 'açılan ihtiyaç kaynak emri taşır');
    assert.equal(await sayim(), once, 'rapor patlatma ya da stok hareketi yazmaz');

    assert.deepEqual([r.stokGorunur, r.satinAlmaGorunur], [true, true], 'planlama stok ve satın almayı okur');
    const m = await tamam<MrpIhtiyaciCevabi>(c.mudur, 'GET', yol);
    assert.deepEqual(m.satirlar.map((x) => [x.malzeme.id, x.brut]), r.satirlar.map((x) => [x.malzeme.id, x.brut]));

    // 1545 a: yalnız plan.planlama-oku olan stok ve satın alma miktarını görmez; brüt aynıdır.
    const rol = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_mrp_okur', 'test_mrp_okur') RETURNING id"))!.id;
    await ortam!.sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'plan.planlama-oku')", [rol]);
    await kisiEkle('mrpokur', rol);
    const yalniz = await tamam<MrpIhtiyaciCevabi>(await girisCerezi('mrpokur'), 'GET', yol);
    assert.deepEqual([yalniz.stokGorunur, yalniz.satinAlmaGorunur], [false, false]);
    const ys = yalniz.satirlar.find((x) => x.malzeme.id === hamM)!;
    assert.deepEqual([ys.brut, ys.serbest, ys.acikSiparis, ys.net, ys.emniyetPayi], [5, null, null, null, null]);
    assert.equal((await istek(c.operator, 'GET', yol)).statusCode, 403);
    assert.equal((await istek('', 'GET', yol)).statusCode, 401);
  });
});
