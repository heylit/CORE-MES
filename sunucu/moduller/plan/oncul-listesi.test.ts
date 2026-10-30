import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { oner } from './kurallar.ts';
import type { MotorIsi, Yerlesim } from './kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1248 a: emir içi öncül listesi (çok dallı rota). Liste verilince "bir önceki sıra" varsayılmaz; dallar paralel yerleşir, birleştirme
// adımı dalların en geç bitenini bekler. Veriler uydurmadır.
const M1 = { tur: 'makine' as const, id: 1 };
const M2 = { tur: 'makine' as const, id: 2 };
const M3 = { tur: 'makine' as const, id: 3 };
const is = (p: Partial<MotorIsi>): MotorIsi => ({
  id: 1, uretimEmriId: 1, sira: 1, teslimDk: null, kaynak: M1, adaylar: [], sureDk: 60, bagimlilik: 'bekleyen', devirDk: null, ...p,
});
const yeri = (l: readonly Yerlesim[], id: number) => { const y = l.find((x) => x.isEmriId === id); assert.ok(y, `iş ${id} yerleşmeli`); return y; };

// Dal A: 1 -> 2 (M1), dal B: 3 (M2), birleştirme 4 (M3).
const dallar = (p: { a1?: Partial<MotorIsi>; b1?: Partial<MotorIsi>; m?: Partial<MotorIsi> } = {}): MotorIsi[] => [
  is({ id: 1, sira: 10, ...p.a1, onculler: [] }),
  is({ id: 2, sira: 20, onculler: [{ id: 1, tur: 'bekleyen' }] }),
  is({ id: 3, sira: 30, kaynak: M2, sureDk: 30, onculler: [], ...p.b1 }),
  is({ id: 4, sira: 50, kaynak: M3, sureDk: 10, onculler: [{ id: 2, tur: 'bekleyen' }, { id: 3, tur: 'bekleyen' }], ...p.m }),
];

describe('plan: emir içi öncül listesi (1248 a)', () => {
  test('dallar aynı anda yerleşir, birleştirme en geç biten dalın arkasına', () => {
    const o = oner(dallar(), [], 0);
    assert.equal(o.yerlesmeyen.length, 0);
    assert.equal(yeri(o.yerlesimler, 3).baslangic, 0);
    assert.equal(yeri(o.yerlesimler, 2).baslangic, 60);
    assert.equal(yeri(o.yerlesimler, 4).baslangic, 120);
    // Kısa dal uzarsa birleştirme onu bekler.
    const uzun = oner(dallar({ b1: { sureDk: 200 } }), [], 0);
    assert.equal(yeri(uzun.yerlesimler, 4).baslangic, 200);
  });

  test('liste yoksa bugünkü kural: adım emirdeki bir önceki sırayı bekler', () => {
    const l = dallar().map(({ onculler: _, ...x }) => x);
    const o = oner(l, [], 0);
    assert.equal(yeri(o.yerlesimler, 3).baslangic, 120);
    assert.equal(yeri(o.yerlesimler, 4).baslangic, 150);
  });

  test('akışlı öncül kendi devriyle başlatır, bekleyen öncül bitişiyle', () => {
    const o = oner(dallar({ m: { devirSonDk: 1, onculler: [{ id: 2, tur: 'akisli', devirDk: 20 }, { id: 3, tur: 'bekleyen' }] } }), [], 0);
    // Dal A 60'ta başlar, devir 20 dakikada: 80; bekleyen dal B 30'da biter. Akışlı öncülden önce bitemez: en erken 121.
    const m = yeri(o.yerlesimler, 4);
    assert.equal(m.baslangic, 80);
    assert.ok(m.bitis >= 121);
  });

  test('yerleşmeyen öncülün ardılı yerleşmez; öteki dal yerleşir', () => {
    const o = oner(dallar({ a1: { sureDk: null } }), [], 0);
    const neden = new Map(o.yerlesmeyen.map((x) => [x.isEmriId, x.neden]));
    assert.equal(neden.get(1), 'Süre bilinmiyor.');
    assert.equal(neden.get(2), 'Önceki iş emri yerleşmedi.');
    assert.equal(neden.get(4), 'Önceki iş emri yerleşmedi.');
    assert.equal(yeri(o.yerlesimler, 3).baslangic, 0);
  });

  test('sabit öncül yerinden beklenir, bitmiş (yeri olmayan) öncül beklenmez', () => {
    const l = dallar().filter((x) => x.id !== 1);
    const sabit = oner(l, [{ isEmriId: 1, uretimEmriId: 1, sira: 10, kaynak: M1, baslangic: 0, bitis: 90 }], 0);
    assert.equal(yeri(sabit.yerlesimler, 2).baslangic, 90);
    const bitmis = oner(l, [], 0);
    assert.equal(yeri(bitmis.yerlesimler, 2).baslangic, 0);
  });

  test('geri yön dalları ayrı sayar: emir en uzun dalın başlangıcında hazır', () => {
    const l = dallar().map((x) => ({ ...x, teslimDk: 1000 }));
    const o = oner(l, [], 0, { kural: 'oncelik', yon: 'geri', tamponDk: 0 });
    assert.equal(yeri(o.yerlesimler, 4).bitis, 1000);
    assert.equal(yeri(o.yerlesimler, 1).baslangic, 870);
  });
});

