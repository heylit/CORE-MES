import assert from 'node:assert/strict';
import { before, describe, mock, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { senaryolar } from './servis.ts';

// 1872: senaryo listesi canlı plan ve her açık senaryo için ayrı bağlam kurar. Hedefe bağlı olmayan okumalar (açık işler, kaynaklar,
// vardiya takvimi, kur, katkı) istek içinde bir kez yapılır; senaryo başına yalnız kendi okumaları eklenir. Bir senaryonun denemesi
// (makine arızası, acil emir) canlıya ve öteki senaryolara geçmemeli: her senaryo tek başınayken aldığı cevabı listede de alır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): senaryo listesi sorgu sayısı ve ortak okuma', () => {
  const { c, vt, tamam, istek, isEmirleriAc, yeniAdim, taslaktaOner } = planTestOrtami();
  let planlamaci: Kullanici;
  before(async () => { planlamaci = (await kimlikCozucu(vt())({ headers: { cookie: c.planlama } } as never))!; });

  // Aynı an: gösterge ve etki şimdiye göre hesaplanır; iki okuma ancak aynı anda karşılaştırılabilir.
  const AN = Date.now();
  const liste = async (): Promise<[SenaryolarCevabi, number]> => {
    const saat = mock.method(Date, 'now', () => AN);
    try {
      return await vt().tx(async (db) => {
        let n = 0;
        const sayan: Db = { sorgu: (q, p) => { n += 1; return db.sorgu(q, p); }, tek: (q, p) => { n += 1; return db.tek(q, p); } };
        return [await senaryolar(sayan, planlamaci), n];
      });
    } finally {
      saat.mock.restore();
    }
  };
  const ac = async (ad: string, tur: 'ariza' | 'acil') => {
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad })).senaryolar.find((x) => x.ad === ad)!;
    const r = await istek(c.planlama, 'POST', `/plan/senaryolar/${s.id}/hizli`, { tur, surum: s.surum });
    assert.equal(r.statusCode, 200, r.body);
    return s.id;
  };
  const vazgec = async (id: number, l: SenaryolarCevabi) =>
    tamam(c.planlama, 'POST', `/plan/senaryolar/${id}/vazgec`, { surum: l.senaryolar.find((x) => x.id === id)!.surum });
  const bul = (l: SenaryolarCevabi, id: number) => l.senaryolar.find((x) => x.id === id);

  test('açık senaryo başına eklenen sorgu canlı bağlamın küçük bir kısmıdır; deneme canlıya ve öteki senaryoya geçmez', async () => {
    await isEmirleriAc([yeniAdim()]);
    await isEmirleriAc([yeniAdim(), yeniAdim()]);
    // Arıza denemesi canlıda iş taşıyan makineyi seçer: önce canlı plan kurulur, sonra karşılaştırılacak açık senaryo.
    const ilk = await taslaktaOner();
    const onayda = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${ilk.taslak!.id}/onaya-gonder`, { surum: ilk.taslak!.surum }))
      .senaryolar.find((x) => x.id === ilk.taslak!.id)!;
    const al = await istek(c.mudur, 'POST', `/plan/senaryolar/${onayda.id}/canliya-al`, { surum: onayda.surum, cakismalariKabul: true });
    assert.equal(al.statusCode, 200, al.body);
    await isEmirleriAc([yeniAdim()]);
    const p = (await taslaktaOner()).taslak!.id;
    const [l1, n1] = await liste();
    assert.ok(bul(l1, p)?.gostergeler, 'açık senaryonun göstergesi var');

    const a = await ac('1872 arıza', 'ariza');
    const g = await ac('1872 acil', 'acil');
    const [l2, n2] = await liste();
    assert.deepEqual(l2.canli, l1.canli, 'denemeler canlıyı değiştirmez');
    assert.deepEqual(bul(l2, p), bul(l1, p), 'denemeler öteki senaryoya geçmez');
    assert.ok((n2 - n1) / 2 < n1 / 4, `iki senaryo ${String(n2 - n1)} sorgu ekledi; tek senaryolu liste ${String(n1)} sorgu`);

    // Arıza senaryosu tek başına açıkken aynı cevabı alır (öncesinde ve sonrasında başka senaryolar işlenmişti).
    await vazgec(p, l2);
    await vazgec(g, l2);
    const [l3] = await liste();
    assert.deepEqual(l3.canli, l1.canli);
    assert.deepEqual(bul(l3, a)?.gostergeler, bul(l2, a)?.gostergeler);
    assert.deepEqual(bul(l3, a)?.etki, bul(l2, a)?.etki);
    assert.notDeepEqual(bul(l2, a)?.gostergeler, bul(l2, g)?.gostergeler, 'iki deneme ayrı bağlamla hesaplandı');
  });
});
