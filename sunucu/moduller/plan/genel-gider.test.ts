import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeSonucu, type DegerlendirmeIstegi } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeYap } from './degerlendirme.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 2173-1 a: genel gider tek oranı girilmemişse sipariş maliyetindeki genel gider bilinmez (null); 120 TL/sa varsayılmaz, toplam onu atlar.
// Gözlenen değer termin seçeneklerinin net kârıdır: oran girilmemiş plan, oranı 0 girilmiş planla aynı kârı verir. Veriler uydurmadır.

const tezgah = { id: '100', ad: '100', grup: '10', ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 };
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-23', priority: 2, status: 'serbest' }],
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null, siparisBedelleri: { O1: { gelir: 50000 } } },
};
// Kayıttan kurulan çalışmanın verisine sayfanın maliyet ayarı (planTL) yazılır; kayıt değişmediği için girdi onu yeniden kurmaz.
const calisma = (planTL: Record<string, unknown> | undefined): Record<string, unknown> => {
  const c0 = {
    surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
    param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
  };
  const g0 = planGirdisi({ calisma: c0, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
  assert.ok(g0);
  const S = structuredClone(g0.S) as { D: Record<string, unknown> };
  if (planTL) S.D['planTL'] = planTL;
  const g = planGirdisi({ calisma: S, kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19' });
  assert.ok(g);
  assert.deepEqual((g.S as { D: Record<string, unknown> }).D['planTL'], planTL);
  const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  return { ...S, plan: { ops: p.ops, fail: [], J: Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }])), dataVer: 1 } };
};
const AN = Date.parse('2026-10-19T06:00:00Z');
const netKar = async (planTL: Record<string, unknown> | undefined): Promise<number | null> => {
  const istek: DegerlendirmeIstegi = { tur: 'termin-secenekleri', siparisId: 'O1' };
  const r = await degerlendirmeYap({ calisma: calisma(planTL), kayit: KAYIT, kaynak: KAYNAK, bugun: '2026-10-19', istek }, AN);
  assert.ok(r && !('hata' in r), JSON.stringify(r));
  const s = degerlendirmeSonucu.parse(r.sonuc);
  if (s.tur !== 'termin-secenekleri') return assert.fail(s.tur);
  return s.satirlar.find((x) => x.secenek === 'en-erken')?.netKar ?? null;
};

describe('genel gider oranı girilmemişse (2173-1 a)', () => {
  test('GG-01: oran yoksa genel gider sıfır ya da 120 TL/sa sayılmaz; kâr oranı 0 girilmiş planla aynıdır, oran girilince düşer', async () => {
    const yok = await netKar(undefined);
    const sifir = await netKar({ genelGider: 0 });
    const yuz = await netKar({ genelGider: 100 });
    const yuzYirmi = await netKar({ genelGider: 120 });
    assert.equal(typeof yok, 'number');
    assert.equal(yok, sifir);
    assert.ok(yuz !== null && sifir !== null && yuz < sifir, `${String(yuz)} < ${String(sifir)}`);
    assert.ok(yuzYirmi !== null && yuzYirmi < (yuz ?? 0));
    assert.notEqual(yok, yuzYirmi);
  });
});