// Ortak motorun girdisi (girdi.betik): Reçete ve Rota adımının çözülmüş öncül listesi adımın bağı olur.
type Bag = [string, string][];
const rotaBaglari = (adimlar: readonly Record<string, unknown>[]): [string, Bag][] => {
  const steps = adimlar.map((a) => ({ id: `50-o${String(a['seq'])}`, opNo: a['seq'], opId: '13', stationId: '10', setup: 0, cycle: 1, alts: [], altTimes: {}, ins: [], ...a }));
  const r = planGirdisi({
    calisma: {
      D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] },
      rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
      param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: { ops: {} },
    },
    kayit: { version: 7, savedAt: 9, items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }], opdefs: [{ id: '13', name: 'Tornalama' }],
      machines: [], routes: { 50: { base: null, steps } }, orders: [], cal: { shifts: [], holidays: [] }, wcs: [] },
    kaynak: null,
  });
  const st = r?.st as { D: { urunler: { rota: { k: string; bag: Bag }[] }[] } } | undefined;
  return (st?.D.urunler[0]?.rota ?? []).map((x) => [x.k, x.bag]);
};

describe('plan girdisi: rota adımının öncül listesi (1248 a)', () => {
  test('liste varsa bağ ondandır; boş liste dal başıdır, birleştirme her dalı kendi türüyle bekler', () => {
    assert.deepEqual(rotaBaglari([
      { seq: 10, dep: 'bagimli', onculler: [] },
      { seq: 20, dep: 'bagimli', onculler: [{ seq: 10, tur: 'bekleyen' }] },
      { seq: 30, dep: 'bagimli', onculler: [] },
      { seq: 50, dep: 'ortulu', onculler: [{ seq: 20, tur: 'akisli' }, { seq: 30, tur: 'akisli' }] },
    ]), [['10', []], ['20', [['10', 'b']]], ['30', []], ['50', [['20', 'o'], ['30', 'o']]]]);
  });

  test('liste yoksa (null) bugünkü kural: adım bir önceki adımı bekler', () => {
    assert.deepEqual(rotaBaglari([
      { seq: 10, dep: 'bagimli', onculler: null },
      { seq: 20, dep: 'bagimli', onculler: null },
      { seq: 30, dep: 'ortulu', onculler: null },
    ]), [['10', []], ['20', [['10', 'b']]], ['30', [['20', 'o']]]]);
  });
});

// Rota dalından emre, emirden plana: dal başı öteki dalı beklemez, birleştirme adımı iki dalın da bitişinden sonra başlar.
describe('plan (gerçek PostgreSQL): çok dallı emir (1248 a)', () => {
  const { isEmirleriAc, yeniAdim, taslaktaOner, yer, durum } = planTestOrtami();
  const dk = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;

  test('dallar aynı anda yerleşir, birleştirme en geç biten dalın arkasına', async () => {
    const { makineA, makineB } = durum();
    const [a, b, m] = await isEmirleriAc([
      yeniAdim({ dal: 'A', kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 0, birimSureDk: 10 }),
      yeniAdim({ dal: 'B', kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: 0, birimSureDk: 2 }),
      yeniAdim({ birlesen: ['A', 'B'], kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: 0, birimSureDk: 1, bilesenler: [] }),
    ], 10);
    const p = await taslaktaOner();
    const ya = yer(p, a!), yb = yer(p, b!), ym = yer(p, m!);
    assert.ok(dk(yb.baslangic, ya.bitis) > 0, `B dalı A'yı beklememeli: A ${ya.baslangic}-${ya.bitis}, B ${yb.baslangic}`);
    assert.ok(dk(ya.bitis, ym.baslangic) >= 0 && dk(yb.bitis, ym.baslangic) >= 0, `A ${ya.bitis} B ${yb.bitis} birleştirme ${ym.baslangic}`);
  });
});
