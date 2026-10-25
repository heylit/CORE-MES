import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bekleyenSiralar, canliSira, kuyruguSirala } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 147 a: Arkon'un "sıra onay bekliyor"u yalnız tabanı güncel canlı sürüm olan taslaktan gelir. Aynı tabandan açılmış başka bir taslak
// canlıya alınınca onaydaki taslak bayatlar; onun sırası canlıdaki sıranın üstüne beklemez (yetim onay senaryosu). Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): bayat taslağın sırası beklemez', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, planOku, taslaktaOner } = planTestOrtami();
  const gecis = async (cerez: string, id: number, ad: string, govde: Record<string, unknown>) =>
    (await tamam<SenaryolarCevabi>(cerez, 'POST', `/plan/senaryolar/${id}/${ad}`, govde)).senaryolar.find((x) => x.id === id)!;

  test('PL-ONAY: aynı tabanlı başka taslak canlıya alınınca onaydaki taslağın sırası bekleyen sayılmaz; tabanı güncellenince yine sayılır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    let p = await taslaktaOner();
    let s = await gecis(c.planlama, p.taslak!.id, 'onaya-gonder', { surum: p.taslak!.surum });
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    const once = await vt().tx((db) => canliSira(db, [i1!, i2!]));
    const planlamaci = (await kimlikCozucu(vt())({ headers: { cookie: c.planlama } } as never))!;
    // Taslak A: Arkon sırası, onaya gider.
    const a = await vt().tx((db) => kuyruguSirala(db, planlamaci, { kaynak: once.yerlesimler[0]!.kaynak, isEmriIdleri: [i2!, i1!], planSurumu: once.planSurumu }));
    p = await planOku(a.taslakId);
    await gecis(c.planlama, a.taslakId, 'onaya-gonder', { surum: p.taslak!.surum });
    const bekleyen = () => vt().tx((db) => bekleyenSiralar(db, [i1!, i2!]));
    assert.deepEqual((await bekleyen()).map((x) => [x.senaryoId, x.durum]), [[a.taslakId, 'onayda'], [a.taslakId, 'onayda']]);
    // Taslak B aynı tabandan açılır ve canlıya alınır; A onayda kalır ama bayattır.
    p = await taslaktaOner();
    assert.notEqual(p.taslak!.id, a.taslakId);
    s = await gecis(c.planlama, p.taslak!.id, 'onaya-gonder', { surum: p.taslak!.surum });
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    const durumA = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === a.taslakId)?.durum;
    assert.equal(durumA, 'onayda', 'A kapanmadı (kök neden ayrı soruda)');
    assert.deepEqual(await bekleyen(), []);
    // A'nın tabanı güncel canlıya alınırsa sırası yine bekler.
    await vt().tx((db) => db.sorgu('UPDATE plan_senaryosu SET taban_plan_surumu = (SELECT surum FROM plan_durumu) WHERE id = $1', [a.taslakId]));
    assert.deepEqual((await bekleyen()).map((x) => x.senaryoId), [a.taslakId, a.taslakId]);
  });
});
