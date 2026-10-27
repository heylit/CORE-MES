import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { coz } from './plan-cozucusu.ts';
import { motorKodu, motorYukle, type Motor, type MotorDurumu, type MotorPlani } from './plan-motoru.ts';

// 878 a: plan motoru uç durum testinin üç hatası (raporlar/plan-motoru-test.md). Veriler uydurmadır.
const GUNLER = ['pzt', 'sal', 'car', 'per', 'cum'];
const veri = (o: Record<string, unknown> = {}) => ({
  meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }],
  calismaGunleri: Object.fromEntries(GUNLER.map((g) => [g, ['V']])), tatiller: [],
  tezgahlar: [{ id: 'T1', grup: 'G', opOran: 0 }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'], ayar: true }],
  urunler: [{ id: 'U', rota: [{ k: 10, ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] }],
  siparisler: [{ id: 'S1', urun: 'U', adet: 4, termin: '2026-01-09' }],
  ...o,
});
const durum = (m: Motor, D: unknown, w: Record<string, unknown> = {}): MotorDurumu => ({
  D, now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...m.W0, tampon: false, ...w },
});
const sira = (p: MotorPlani) => Object.entries(p.ops).sort(([, a], [, b]) => a.S - b.S).map(([id]) => id.split('.')[0]).join('>');
type Deger = { lex: (number | null)[]; idle: number };

describe('plan motoru, EDD kuralında terminsiz iş (878 a)', () => {
  test('terminsiz iş en sona; geçmiş termin en öne', () => {
    const m = motorYukle();
    const D = veri({ siparisler: [{ id: 'G', urun: 'U', adet: 8, termin: '2025-12-20' }, { id: 'N', urun: 'U', adet: 8, termin: null }, { id: 'Y', urun: 'U', adet: 8, termin: '2026-01-06' }] });
    assert.equal(sira(m.schedule(durum(m, D, { rule: 'edd' }), 'dagit', null)), 'G>Y>N');
  });
});

describe('plan motoru, hızlı ve tam değerlendirmenin kıyası (878 a)', () => {
  // A ve B tek tezgâhta, B bir gün sonra serbest: aradaki bekleme boşta kalmadır. Hızlı değerlendirme boşta kalmayı hesaplamaz.
  const st = (m: Motor) => durum(m, veri({ siparisler: [{ id: 'A', urun: 'U', adet: 2, termin: '2026-02-20', serbest: '2026-01-05 08:00' }, { id: 'B', urun: 'U', adet: 2, termin: '2026-02-20', serbest: '2026-01-06 08:00' }] }));
  test('aynı plan iki kipte eşit sayılır; hızlı değerlendirmede boşta kalma boştur', () => {
    // Kıyas işlevi motorun dışına verilmez; aynı kod ayrı bağlamda yüklenip alınır.
    const b = vm.createContext({ GIRDI_SAAT_DILIMI: 'Europe/Istanbul' }); b['self'] = b;
    const m = vm.runInContext(motorKodu(), b) as Motor;
    const cmpEv = vm.runInContext('cmpEv', b) as (a: Deger, b: Deger) => number;
    const s = st(m); const p = m.schedule(s, 'dagit', null);
    const tam = m.evaluate(p, s, null, false) as Deger, hiz = m.evaluate(p, s, null, true) as Deger;
    assert.ok(tam.idle > 0.25, 'örnekte boşta kalma var');
    assert.equal(hiz.lex[5], null);
    assert.equal(tam.lex[5], tam.idle);
    assert.deepEqual([cmpEv(hiz, tam), cmpEv(tam, hiz)], [0, 0]);
    // Tam kipte boşta kalma ölçüt olarak kalır (831 a): boşluğu az olan plan iyidir (cmpEv(a, b) > 0: a iyi).
    assert.equal(cmpEv(tam, { ...tam, lex: tam.lex.map((x, i) => (i === 5 ? 0 : x)) }), -1);
  });
});

describe('plan motoru, makinesi planda olmayan çalışan adım (878 a)', () => {
  const tezgah = (id: string) => ({ id, ad: id, grup: '10', ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 });
  const KAYIT = {
    version: 7, savedAt: 9,
    items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
    opdefs: [{ id: '13', name: 'Tornalama' }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100') }],
    routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] } },
    orders: [
      { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-20', priority: 2, status: 'serbest' },
      { id: 'O2', no: 'E-2', itemId: '50', qty: 16, start: '2026-10-19', due: '2026-10-20', priority: 2, status: 'serbest' },
    ],
  };
  const makine = (id: string, aktif: boolean) => ({ id, code: `T${id}`, name: `Torna ${id}`, stationId: '10', status: 'aktif', aktif });
  const kaynak = (pasif: boolean) => ({
    durum: {
      wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
      stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 2, aktif: true }],
      machines: [makine('100', true), makine('101', !pasif)], people: [],
      cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    },
    ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
  });
  const calisma = {
    surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
    param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
  };
  const cozdur = (pasif: boolean, makineId: number) => coz({ calisma, kayit: KAYIT, kaynak: kaynak(pasif) }, {
    kip: 'sabit', simdi: new Date('2026-10-19T07:00:00Z'), taslakId: null, sabitler: [],
    calisanlar: [{ anahtar: 'E-1|10', makineId, baslangic: '2026-10-19T05:00:00Z', sayimAni: '2026-10-19T06:30:00Z', kalanDk: 120, kalanVerimliDk: 120 }],
    kuyruklar: [{ makineId: 100, anahtarlar: ['E-2|10'] }],
  });

  test('pasif ya da tanımsız makinedeki çalışan adım çözümü durdurmaz; kuyruk yazılır', async () => {
    for (const [pasif, makineId] of [[true, 101], [false, 999]] as const) {
      const r = await cozdur(pasif, makineId);
      assert.deepEqual(r.yerlesimler.map((y) => [y.anahtar, y.makineId]), [['E-2|10', 100]], `pasif=${String(pasif)} makine=${makineId}`);
      assert.deepEqual(r.yerlesmeyen, []);
    }
  });

  test('aktif makinedeki çalışan adım bugünkü gibi tezgâhı tutar', async () => {
    const r = await cozdur(false, 101);
    assert.deepEqual(r.yerlesimler.map((y) => [y.anahtar, y.makineId]), [['E-2|10', 100]]);
  });
});
