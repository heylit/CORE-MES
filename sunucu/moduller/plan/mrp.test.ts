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

  // B-2499-5: adımlarında hiç bileşen olmayan açık emrin ihtiyacı hesaplanamaz; sayıda görünür, sessiz düşmez.
  test('bileşensiz açık emir hesaplanamayan emir sayısına girer', async () => {
    const once = (await tamam<MrpIhtiyaciCevabi>(c.planlama, 'GET', yol)).urunsuzEmir;
    // Rota adımı bileşen ister; bileşensiz emir eski ya da örnek veriden gelir (B-2499-4): emrin bileşenleri VT'de silinir.
    const ham = await kartAc('hammadde');
    const rota = await yururlugeAlinmisRota(await kartAc('mamul'), [yeniAdim({ bilesenler: [{ malzemeId: ham, miktar: 1, fireYuzde: 0 }] })]);
    const e = await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rota}/emre-kopyala`, { projeId: durum().denemeProjeId, adet: 5, teslim: null });
    await durum().ortam!.sahip.sorgu('DELETE FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = ANY($1::int[])', [e.isEmriIdleri]);
    assert.equal((await tamam<MrpIhtiyaciCevabi>(c.planlama, 'GET', yol)).urunsuzEmir, once + 1);
  });

  // B-2482-8 (2527-2): ilk adımı sayılmış emrin hammaddesi statü zincirindedir (stok rezervesi, statülü); MRP onu emre verilmiş sayar ve sahte
  // eksik göstermez. Zincir burada doğrudan rezerve satırıyla kurulur (sayım akışı stok testinde, zincir-miktari.test.ts).
  test('emrin statü zincirindeki hammaddesi emre verilmiş sayılır: OP 10 sayıldı, OP 20 sayılmadı, kalan 0 (B-2482-8)', async () => {
    const ham = await kartAc('hammadde');
    const mamul = await kartAc('mamul');
    const rota = await yururlugeAlinmisRota(mamul, [yeniAdim({ bilesenler: [{ malzemeId: ham, miktar: 1, fireYuzde: 0 }] }), yeniAdim({ bilesenler: [] })]);
    const { isEmriIdleri } = await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rota}/emre-kopyala`, { projeId: durum().denemeProjeId, adet: 10, teslim: null });
    const { ortam } = durum();
    const emir = (await ortam!.sahip.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriIdleri[0]]))!.u;
    const brut = async () => (await tamam<MrpIhtiyaciCevabi>(c.planlama, 'GET', yol)).satirlar.find((x) => x.malzeme.id === ham && x.emirler.length > 0)?.brut ?? 0;
    assert.equal(await brut(), 10, 'zincir yokken bütün ihtiyaç');
    const statu = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ($1, 'OP 10 sonrası', $2, '#112233', 'HM') RETURNING id", [String(ham), `${String(mamul)}-o10-mrp`]))!.id;
    await ortam!.sahip.sorgu('INSERT INTO stok_rezerve (malzeme_id, statu_id, uretim_emri_id, miktar) VALUES ($1, $2, $3, 6)', [ham, statu, emir]);
    assert.equal(await brut(), 4, '6 kg zincirde: kalan 4');
    await ortam!.sahip.sorgu('UPDATE stok_rezerve SET miktar = 10 WHERE uretim_emri_id = $1', [emir]);
    assert.equal(await brut(), 0, 'OP 10 bütünü sayıldı, OP 20 sayılmadı: kalan 0');
  });

  // 3175 (Risk M1, M2, M4): emrin MRP fişi plan MRP'sinin bu emre düşen satırlarıdır; hesap bütün açık emirlerle yapılır, süzgeç sonra.
  test('emrin MRP fişi: satırlar plan MRP sayfasındakiyle aynı; yalnız emri anan satır gelir; planlama okuması şart, bilinmeyen emir 404', async () => {
    const ham = await kartAc('hammadde');
    const baska = await kartAc('hammadde');
    const rota1 = await yururlugeAlinmisRota(await kartAc('mamul'), [yeniAdim({ bilesenler: [{ malzemeId: ham, miktar: 2, fireYuzde: 0 }] })]);
    const rota2 = await yururlugeAlinmisRota(await kartAc('mamul'), [yeniAdim({ bilesenler: [{ malzemeId: ham, miktar: 1, fireYuzde: 0 }, { malzemeId: baska, miktar: 1, fireYuzde: 0 }] })]);
    const e1 = await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rota1}/emre-kopyala`, { projeId: durum().denemeProjeId, adet: 5, teslim: null });
    await tamam(c.planlama, 'POST', `/rota/revizyonlar/${rota2}/emre-kopyala`, { projeId: durum().denemeProjeId, adet: 3, teslim: null });
    const { ortam } = durum();
    const emir = (await ortam!.sahip.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [e1.isEmriIdleri[0]]))!.u;
    const tum = await tamam<MrpIhtiyaciCevabi>(c.planlama, 'GET', yol);
    const emrin = await tamam<MrpIhtiyaciCevabi>(c.planlama, 'GET', `/plan/uretim-emirleri/${String(emir)}/mrp`);
    const hamSatiri = tum.satirlar.find((x) => x.malzeme.id === ham)!;
    assert.deepEqual(emrin.satirlar.find((x) => x.malzeme.id === ham), hamSatiri, 'satır plan MRP sayfasındakiyle aynı (iki emrin toplamı)');
    assert.equal(hamSatiri.brut, 13);
    assert.equal(emrin.satirlar.some((x) => x.malzeme.id === baska), false, 'başka emrin malzemesi gelmez');
    assert.ok(emrin.satirlar.every((x) => tum.satirlar.some((y) => y.malzeme.id === x.malzeme.id && x.emirler.length > 0)));
    assert.deepEqual([emrin.stokGorunur, emrin.satinAlmaGorunur, emrin.urunsuzEmir], [true, true, 0]);
    const yalniz = await tamam<MrpIhtiyaciCevabi>(await girisCerezi('mrpokur'), 'GET', `/plan/uretim-emirleri/${String(emir)}/mrp`);
    const ys = yalniz.satirlar.find((x) => x.malzeme.id === ham)!;
    assert.deepEqual([ys.serbest, ys.acikSiparis, ys.net], [null, null, null], '1545 a null aynen');
    assert.equal((await istek(c.operator, 'GET', `/plan/uretim-emirleri/${String(emir)}/mrp`)).statusCode, 403);
    assert.equal((await istek(c.planlama, 'GET', '/plan/uretim-emirleri/999999/mrp')).statusCode, 404);
  });
});
