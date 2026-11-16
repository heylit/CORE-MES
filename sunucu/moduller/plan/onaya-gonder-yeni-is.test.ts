import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3334 a (B-2499'u değiştirir): taslak açıldıktan sonra açılan ve taslağın ele almadığı iş onaya göndermeyi ve canlıya almayı durdurmaz;
// sayısı uyarı olarak gelir. Böyle iş canlıya yazılan kümeye girmez: canlıdaki yeri ve bölmesi olduğu gibi kalır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): taslaktan sonra açılan iş onayı ve canlıya almayı durdurmaz', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, taslaktaOner, taslagaYaz, isEmriKomutu, planOku, yer, tg, durum } = planTestOrtami();
  const senaryo = async (id: number) => (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id)!;
  const canliSatirlari = (isEmriId: number) => vt().tx(async (db) => ({
    yer: await db.sorgu('SELECT makine_id, baslangic, bitis FROM plan_yerlesimi WHERE is_emri_id = $1', [isEmriId]),
    parca: await db.sorgu('SELECT parca_no, adet, baslangic FROM plan_yerlesim_parcasi WHERE is_emri_id = $1 ORDER BY parca_no', [isEmriId]),
  }));

  test('yeni iş taslakta yokken onaya gider ve canlıya alınır; uyarı sayısı gelir, canlıdaki yer ve bölme aynen kalır', async () => {
    const [planli] = await isEmirleriAc([yeniAdim()]);
    const t = await taslaktaOner();
    const id = t.taslak!.id;
    assert.equal((await senaryo(id)).plansizYeniIsler, undefined, 'yeni iş yokken uyarı alanı gelmez');
    const [plansiz] = await isEmirleriAc([yeniAdim()]);
    const [yerli] = await isEmirleriAc([yeniAdim()]);
    const [bolmeli] = await isEmirleriAc([yeniAdim()]);
    // Canlıya başka yoldan girmiş yer ve yalnız elle bölmesi olan iş (yersiz bölme).
    const { makineB, yoneticiId } = durum();
    await vt().tx(async (db) => {
      await db.sorgu(
        `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, baslangic, bitis, yazan_kisi_id)
         VALUES ($1, $2, now() + interval '30 days', now() + interval '30 days 2 hours', $3)`, [yerli, makineB, yoneticiId]);
      await db.sorgu('INSERT INTO plan_yerlesim_parcasi (is_emri_id, parca_no, adet) VALUES ($1, 1, 4), ($1, 2, 6)', [bolmeli]);
    });
    const once = { yerli: await canliSatirlari(yerli!), bolmeli: await canliSatirlari(bolmeli!) };
    assert.equal(once.yerli.yer.length, 1);
    assert.equal(once.bolmeli.parca.length, 2);

    const uyari = (await senaryo(id)).plansizYeniIsler;
    assert.equal(uyari?.adet, 2, 'canlıda yeri olan yeni iş sayılmaz; yeri olmayan ve yalnız bölmesi olan sayılır');
    assert.equal(uyari?.isler.length, 2);

    const gonderilen = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(id)}/onaya-gonder`, { surum: (await planOku(id)).taslak!.surum }))
      .senaryolar.find((x) => x.id === id)!;
    assert.equal(gonderilen.durum, 'onayda');
    const alinan = (await tamam<SenaryolarCevabi>(c.mudur, 'POST', `/plan/senaryolar/${String(id)}/canliya-al`, { surum: gonderilen.surum, cakismalariKabul: true, dortSaatGerekcesi: 'Deneme: yakın iş.' }))
      .senaryolar.find((x) => x.id === id)!;
    assert.equal(alinan.durum, 'canliya_alindi');

    const canli = await planOku();
    assert.ok(yer(canli, planli!), 'taslaktaki iş canlıya geçer');
    assert.ok(canli.yerlesmemis.some((y) => y.isEmriId === plansiz), 'yeni iş canlıda plansız kalır');
    assert.deepEqual(await canliSatirlari(yerli!), once.yerli, 'yeni işin canlıdaki yeri aynen kalır');
    assert.deepEqual(await canliSatirlari(bolmeli!), once.bolmeli, 'yeni işin canlıdaki bölmesi aynen kalır');
  });

  test('plandan önce açılmış iş ve taslağın bildiği (bölmesi ya da defter kaydı olan) yeni iş dışlanmaz: taslaktaki hâli canlıya geçer', async () => {
    // Plandan önce açılmış, canlıda yeri olan iş taslaktan çıkarılır (defter kaydı olmadan: canlıda kilitli olduğu için Planı kur onu kuyruğa yazmaz).
    const [eski] = await isEmirleriAc([yeniAdim()]);
    const { makineB, yoneticiId } = durum();
    const canliYer = (isEmriId: number, gun: number, kilitli = false) => vt().tx((db) => db.sorgu(
      `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, baslangic, bitis, kilitli, yazan_kisi_id)
       VALUES ($1, $2, now() + make_interval(days => $4), now() + make_interval(days => $4, hours => 2), $5, $3)`, [isEmriId, makineB, yoneticiId, gun, kilitli]));
    await canliYer(eski!, 40, true);
    const t = await taslaktaOner();
    const id = t.taslak!.id;
    await vt().tx((db) => db.sorgu('DELETE FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND is_emri_id = $2', [id, eski]));
    // Plandan sonra açılan iki iş: birinin taslakta yalnız bölmesi var, öteki taslağa yazılıp kaldırıldı (defterde geçer) ve canlıda yeri var.
    const [bolmeli] = await isEmirleriAc([yeniAdim()]);
    const [kaldirilan] = await isEmirleriAc([yeniAdim()]);
    await vt().tx((db) => db.sorgu('INSERT INTO plan_senaryo_yerlesim_parcasi (senaryo_id, is_emri_id, parca_no, adet) VALUES ($1, $2, 1, 4), ($1, $2, 2, 6)', [id, bolmeli]));
    assert.equal((await taslagaYaz(c.planlama, tg(await planOku(id)), kaldirilan!)).statusCode, 200);
    const kaldir = await isEmriKomutu(await planOku(id), kaldirilan!, 'kaldir');
    assert.equal(kaldir.statusCode, 200, kaldir.body);
    await canliYer(kaldirilan!, 41);
    assert.equal((await canliSatirlari(eski!)).yer.length, 1);
    assert.equal((await canliSatirlari(kaldirilan!)).yer.length, 1);

    assert.equal((await senaryo(id)).plansizYeniIsler, undefined, 'eski iş ve taslağın bildiği yeni işler plansız yeni sayılmaz');
    const gonderilen = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(id)}/onaya-gonder`, { surum: (await planOku(id)).taslak!.surum }))
      .senaryolar.find((x) => x.id === id)!;
    const al = await istek(c.mudur, 'POST', `/plan/senaryolar/${String(id)}/canliya-al`, { surum: gonderilen.surum, cakismalariKabul: true, dortSaatGerekcesi: 'Deneme: yakın iş.' });
    assert.equal(al.statusCode, 200, al.body);

    assert.equal((await canliSatirlari(eski!)).yer.length, 0, 'plandan önce açılmış iş taslakta yoksa canlıdan kalkar');
    assert.equal((await canliSatirlari(kaldirilan!)).yer.length, 0, 'taslağın kaldırdığı yeni iş canlıdan kalkar');
    assert.equal((await canliSatirlari(bolmeli!)).parca.length, 2, 'taslaktaki bölme canlıya geçer');
  });
});
