import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanlanabilirlikCevabi, RotaPlanlanabilirlikCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 2779: planlanabilirlik uçları. Emir sekmesi yalnız yerleşmeyen adımları, kontrolleri sırasıyla ve kökü ilk eksikle döner; öncül zinciri
// kök adıma kadar izlenir. Rota sekmesi emre bağlı kontrolleri döndürmez. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): planlanabilirlik uçları (2779)', () => {
  const o = planTestOrtami();
  const emirSekmesi = () => o.tamam<PlanlanabilirlikCevabi>(o.c.planlama, 'GET', '/plan/planlanabilirlik');
  const rotaSekmesi = () => o.tamam<RotaPlanlanabilirlikCevabi>(o.c.planlama, 'GET', '/plan/planlanabilirlik/rotalar');
  const kodlar = (k: { kod: string; durum: string }[]) => k.map((x) => `${x.kod}:${x.durum}`);

  test('PB-01: pasif makine kök adımdır; ardılı öncül, bekledigiOp kök adımın OP numarası; yerleşen adım listede yok', async () => {
    const { merkezId, makineA } = o.durum();
    const ist = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-PB', ad: 'Deneme PB ist', isMerkeziId: merkezId })).id;
    const makine = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/makineler', { kod: 'RT-PBM', ad: 'Deneme PB makine', istasyonId: ist })).id;
    const [, is20, is30] = await o.isEmirleriAc([
      o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 0, birimSureDk: 1 }),
      o.yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [] }),
      o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [] }),
    ]);
    await o.vt().tx((db) => db.sorgu('UPDATE makine SET aktif = false WHERE id = $1', [makine]));
    const p = await emirSekmesi();
    const p0 = await o.planOku();
    const is = (id: number) => p0.yerlesmemis.find((x) => x.isEmriId === id) ?? p0.yerlesimler.find((x) => x.isEmriId === id)!;
    const op = (id: number) => is(id).opNo;
    const emirNo = is(is20!).emirNo;
    const e = p.emirler.find((x) => x.emirNo === emirNo);
    assert.ok(e, JSON.stringify(p));
    assert.ok(p.motorZamani !== null && p.acikEmir >= 1);
    assert.deepEqual(e.adimlar.map((a) => a.opNo), [op(is20!), op(is30!)], 'yerleşen ilk adım listede yok');
    const [kok, ardil] = e.adimlar;
    assert.equal(kok!.kok, 'makine-pasif');
    assert.deepEqual(kodlar(kok!.kontroller), ['rotada-yok:tamam', 'sure-bos:tamam', 'makine-pasif:eksik', 'yetki-disi:olculemedi', 'takvim-yok:olculemedi',
      'kisi-vardiyasiz:olculemedi', 'malzeme:olculemedi', 'ufuk:olculemedi', 'oncul:olculemedi']);
    const eksik = kok!.kontroller.find((k) => k.durum === 'eksik')!;
    assert.deepEqual([eksik.metin, eksik.hedef], ['Deneme PB makine makinesi kullanımda değil.', { tur: 'makine', id: makine, ad: 'Deneme PB makine' }]);
    assert.equal(kok!.kontroller.find((k) => k.kod === 'ufuk')?.yaklasik, true);
    assert.deepEqual([kok!.bekledigiOp, kok!.bekledigiEmirNo], [null, null]);
    assert.equal(ardil!.kok, 'oncul');
    assert.deepEqual([ardil!.bekledigiOp, ardil!.bekledigiEmirNo], [op(is20!), emirNo], 'zincirin kökü, ara adım değil');
  });

  test('PB-02: rota sekmesi: vardiyasız tezgâh takvim eksiği, emre bağlı kontrol yok', async () => {
    const merkez = await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-PBR', ad: 'Vardiyasiz merkez PB', aciklama: null });
    const ist = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-PBRI', ad: 'Deneme PBR istasyon', isMerkeziId: merkez.id })).id;
    const makine = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/makineler', { kod: 'RT-PBRM', ad: 'Deneme PBR makine', istasyonId: ist })).id;
    const urun = await o.mamulAc();
    await o.yururlugeAlinmisRota(urun, [
      o.yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 0, birimSureDk: 2 }),
      o.yeniAdim({ kaynak: { tur: 'makine', id: o.durum().makineA }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [] }),
    ]);
    const r = await rotaSekmesi();
    const u = r.urunler.find((x) => x.urunId === urun);
    assert.ok(u, JSON.stringify(r.urunler.map((x) => x.urunId)));
    assert.equal(u.acikEmir, 0);
    const [a1, a2] = u.adimlar;
    assert.deepEqual(kodlar(a1!.kontroller), ['sure-bos:tamam', 'makine-yok:tamam', 'takvim-yok:eksik', 'kisi-vardiyasiz:tamam']);
    assert.equal(a1!.kok, 'takvim-yok');
    assert.deepEqual(a1!.kontroller[2]!.hedef, { tur: 'makine', id: makine, ad: 'Deneme PBR makine' });
    assert.equal(a1!.kontroller[2]!.metin, 'Deneme PBR makine tezgâhının vardiyası tanımsız.');
    assert.equal(a2!.kok, null, JSON.stringify(a2));
    assert.ok(a2!.kontroller.every((k) => k.durum === 'tamam'));
    assert.ok(u.adimlar.every((a) => a.bekledigiOp === null && a.kontroller.every((k) => !['rotada-yok', 'malzeme', 'ufuk', 'oncul', 'yetki-disi'].includes(k.kod))));
  });
});
