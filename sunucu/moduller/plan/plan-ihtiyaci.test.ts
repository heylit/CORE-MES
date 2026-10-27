import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { canliPlanIhtiyaclari } from './plan-ihtiyaci.ts';
import { planIhtiyaclari, type IhtiyacGirdisi } from './plan-ihtiyaci-kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// Kart 898 a (Dal 2): canlı planın malzeme eksiği satın almanın plan ön talebine gider. Veriler uydurmadır.

const GUN = 86_400_000;
const T0 = Date.UTC(2026, 10, 2, 9);

describe('plan: malzeme ihtiyacı kuralı', () => {
  const temel: IhtiyacGirdisi = {
    emirler: [{ id: 1, no: 'E-1' }, { id: 2, no: 'E-2' }, { id: 3, no: 'E-3' }],
    ihtiyaclar: new Map([
      [1, [{ malzemeNo: 10, opNo: 10, brut: '6' }, { malzemeNo: 20, opNo: 10, brut: '1' }, { malzemeNo: 10, opNo: 20, brut: '2' }]],
      [2, [{ malzemeNo: 10, opNo: 10, brut: '5' }]],
      [3, null],
    ]),
    sarflar: [],
    baslangiclar: new Map([['1:10', T0 + 2 * GUN], ['1:20', T0 + 3 * GUN], ['2:10', T0]]),
    kartlar: new Map([[10, { tur: 'hammadde' }], [20, { tur: 'yarimamul' }]]),
    serbest: new Map([[10, '4']]),
  };

  test('stok en erken tüketime düşer; eksik toplanır, gereken gün ilk karşılanamayan tüketimdir', () => {
    // E-2 (T0) 5 ister, stok 4: 1 eksik T0'da; E-1 (T0+2) 8 ister, hepsi eksik. Yarı mamul satın almaya gitmez.
    assert.deepEqual(planIhtiyaclari(temel), [
      { malzemeNo: 10, miktar: 9, gerekenTarih: '2026-11-02', emirler: ['E-2', 'E-1'], stokBilinmiyor: false },
    ]);
  });

  test('stok yeterse ihtiyaç yok; verilmiş sarf düşülür; stok kaydı olmayan sıfır sayılır ve işaretlenir', () => {
    assert.deepEqual(planIhtiyaclari({ ...temel, serbest: new Map([[10, '13']]) }), []);
    const sarfli = planIhtiyaclari({ ...temel, sarflar: [{ emirId: 2, malzemeId: 10, miktar: '5' }] });
    assert.deepEqual(sarfli.map((x) => [x.miktar, x.gerekenTarih, x.emirler]), [[4, '2026-11-04', ['E-1']]]);
    assert.deepEqual(planIhtiyaclari({ ...temel, serbest: new Map() }).map((x) => [x.miktar, x.stokBilinmiyor]), [[13, true]]);
  });

  test('canlıda yeri olmayan adımın malzemesi ve ürünsüz emir ihtiyaç vermez', () => {
    const l = planIhtiyaclari({ ...temel, baslangiclar: new Map([['1:20', T0]]), serbest: new Map() });
    assert.deepEqual(l.map((x) => [x.malzemeNo, x.miktar, x.emirler]), [[10, 8, ['E-1']]]);
    assert.deepEqual(planIhtiyaclari({ ...temel, baslangiclar: new Map() }), []);
  });
});

describe('plan (gerçek PostgreSQL): canlı planın malzeme ihtiyacı', () => {
  const { c, vt, istek, tamam, kartAc, yeniAdim, isEmirleriAc, taslaktaOner } = planTestOrtami();
  const canliyaAl = async (p: PlanCevabi) => {
    const surum = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!.surum;
    const r = await istek(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum, cakismalariKabul: true });
    assert.equal(r.statusCode, 200, r.body);
  };

  test('canlıya alınan emrin hammaddesi stok kaydı yoksa tamamı ihtiyaçtır; canlıda olmayan emir sayılmaz', async () => {
    const ham = await kartAc('hammadde');
    const [is] = await isEmirleriAc([yeniAdim({ bilesenler: [{ malzemeId: ham, miktar: 2, fireYuzde: 0 }] })], 5);
    assert.deepEqual((await vt().tx((db) => canliPlanIhtiyaclari(db))).filter((x) => x.malzemeNo === ham), []);
    const p = await taslaktaOner();
    assert.ok(p.yerlesimler.some((y) => y.isEmriId === is));
    await canliyaAl(p);
    const l = (await vt().tx((db) => canliPlanIhtiyaclari(db))).filter((x) => x.malzemeNo === ham);
    assert.equal(l.length, 1);
    assert.deepEqual([l[0]!.miktar, l[0]!.stokBilinmiyor, l[0]!.emirler.length], [10, true, 1]);
    assert.match(l[0]!.gerekenTarih, /^\d{4}-\d{2}-\d{2}$/);
  });
});
