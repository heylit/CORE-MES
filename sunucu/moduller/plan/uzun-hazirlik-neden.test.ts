import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { coz } from './plan-cozucusu.ts';

// 2784 (2785 b öncesi davranış): hazırlık tek parçadır ve tezgâhın her hazırlık diliminde ayarcı ister. Tezgâh ayarcının olmadığı
// vardiyada da çalışıyorsa hazırlık ayarcının kesintisiz süresine sığmalıdır; sığmayan iş yerleşmez ve nedeni iki süreyle yazılır.
// Senaryo 2482'nin tekrar üreten testindendir. Veriler uydurmadır.
const V = '3', N = '4';
const adim = (setup: number, proc: number) => ({
  id: '50-o10', opNo: 10, seq: 10, opId: '13', name: 'Tornalama', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup, proc, chg: null, cycle: proc, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
});
const kaynak = (setup: number, proc: number, makineVard: string[], kisiVard: string, qty: number, ikinciAyarci: string | null = null) => ({
  calisma: {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }, { id: N, bas: '16:00', bit: '24:00' }], calismaGunleri: { pzt: makineVard, sal: makineVard, car: makineVard, per: makineVard, cum: makineVard },
      tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  },
  kayit: { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] },
  kaynak: {
    durum: {
      items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'ad', stock: 0 }],
      opdefs: [{ id: '13', code: 'TOR', name: 'Tornalama' }],
      routes: { 50: { base: null, steps: [adim(setup, proc)] } },
      routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
      wcs: [{ id: '1', code: 'IM', name: 'Merkez', aktif: true }],
      stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
      machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
      cal: { shifts: [{ id: V, name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }, { id: N, name: 'Aksam', start: '16:00', end: '24:00', breaks: [] }], holidays: [] },
      people: [{ id: '7', name: 'Deneme ayarci', code: 'A7', wcId: '1', stationId: '10', skills: ['10'], active: true },
        ...(ikinciAyarci === null ? [] : [{ id: '8', name: 'Deneme ayarci 2', code: 'A8', wcId: '1', stationId: '10', skills: ['10'], active: true }])],
      emirler: { orders: [{ id: '1', no: 'E-1', itemId: '50', qty, start: '2026-10-19', due: '2026-12-30', priority: 2, status: 'serbest' }], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: { takvim: { hafta: { 1: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((g) => [g, makineVard])) }, kisiVardiyasi: { 7: kisiVard, ...(ikinciAyarci === null ? {} : { 8: ikinciAyarci }) } }, makineNotu: null, kisiGorevi: { 7: 'Ayarcı', ...(ikinciAyarci === null ? {} : { 8: 'Ayarcı' }) } },
  },
});
const istek = { kip: 'sabit', simdi: new Date('2026-10-19T05:00:00Z'), sabitler: [], calisanlar: [], taslakId: 1, kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }] } as never;
describe('plan çözücüsü: uzun hazırlık ve ayarcı vardiyası (2784)', () => {
  const coz1 = async (s: number, p: number, mv: string[], kv: string, ikinci: string | null = null) => coz(kaynak(s, p, mv, kv, 1, ikinci) as never, istek);
  const NEDEN = 'Torna 1 tezgâhında hazırlık (1.800 dk, 30 sa) ayarcının kesintisiz bulunduğu süreden (480 dk) uzun; hazırlık süresini kontrol edin ya da tezgâhın ayarcısız vardiyalarına ayarcı atayın.';
  test('UH-01: tezgâh V+N, ayarcı yalnız V: 1800 dk hazırlık yerleşmez, neden kişi vardiyası, tezgâh hedefli', async () => {
    for (const kv of [V, N]) {
      const r = await coz1(1800, 900, [V, N], kv);
      assert.equal(r.yerlesimler.length, 0, JSON.stringify(r.yerlesimler));
      const n = Object.values(r.nedenler)[0];
      assert.equal(n?.kod, 'kisi-vardiyasiz', JSON.stringify(r.nedenler));
      assert.equal(n.metin, NEDEN);
      assert.deepEqual(n.hedef, { tur: 'makine', id: 100, ad: 'Torna 1' });
    }
  });
  test('UH-02: aynı süreler tezgâh yalnız V iken yerleşir; işlemi uzun hazırlığı kısa adım V+N tezgâhta yerleşir', async () => {
    assert.equal((await coz1(1800, 900, [V], V)).yerlesimler.length, 1);
    assert.equal((await coz1(60, 900, [V, N], V)).yerlesimler.length, 1);
    assert.equal((await coz1(400, 10, [V, N], V)).yerlesimler.length, 1);
  });
  test('UH-03 (Atölye N2): V ve N vardiyasında ayrı ayarcı ard arda kesintisiz sayılır; 900 dk hazırlık tek ayarcıyla yerleşmez, ikisiyle yerleşir', async () => {
    const tek = await coz1(900, 60, [V, N], V);
    assert.equal(tek.yerlesimler.length, 0);
    assert.match(Object.values(tek.nedenler)[0]?.metin ?? '', /hazırlık \(900 dk, 15 sa\) ayarcının kesintisiz bulunduğu süreden \(480 dk\) uzun/);
    assert.equal((await coz1(900, 60, [V, N], V, N)).yerlesimler.length, 1);
  });
});
