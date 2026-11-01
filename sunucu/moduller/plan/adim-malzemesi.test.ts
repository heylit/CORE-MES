import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle, type MotorDurumu } from './plan-motoru.ts';

// 1473 a: siparişin malzemesi rotanın bütün adımlarının hammaddesidir; her satır tükettiği adımı taşır, motor malzemeyi o adımın başlangıcında
// bekler, biten adımın malzemesini dağıtmaz. Veriler uydurmadır.

const adim = (seq: number, ins: { itemId: string; qty: number }[]) => (
  { id: `50-o${String(seq)}`, seq, opNo: seq, opId: '13', stationId: '10', setup: 0, cycle: 6, alts: [], altTimes: {}, ins });
const KAYIT = (adimlar: ReturnType<typeof adim>[]) => ({
  version: 7, savedAt: 9,
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' },
    { id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', stock: 10 },
    { id: 'H2', code: 'H2', name: 'Ornek civata', type: 'ham', unit: 'adet', stock: 10 },
    { id: 'Y1', code: 'Y1', name: 'Ornek yari', type: 'yari' },
  ],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: adimlar } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'uretimde' }],
  cal: { shifts: [{ id: '3', start: '08:00', end: '16:00' }], holidays: [] },
  wcs: [{ id: 'w-atolye', week: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }],
});
const D0 = { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] };
const calisma = (D: unknown) => ({
  D, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
type Satir = { kod: string; miktar: number; adim: string };
const malzemesi = (S: Record<string, unknown> | undefined): Satir[] =>
  ((S?.['D'] as { siparisler: { id: string; malzeme: Satir[] }[] }).siparisler.find((s) => s.id === 'O1')?.malzeme ?? []);

describe('plan girdisi: rotanın bütün adımlarının malzemesi (1473 a)', () => {
  test('her adımın hammaddesi tükettiği adımla gelir; yarı mamul malzeme sayılmaz', () => {
    const g = planGirdisi({ calisma: calisma(D0), kayit: KAYIT([adim(10, [{ itemId: 'H1', qty: 2 }, { itemId: 'Y1', qty: 1 }]), adim(20, [{ itemId: 'H2', qty: 3 }])]), kaynak: null, bugun: '2026-10-19' });
    assert.ok(g);
    assert.deepEqual(malzemesi(g.S), [{ kod: 'H1', miktar: 2, adim: '10' }, { kod: 'H2', miktar: 3, adim: '20' }]);
  });

  test('kayıtlı siparişte rota değişince malzeme listesi yenilenir', () => {
    const ilk = planGirdisi({ calisma: calisma(D0), kayit: KAYIT([adim(10, [{ itemId: 'H1', qty: 2 }])]), kaynak: null, bugun: '2026-10-19' });
    assert.ok(ilk);
    const D1 = ilk.S['D'];
    const ikinci = planGirdisi({ calisma: calisma(D1), kayit: KAYIT([adim(10, [{ itemId: 'H1', qty: 2 }]), adim(30, [{ itemId: 'H2', qty: 1 }])]), kaynak: null, bugun: '2026-10-19' });
    assert.ok(ikinci);
    assert.deepEqual(malzemesi(ikinci.S), [{ kod: 'H1', miktar: 2, adim: '10' }, { kod: 'H2', miktar: 1, adim: '30' }]);
  });
});

describe('plan motoru: malzeme tükettiği adımda beklenir (1473 a)', () => {
  const m = motorYukle();
  // Pazartesi 2026-01-05 başlangıç; H2 stokta yok, satın alma 2026-01-07 08:00'de gelir (saat 56)
  const st = (ek: Record<string, unknown> = {}, malzeme: Record<string, unknown>[] = [{ kod: 'H1', miktar: 1, adim: '10' }, { kod: 'H2', miktar: 1, adim: '20' }]): MotorDurumu => m.stHazirla({
    D: {
      meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }],
      calismaGunleri: { pzt: ['V'], sal: ['V'], car: ['V'], per: ['V'], cum: ['V'] },
      tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G2' }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G', 'G2'] }],
      malzemeler: [{ kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok: 10, tedarikGun: 0, muayeneGun: 0 }, { kod: 'H2', ad: 'Ornek civata', birim: 'adet', stok: 0, tedarikGun: 0, muayeneGun: 0 }],
      satinalma: [{ kod: 'H2', miktar: 10, gelis: '2026-01-07 08:00' }],
      urunler: [{ id: 'U', rota: [
        { k: '10', ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 15, ayar: 0 }] },
        { k: '20', ad: 'Montaj', tezgahlar: [{ id: 'T2', cevrim: 15, ayar: 0 }], bag: [['10', 'b']] },
      ] }],
      siparisler: [{ id: 'S1', urun: 'U', adet: 4, termin: '2026-01-16 17:00', malzeme }],
    },
    now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...m.W0, mat: 'sert' }, ...ek,
  });

  test('ilk adım stoktaki malzemeyle hemen başlar, ikinci adım kendi malzemesinin gelişini bekler', () => {
    const p = m.schedule(st(), 'yeni', null);
    assert.equal(p.ops['S1.10']?.S, 8);
    assert.ok((p.ops['S1.20']?.S ?? 0) >= 56, String(p.ops['S1.20']?.S));
  });

  test('adımsız (eski) satır eskisi gibi öncülsüz adımda beklenir', () => {
    const p = m.schedule(st({}, [{ kod: 'H2', miktar: 1 }]), 'yeni', null);
    assert.ok((p.ops['S1.10']?.S ?? 0) >= 56, String(p.ops['S1.10']?.S));
  });

  test('biten adımın malzemesi dağıtılmaz; kalan adımın malzemesi dağıtılır', () => {
    const s = st({ bitti: { 'S1.10': 1 } });
    const cx = m.compile(s) as { mat: { res: Record<string, { det: { kod: string }[] }> } };
    assert.deepEqual([...(cx.mat.res['S1']?.det ?? [])].map((d) => d.kod), ['H2']);
  });

  test('uyarı malzemeyi bekleyen adımdan verilir; uyarı kipinde ikinci adım erken başlarsa uyarılır', () => {
    const s = st({ w: { ...m.W0, mat: 'uyari' } });
    const p = m.schedule(s, 'yeni', null);
    const uyari = (m.evaluate(p, s, null, false) as { warn: { t: string; txt: string }[] }).warn.filter((w) => w.t === 'malzeme').map((w) => w.txt);
    assert.equal(uyari.length, 1, uyari.join(' | '));
    assert.match(uyari[0] ?? '', /^S1: malzeme .* geliyor/);
  });
});
