import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { motorKodu } from './plan-motoru.ts';

// 1379 a: B motorunun katkı payı (durum.betik agKatki) ve kâr hesabı (engine.betik evaluate) siparişin bütün adımlarını düşer; biten
// adım plana girmediği için maliyeti bitenAdimMaliyeti'nden gelir. Motor dosyaları sunucudaki gibi boş bağlamda yüklenir. Veriler uydurmadır.
type Nesne = Record<string, unknown>;
interface Bilesen { mc: number; sc: number; fc: number; miss: string[] }
const kod = `${motorKodu()}\n;({ agKatki, bitenAdimMaliyeti });`;
const baglam = vm.createContext({ GIRDI_SAAT_DILIMI: TESIS_SAAT_DILIMI });
baglam['self'] = baglam;
const motor = vm.runInContext(kod, baglam) as {
  agKatki: (s: Nesne, D: Nesne, S0: Nesne) => number | null;
  bitenAdimMaliyeti: (D: Nesne, bitti: Nesne | undefined, j: Nesne) => Bilesen;
};
// Bağlamın nesneleri başka genel nesnenin prototipindedir; karşılaştırma için düz nesneye çevrilir.
const biten = (D: Nesne, bitti: Nesne, j: Nesne): Bilesen => JSON.parse(JSON.stringify(motor.bitenAdimMaliyeti(D, bitti, j))) as Bilesen;

// Gelir 1000; malzeme 2 × 1,5 kg × 10 = 30; tornalama 2 adet × 60 dk × 100 TL/sa = 200 (ayar 6 dk × (100 + 50) = 15); kaplama 2 × 5 = 10.
const D = (ucret: number | null = 100): Nesne => ({
  ayarlar: { ayarciUcret: 50 },
  tezgahlar: [{ id: 'T1', ucret, verim: 1 }],
  urunler: [{ id: 'U1', rota: [{ k: '10', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 6 }] }, { k: '20', fason: 'F1' }] }],
  fasoncular: [{ id: 'F1', fiyat: 5 }],
  malzemeler: [{ kod: 'M1', birimFiyat: 10 }],
});
const S1: Nesne = { id: 'S1', urun: 'U1', adet: 2, gelir: 1000, malzeme: [{ kod: 'M1', miktar: 1.5 }] };
const TORNA = { id: 'S1.10', job: 'S1', m: 'T1', run: 2, su: 0.1 };
const KAPLAMA = { id: 'S1.20', job: 'S1', m: '@F1', fas: 1, run: 0, su: 0 };

describe('1379 a: B motoru katkı payı bütün adımlarla', () => {
  test('tam planda katkı 1000 − 30 − 200 − 15 − 10 = 745', () => {
    assert.equal(motor.agKatki(S1, D(), { plan: { ops: { 'S1.10': TORNA, 'S1.20': KAPLAMA } } }), 745);
  });

  test('tornalama bitince plandan düşer: eski hesap 960 (yalnız kalan), yeni hesap biten adımı rotadaki tezgâhla düşer, 745', () => {
    const plan = { ops: { 'S1.20': KAPLAMA } };
    assert.equal(motor.agKatki(S1, D(), { plan }), 960, 'bitti bilgisi yoksa yalnız kalan düşülür');
    assert.deepEqual(biten(D(), { 'S1.10': 1 }, S1), { mc: 200, sc: 15, fc: 0, miss: [] });
    assert.equal(motor.agKatki(S1, D(), { plan, bitti: { 'S1.10': 1 } }), 745);
  });

  test('biten fason adım fiyat × adet; biten adımın ücreti ya da fiyatı bilinmezse katkı bilinmez (null)', () => {
    assert.deepEqual(biten(D(), { 'S1.20': 1 }, S1), { mc: 0, sc: 0, fc: 10, miss: [] });
    assert.equal(motor.agKatki(S1, D(null), { plan: { ops: { 'S1.20': KAPLAMA } }, bitti: { 'S1.10': 1 } }), null);
    assert.deepEqual(biten({ ...D(), fasoncular: [] }, { 'S1.20': 1 }, S1).miss, ['fason fiyatı']);
  });
});
