import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// B-2499 (ön deneme): taslak açıldıktan sonra açılan emrin işi taslakta yoksa (Planı kur'a basılmadı) taslak onaya gönderilmez ve canlıya
// alınmaz; Planı kur'dan sonra gider. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): taslaktan sonra açılan iş onaya gönderilmeden yerleşmeli', () => {
  const { c, tamam, istek, yeniAdim, isEmirleriAc, taslaktaOner, planOku, yer } = planTestOrtami();

  test('yeni iş taslakta yoksa onaya gönder ve canlıya al 409; Planı kur sonrası geçer', async () => {
    await isEmirleriAc([yeniAdim()]);
    const t = await taslaktaOner();
    const id = t.taslak!.id;
    const [yeni] = await isEmirleriAc([yeniAdim()]);
    const gonder = (surum: number) => istek(c.planlama, 'POST', `/plan/senaryolar/${String(id)}/onaya-gonder`, { surum });
    const red = await gonder((await planOku(id)).taslak!.surum);
    assert.equal(red.statusCode, 409, red.body);
    assert.match(red.body, /taslakta yok/);
    assert.equal((await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id)!.durum, 'acik', 'taslak açık kalır');

    const kurulu = await taslaktaOner(c.planlama, id);
    assert.ok(yer(kurulu, yeni!), 'Planı kur yeni işi yerleştirir');
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(id)}/onaya-gonder`, { surum: kurulu.taslak!.surum }))
      .senaryolar.find((x) => x.id === id)!;
    // Onaydayken bir iş daha açılır: canlıya alma da durur.
    await isEmirleriAc([yeniAdim()]);
    const al = await istek(c.mudur, 'POST', `/plan/senaryolar/${String(id)}/canliya-al`, { surum: s.surum, cakismalariKabul: true, dortSaatGerekcesi: 'Deneme: yakın iş.' });
    assert.equal(al.statusCode, 409, al.body);
    assert.match(al.body, /geri gönderin/);
  });
});
