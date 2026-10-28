import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planTestOrtami } from './plan-ortak.test.ts';

// 988 a: emirde sonradan fasona alınan adım sunucu motorunda rotadaki fason adım gibi döner (CA-2): sonraki adım önceki iç adımın
// bitişinden emrin termin günü kadar sonra başlar. Rotanın geri kalanı yürürlükteki rotadandır (983 b).
describe('plan (gerçek PostgreSQL): emirde fasona alınan adım (988 a)', () => {
  const o = planTestOrtami();
  test('ardıl adım termin günü kadar bekler; fason adım kuyruğa girmez', async () => {
    const { makineA, yoneticiId, denemeProjeId } = o.durum();
    const firma = (await o.vt().tx((db) => db.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason 988', 'tedarikci', $1, true) RETURNING id", [yoneticiId])))!.id;
    const ic = (bilesenli: boolean) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...(bilesenli ? {} : { bilesenler: [] }) });
    const urun = await o.mamulAc();
    const rev = await o.yururlugeAlinmisRota(urun, [ic(true), ic(false), ic(false)]);
    const [a1, a2, a3] = (await o.tamam<{ isEmriIdleri: number[] }>(o.c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    const emir = (await o.vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [a1])))!.u;
    const opNo = (await o.vt().tx((db) => db.tek<{ n: number }>('SELECT op_no AS n FROM uretim_emirleri_is_emri WHERE id = $1', [a2])))!.n;
    const ayr = await o.tamam<{ emir: { surum: number } }>(o.c.planlama, 'GET', `/adimli-emirler/${emir}`);
    const uy = await o.istek(o.c.planlama, 'POST', `/adimli-emirler/${emir}/uretim-yeri`, { opNo, yer: 'fason', firmaId: firma, terminGun: 5, surum: ayr.emir.surum });
    assert.equal(uy.statusCode, 200, uy.body);
    const p = await o.taslaktaOner();
    const y1 = o.yer(p, a1!), y3 = o.yer(p, a3!);
    assert.equal(p.yerlesimler.some((y) => y.isEmriId === a2), false, 'fason adım tezgâha yerleşmez');
    const gun = (Date.parse(y3.baslangic) - Date.parse(y1.bitis)) / 86_400_000;
    assert.ok(gun >= 5 - 1e-6 && gun < 6, `üçüncü adım ilkin bitişinden ${String(gun)} gün sonra`);
  });
});
