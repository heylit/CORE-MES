import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planTestOrtami } from './plan-ortak.test.ts';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';

// 1202: hatalı parça kolundaki rework fasonda yapılırsa adım plana iş olarak girmez; kolun tekrar adımı sunucu motorunda da fasonun termin
// günü kadar bekler (motorsuz yoldaki fasonBekleGun gibi). Rota ve emir fasonu motorun kendi bilgisidir (emir-fasonu.test).
describe('plan (gerçek PostgreSQL): fason rework adımı (1202)', () => {
  const o = planTestOrtami();
  const GUN_MS = 86_400_000;

  async function fasonReworkluKol(terminGun: number) {
    const { makineA, yoneticiId, denemeProjeId } = o.durum();
    const firma = (await o.vt().tx((db) => db.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason 1202', 'tedarikci', $1, true) RETURNING id", [yoneticiId])))!.id;
    const ic = (bilesenli: boolean) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...(bilesenli ? {} : { bilesenler: [] }) });
    const rev = await o.yururlugeAlinmisRota(await o.mamulAc(), [ic(true), ic(false), ic(false)]);
    const [a1, a2, a3] = (await o.tamam<{ isEmriIdleri: number[] }>(o.c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    const emir = (await o.vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [a1])))!.u;
    const ayr = await o.tamam<{ emir: { surum: number } }>(o.c.planlama, 'GET', `/adimli-emirler/${emir}`);
    const ek = { oncekiOpNo: null, opNo: 12, tur: 'ek', ad: 'Kalite kararı', operasyonTipiId: o.tip('TRN'), kaynak: null, ayarSuresiDk: null, birimSureDk: null, terminGun: null, aciklama: null };
    const rw = { ...ek, oncekiOpNo: 12, opNo: 14, tur: 'rework', ad: 'Rework', kaynak: { tur: 'fason', id: firma }, terminGun };
    const b = await o.tamam<{ altEmirId: number }>(o.c.planlama, 'POST', `/adimli-emirler/${emir}/bol`, { adimSira: 2, adet: 2, surum: ayr.emir.surum, birlesmeOpNo: 30, ekAdimlar: [ek, rw] });
    const kol = await o.vt().tx((db) => db.sorgu<{ id: number; op: number }>('SELECT id, op_no AS op FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [b.altEmirId]));
    const id = (op: number) => kol.find((x) => x.op === op)!.id;
    // Test yardımcısı yalnız kaynaklı işi kuyruğa koyar (hatali-kol.test gibi); kalite kararı verilmiş sayılır.
    await o.vt().tx(async (db) => {
      await db.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = $2 WHERE id = $1', [id(20), makineA]);
      await db.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 2 WHERE id = $1", [id(12)]);
    });
    return { ana: { op20: a2!, op30: a3! }, kol: { rework: id(14), tekrar: id(20) } };
  }
  const yerli = (p: PlanCevabi, isEmriId: number) => p.yerlesimler.some((y) => y.isEmriId === isEmriId);

  test('kolun tekrar adımı fasonun termin günü kadar bekler; birleşme adımı kolu bekler', async () => {
    const e = await fasonReworkluKol(3);
    const once = Date.now();
    const p = await o.taslaktaOner();
    assert.equal(yerli(p, e.kol.rework), false, 'fason rework tezgâha yerleşmez');
    const tekrar = o.yer(p, e.kol.tekrar);
    const gun = (Date.parse(tekrar.baslangic) - once) / GUN_MS;
    assert.ok(gun >= 3 - 1 / 24 && gun < 5, `tekrar adımı ${String(gun)} gün sonra`);
    assert.ok(Date.parse(o.yer(p, e.ana.op30).baslangic) >= Date.parse(tekrar.bitis), 'birleşme kolun son adımından sonra');
  });

});
