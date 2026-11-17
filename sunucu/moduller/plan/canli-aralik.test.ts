import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { canliPlanAraligi } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

const SA = 3_600_000;
const T = Date.parse('2031-03-10T00:00:00Z');
const an = (saat: number): string => new Date(T + saat * SA).toISOString();

// 3390-2: Ortak Dosyalar plan listesinin kaynağı. Bölünmüş işin zarfı (makine A, saat 1) ilk parçadan (makine B) ayrışsın diye kaynaklar farklıdır. Canlı yerleşim ve parçalar elle eklenir; veriler uydurmadır.
describe('plan (gerçek PostgreSQL): canlı plan aralığı (3390-2)', () => {
  const { vt, isEmirleriAc, yeniAdim, durum } = planTestOrtami();

  test('aralığa değen yerleşim gelir; bölünmüş işin zarfı değil penceredeki her parçası gelir; yalnız sınıra dokunan gelmez', async () => {
    const { makineA, makineB, operatorId } = durum();
    const [tek = 0, bolunmus = 0, sonda = 0, basta = 0, tasan = 0] = await isEmirleriAc([yeniAdim(), yeniAdim(), yeniAdim(), yeniAdim(), yeniAdim()], 5);
    await vt().tx(async (db) => {
      const yerlesim = (is: number, bas: number, bit: number) => db.sorgu(
        'INSERT INTO plan_yerlesimi (is_emri_id, makine_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5)',
        [is, makineA, an(bas), an(bit), operatorId]);
      const parca = (no: number, makine: number, bas: number, bit: number) => db.sorgu(
        'INSERT INTO plan_yerlesim_parcasi (is_emri_id, parca_no, adet, makine_id, baslangic, bitis) VALUES ($1, $2, 1, $3, $4::timestamptz, $5::timestamptz)',
        [bolunmus, no, makine, an(bas), an(bit)]);
      await yerlesim(tek, 2, 4);
      await yerlesim(bolunmus, 1, 30);
      await parca(1, makineB, 1, 3);
      await parca(2, makineA, 5, 7);
      await parca(3, makineA, 26, 30);
      await yerlesim(sonda, 24, 26);
      await yerlesim(basta, -2, 0);
      await yerlesim(tasan, -1, 1);
    });
    const r = await vt().tx((db) => canliPlanAraligi(db, new Date(T), new Date(T + 24 * SA)));
    assert.deepEqual(r.map((x) => [x.isEmriId, x.makineId, x.baslangic]), [
      [tasan, makineA, an(-1)],
      [bolunmus, makineB, an(1)],
      [tek, makineA, an(2)],
      [bolunmus, makineA, an(5)],
    ]);
    assert.deepEqual(await vt().tx((db) => canliPlanAraligi(db, new Date(T + 40 * SA), new Date(T + 48 * SA))), [], 'boş aralık');
  });
});
