import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { VeriSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { ReceteRotaDurumCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { veriSagligi, type VeriSagligiGirdisi } from './veri-sagligi-kurallar.ts';

// 782: veri sağlığı raporu. Kural saf; uç gerçek PostgreSQL'de. Veriler uydurmadır.

type Adim = NonNullable<ReceteRotaDurumCevabi['routes']>[string]['steps'][number];
const adim = (p: Partial<Adim>): Adim => ({
  id: 'o10', seq: 10, opNo: 10, opId: '1', name: 'Tornalama', stationId: '1', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 30, proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: true,
  alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [], ...p,
});
const kart = (id: string, tur: 'ham' | 'mamul', stock: number | null) => ({
  id, kayitNo: Number(id), code: `K-${id}`, name: `Kart ${id}`, type: tur, unit: 'ad', cost: null, stock, min: null, aktif: true,
  kategori: null, kategoriAdi: null, girdiOlabilir: true,
});
const istasyon = (id: string, wcId: string) => ({ id, code: `I-${id}`, name: `İstasyon ${id}`, wcId, eff: 100, opPer: 1, count: 1, cost: null, aktif: true });
const emir = (no: string, due: string | null, status: 'serbest' | 'uretimde' | 'tamam') => ({
  id: no, kayitNo: 1, no, itemId: '3', qty: 5, start: null, due, priority: 3, note: null, rev: null, status, created: 0, doneAt: null, tur: 'seri',
  parentId: null, kol: null, birlestigiId: null, surum: 1,
});
const maliyet = (paraBirimi: string) => ({ birimMaliyet: '100', paraBirimi, surum: 1 });

function durum(p: Partial<ReceteRotaDurumCevabi> = {}): ReceteRotaDurumCevabi {
  return {
    items: [kart('1', 'ham', null), kart('2', 'ham', 40), kart('3', 'mamul', null), kart('4', 'ham', null)],
    units: null, opdefs: null, wcs: null,
    stations: [istasyon('1', '10'), istasyon('2', '20')],
    machines: [
      { id: '5', code: 'M-5', name: 'Makine 5', stationId: '1', status: 'aktif', aktif: true },
      { id: '6', code: 'M-6', name: 'Makine 6', stationId: '2', status: 'ariza', aktif: true },
      { id: '7', code: 'M-7', name: 'Makine 7', stationId: '2', status: 'bakim', aktif: false },
    ],
    people: null,
    routes: {
      3: { base: null, steps: [
        adim({ ins: [{ itemId: '1', qty: 1, scrap: 0 }, { itemId: '2', qty: 1, scrap: 0 }] }),
        adim({ id: 'o20', seq: 20, opNo: 20, name: 'Frezeleme', setup: null, cycle: null, altTimes: { 2: { setup: 5, cycle: null } } }),
        adim({ id: 'o30', seq: 30, opNo: 30, name: 'Kaplama', fasonId: '9', stationId: null, setup: null, cycle: null }),
      ] },
    },
    routeRevs: null, cal: { shifts: [], holidays: [] },
    emirler: { orders: [emir('UE-1', null, 'serbest'), emir('UE-2', '2026-11-01', 'uretimde'), emir('UE-3', null, 'tamam')], opStatus: {}, opProg: {} },
    maliyet: { yazabilir: false, malzeme: { 2: maliyet('EUR') }, istasyon: { 1: maliyet('TRY') }, kisi: {} },
    moves: null, malzemeKesildi: false,
    ...p,
  };
}
const girdi = (p: Partial<VeriSagligiGirdisi> = {}): VeriSagligiGirdisi => ({
  durum: durum(), planAyarliIstasyonlar: new Set(['1']), vardiyaliMerkezler: new Set(['10']),
  tezgahlar: [{ id: '5', ad: 'Makine 5', ucret: 900, ucretIst: 750 }, { id: '6', ad: 'Makine 6', ucret: 500, ucretIst: 500 },
    { id: '8', ad: 'Eski', ucret: 300, ucretIst: undefined }],
  ...p,
});
const bul = (c: VeriSagligiCevabi, anahtar: VeriSagligiCevabi['kategoriler'][number]['anahtar']) => {
  const k = c.kategoriler.find((x) => x.anahtar === anahtar);
  if (!k) throw new Error(`Kategori yok: ${anahtar}`);
  return k;
};

describe('plan: veri sağlığı kuralı', () => {
  test('boş alanlar sayılır, dolu olanlar sayılmaz; toplamlar paydadır', () => {
    const c = veriSagligi(girdi());
    assert.deepEqual([bul(c, 'stok-bos').sayi, bul(c, 'stok-bos').toplam], [1, 2], 'rotada geçmeyen ham kart sayılmaz');
    assert.deepEqual(bul(c, 'stok-bos').ornekler, [{ kod: 'K-1', ad: 'Kart 1' }]);
    assert.deepEqual([bul(c, 'sure-bos').sayi, bul(c, 'sure-bos').toplam], [1, 2], 'fason adım süre istemez');
    assert.match(bul(c, 'sure-bos').ornekler[0]!.ad, /işlem süresi, hazırlık süresi, alternatif istasyon süresi \(1\) boş/);
    assert.equal(bul(c, 'sure-bos').ornekler[0]!.kod, 'K-3 OP 20');
    assert.deepEqual(bul(c, 'istasyon-plan-ayari-yok').ornekler.map((x) => x.kod), ['I-2']);
    assert.deepEqual(bul(c, 'vardiyasiz-istasyon').ornekler.map((x) => x.kod), ['I-2']);
    assert.deepEqual(bul(c, 'istasyon-maliyet-yok').ornekler.map((x) => x.kod), ['I-2']);
    assert.deepEqual(bul(c, 'maliyet-doviz').ornekler, [{ kod: 'malzeme K-2', ad: 'Kart 2 (EUR)' }]);
    assert.deepEqual([bul(c, 'terminsiz-emir').sayi, bul(c, 'terminsiz-emir').toplam], [1, 2], 'biten emir plana girmez');
    assert.deepEqual(bul(c, 'arizali-makine').ornekler, [{ kod: 'M-6', ad: 'Makine 6 (arıza)' }], 'pasif makine sayılmaz');
    assert.deepEqual(bul(c, 'elle-tezgah-ucreti').ornekler, [{ kod: '5', ad: 'Makine 5' }], 'izleme işareti olmayan eski tezgâh bilinemez, sayılmaz');
    assert.deepEqual([c.calismaVar, c.malzemeKesildi], [true, false]);
  });

  test('okunamayan dilim 0 değil boş sayıdır', () => {
    const c = veriSagligi(girdi({ durum: durum({ items: null, routes: null, stations: null, machines: null, maliyet: null, emirler: null }), tezgahlar: null }));
    for (const k of c.kategoriler) assert.deepEqual([k.anahtar, k.sayi, k.ornekler], [k.anahtar, null, []]);
    assert.equal(c.calismaVar, false);
  });

  test('malzeme listesi kesildiyse işaret geçer; örnekler en çok 20', () => {
    const items = Array.from({ length: 30 }, (_, i) => kart(String(100 + i), 'ham', null));
    const ins = items.map((x) => ({ itemId: x.id, qty: 1, scrap: 0 }));
    const c = veriSagligi(girdi({ durum: durum({ items, routes: { 3: { base: null, steps: [adim({ ins })] } }, malzemeKesildi: true }) }));
    assert.equal(c.malzemeKesildi, true);
    assert.deepEqual([bul(c, 'stok-bos').sayi, bul(c, 'stok-bos').ornekler.length], [30, 20]);
  });
});

describe('plan (gerçek PostgreSQL): veri sağlığı ucu', () => {
  const { c, istek, tamam, mamulAc, hammaddeAc, yeniAdim, yururlugeAlinmisRota } = planTestOrtami();
  const yol = '/plan/veri-sagligi';

  test('782: rapor yalnız okur; stoku olmayan hammadde ve plan ayarı olmayan istasyon görünür; yetkisiz 403, oturumsuz 401', async () => {
    // Ortak hammaddenin stoku bilinir (plan-ortak); bu adım stok kaydı olmayan yeni hammaddeyi tüketir.
    await yururlugeAlinmisRota(await mamulAc(), [yeniAdim({ bilesenler: [{ malzemeId: await hammaddeAc(), miktar: 1, fireYuzde: 0 }] })]);
    const r = await tamam<VeriSagligiCevabi>(c.planlama, 'GET', yol);
    assert.ok((bul(r, 'stok-bos').sayi ?? 0) >= 1, 'örnek adımın hammaddesinin stoku yok');
    assert.equal(bul(r, 'sure-bos').sayi, 0, 'onaylı rotada süre zorunlu');
    assert.ok((bul(r, 'istasyon-plan-ayari-yok').sayi ?? 0) >= 1);
    assert.equal(bul(r, 'elle-tezgah-ucreti').sayi === null, !r.calismaVar, 'çalışma yoksa elle ücret sayılamaz');
    assert.deepEqual(await tamam<VeriSagligiCevabi>(c.planlama, 'GET', yol), r, 'okuma yazmaz, ikinci okuma aynı');
    assert.equal((await istek(c.operator, 'GET', yol)).statusCode, 403);
    assert.equal((await istek('', 'GET', yol)).statusCode, 401);
  });
});
