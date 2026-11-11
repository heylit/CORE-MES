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
    const [, is20, is30, is40] = await o.isEmirleriAc([
      o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 0, birimSureDk: 1 }),
      o.yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [] }),
      o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 0, birimSureDk: 2, bilesenler: [] }),
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
    assert.deepEqual(e.adimlar.map((a) => a.opNo), [op(is20!), op(is30!), op(is40!)], 'yerleşen ilk adım listede yok');
    const [kok, ardil, son] = e.adimlar;
    assert.equal(kok!.kok, 'makine-pasif');
    assert.deepEqual(kodlar(kok!.kontroller), ['rotada-yok:tamam', 'sure-bos:tamam', 'makine-pasif:eksik', 'yetki-disi:olculemedi', 'takvim-yok:olculemedi',
      'kisi-vardiyasiz:olculemedi', 'malzeme:olculemedi', 'ufuk:olculemedi', 'oncul:olculemedi']);
    const eksik = kok!.kontroller.find((k) => k.durum === 'eksik')!;
    assert.deepEqual([eksik.metin, eksik.hedef], ['Deneme PB makine makinesi kullanımda değil.', { tur: 'makine', id: makine, ad: 'Deneme PB makine' }]);
    assert.equal(kok!.kontroller.find((k) => k.kod === 'ufuk')?.yaklasik, true);
    assert.deepEqual([kok!.bekledigiOp, kok!.bekledigiEmirNo], [null, null]);
    assert.equal(ardil!.kok, 'oncul');
    assert.deepEqual([ardil!.bekledigiOp, ardil!.bekledigiEmirNo], [op(is20!), emirNo]);
    assert.equal(son!.kok, 'oncul');
    assert.deepEqual([son!.bekledigiOp, son!.bekledigiEmirNo], [op(is20!), emirNo], 'üç adımlı zincirde kök adım, ara adım değil');
  });

  test('PB-03: bağlı partide bekledigiEmirNo öteki emrin (kolun) numarası, bekledigiOp kolun kök adımı', async () => {
    const { makineA, denemeProjeId } = o.durum();
    const ic = (bilesenli: boolean) => o.yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, ...(bilesenli ? {} : { bilesenler: [] }) });
    const rev = await o.yururlugeAlinmisRota(await o.mamulAc(), [ic(true), ic(false), ic(false)]);
    const [a1, , a3] = (await o.tamam<{ isEmriIdleri: number[] }>(o.c.planlama, 'POST', `/rota/revizyonlar/${rev}/emre-kopyala`, { projeId: denemeProjeId, adet: 10, teslim: null })).isEmriIdleri;
    const emir = (await o.vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [a1])))!.u;
    const ayr = await o.tamam<{ emir: { surum: number } }>(o.c.planlama, 'GET', `/adimli-emirler/${emir}`);
    const ek = { oncekiOpNo: null, opNo: 12, tur: 'ek', ad: 'Kalite kararı', operasyonTipiId: o.tip('TRN'), kaynak: null, ayarSuresiDk: null, birimSureDk: null, terminGun: null, aciklama: null };
    const rw = { ...ek, oncekiOpNo: 12, opNo: 14, tur: 'rework', ad: 'Rework' };
    const b = await o.tamam<{ altEmirId: number }>(o.c.planlama, 'POST', `/adimli-emirler/${emir}/bol`, { adimSira: 2, adet: 2, surum: ayr.emir.surum, birlesmeOpNo: 30, ekAdimlar: [ek, rw] });
    const p = await emirSekmesi();
    const p0 = await o.planOku();
    const ana = p.emirler.find((x) => x.uretimEmriId === emir);
    const kol = p.emirler.find((x) => x.uretimEmriId === b.altEmirId);
    assert.ok(ana && kol, JSON.stringify(p.emirler.map((x) => x.emirNo)));
    const birlesme = ana.adimlar.find((a) => a.opNo === p0.yerlesmemis.find((y) => y.isEmriId === a3)?.opNo);
    assert.equal(birlesme?.kok, 'bagli-parti', JSON.stringify(ana.adimlar));
    assert.equal(birlesme.bekledigiEmirNo, kol.emirNo);
    const kokAdimi = kol.adimlar.find((a) => a.opNo === birlesme.bekledigiOp);
    assert.ok(kokAdimi !== undefined && kokAdimi.kok !== 'oncul' && kokAdimi.kok !== 'bagli-parti', JSON.stringify(kol.adimlar));
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
