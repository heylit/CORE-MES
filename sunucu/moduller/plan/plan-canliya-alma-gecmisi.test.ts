import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { CanliyaAlmaGecmisiCevabi, PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 510 a: eski "Plan değişikliği" kutusu; taban planın ilk yazılışından sonraki canlıya almalar ve canlıya alanların adları. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): canlıya alma geçmişi', () => {
  const { c, tamam, istek, yeniAdim, isEmirleriAc, taslaktaOner } = planTestOrtami();
  const yol = '/plan/canliya-alma-gecmisi';
  const canliyaAl = async (p: PlanCevabi, sahip: string) => {
    const surum = (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!.surum;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/canliya-al`, { surum, cakismalariKabul: true });
  };

  test('PL-510: ilk canlıya alma (tabanı yazan) sayılmaz; sonrakiler kişi başına sayılır, en son önce; planı okumayan 403, oturumsuz 401', async () => {
    assert.deepEqual(await tamam<CanliyaAlmaGecmisiCevabi>(c.planlama, 'GET', yol), { tabanZamani: null, toplam: 0, kisiler: [], son: [] });
    await isEmirleriAc([yeniAdim()], 5);
    await canliyaAl(await taslaktaOner(), c.planlama);
    const ilk = await tamam<CanliyaAlmaGecmisiCevabi>(c.planlama, 'GET', yol);
    assert.ok(ilk.tabanZamani !== null);
    assert.deepEqual([ilk.toplam, ilk.kisiler, ilk.son], [0, [], []], 'tabanı yazan canlıya alma değişiklik değildir');

    await isEmirleriAc([yeniAdim()], 5);
    const p2 = await taslaktaOner();
    await canliyaAl(p2, c.planlama);
    await isEmirleriAc([yeniAdim()], 5);
    const p3 = await taslaktaOner(c.planlama2);
    await canliyaAl(p3, c.planlama2);
    const g = await tamam<CanliyaAlmaGecmisiCevabi>(c.cam, 'GET', yol);
    assert.equal(g.toplam, 2);
    assert.deepEqual(g.kisiler, [{ kisi: 'Deneme mudur', sayi: 2 }], 'canlıya alan onaylayandır');
    assert.deepEqual(g.son.map((x) => [x.senaryoId, x.kisi]), [[p3.taslak!.id, 'Deneme mudur'], [p2.taslak!.id, 'Deneme mudur']]);
    assert.ok(Date.parse(g.son[0]!.zaman) >= Date.parse(g.son[1]!.zaman));

    assert.equal((await istek(c.operator, 'GET', yol)).statusCode, 403, 'plan okuma yetkisi yok');
    assert.equal((await istek('', 'GET', yol)).statusCode, 401);
  });
});
