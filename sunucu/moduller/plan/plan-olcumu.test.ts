import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { emirTahminleri, olcumler } from './sorgular.ts';

// 1470 a: her canlıya almada planın göstergeleri ve emir başına tahmini bitiş yalnız eklenen iki tabloya yazılır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): canlıya almada plan ölçümü (1470 a)', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner } = planTestOrtami();
  const canliyaAl = async () => {
    const p = await taslaktaOner();
    const t = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum })).senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${t.id}/canliya-al`, { surum: t.surum, cakismalariKabul: true });
    return t.id;
  };

  test('canlıya alma tek ölçüm satırı ve emir başına tahmini bitiş yazar; satırlar değişmez, silinmez', async () => {
    const [a] = await isEmirleriAc([yeniAdim()], 10, '2030-04-10');
    const [b] = await isEmirleriAc([yeniAdim()], 5, null);
    const emir = async (isEmriId: number) => (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId])))!.id;
    const [ea, eb] = [await emir(a!), await emir(b!)];
    const senaryo = await canliyaAl();
    const o = await vt().tx((db) => olcumler(db, new Date(0)));
    assert.equal(o.length, 1);
    const surum = (await vt().tx((db) => db.tek<{ surum: number }>('SELECT surum FROM plan_durumu')))!.surum;
    assert.deepEqual({ ...o[0]!, id: 0, zaman: '', yazanKisiId: 0 }, {
      id: 0, zaman: '', yazanKisiId: 0, planSurumu: surum, senaryoId: senaryo, toplamIs: 2, yerlesmeyenIs: 0, gecikenEmir: 0, zamanindaYuzde: 100,
      agirlikliGecikmeSaat: 0, degisenIs: 0, yakinDegisenIs: 0, yeniIs: 2, vardiyasizIs: 0, gelirsizEmir: 2,
    });
    const e = await vt().tx((db) => emirTahminleri(db, new Date(0)));
    assert.deepEqual(e.map((x) => [x.uretimEmriId, x.termin, x.tahminiBitis !== null]).sort(), [[ea, '2030-04-10', true], [eb, null, true]].sort());
    const plan = await vt().tx((db) => db.tek<{ bitis: string }>(`SELECT to_json(max(bitis)) #>> '{}' AS bitis FROM plan_yerlesimi WHERE is_emri_id = $1`, [a]));
    assert.equal(Date.parse(e.find((x) => x.uretimEmriId === ea)!.tahminiBitis!), Date.parse(plan!.bitis));
    await assert.rejects(vt().tx((db) => db.sorgu('UPDATE plan_olcumu SET degisen_is = 1')));
    await assert.rejects(vt().tx((db) => db.sorgu('DELETE FROM plan_olcumu_emri')));
  });

  test('ikinci canlıya alma yeni satır yazar; yerinden oynamayan iş değişmiş sayılmaz', async () => {
    await canliyaAl();
    const o = await vt().tx((db) => olcumler(db, new Date(0)));
    assert.equal(o.length, 2);
    assert.ok(o[1]!.planSurumu > o[0]!.planSurumu);
    assert.equal(o[1]!.yeniIs, 0);
    assert.equal(o[1]!.toplamIs, 2);
  });
});
