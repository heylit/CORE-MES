import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describe, test } from 'node:test';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { degerlendirmeKodu } from './degerlendirme.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { calismaPlani, planGirdisi } from './plan-girdisi.ts';
import { calismaElleBolmeleri, calismaIsleri } from './planlama-kurallar.ts';

// 3681 (Risk S1, N1, N2): kayıtlı plan sayımla güncellenirken (canlıya alma bu planı okur) bölünmüş başlamış adım derlemedeki gibi hesaplanır:
// çalışan payın bitişi payın kalan adedine oranlanır, canlıya pay adedi sayılan + kalan gider, kalanı 0'a inen başlamamış pay plana girmez.
// Motor ve çalışma planı yalnız hesap yapar (veritabanı yok); veriler uydurmadır. Süre: 30 dk/adet, tezgâh 08:00-16:00, ilk saat 08:00 (UTC+3).
const makine = (id: string) => ({ id, code: `T${id}`, name: `Tezgah ${id}`, stationId: '10', status: 'aktif', aktif: true });
const istasyon = (id: string) => ({ id, code: `S${id}`, name: `Istasyon ${id}`, wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true });
const adim = (seq: number, stationId: string) => ({
  id: `50-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId, setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [], split: 'tek', minLot: 0,
});
const BASLANGIC = '2026-10-19T05:00:00.000Z';
type Elle = Record<string, { adet: number; m: string }[]>;
interface Calisan { saglam: number; kalanDk: number; paylar?: { makineId: string; sayilan: number }[] }
const ham = (adet: number, elleBol: Elle | null, calisan: Calisan | null) => {
  const ROTA = {
    items: [{ id: '50', code: 'MM-1', name: 'Ornek govde', type: 'mamul', unit: 'ad', stock: 0 }],
    routes: { 50: { base: null, steps: [adim(10, '10'), adim(20, '30')] } },
    routeRevs: [{ id: '7', itemId: '50', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [] } }],
  };
  const kayit = {
    version: 7, savedAt: 9, items: ROTA.items, opdefs: [{ id: '13', name: 'Montaj' }], machines: [], routes: ROTA.routes,
    orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: adet, start: '2026-10-19', due: '2026-11-20', priority: 1, status: 'serbest' }],
  };
  const calisanAdimlar = calisan === null ? [] : [{
    anahtar: 'E-1|10', makineId: '100', baslangic: BASLANGIC, sayimAni: BASLANGIC, kalanVerimliDk: calisan.kalanDk, saglam: calisan.saglam, adet,
    ...(calisan.paylar ? { paylar: calisan.paylar } : {}),
  }];
  const kaynak = {
    durum: {
      ...ROTA,
      wcs: [{ id: '1', code: 'IM-1', name: 'Montaj', week: null, aktif: true }],
      stations: [istasyon('10'), istasyon('30')],
      machines: [makine('100'), makine('101'), makine('102'), { ...makine('300'), stationId: '30' }],
      people: [], calisanAdimlar,
      cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    },
    ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, insanliIstasyonlar: [], ekipUyeleri: {} },
  };
  const calisma = {
    surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    rrSavedAt: 5, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, ...(elleBol ? { elleBol } : {}), w: { famK: 0.3, mat: 'sert', dondurma: 4, rule: 'edd' },
    param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: ['personel'], olaylar: [], plan: null,
  };
  return { calisma: calismayaMotorAyari(calisma, { ...MOTOR_AYARI_VARSAYILAN }), kayit, kaynak, bugun: '2026-10-19' };
};
interface Kayit { ops: Record<string, { S: number; C: number; elenenPay?: number; pay?: { kalan?: number } }> }
// Plan kaydı: motorun o anki girdisiyle kurduğu kayıt (çalışmaya `plan` olarak yazılan).
const kayitliPlan = (adet: number, elleBol: Elle | null, calisan: Calisan | null): Kayit => {
  const g = planGirdisi(ham(adet, elleBol, calisan));
  assert.ok(g);
  const b = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI });
  b['self'] = b;
  vm.runInContext(degerlendirmeKodu(), b);
  b['durum'] = g.st;
  return JSON.parse(vm.runInContext(`(() => { const st = stHazirla({ ...durum, w: { ...W0, ...(durum.w || {}) } }); const cx = compile(st);
    return JSON.stringify(planKaydi(schedule(st, 'yeni', null, { cx }), st)); })()`, b) as string) as Kayit;
};
// Çalışmada kayıtlı plan varken sayım gelir: sunucunun okuduğu çalışma planı (canlıya almanın okuduğu).
const sayimdan = (adet: number, elleBol: Elle | null, plan: Kayit, calisan: Calisan) => {
  const h = ham(adet, elleBol, calisan);
  const c = calismaPlani({ ...h, calisma: { ...(h.calisma as object), plan } } as never, Date.parse('2026-10-19T05:00:00Z'));
  assert.ok(c?.ops);
  return c;
};

describe('plan: bölünmüş başlamış adım kayıtlı planda sayımla güncellenir (3681 Risk S1)', () => {
  test('S1: çalışan payın bitişi bütün adımın kalanıyla değil, payın kalan adediyle hesaplanır', () => {
    // 10 adet = 5 + 5; 1 sayılmış, adımın kalanı 9 adet x 30 dk = 4,5 saat. 1. payın kalanı 4 adet: 4/9 x 4,5 = 2 saat (bölünmemiş adım 4,5 saat).
    const elle: Elle = { 'O1.10': [{ adet: 5, m: '100' }, { adet: 5, m: '101' }] };
    const sayim: Calisan = { saglam: 1, kalanDk: 270 };
    const bolunmus = sayimdan(10, elle, kayitliPlan(10, elle, null), sayim).ops!.find((x) => x.id === 'O1.10')!;
    const tek = sayimdan(10, null, kayitliPlan(10, null, null), sayim).ops!.find((x) => x.id === 'O1.10')!;
    assert.ok(Math.abs(tek.S - bolunmus.S) < 1e-9);
    assert.ok(Math.abs((tek.C - tek.S) - 4.5) < 1e-6, `bölünmemiş ${String(tek.C - tek.S)}`);
    assert.ok(Math.abs((bolunmus.C - bolunmus.S) - 2) < 1e-6, `bölünmüş ${String(bolunmus.C - bolunmus.S)}`);
  });
});

describe('plan: canlıya giden pay adedi ve elenen pay (3681 Risk N1, N2)', () => {
  const adimAdetleri = new Map([['E-1|10', 30]]);
  const yaz = (elle: Elle, plan: Kayit, calisan: Calisan) => {
    const c = sayimdan(30, elle, plan, calisan);
    const r = calismaIsleri(c.ops!, c.kimlik, new Set(Object.values(c.kimlik)), calismaElleBolmeleri({ elleBol: elle }), adimAdetleri);
    return { ...r, yazilacak: r.yazilacak.filter((y) => y.anahtar === 'E-1|10') };
  };

  test('N1: fazla sayım payın kalanından düşülür, canlıya pay adedi sayılan + kalan gider (22 + 8, 19 + 11 değil)', () => {
    const elle: Elle = { 'O1.10': [{ adet: 19, m: '100' }, { adet: 11, m: '101' }] };
    const r = yaz(elle, kayitliPlan(30, elle, null), { saglam: 22, kalanDk: 240, paylar: [{ makineId: '100', sayilan: 22 }] });
    assert.deepEqual(r.yazilamaz, []);
    assert.deepEqual(r.yazilacak.map((y) => [y.parca?.no, y.parca?.adet, y.kaynak.id]), [[1, 22, 100], [2, 8, 101]]);
  });

  test('N1: fazla sayım yokken pay adetleri elle bölmedeki gibi kalır', () => {
    const elle: Elle = { 'O1.10': [{ adet: 19, m: '100' }, { adet: 11, m: '101' }] };
    const r = yaz(elle, kayitliPlan(30, elle, null), { saglam: 8, kalanDk: 660, paylar: [{ makineId: '100', sayilan: 8 }] });
    assert.deepEqual(r.yazilacak.map((y) => [y.parca?.no, y.parca?.adet]), [[1, 19], [2, 11]]);
  });

  test('N2: kalanı 0 a inen başlamamış pay planda yer tutmaz; adım tek pay olarak, uyarısız yazılır', () => {
    const elle: Elle = { 'O1.10': [{ adet: 15, m: '100' }, { adet: 15, m: '101' }] };
    const sayim: Calisan = { saglam: 30, kalanDk: 0, paylar: [{ makineId: '100', sayilan: 30 }] };
    const plan = kayitliPlan(30, elle, sayim);
    assert.deepEqual(Object.keys(plan.ops).filter((id) => id.startsWith('O1.10')), ['O1.10']);
    assert.equal(plan.ops['O1.10']!.elenenPay, 1);
    const r = yaz(elle, plan, sayim);
    assert.deepEqual(r.yazilamaz, []);
    assert.deepEqual(r.yazilacak.map((y) => [y.parca, y.kaynak.id]), [[undefined, 100]]);
    assert.deepEqual(r.uyarilar, []);
  });
});
