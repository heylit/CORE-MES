import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 502 a: bir taslak canlıya alınınca aynı tabandan açılmış öbür açık ve onaydaki taslaklar canlıya alanın adına kapanır (vazgeçildi);
// onaydaki önce onaydan çekilir. Başka tabanlı taslağa dokunulmaz. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): canlıya alma kardeş taslakları kapatır', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner } = planTestOrtami();
  const liste = async () => (await tamam<SenaryolarCevabi>(c.mudur, 'GET', '/plan/senaryolar')).senaryolar;
  const gecis = async (cerez: string, id: number, ad: string, govde: Record<string, unknown>) =>
    (await tamam<SenaryolarCevabi>(cerez, 'POST', `/plan/senaryolar/${id}/${ad}`, govde)).senaryolar.find((x) => x.id === id)!;
  const ac = async (cerez: string, ad: string) =>
    (await tamam<SenaryolarCevabi>(cerez, 'POST', '/plan/senaryolar', { ad })).senaryolar.find((x) => x.ad === ad && x.durum === 'acik')!;

  test('PL-502: onaydaki ve açık kardeş taslak kapanır, kapatan canlıya alan, onaydan çekme kaydı yazılır; yeni tabanlı taslak açık kalır', async () => {
    await isEmirleriAc([yeniAdim()]);
    // Planlamacı A'yı onaya gönderir; B ile C aynı tabandan açılır.
    let p: PlanCevabi = await taslaktaOner();
    const a = await gecis(c.planlama, p.taslak!.id, 'onaya-gonder', { surum: p.taslak!.surum });
    const b = await ac(c.planlama, 'Deneme B');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/oner', { taslak: { id: b.id, surum: b.surum } });
    const bOnayda = await gecis(c.planlama, b.id, 'onaya-gonder', { surum: p.taslak!.surum });
    const cAcik = await ac(c.mudur, 'Deneme C');
    assert.equal(new Set([a.tabanPlanSurumu, bOnayda.tabanPlanSurumu, cAcik.tabanPlanSurumu]).size, 1);
    // Müdür B'yi canlıya alır: A (onayda) ve C (açık) kapanır.
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${b.id}/canliya-al`, { surum: bOnayda.surum, cakismalariKabul: true });
    const satirlar = await vt().tx((db) => db.sorgu<{ id: number; durum: string; kapatan: number | null }>(
      'SELECT id, durum, kapatan_kisi_id AS kapatan FROM plan_senaryosu WHERE id = ANY($1::int[]) ORDER BY id', [[a.id, b.id, cAcik.id]]));
    const mudur = (await vt().tx((db) => db.tek<{ id: number }>("SELECT kapatan_kisi_id AS id FROM plan_senaryosu WHERE id = $1", [b.id])))!.id;
    assert.deepEqual(satirlar, [
      { id: a.id, durum: 'vazgecildi', kapatan: mudur }, { id: b.id, durum: 'canliya_alindi', kapatan: mudur }, { id: cAcik.id, durum: 'vazgecildi', kapatan: mudur },
    ].sort((x, y) => x.id - y.id));
    const kayit = await vt().tx((db) => db.sorgu<{ islem: string; kisi: number }>(
      'SELECT islem, kisi_id AS kisi FROM plan_senaryo_onay_kaydi WHERE senaryo_id = $1 ORDER BY id', [a.id]));
    assert.deepEqual(kayit.map((x) => x.islem), ['onaya_gonder', 'onaydan_cek']);
    assert.equal(kayit.at(-1)!.kisi, mudur);
    assert.ok(!(await liste()).some((x) => [a.id, cAcik.id].includes(x.id) && (x.durum === 'acik' || x.durum === 'onayda')));
    // Yeni canlı tabandan açılan taslak bir sonraki canlıya almaya kadar açık kalır.
    const d = await ac(c.planlama, 'Deneme D');
    assert.notEqual(d.tabanPlanSurumu, a.tabanPlanSurumu);
    assert.equal((await liste()).find((x) => x.id === d.id)?.durum, 'acik');
  });
});
