import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from '../plan-ortak.test.ts';

// 3256-1: satın alma termini dinleyicisi sunucu/kablolama.ts'teki bağla kurulur. Olayı satın almanın gerçek tedarik termini ucu verir;
// işaret yalnız bağ kuruluysa yazılır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): satın alma termini bağı kablolamadan', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner, hammaddeAc } = planTestOrtami();
  const emriOf = async (isEmriId: number) =>
    (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId])))!.id;
  const say = (emirId: number) => vt().tx((db) => db.tek<{ n: number }>(
    "SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = 'satin-alma-termini' AND uretim_emri_id = $1", [emirId]));
  const termin = (malzemeNo: number, gun: string) =>
    tamam(c.yonetici, 'POST', '/satin-alma-tedarik-terminleri/kaydet', { malzemeNo, termin: gun, aciklama: '', surum: null });

  test('BK-K4: canlıdaki emrin malzemesine termin girilince satın alma termini işaretlenir; başka malzeme işaretlemez', async () => {
    const [kullanilan, baska] = [await hammaddeAc(), await hammaddeAc()];
    const [i1] = await isEmirleriAc([yeniAdim({ bilesenler: [{ malzemeId: kullanilan, miktar: 1, fireYuzde: 0 }] })]);
    const e1 = await emriOf(i1!);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    await termin(baska, '2099-01-05');
    assert.equal((await say(e1))?.n, 0, 'emrin kullanmadığı malzeme');
    await termin(kullanilan, '2099-01-05');
    assert.equal((await say(e1))?.n, 1, 'emrin malzemesi');
    const b = await tamam<{ bayat?: { bayat: boolean; sayilar?: Record<string, number> } }>(c.planlama, 'GET', '/plan/surum');
    assert.equal(b.bayat?.bayat, true);
    assert.equal(b.bayat?.sayilar?.['satin-alma-termini'], 1);
  });
});
