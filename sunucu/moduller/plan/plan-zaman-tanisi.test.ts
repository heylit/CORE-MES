import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describe, test } from 'node:test';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { degerlendirmeKodu } from './degerlendirme.ts';
import { coz } from './plan-cozucusu.ts';
import { cozumGirdisi } from './plan-girdisi.ts';

// 3457: Kokpit'in plan kaydı yerleşmeyen adımın 'zaman' nedenini alt nedene indirir (motor/engine.js zamanTanisi, degerlendir.js
// failNedenKaydi). Alt neden sunucu iletisinin (2780 zamanNedeni) koduyla aynıdır; ikisi aynı ölçüyü (zamanOlcusu) okur.
// Senaryo uzun-hazirlik-neden.test.ts'ninkidir. Veriler uydurmadır.
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
const ISTEK = { simdi: '2026-10-19T05:00:00.000Z', kuyruklar: [{ makineId: 100, anahtarlar: ['E-1|10'] }], sabitler: [], calisanlar: [] };
const ALT_KODU: Record<string, string> = { sure: 'ufuk', dolu: 'ufuk', vardiya: 'takvim-yok', kisi: 'kisi-vardiyasiz', hazirlik: 'takvim-yok', ayarci: 'kisi-vardiyasiz', malzeme: 'malzeme' };

// Plan kaydının failNeden'i: motor kuraldan dizer ('dagit'), kayıt Kokpit'e giden biçimdedir.
function kokpitNedeni(k: ReturnType<typeof kaynak>): Record<string, { kod: string; tani?: Record<string, unknown> }> {
  const g = cozumGirdisi({ ...k, istek: ISTEK } as never);
  assert.ok(g !== null);
  const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
  vm.runInContext(degerlendirmeKodu(), b);
  b['durum'] = g.st;
  return JSON.parse(vm.runInContext(`(() => { const st = stHazirla({ ...durum, w: { ...W0, ...(durum.w || {}) } }); const cx = compile(st);
    const p = schedule(st, 'dagit', null, { cx }); return JSON.stringify(failNedenKaydi(p, st)); })()`, b) as string);
}
const sunucuNedeni = async (k: ReturnType<typeof kaynak>) => Object.values((await coz(k as never, { ...ISTEK, kip: 'sabit', simdi: new Date(ISTEK.simdi), taslakId: 1 } as never)).nedenler)[0];

describe('Kokpit yerleşmeme nedeni: zaman alt nedeni (3457)', () => {
  test('ZT-01: işin süresi ufuktaki açık süreden uzun: alt neden süre, gereken ve mevcut saatle; sunucu iletisiyle aynı kod', async () => {
    const k = kaynak(30, 60_000, [V], V, 1);
    const n = Object.values(kokpitNedeni(k))[0];
    assert.equal(n?.kod, 'zaman');
    assert.equal(n?.tani?.['alt'], 'sure');
    assert.equal(n?.tani?.['ad'], 'Torna 1');
    assert.equal(n?.tani?.['ufukGun'], 120);
    assert.ok((n?.tani?.['gerek'] as number) > (n?.tani?.['mevcut'] as number), JSON.stringify(n));
    assert.equal(n?.tani?.['gerek'], 1000.5);
    assert.equal((await sunucuNedeni(k))?.kod, ALT_KODU['sure']);
  });
  test('ZT-02: hazırlık tezgâhın kesintisiz bloğuna sığmaz: alt neden hazırlık, 30 sa ve 8 sa', async () => {
    const k = kaynak(1800, 900, [V], V, 1);
    const n = Object.values(kokpitNedeni(k))[0];
    assert.deepEqual({ alt: n?.tani?.['alt'], gerek: n?.tani?.['gerek'], mevcut: n?.tani?.['mevcut'] }, { alt: 'hazirlik', gerek: 30, mevcut: 8 });
    assert.equal((await sunucuNedeni(k))?.kod, ALT_KODU['hazirlik']);
  });
  test('ZT-03: hazırlık ayarcının kesintisiz bulunduğu süreden uzun: alt neden ayarcı', async () => {
    const k = kaynak(900, 60, [V, N], V, 1);
    const n = Object.values(kokpitNedeni(k))[0];
    assert.deepEqual({ alt: n?.tani?.['alt'], gerek: n?.tani?.['gerek'], mevcut: n?.tani?.['mevcut'] }, { alt: 'ayarci', gerek: 15, mevcut: 8 });
    assert.equal((await sunucuNedeni(k))?.kod, ALT_KODU['ayarci']);
  });
  test('ZT-04: yerleşen adımda neden yazılmaz', () => {
    assert.deepEqual(kokpitNedeni(kaynak(60, 600, [V], V, 1)), {});
  });
});
