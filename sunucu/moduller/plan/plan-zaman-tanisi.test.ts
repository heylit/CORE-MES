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
  test('ZT-01 (1681 b değişti): işleme ufka sığmıyorsa iş düşmez; ufkun sonuna kadar yerleşir, sığmayan saat ufuk dışıdır; canlıya yazılmaz', async () => {
    const k = kaynak(30, 60_000, [V], V, 1);
    assert.deepEqual(kokpitNedeni(k), {});
    const g = cozumGirdisi({ ...k, istek: ISTEK } as never)!;
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
    vm.runInContext(degerlendirmeKodu(), b); b['durum'] = g.st;
    const r = JSON.parse(vm.runInContext(`(() => { const st = stHazirla({ ...durum, w: { ...W0, ...(durum.w || {}) } }); const cx = compile(st);
      const p = schedule(st, 'dagit', null, { cx }); const id = Object.keys(p.ops)[0]; const M = cx.M[p.ops[id].m];
      return JSON.stringify({ ...p.ops[id], acik: workIn(M.rw, st.now, HDAYS * 24), ufukSonu: HDAYS * 24 }); })()`, b) as string) as { ufukDisi: number; run: number; su: number; C: number; acik: number; ufukSonu: number };
    assert.ok(r.C <= r.ufukSonu, JSON.stringify(r));
    // Ufuk dışı saat, işin süresinden ufukta yapılabilenin çıkarılmasıdır (hazırlık ufkun içindedir).
    assert.ok(Math.abs(r.ufukDisi - (r.su + r.run - r.acik)) < 0.01, JSON.stringify(r));
    // Risk K1: sunucu bu işi canlı kuyruğa yazmaz (bitişi ufuk sonudur); nedeni ufuk.
    const sunucu = await coz(k as never, { ...ISTEK, kip: 'sabit', simdi: new Date(ISTEK.simdi), taslakId: 1 } as never);
    assert.equal(sunucu.yerlesimler.length, 0);
    assert.equal(Object.values(sunucu.nedenler)[0]?.kod, 'ufuk');
  });
  test('ZT-01b: ufka taşan adımın ardılı "önceki adım ufuk dışında" nedeniyle yerleşmez', () => {
    const k = kaynak(30, 60_000, [V], V, 1);
    const adimlar = (k.kaynak.durum.routes as Record<string, { steps: Record<string, unknown>[] }>)['50']!.steps;
    adimlar.push({ ...adimlar[0]!, id: '50-o20', opNo: 20, seq: 20, setup: 10, proc: 10, cycle: 10 });
    const n = kokpitNedeni(k);
    const ardil = Object.entries(n).find(([id]) => id.endsWith('.20'));
    assert.ok(ardil, JSON.stringify(n));
    assert.equal(ardil[1].kod, 'oncul');
    assert.equal((ardil[1] as { ufukDisi?: number }).ufukDisi, 1);
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
  test('ZT-05 (Test T1): zamandan başka nedeni olan adımın nedeni korunur; nedeni yazılmamış adım zaman tanısı alır', () => {
    const k = kaynak(60, 600, [V], V, 1);
    const g = cozumGirdisi({ ...k, istek: ISTEK } as never)!;
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
    vm.runInContext(degerlendirmeKodu(), b); b['durum'] = g.st;
    const n = JSON.parse(vm.runInContext(`(() => { const st = stHazirla({ ...durum, w: { ...W0, ...(durum.w || {}) } }); const cx = compile(st);
      const p = schedule(st, 'dagit', null, { cx }); const id = Object.keys(p.ops)[0];
      const kayit = (neden) => failNedenKaydi({ ...p, fail: [id], failNeden: neden === undefined ? {} : { [id]: neden } }, st)[id];
      return JSON.stringify({ oncul: kayit({ kod: 'oncul', oncul: 'x' }), aday: kayit({ kod: 'aday' }), yok: kayit(undefined) }); })()`, b) as string) as Record<string, { kod: string; oncul?: string; tani?: { alt: string } }>;
    assert.deepEqual(n['oncul'], { kod: 'oncul', oncul: 'x' });
    assert.deepEqual(n['aday'], { kod: 'aday' });
    assert.equal(n['yok']?.kod, 'zaman');
    assert.ok(n['yok']?.tani?.alt, JSON.stringify(n));
  });
  // ZT-06 (Test T2, T3): ölçüden alt nedene iniş; ölçüler elle kurulur, her dal ve seçilen tezgâh sınanır.
  test('ZT-06: zamanTanisi her dalda doğru alt nedeni, tezgâhı ve saatleri yazar', () => {
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI }); b['self'] = b;
    vm.runInContext(degerlendirmeKodu(), b);
    const tani = (z: string) => JSON.parse(vm.runInContext(`JSON.stringify(zamanTanisi(${z}))`, b) as string) as Record<string, unknown>;
    const a = (m: string, ek: string) => `{ m: '${m}', ad: 'ORN-${m}', acikSaat: 600, sureSaat: 100, personelYok: false, blok: null, ayarci: null, bosSaat: 300, ${ek} }`;
    const z = (adaylar: string[], mal = 'null') => `{ ufukGun: 120, malzemeHazirSaat: ${mal}, adaylar: [${adaylar.join(',')}] }`;
    assert.deepEqual(tani(z([a('A', '')], 'Infinity')), { alt: 'malzeme', ufukGun: 120, mevcut: null });
    assert.deepEqual(tani(z([a('A', '')], '3000')), { alt: 'malzeme', ufukGun: 120, mevcut: 3000 });
    assert.equal(tani(z([a('A', 'acikSaat: 0')])).alt, 'vardiya');
    assert.deepEqual(tani(z([a('A', 'personelYok: true'), a('B', 'acikSaat: 0')])), { alt: 'kisi', m: 'A', ad: 'ORN-A', gerek: null, mevcut: null, ufukGun: 120 });
    // Süre: ikisi de sığmaz; en çok açık saati olan tezgâh yazılır.
    assert.deepEqual(tani(z([a('A', 'sureSaat: 900, acikSaat: 400'), a('B', 'sureSaat: 900, acikSaat: 640')])), { alt: 'sure', m: 'B', ad: 'ORN-B', gerek: 900, mevcut: 640, ufukGun: 120 });
    // Dolu: süre sığar; mevcut boş saattir (açık saat değil), en çok boş saati olan tezgâh yazılır.
    assert.deepEqual(tani(z([a('A', 'bosSaat: 20'), a('B', 'bosSaat: 50')])), { alt: 'dolu', m: 'B', ad: 'ORN-B', gerek: 100, mevcut: 50, ufukGun: 120 });
    assert.equal(tani(z([])).alt, 'bilinmiyor');
    assert.equal(tani('null').alt, 'bilinmiyor');
  });
});
