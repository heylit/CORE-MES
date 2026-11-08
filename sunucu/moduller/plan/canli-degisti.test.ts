import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CANLI_DEGISTI, type CanliDegistiAyrintisi, type SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 2311 S1: taslak açıldıktan sonra canlı plan değiştiyse canlıya alma, kişi onaylamadan (cakismalariKabul false) 409 döner; ayrıntı ekranın
// soruyu kurması içindir. Aynı tabanlı kardeş taslak zaten kapanır (502 a); burada canlı sürümün başka yoldan artması doğrudan kurulur.
describe('plan (gerçek PostgreSQL): canlı değişti sorusu', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, taslaktaOner } = planTestOrtami();

  test('PL-2316: canlı değiştiyse onaysız 409 (neden, taban ve canlı sürüm); onaylı canlıya alınır', async () => {
    await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    const canli = await vt().tx(async (db) => (await db.tek<{ surum: number }>('UPDATE plan_durumu SET surum = surum + 1 RETURNING surum'))!.surum);
    const yol = `/plan/senaryolar/${String(s.id)}/canliya-al`;

    const red = await istek(c.mudur, 'POST', yol, { surum: s.surum, cakismalariKabul: false });
    assert.equal(red.statusCode, 409, red.body);
    assert.deepEqual(red.json<{ ayrinti: unknown }>().ayrinti,
      { neden: CANLI_DEGISTI, tabanSurumu: s.tabanPlanSurumu, canliSurumu: canli } satisfies CanliDegistiAyrintisi);
    const varsayilan = await istek(c.mudur, 'POST', yol, { surum: s.surum });
    assert.equal(varsayilan.statusCode, 409, 'bayrak verilmezse sorulur');

    const al = await tamam<SenaryolarCevabi>(c.mudur, 'POST', yol, { surum: s.surum, cakismalariKabul: true });
    assert.equal(al.canliSurum, canli + 1);
  });

  test('PL-2316: canlı değişmediyse bayraksız canlıya alınır', async () => {
    await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    const r = await istek(c.mudur, 'POST', `/plan/senaryolar/${String(s.id)}/canliya-al`, { surum: s.surum, cakismalariKabul: false });
    assert.equal(r.statusCode, 200, r.body);
  });
});
