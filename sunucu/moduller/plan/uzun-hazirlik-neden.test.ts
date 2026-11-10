import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { coz } from './plan-cozucusu.ts';

// 2784, 2785 b: hazırlık tek parçadır; tezgâhın kesintisiz çalıştığı blokta (molalar içinde) ve her diliminde ayarcıyla biter, sığmazsa
// sığdığı ilk blokta başlar. İşleme vardiya sınırında bölünür; bekleme aralığında tezgâha başka işin hazırlığı girmez. Sığmayan iş
// yerleşmez ve nedeni iki süreyle yazılır.
// Senaryo 2482'nin tekrar üreten testindendir. Veriler uydurmadır.
const V = '3', N = '4';
const adim = (setup: number, proc: number) => ({
  id: '50-o10', opNo: 10, seq: 10, opId: '13', name: 'Tornalama', stationId: '10', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup, proc, chg: null, cycle: proc, dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: 0, resetup: false, alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
});
const kaynak = (setup: number, proc: number, makineVard: string[], kisiVard: string, qty: number, ikinciAyarci: string | null = null, ikinciEmir = false) => ({
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
      emirler: { orders: [{ id: '1', no: 'E-1', itemId: '50', qty, start: '2026-10-19', due: '2026-12-30', priority: 2, status: 'serbest' },
        ...(ikinciEmir ? [{ id: '2', no: 'E-2', itemId: '50', qty, start: '2026-10-19', due: '2026-12-30', priority: 2, status: 'serbest' }] : [])], opStatus: {}, opProg: {} },
      calisanAdimlar: [],
    },
    ek: { takvim: { hafta: { 1: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((g) => [g, makineVard])) }, kisiVardiyasi: { 7: kisiVard, ...(ikinciAyarci === null ? {} : { 8: ikinciAyarci }) } }, makineNotu: null, kisiGorevi: { 7: 'Ayarcı', ...(ikinciAyarci === null ? {} : { 8: 'Ayarcı' }) } },
  },
});
const istek = (simdi = '2026-10-19T05:00:00Z', anahtarlar = ['E-1|10']) =>
  ({ kip: 'sabit', simdi: new Date(simdi), sabitler: [], calisanlar: [], taslakId: 1, kuyruklar: [{ makineId: 100, anahtarlar }] }) as never;
describe('plan çözücüsü: uzun hazırlık tek parça, işlem bölünür (2784, 2785 b)', () => {
  const coz1 = async (s: number, p: number, mv: string[], kv: string, ikinci: string | null = null) => coz(kaynak(s, p, mv, kv, 1, ikinci) as never, istek());
  const neden = (r: Awaited<ReturnType<typeof coz>>) => Object.values(r.nedenler)[0];
  const TORNA = { tur: 'makine', id: 100, ad: 'Torna 1' };
  test('UH-01: 1800 dk hazırlık tezgâhın kesintisiz çalıştığı süreye sığmaz: yerleşmez, neden tezgâh vardiyası, iki süreyle', async () => {
    for (const [mv, blok] of [[[V, N], '960 dk, 16 sa'], [[V], '480 dk']] as const) {
      const r = await coz1(1800, 900, [...mv], V);
      assert.equal(r.yerlesimler.length, 0, JSON.stringify(r.yerlesimler));
      assert.deepEqual(neden(r), {
        kod: 'takvim-yok', hedef: TORNA,
        metin: `Torna 1 tezgâhında hazırlık (1.800 dk, 30 sa) tezgâhın kesintisiz çalıştığı süreden (${blok}) uzun; hazırlık bölünmez. Hazırlık süresini kontrol edin ya da tezgâhın vardiyasını uzatın.`,
      });
    }
  });
  test('UH-02 (Atölye N2): bloğa sığan hazırlık ayarcının kesintisiz süresine de sığmalı; V ve N vardiyasında ayrı ayarcı ard arda sayılır', async () => {
    const tek = await coz1(900, 60, [V, N], V);
    assert.equal(tek.yerlesimler.length, 0);
    assert.deepEqual(neden(tek), {
      kod: 'kisi-vardiyasiz', hedef: TORNA,
      metin: 'Torna 1 tezgâhında hazırlık (900 dk, 15 sa) ayarcının kesintisiz bulunduğu süreden (480 dk) uzun; hazırlık süresini kontrol edin ya da tezgâhın ayarcısız vardiyalarına ayarcı atayın.',
    });
    assert.equal((await coz1(900, 60, [V, N], V, N)).yerlesimler.length, 1);
  });
  test('UH-03: işlemi uzun, hazırlığı kısa adım yerleşir; işleme vardiya sınırında bölünür', async () => {
    for (const mv of [[V, N], [V]]) {
      const r = await coz1(60, 1800, mv, V);
      assert.equal(r.yerlesimler.length, 1, JSON.stringify(r.nedenler));
      const y = r.yerlesimler[0]!;
      assert.equal(y.baslangic, '2026-10-19T05:00:00.000Z');
      assert.ok(Date.parse(y.bitis) > Date.parse('2026-10-20T00:00:00Z'), y.bitis);
    }
  });
  test('UH-04: vardiyanın kalanına sığmayan hazırlık bölünmez, ertesi vardiyanın başında başlar', async () => {
    const r = await coz(kaynak(300, 60, [V], V, 1) as never, istek('2026-10-19T09:00:00Z'));
    assert.equal(r.yerlesimler[0]?.baslangic, '2026-10-20T05:00:00.000Z', JSON.stringify(r.yerlesimler));
    const sigan = await coz(kaynak(180, 60, [V], V, 1) as never, istek('2026-10-19T09:00:00Z'));
    assert.equal(sigan.yerlesimler[0]?.baslangic, '2026-10-19T09:00:00.000Z');
  });
  test('UH-05 (Atölye koşulu): bölünen işin bekleme aralığına aynı tezgâhta başka işin hazırlığı girmez', async () => {
    const r = await coz(kaynak(60, 900, [V], V, 1, null, true) as never, istek('2026-10-19T05:00:00Z', ['E-1|10', 'E-2|10']));
    const [a, b] = ['E-1|10', 'E-2|10'].map((k) => r.yerlesimler.find((y) => y.anahtar === k));
    assert.ok(a && b, JSON.stringify(r));
    assert.ok(Date.parse(a.bitis) > Date.parse('2026-10-19T13:00:00Z'), 'ilk iş vardiyayı aşar, bölünür');
    assert.ok(Date.parse(b.baslangic) >= Date.parse(a.bitis), `${b.baslangic} < ${a.bitis}`);
  });
});
