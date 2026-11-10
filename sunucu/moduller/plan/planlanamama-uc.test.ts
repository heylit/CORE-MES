import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { NEDEN_DUZELTME_YERI, type MotorYerlesimiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 2780: GET /plan/motor-yerlesimi yerleşmeyen işin tek nedenini kodu ve düzeltilecek kaynağıyla döner (Reçete ve Rota "Planlanamıyor").
// Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): planlanamama nedeni motor yerleşiminde (2780)', () => {
  const o = planTestOrtami();
  const yerlesim = () => o.tamam<MotorYerlesimiCevabi>(o.c.planlama, 'GET', '/plan/motor-yerlesimi');
  const nedeni = (m: MotorYerlesimiCevabi, id: number) => { const y = m.yerlesmeyen.find((x) => x.isEmriId === id); return y && { neden: y.neden, kod: y.nedenKodu, hedef: y.hedef }; };

  test('PU-01: vardiyası tanımsız tezgâh: takvim nedeni, tezgâhın adıyla; düzeltme yeri vardiyalar', async () => {
    const merkez = await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-PU', ad: 'Vardiyasiz merkez', aciklama: null });
    const ist = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-PUI', ad: 'Deneme PU istasyon', isMerkeziId: merkez.id })).id;
    const makine = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/makineler', { kod: 'RT-PUM', ad: 'Deneme PU makine', istasyonId: ist })).id;
    const [is] = await o.isEmirleriAc([o.yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 0, birimSureDk: 2 })]);
    const n = nedeni(await yerlesim(), is!);
    assert.deepEqual(n, { neden: 'Deneme PU makine tezgâhının vardiyası tanımsız.', kod: 'takvim-yok', hedef: { tur: 'makine', id: makine, ad: 'Deneme PU makine' } });
    assert.equal(NEDEN_DUZELTME_YERI[n.kod], 'vardiyalar');
  });

  test('PU-02: seçili makine pasif: makinenin adıyla; ardılı öncül nedeniyle, kök adımı söyleyerek', async () => {
    const { merkezId } = o.durum();
    const ist = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-PUP', ad: 'Deneme PU pasif ist', isMerkeziId: merkezId })).id;
    const makine = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/makineler', { kod: 'RT-PUPM', ad: 'Deneme PU pasif makine', istasyonId: ist })).id;
    const [is10, is20] = await o.isEmirleriAc([
      o.yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 0, birimSureDk: 2 }),
      o.yeniAdim({ kaynak: { tur: 'makine', id: o.durum().makineA }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [] }),
    ]);
    await o.vt().tx((db) => db.sorgu('UPDATE makine SET aktif = false WHERE id = $1', [makine]));
    const m = await yerlesim();
    const kok = nedeni(m, is10!);
    assert.deepEqual(kok, { neden: 'Deneme PU pasif makine makinesi kullanımda değil.', kod: 'makine-pasif', hedef: { tur: 'makine', id: makine, ad: 'Deneme PU pasif makine' } }, JSON.stringify(m.yerlesmeyen));
    const ardil = nedeni(m, is20!);
    assert.equal(ardil?.kod, 'oncul', JSON.stringify(m.yerlesmeyen));
    assert.match(ardil?.neden ?? '', /^Önceki adım \(.*OP \d+\) yerleşmedi\.$/);
    assert.equal(ardil?.hedef, null);
  });
});
