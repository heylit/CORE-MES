import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { KuyrukYazCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1476-D: çok katmanlı emrin alt düğümü plana kendi ürününün rotasıyla girer; tüketen kök adım alt düğümün son adımı bitmeden başlamaz.
describe('plan (gerçek PostgreSQL): çok katmanlı emir montaj bağıyla (1476-D)', () => {
  const o = planTestOrtami();
  const { c, tamam, planOku, durum } = o;
  test('alt düğüm adımları yerleşir; kökün tüketen adımı alt düğümün son adımından sonra başlar', async () => {
    const { makineA, denemeProjeId } = durum();
    const a = (ek = {}) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...ek });
    const alt = await o.kartAc('yarimamul');
    await o.yururlugeAlinmisRota(alt, [a(), a({ bilesenler: [] })]);
    const urun = await o.mamulAc();
    const rev = await o.yururlugeAlinmisRota(urun, [a({ bilesenler: [{ malzemeId: alt, miktar: 2, fireYuzde: 0 }] }), a({ bilesenler: [] })]);
    const k = await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null, cokKatmanli: true });
    assert.equal(k.isEmriIdleri.length, 4);

    const p0 = await planOku();
    const bul = (id: number) => [...p0.yerlesimler, ...p0.yerlesmemis].find((x) => x.isEmriId === id)!;
    const isler = k.isEmriIdleri.map(bul);
    const emirNo = isler[0]!.emirNo;
    const sira = [...isler].sort((x, y) => (x.opNo >= 1000 ? 0 : 1) - (y.opNo >= 1000 ? 0 : 1) || x.opNo - y.opNo);
    const y = await tamam<KuyrukYazCevabi>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      planSurumu: p0.surum,
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date().toISOString(), isler: sira.map((x) => ({ emirNo, opNo: x.opNo, dondurulmus: false, elle: false })) }],
    });
    assert.equal(y.yazilan, 4);
    assert.deepEqual(y.yerlesmeyen ?? [], []);
    const p = await planOku(y.taslak);
    const yer = (opNo: number) => p.yerlesimler.find((x) => x.emirNo === emirNo && x.opNo === opNo);
    const [d1, d2, k1] = [sira[0]!.opNo, sira[1]!.opNo, sira[2]!.opNo];
    assert.ok(yer(d1) && yer(d2) && yer(k1), JSON.stringify(p.yerlesmemis));
    assert.ok(Date.parse(yer(k1)!.baslangic) >= Date.parse(yer(d2)!.bitis), 'kökün tüketen adımı alt düğümün son adımını bekler');
  });

  // 1559 a: emirde fasona alınan alt düğüm adımı kökteki gibi döner (988 a): tezgâha yerleşmez, düğümün ardıl adımı önceki iç adımın
  // bitişinden emrin termin günü kadar sonra başlar.
  test('alt düğümde fasona alınan adım tezgâha yerleşmez; ardılı termin günü kadar bekler', async () => {
    const { makineA, yoneticiId, denemeProjeId } = durum();
    const firma = (await o.vt().tx((db) => db.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason 1559', 'tedarikci', $1, true) RETURNING id", [yoneticiId])))!.id;
    const a = (ek = {}) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...ek });
    const alt = await o.kartAc('yarimamul');
    await o.yururlugeAlinmisRota(alt, [a(), a({ bilesenler: [] }), a({ bilesenler: [] })]);
    const urun = await o.mamulAc();
    const rev = await o.yururlugeAlinmisRota(urun, [a({ bilesenler: [{ malzemeId: alt, miktar: 1, fireYuzde: 0 }] })]);
    const k = await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 5, teslim: null, cokKatmanli: true });
    const satirlar = await o.vt().tx((db) => db.sorgu<{ id: number; u: number; n: number }>(
      'SELECT id, uretim_emri_id AS u, op_no AS n FROM uretim_emirleri_is_emri WHERE id = ANY($1::bigint[]) ORDER BY op_no', [k.isEmriIdleri]));
    const dugum = satirlar.filter((x) => x.n >= 1000);
    assert.equal(dugum.length, 3);
    const [d1, d2, d3] = dugum;
    const emir = d1!.u;
    const ayr = await tamam<{ emir: { surum: number } }>(c.planlama, 'GET', `/adimli-emirler/${emir}`);
    const uy = await o.istek(c.planlama, 'POST', `/adimli-emirler/${emir}/uretim-yeri`, { opNo: d2!.n, yer: 'fason', firmaId: firma, terminGun: 5, surum: ayr.emir.surum });
    assert.equal(uy.statusCode, 200, uy.body);
    const p = await o.taslaktaOner();
    assert.equal(p.yerlesimler.some((y) => y.isEmriId === d2!.id), false, 'fason düğüm adımı tezgâha yerleşmez');
    const y1 = o.yer(p, d1!.id), y3 = o.yer(p, d3!.id);
    assert.ok(y1 && y3, JSON.stringify(p.yerlesmemis));
    const gun = (Date.parse(y3.baslangic) - Date.parse(y1.bitis)) / 86_400_000;
    assert.ok(gun >= 5 - 1e-6 && gun < 6, `düğümün üçüncü adımı ilkin bitişinden ${String(gun)} gün sonra`);
  });
});
