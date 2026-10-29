import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planTestOrtami } from './plan-ortak.test.ts';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';

// 1034, 1036 a: hatalı parça kolu kalite kararı ve rework adımıyla açılır, sonraki adımda ana partiye katılır. Kalite adımı ve doldurulmamış
// rework adımı süresiz ve kaynaksızdır, plana girmez; kol yerleşmedikçe ana partinin birleşme adımı da yerleşmez (bekler). Planlama rework
// adımını doldurunca kol dizilir. Kol burada parti bölmenin ek adımlarıyla kurulur
// (aynı biçim: tur ek ve rework, kol bölünen adımın tekrarıyla birleşme adımına kadar yürür).
describe('plan (gerçek PostgreSQL): hatalı parça kolu (1034, 1036 a)', () => {
  const o = planTestOrtami();

  async function kolluEmir(rework: { kaynak: { tur: 'makine' | 'fason'; id: number } | null; sure: boolean; terminGun?: number }) {
    const { makineA, denemeProjeId } = o.durum();
    const ic = (bilesenli: boolean) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...(bilesenli ? {} : { bilesenler: [] }) });
    const rev = await o.yururlugeAlinmisRota(await o.mamulAc(), [ic(true), ic(false), ic(false)]);
    const [a1, a2, a3] = (await o.tamam<{ isEmriIdleri: number[] }>(o.c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    const emir = (await o.vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [a1])))!.u;
    const ayr = await o.tamam<{ emir: { surum: number } }>(o.c.planlama, 'GET', `/adimli-emirler/${emir}`);
    const ek = { oncekiOpNo: null, opNo: 12, tur: 'ek', ad: 'Kalite kararı', operasyonTipiId: o.tip('TRN'), kaynak: null, ayarSuresiDk: null, birimSureDk: null, terminGun: null, aciklama: null };
    const rw = { ...ek, oncekiOpNo: 12, opNo: 14, tur: 'rework', ad: 'Rework', kaynak: rework.kaynak, ...(rework.sure ? { ayarSuresiDk: '5', birimSureDk: '2' } : {}), terminGun: rework.terminGun ?? null };
    const b = await o.tamam<{ altEmirId: number }>(o.c.planlama, 'POST', `/adimli-emirler/${emir}/bol`, { adimSira: 2, adet: 2, surum: ayr.emir.surum, birlesmeOpNo: 30, ekAdimlar: [ek, rw] });
    const kol = await o.vt().tx((db) => db.sorgu<{ id: number; op: number }>('SELECT id, op_no AS op FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [b.altEmirId]));
    const id = (op: number) => kol.find((x) => x.op === op)!.id;
    // Kola kopyalanan rota adımının kaynağı boştur (plan rotadaki makineden aday alır); test yardımcısı yalnız kaynaklı işi kuyruğa koyduğu
    // için tekrar adımına rotadaki makine yazılır.
    await o.vt().tx((db) => db.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = $2 WHERE id = $1', [id(20), makineA]));
    return { ana: { op10: a1!, op20: a2!, op30: a3! }, kol: { kalite: id(12), rework: id(14), tekrar: id(20) } };
  }
  const neden = (p: PlanCevabi, isEmriId: number) => p.yerlesmemis.find((y) => y.isEmriId === isEmriId)?.neden;
  const yerli = (p: PlanCevabi, isEmriId: number) => p.yerlesimler.some((y) => y.isEmriId === isEmriId);
  const kaliteKapandi = (id: number) => o.vt().tx((db) => db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 2 WHERE id = $1", [id]));

  test('karar ve rework beklerken kol plana girmez, ana partinin birleşme adımı da yerleşmez; önceki adımları yerleşir', async () => {
    const e = await kolluEmir({ kaynak: null, sure: false });
    const p = await o.taslaktaOner();
    assert.equal(yerli(p, e.ana.op10) && yerli(p, e.ana.op20), true, 'ana partinin önceki adımları yerleşir');
    assert.equal(yerli(p, e.ana.op30), false, 'birleşme adımı kolu bekler (1036 a)');
    assert.equal(neden(p, e.ana.op30), 'Bağlı parti yerleşmedi.');
    assert.match(neden(p, e.kol.kalite) ?? '', /kalite kararı/);
    assert.equal(neden(p, e.kol.rework), 'Rework adımı: planlama kaynak ve süre seçmedi.');
    assert.equal(yerli(p, e.kol.tekrar), false, 'tekrar adımı rework adımını bekler');
    assert.equal(neden(p, e.kol.tekrar), 'Önceki adım (OP 14) yerleşmedi.');
  });

  test('rework iç kaynakla doldurulup kalite kapanınca kol dizilir; birleşme adımı kolun son adımından sonra başlar', async () => {
    const { makineA } = o.durum();
    const e = await kolluEmir({ kaynak: { tur: 'makine', id: makineA }, sure: true });
    const once = await o.taslaktaOner();
    assert.equal(yerli(once, e.ana.op30), false, 'kalite kararı açıkken birleşme bekler');
    await kaliteKapandi(e.kol.kalite);
    const p = await o.taslaktaOner();
    for (const id of [e.kol.rework, e.kol.tekrar, e.ana.op30]) assert.equal(yerli(p, id), true, `iş ${String(id)} yerleşir`);
    assert.ok(Date.parse(o.yer(p, e.kol.tekrar).baslangic) >= Date.parse(o.yer(p, e.kol.rework).bitis), 'tekrar rework adımından sonra');
    assert.ok(Date.parse(o.yer(p, e.ana.op30).baslangic) >= Date.parse(o.yer(p, e.kol.tekrar).bitis), 'birleşme kolun son adımından sonra');
  });

});
