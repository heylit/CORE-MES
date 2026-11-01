import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { MotorYerlesimiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1567 a: sunucu motoru kök adımın emirdeki istasyonunu ve süresini okur. Rotada fason olup emirde içeri alınan adım emrin istasyonunda
// (operasyon tipinin varsayılanı) iç adım olur; emirdeki süresi rotadakinden ayrılan adım emrin süresiyle dizilir. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): emre özel istasyon ve süre (1567 a)', () => {
  const o = planTestOrtami();
  const dk = (y: { baslangic: string; bitis: string }) => (Date.parse(y.bitis) - Date.parse(y.baslangic)) / 60_000;
  const emirAc = async (rev: number) => (await o.tamam<{ isEmriIdleri: number[] }>(o.c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, {
    projeId: o.durum().denemeProjeId, adet: 10, teslim: null,
  })).isEmriIdleri;
  const satir = <T>(sql: string, p: unknown[]) => o.vt().tx((db) => db.tek<T>(sql, p));

  test('rotada fason, emirde içeri alınan adım emrin istasyonundaki makineye emrin süresiyle yerleşir; ardılı onu bekler', async () => {
    const { makineA, makineB, istasyonB, yoneticiId } = o.durum();
    const firma = (await satir<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason 1567', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    const tip = o.tip('TRN');
    await satir('UPDATE istasyonlar_operasyon_tipi SET varsayilan_istasyon_id = $2, varsayilan_ayar_dk = 20, varsayilan_birim_dk = 3 WHERE id = $1 RETURNING id', [tip, istasyonB]);
    const ic = (bilesenli: boolean) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...(bilesenli ? {} : { bilesenler: [] }) });
    const urun = await o.mamulAc();
    const rev = await o.yururlugeAlinmisRota(urun, [ic(true), o.yeniAdim({ kaynak: { tur: 'fason', id: firma }, terminGun: 3, ayarSuresiDk: null, birimSureDk: null, bilesenler: [] }), ic(false)]);
    const [a1, a2, a3] = await emirAc(rev);
    const emir = (await satir<{ u: number; n: number }>('SELECT uretim_emri_id AS u, op_no AS n FROM uretim_emirleri_is_emri WHERE id = $1', [a2]))!;
    const ayr = await o.tamam<{ emir: { surum: number } }>(o.c.planlama, 'GET', `/adimli-emirler/${emir.u}`);
    const uy = await o.istek(o.c.planlama, 'POST', `/adimli-emirler/${emir.u}/uretim-yeri`, { opNo: emir.n, yer: 'ic', firmaId: null, terminGun: null, surum: ayr.emir.surum });
    assert.equal(uy.statusCode, 200, uy.body);
    // Ekranın "Planı kur"u gibi: sunucu motorunun yerleşimi (makineyi motor seçer) kuyruğa yazılır.
    const m = await o.tamam<MotorYerlesimiCevabi>(o.c.planlama, 'GET', '/plan/motor-yerlesimi');
    assert.deepEqual(m.yerlesimler.find((y) => y.isEmriId === a2)?.kaynak, { tur: 'makine', id: makineB }, 'motor emrin istasyonundaki makineyi seçer');
    const p = await o.taslaktaOner(o.c.planlama, undefined, m);
    const y2 = o.yer(p, a2!), y3 = o.yer(p, a3!);
    assert.ok(y2, 'içeri alınan adım yerleşir');
    assert.deepEqual(y2.kaynak, { tur: 'makine', id: makineB }, 'emrin istasyonundaki makine');
    assert.ok(Math.abs(dk(y2) - (20 + 10 * 3)) < 1, `süre ${String(dk(y2))} dk; emrin ayarı ve birim süresi`);
    assert.ok(Date.parse(y3.baslangic) >= Date.parse(y2.bitis) - 1000, 'ardıl içeri alınan adımı bekler');
    assert.ok(o.yer(p, a1!));
  });

  test('emirdeki süresi rotadakinden ayrılan adım sunucu motorunda emrin süresiyle dizilir; öteki adım rotadakiyle', async () => {
    const { makineA } = o.durum();
    const ic = (bilesenli: boolean) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...(bilesenli ? {} : { bilesenler: [] }) });
    const urun = await o.mamulAc();
    const rev = await o.yururlugeAlinmisRota(urun, [ic(true), ic(false)]);
    const [a1, a2] = await emirAc(rev);
    await satir("UPDATE uretim_emirleri_is_emri SET ayar_suresi_dk = '40', birim_sure_dk = '5' WHERE id = $1 RETURNING id", [a2]);
    const p = await o.taslaktaOner();
    assert.ok(Math.abs(dk(o.yer(p, a2!)) - (40 + 10 * 5)) < 1, `süre ${String(dk(o.yer(p, a2!)))} dk`);
    assert.ok(Math.abs(dk(o.yer(p, a1!)) - (10 + 10 * 1)) < 1, `süre ${String(dk(o.yer(p, a1!)))} dk`);
  });
});
