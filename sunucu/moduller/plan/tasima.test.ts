import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tasimaHesabi } from './tasima.ts';

// 2790: taşıma hesabı motorun takvimiyle (vardiya 08:00-16:00, hafta içi; eksen pazartesi 00:00). Adım 2 adet x 60 dk = 2 sa. Veriler uydurmadır.
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const adim = (k: string, tezgah: string, bag: [string, string][] = []) => ({ k, ad: `OP ${k}`, tezgahlar: [{ id: tezgah, cevrim: 60, ayar: 0 }], transfer: 1, bag });
const calisma = (tur: 'b' | 'o', ops: Record<string, unknown>, ek: Record<string, unknown> = {}) => ({
  surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [],
  w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
  D: {
    meta: { ad: 'Ornek', baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
    calismaGunleri: Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []])), tatiller: [],
    tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }, { id: 'kisi-7', ad: 'Deneme Kisi', grup: 'kisi-7', vardiyalar: ['V1'], opOran: 0, verim: 1 }], personel: [], malzemeler: [],
    urunler: [{ id: 'U', rota: [adim('10', 'T1'), adim('20', 'T2', [['10', tur]]), adim('30', 'kisi-7', [['20', 'b']])] }, { id: 'Y', rota: [adim('10', 'T2')] }],
    siparisler: [{ id: 'S1', urun: 'U', adet: 2, termin: null }, { id: 'S2', urun: 'Y', adet: 2, termin: null }],
  },
  plan: { dataVer: 1, ops },
  ...ek,
});
const op = (job: string, m: string, S: number, ek: Record<string, unknown> = {}) => ({ job, m, S, C: S + 2, lot1: S + 1, act: 0, done: 0, fas: 0, ...ek });
const ozet = (r: ReturnType<typeof tasimaHesabi>) => Object.fromEntries(r.isler.map((i) => [i.isId, [i.tezgah, i.S, i.C, i.tur]]));

describe('taşıma hesabı motorun takvimiyle (2790)', () => {
  test('TH-01: bekleyen ardıl, gece boyunca uzayan öncülün bitişine itilir', () => {
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10) }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    // 15:00-16:00 ve salı 08:00-09:00 (33); ardıl salı 09:00-11:00.
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 33, 35, 'itilen'] });
  });

  test('TH-02: örtülü ardıl ilk partiyle başlar, açık ilk saate oturur ve öncülden önce bitmez', () => {
    const r = tasimaHesabi(calisma('o', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 9) }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 32, 34, 'itilen'] });
  });

  test('TH-03: başka emrin işi itilmez; ardıl onun arkasındaki boş yere oturur', () => {
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10), 'S2.10': op('S2', 'T2', 33) }), 8,
      { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 35, 37, 'itilen'] });
  });

  test('TH-04: donuk bölgedeki ardıl kımıldamaz; taşımanın tamamı yapılmaz', () => {
    const c = calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10) }, { w: { famK: 0.3, mat: 'uyari', dondurma: 4 } });
    const r = tasimaHesabi(c, 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.equal(r.gecerli, false);
    assert.match(r.ileti!, /OP 20 başlamış ya da donuk bölgede/);
  });

  test('TH-05: biten öncül beklenmez; tezgâh işe uygun değilse taşıma yapılmaz', () => {
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8, { done: 1 }), 'S1.20': op('S1', 'T2', 10) }), 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 8 });
    assert.deepEqual(ozet(r), { 'S1.20': ['T2', 8, 10, 'tasinan'] });
    assert.equal(tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8) }), 8, { isId: 'S1.10', tezgah: 'T2', baslangic: 15 }).gecerli, false);
  });

  test('TH-07 (Atölye K1): insanlı istasyondaki ardıl da kişinin el tezgâhında en yakın boş yere itilir', () => {
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10), 'S1.30': op('S1', 'kisi-7', 12), 'S2.10': op('S2', 'kisi-7', 35) }), 8,
      { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 33, 35, 'itilen'], 'S1.30': ['kisi-7', 37, 39, 'itilen'] });
  });

  test('TH-06: öne alınan ardılın öncülü geri çekilir; şimdiye çarparsa ardıl arkasına kayar, neden saatle yazılır', () => {
    const c = calisma('b', { 'S1.10': op('S1', 'T1', 12), 'S1.20': op('S1', 'T2', 14) });
    const r = tasimaHesabi(c, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 11 });
    assert.deepEqual(ozet(r), { 'S1.20': ['T2', 11, 13, 'tasinan'], 'S1.10': ['T1', 9, 11, 'cekilen'] });
    const s = tasimaHesabi(c, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 9 });
    assert.deepEqual(ozet(s), { 'S1.20': ['T2', 10, 12, 'tasinan'], 'S1.10': ['T1', 8, 10, 'cekilen'] });
    assert.equal(s.ileti, 'OP 10 en erken 05.01 Pzt 08:00 başlayabilir (şimdi); OP 20 05.01 Pzt 10:00 saatine kaydı.');
  });
});
