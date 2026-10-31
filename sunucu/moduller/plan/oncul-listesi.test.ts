import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi } from './plan-girdisi.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1248 a: emir içi öncül listesi (çok dallı rota). Liste verilince "bir önceki sıra" varsayılmaz. Veriler uydurmadır.
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
