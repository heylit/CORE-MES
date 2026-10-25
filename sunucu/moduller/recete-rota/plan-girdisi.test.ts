import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';

// Sunucu planın girdisini çerçevenin koduyla (motor/girdi.betik) kurar; çerçeveyle eşitliği istemcideki planlama-girdisi.test.ts sınar.
// Burada sunucuya özgü olanlar: duvar saati tesisin saat dilimindedir, başlangıçsız çalışma tesisin bugününden başlar, girdi değişmez. Veriler uydurmadır.

const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 6, alts: [], altTimes: {}, ins: [] }] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'uretimde' }],
  cal: { shifts: [{ id: '3', start: '08:00', end: '16:00' }], holidays: [] },
  wcs: [{ id: 'w-atolye', week: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }],
};
const calisma = (D: Record<string, unknown>): Record<string, unknown> => ({
  D, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: { ops: { 'O1.10': { id: 'O1.10', job: 'O1', m: '100', S: 20, Su: 20.5, C: 30, lot1: 21 } } },
});
const D0 = { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] };
const KAYNAK = {
  durum: {
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    // 06:00 UTC, tesiste 09:00 (Europe/Istanbul, UTC+3): başlangıç gününden bir gün sonra 09:00 = 33. saat
    calisanAdimlar: [{ anahtar: 'E-1|10', makineId: '100', baslangic: '2026-10-20T06:00:00Z', sayimAni: null, kalanVerimliDk: 60, saglam: 2, adet: 10 }],
  },
  ek: null,
};

describe('plan girdisi (sunucu)', () => {
  test('kayıt çalışmadan yeniyse çeviri ondan, başlamış adımın saati tesisin duvar saatinden; motor bu st yi derler', () => {
    const r = planGirdisi({ calisma: calisma(D0), kayit: KAYIT, kaynak: KAYNAK });
    assert.ok(r);
    const st = r.st as { now: number; D: { siparisler: Array<{ id: string }> }; gercek: Record<string, { S: number; kalan: number; sunucu: number }> };
    assert.deepEqual(st.D.siparisler.map((s) => s.id), ['O1']);
    assert.deepEqual([st.gercek['O1.10']?.S, st.gercek['O1.10']?.kalan, st.gercek['O1.10']?.sunucu], [33, 1, 1]);
    assert.equal(st.now, 7);
    assert.doesNotThrow(() => motorYukle().compile(r.st));
  });

  test('başlangıçsız çalışma verilen günden, verilmezse tesisin bugününden başlar; girdi değişmez', () => {
    const bas = { ...D0, meta: undefined };
    const g = { calisma: calisma(bas), kayit: KAYIT, kaynak: null };
    const once = JSON.stringify(g);
    assert.equal((planGirdisi({ ...g, bugun: '2026-11-02' })?.S['D'] as { meta: { baslangic: string } }).meta.baslangic, '2026-11-02');
    // 2026-10-20 22:30 UTC tesiste 21 Ekim 01:30'dur
    assert.equal((planGirdisi(g, Date.UTC(2026, 9, 20, 22, 30))?.S['D'] as { meta: { baslangic: string } }).meta.baslangic, '2026-10-21');
    assert.equal(JSON.stringify(g), once);
  });

  // 524/5 a, kural 5: teslimi boş emir bugüne bitmiş sayılmaz (ekranda bugünün tarihi ve "gecikiyor" görünüyordu).
  test('sunucu emrinin teslimi yoksa termini de yoktur; başlangıcı yoksa bugünden başlar; teslimi olanın termini günün 17:00ıdır', () => {
    const emirler = { orders: [
      { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: null, due: null, priority: 2, status: 'uretimde' },
      { id: 'O2', no: 'E-2', itemId: '50', qty: 5, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' },
    ], opStatus: {}, opProg: {} };
    const r = planGirdisi({ calisma: calisma(D0), kayit: KAYIT, kaynak: { durum: { ...KAYNAK.durum, emirler }, ek: null }, bugun: '2026-10-21' });
    const sip = (r?.st as { D: { siparisler: Array<{ id: string; termin: string | null; serbest: string | null }> } }).D.siparisler;
    assert.equal(sip.find((x) => x.id === 'O1')?.termin, null);
    assert.equal(sip.find((x) => x.id === 'O2')?.termin, '2026-10-30 17:00');
  });

  test('çalışma yoksa null', () => {
    assert.equal(planGirdisi({ calisma: null, kayit: KAYIT, kaynak: null }), null);
  });
});
