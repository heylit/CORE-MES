import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeSonucu } from '#paylasilan/sozlesme/planlama.ts';
import { degerlendirmeYap } from './degerlendirme.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// 3511: emir Üretim Emirleri'nde bölününce yeni parti ayrı kimlikle açılır, üst emrine parentId ile bağlıdır. Üst emrin adımına bildirilen
// bekleme (çalışmanın w.adimBekle'si, adım kimliğiyle) partinin aynı adımında da geçerlidir. Emirler kaynak okumasındaki biçimdedir
// (Reçete ve Rota emirleriCevir); veriler uydurmadır.

const tezgah = (id: string, grup: string): Record<string, unknown> => ({ id, ad: id, grup, ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 });
const adim = (seq: number, st: string, cycle: number, setup: number) => ({ id: `51-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId: st, setup, cycle, alts: [], altTimes: {}, ins: [] });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '51', code: 'MM-2', name: 'Ornek burc', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10') }, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', plan: tezgah('200', '20') }],
  routes: { 51: { base: null, steps: [adim(10, '20', 50, 45), adim(20, '10', 80, 30)] } },
  orders: [],
};
type Emir = { id: string; no: string; itemId: string; qty: number; start: string; due: string; priority: number; status: string; note: string; parentId: string | null; kol: null };
const emir = (id: string, qty: number, parentId: string | null = null, status = 'serbest'): Emir =>
  ({ id, no: `E-${id}`, itemId: '51', qty, start: '2026-10-19', due: '2026-10-30', priority: 2, status, note: '', parentId, kol: null });
const kaynak = (orders: Emir[], opStatus: Record<string, string> = {}) => ({
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }, { id: '20', code: 'FRZ', name: 'Freze', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }, { id: '200', code: 'F1', name: 'Freze 1', stationId: '20', status: 'aktif', aktif: true }],
    people: [], cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
    emirler: { orders, opStatus, opProg: {} },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
});
const calismaKur = (ek: Record<string, unknown> = {}): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null, ...ek,
});
interface Is { m: string; S: number; C: number; run: number }
interface Durum { adimBekle?: Record<string, { kadar: number }>; beklemeKilit?: string[]; locks?: Record<string, unknown> }
// Kaynak birleşmesi veri sürümünü artırır; kararlı olana dek yinelenir, sonra kural tabanlı plan kurulur.
function kur(orders: Emir[], ek: Record<string, unknown> = {}, opStatus: Record<string, string> = {}): { S: Record<string, unknown>; st: Durum; ops: Record<string, Is>; plan: Record<string, unknown> } {
  const k = kaynak(orders, opStatus);
  let S = calismaKur(ek);
  let g = planGirdisi({ calisma: S, kayit: KAYIT, kaynak: k, bugun: '2026-10-19' });
  for (let i = 0; i < 4 && g && g.S['dataVer'] !== S['dataVer']; i++) { S = g.S; g = planGirdisi({ calisma: S, kayit: KAYIT, kaynak: k, bugun: '2026-10-19' }); }
  assert.ok(g && g.S['dataVer'] === S['dataVer'], 'birleşme kararlı');
  const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  const yerlesmeyen = p.fail ?? [];
  assert.equal(yerlesmeyen.length, 0, `bütün adımlar yerleşti: ${yerlesmeyen.join(', ')}`);
  const ops = p.ops as unknown as Record<string, Is>;
  // Motorun nesneleri kendi bağlamındandır; karşılaştırma için düz kopyası alınır. Kayıtlı plan sayfanın kaydettiği biçimin en azıdır.
  const d = g.st as unknown as Durum;
  return { S: g.S, st: JSON.parse(JSON.stringify({ adimBekle: d.adimBekle, beklemeKilit: d.beklemeKilit, locks: d.locks })) as Durum, ops,
    plan: { ops, fail: [], J: Object.fromEntries(Object.entries(e.J).map(([id, x]) => [id, { C: x.C, T: x.T }])), dataVer: g.S['dataVer'] } };
}
const KADAR = 200;
const bekle = (idler: Record<string, number>, w: Record<string, unknown> = {}) =>
  ({ w: { famK: 0.3, mat: 'sert', dondurma: 4, adimBekle: Object.fromEntries(Object.entries(idler).map(([id, kadar]) => [id, { kadar, neden: 'malzeme' }])), ...w } });
// Üst emir 2 (6 adet), ondan bölünen parti 3 (3 adet).
const BOLUNMUS = [emir('2', 6), emir('3', 3, '2')];

describe('bölünen partinin adım beklemesi (3511)', () => {
  test('BP-01: üst emrin adımına bildirilen bekleme ondan bölünen partinin aynı adımında da geçerlidir; bağı olmayan emirde geçmez', () => {
    const yalin = kur(BOLUNMUS).ops;
    assert.ok(yalin['2.20']!.S < KADAR && yalin['3.20']!.S < KADAR, 'bekleme yokken iki adım da erken başlar');
    const b = kur(BOLUNMUS, bekle({ '2.20': KADAR }));
    assert.ok(b.ops['2.20']!.S >= KADAR, `üst emir bekler: ${String(b.ops['2.20']!.S)}`);
    assert.ok(b.ops['3.20']!.S >= KADAR, `parti de bekler: ${String(b.ops['3.20']!.S)}`);
    assert.deepEqual([b.ops['3.10']!.S, b.ops['3.10']!.C], [yalin['3.10']!.S, yalin['3.10']!.C], 'beklemesi olmayan adım yerinde');
    const bagsiz = kur([emir('2', 6), emir('3', 3)], bekle({ '2.20': KADAR })).ops;
    assert.ok(bagsiz['2.20']!.S >= KADAR && bagsiz['3.20']!.S < KADAR, 'üst emre bağlı olmayan emir beklemez');
  });

  test('BP-02: partinin kendi geçerli beklemesi üst emrinkinin yerine geçer', () => {
    const b = kur(BOLUNMUS, bekle({ '2.20': KADAR, '3.20': 120 }));
    assert.deepEqual(b.st.adimBekle, { '2.20': { kadar: KADAR }, '3.20': { kadar: 120 } });
    assert.ok(b.ops['3.20']!.S >= 120 && b.ops['3.20']!.S < KADAR, `parti kendi anını bekler: ${String(b.ops['3.20']!.S)}`);
  });

  test('BP-03: üst emrin adımı bittiyse, başladıysa ya da üst emir kapandıysa bekleme partiye geçmez', () => {
    const biten = kur(BOLUNMUS, bekle({ '2.20': KADAR }), { '2|root|1': 'tamam', '2|root|2': 'tamam' });
    assert.equal(biten.st.adimBekle?.['3.20'], undefined, 'üst emir bitti');
    assert.ok(biten.ops['3.20']!.S < KADAR);
    // Yalnız beklemeli adımı biten üst emir: ilk adımı sürüyor, emir açık.
    const tek = kur([emir('2', 6), emir('3', 3, '2')], bekle({ '2.10': KADAR }), { '2|root|1': 'tamam' });
    assert.equal(tek.st.adimBekle?.['3.10'], undefined, 'üst emrin o adımı bitti');
    assert.ok(tek.ops['3.10']!.S < KADAR);
    const iptal = kur([emir('2', 6, null, 'iptal'), emir('3', 3, '2')], bekle({ '2.20': KADAR }));
    assert.equal(iptal.st.adimBekle?.['3.20'], undefined, 'üst emir iptal');
    const baslamis = kur(BOLUNMUS, { ...bekle({ '2.20': KADAR }), gercek: { '2.20': { m: '100', S: 40 } } });
    assert.equal(baslamis.st.adimBekle?.['3.20'], undefined, 'üst emrin adımı başlamış: neden kalkmış');
  });

  test('BP-04: partiden bölünen parti de bekler; en yakın üst emrin kaydı geçer', () => {
    const zincir = [emir('2', 4), emir('3', 3, '2'), emir('4', 2, '3')];
    const b = kur(zincir, bekle({ '2.20': KADAR }));
    assert.deepEqual(b.st.adimBekle, { '2.20': { kadar: KADAR }, '3.20': { kadar: KADAR }, '4.20': { kadar: KADAR } });
    assert.ok(b.ops['4.20']!.S >= KADAR, String(b.ops['4.20']!.S));
    const yakin = kur(zincir, bekle({ '2.20': KADAR, '3.20': 120 }));
    assert.deepEqual(yakin.st.adimBekle?.['4.20'], { kadar: 120 }, 'ara partinin kaydı');
    // Kapanan ara parti zinciri koparmaz: üstündeki emrin kaydı geçer.
    const kapali = kur([emir('2', 4), emir('3', 3, '2', 'tamam'), emir('4', 2, '3')], bekle({ '2.20': KADAR }));
    assert.deepEqual(kapali.st.adimBekle?.['4.20'], { kadar: KADAR });
  });

  test('BP-05: partinin adımı başladıysa bekleme uygulanmaz; beklemeden önceye verilmiş kilit bu hesapta uygulanmaz ve bildirilir', () => {
    const baslamis = kur(BOLUNMUS, { ...bekle({ '2.20': KADAR }), gercek: { '3.20': { m: '100', S: 40 } } });
    assert.equal(baslamis.st.adimBekle?.['3.20'], undefined);
    assert.deepEqual(baslamis.st.adimBekle?.['2.20'], { kadar: KADAR });
    const kilitli = kur(BOLUNMUS, { ...bekle({ '2.20': KADAR }), locks: { '3.20': { m: '100', S: 60 } } });
    assert.deepEqual(kilitli.st.beklemeKilit, ['3.20']);
    assert.equal(kilitli.st.locks?.['3.20'], undefined);
    assert.ok(kilitli.ops['3.20']!.S >= KADAR, String(kilitli.ops['3.20']!.S));
    const sonraki = kur(BOLUNMUS, { ...bekle({ '2.20': KADAR }), locks: { '3.20': { m: '100', S: 248 } } });
    assert.equal(sonraki.st.beklemeKilit, undefined, 'beklemeden sonraki kilit durur');
    assert.equal(sonraki.ops['3.20']!.S, 248, 'kilit vardiya içindedir (08:00); vardiya dışı kilit ilk açık ana kayar, 3601');
  });

  test('BP-06: ek süre bildirildiği emirde kalır, partiye geçmez', () => {
    const yalin = kur(BOLUNMUS).ops;
    const ekli = kur(BOLUNMUS, { w: { famK: 0.3, mat: 'sert', dondurma: 4, adimEk: { '2.20': { ekSaat: 9, bitis0: null } } } }).ops;
    assert.ok(Math.abs(ekli['2.20']!.run - yalin['2.20']!.run - 9) < 1e-6, `üst emir 9 saat uzar: ${String(ekli['2.20']!.run - yalin['2.20']!.run)}`);
    assert.equal(ekli['3.20']!.run, yalin['3.20']!.run, 'partinin süresi aynı');
  });

  test('BP-07: değerlendirme hesabı da (değişikliği uygula) partiyi beklemeden sonra dizer', async () => {
    const k = kaynak(BOLUNMUS);
    const onceki = kur(BOLUNMUS);
    const calisma = { ...onceki.S, plan: onceki.plan, ...bekle({ '2.20': KADAR }, onceki.S['w'] as Record<string, unknown>) };
    const r = await degerlendirmeYap({ calisma, kayit: KAYIT, kaynak: k, bugun: '2026-10-19', istek: { tur: 'plan-uygula', isler: ['2', '3'] } }, Date.parse('2026-10-19T06:00:00Z'));
    assert.ok(r && !('hata' in r), JSON.stringify(r));
    const s = degerlendirmeSonucu.parse(r.sonuc); if (s.tur !== 'plan-uygula') return assert.fail(s.tur);
    const ops = s.plan['ops'] as Record<string, Is>;
    assert.ok(ops['2.20']!.S >= KADAR && ops['3.20']!.S >= KADAR, `${String(ops['2.20']?.S)}, ${String(ops['3.20']?.S)}`);
  });
});
