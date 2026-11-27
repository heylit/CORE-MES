import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isTasi } from './atolye-komutlari-kurallar.ts';
import { tasimaHesabi } from './tasima.ts';

const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const adim = (k: string, tezgahlar: string[], ek: Record<string, unknown> = {}) => ({ k, ad: `OP ${k}`, tezgahlar: tezgahlar.map((id) => ({ id, cevrim: 60, ayar: 0 })), transfer: 1, bag: [], ...ek });
const calisma = (ops: Record<string, unknown>, ek: Record<string, unknown> = {}, rota = [adim('10', ['T1', 'T2', 'T3'])]) => ({
  surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [],
  w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
  D: {
    meta: { ad: 'Ornek', baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
    calismaGunleri: Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []])), tatiller: [],
    tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }, { id: 'T3', grup: 'G' }], personel: [], malzemeler: [],
    urunler: [{ id: 'U', rota }],
    siparisler: [{ id: 'S1', urun: 'U', adet: 4, termin: null }],
  },
  plan: { dataVer: 1, ops },
  ...ek,
});
const pay = (no: number, n: number, adet: number, ek: Record<string, unknown> = {}) => ({ pay: { no, n, asil: 'S1.10', adet, ...ek } });
const op = (m: string, S: number, ek: Record<string, unknown> = {}) => ({ job: 'S1', m, S, C: S + 2, lot1: S + 1, act: 0, done: 0, fas: 0, ...ek });
const ozet = (r: ReturnType<typeof tasimaHesabi>) => Object.fromEntries(r.isler.map((i) => [i.isId, [i.tezgah, i.S, i.C, i.tur]]));

const KISI = { kim: 'Deneme Planlamaci', sayfa: 'Planlama atölyesi', t: Date.parse('2026-01-05T08:00:00') };
const yazilan = (r: ReturnType<typeof isTasi>) => { assert.ok('deger' in r, JSON.stringify(r)); return r.deger as Record<string, unknown> & { locks: Record<string, unknown>; elleBol?: Record<string, unknown> }; };

describe('bölünmüş adımın payını taşıma (3791)', () => {
  const bol = { 'S1.10': [{ adet: 2, m: 'T1' }, { adet: 2, m: 'T2' }] };
  const elleOps = { 'S1.10': { ...op('T1', 8), ...pay(1, 2, 2, { elle: 1 }) }, 'S1.10~2': { ...op('T2', 8), ...pay(2, 2, 2, { elle: 1 }) } };

  test('elle bölünmüş adımın payı aynı tezgâhta başka saate taşınır: yalnız o payın kilidi yazılır, bölme kaydı değişmez', () => {
    const c = calisma(elleOps, { elleBol: bol });
    for (const [id, m] of [['S1.10~2', 'T2'], ['S1.10', 'T1']] as const) {
      const r = tasimaHesabi(c, 8, { isId: id, tezgah: m, baslangic: 12 });
      assert.deepEqual(ozet(r), { [id]: [m, 12, 14, 'tasinan'] });
      const d = yazilan(isTasi(c, { isId: id, tezgah: m, baslangic: 12 }, KISI, tasimaHesabi));
      assert.deepEqual(d.locks, { [id]: { m, S: 12 } });
      assert.deepEqual(d.elleBol, bol);
    }
  });

  test('elle bölünmüş payı başka tezgâha taşımak bölme kaydındaki o payın tezgâhını değiştirir; diğer pay ve kilidi yerinde kalır', () => {
    const c = calisma(elleOps, { elleBol: bol, locks: { 'S1.10': { m: 'T1', S: 20 } } });
    const r = tasimaHesabi(c, 8, { isId: 'S1.10~2', tezgah: 'T3', baslangic: 12 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    assert.deepEqual(ozet(r), { 'S1.10~2': ['T3', 12, 14, 'tasinan'] });
    const d = yazilan(isTasi(c, { isId: 'S1.10~2', tezgah: 'T3', baslangic: 12 }, KISI, tasimaHesabi));
    assert.deepEqual(d.elleBol, { 'S1.10': [{ adet: 2, m: 'T1' }, { adet: 2, m: 'T3' }] });
    assert.deepEqual(d.locks, { 'S1.10': { m: 'T1', S: 20 }, 'S1.10~2': { m: 'T3', S: 12 } });
  });

  test('rotada paralel böl payı taşınınca bölme elle bölmeye döner (kayıt yoksa kilit adımı tek parçaya indirirdi)', () => {
    const ops = { 'S1.10': { ...op('T1', 8), ...pay(1, 2, 2) }, 'S1.10~2': { ...op('T2', 8), ...pay(2, 2, 2) } };
    const d = yazilan(isTasi(calisma(ops), { isId: 'S1.10', tezgah: 'T1', baslangic: 12 }, KISI, tasimaHesabi));
    assert.deepEqual(d.elleBol, bol);
    assert.deepEqual(d.locks, { 'S1.10': { m: 'T1', S: 12 } });
  });

  test('rotada olmayan tezgâh reddedilir; başlamış payın tezgâhı değişmez, saati kayabilir', () => {
    const r = tasimaHesabi(calisma(elleOps, { elleBol: bol }), 8, { isId: 'S1.10~2', tezgah: 'T9', baslangic: 12 });
    assert.equal(r.gecerli, false);
    const suren = { ...elleOps, 'S1.10': { ...elleOps['S1.10'], act: 1 } };
    const t = tasimaHesabi(calisma(suren, { elleBol: bol }), 8, { isId: 'S1.10', tezgah: 'T2', baslangic: 12 });
    assert.equal(t.gecerli, false);
    assert.match(t.ileti ?? '', /tezgâhı bölmede kalır/);
  });

  test('bölünmemiş işin taşınması bölme kaydı yazmaz', () => {
    const r = tasimaHesabi(calisma({ 'S1.10': op('T1', 8) }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 12 });
    assert.equal(r.gecerli, true);
    assert.equal('bolme' in r, false);
  });
});
