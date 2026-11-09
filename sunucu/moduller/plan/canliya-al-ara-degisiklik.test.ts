import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

const GUN = 24 * 60 * 60 * 1000;
const SAAT = 60 * 60 * 1000;
const GEREKCE = 'Deneme: yakındaki iş bilerek taşındı.';

// B-2483-1, B-2483-2: taslak açıldıktan sonra canlı plan değişir, kişi "canlı değişti" sorusunu onaylar. Canlıya yalnız taslağın değiştirdiği
// işler geçer; arada canlıya giren yer ve iş korunur. Korunan canlıyla taslaktan gelen iş aynı makinede üst üste binerse canlıya alınmaz.
describe('plan (gerçek PostgreSQL): canlı değiştikten sonra canlıya alma', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, taslaktaOner, planOku, yer, durum } = planTestOrtami();

  const ileri = (gun: number, saat: number) => new Date(tesisGunBasi(tesisGunu(Date.now())) + gun * GUN + saat * SAAT);
  // Canlı plan başka yoldan değişir (canlıya alınan başka taslak gibi): yer kayar, yeni iş girer, sürüm artar.
  const canliTasi = (isEmriId: number, bas: Date) => vt().tx((db) => db.sorgu(
    'UPDATE plan_yerlesimi SET bitis = $2::timestamptz + (bitis - baslangic), baslangic = $2 WHERE is_emri_id = $1', [isEmriId, bas]));
  const canliyaEkle = (isEmriId: number, makineId: number, bas: Date) => vt().tx((db) => db.sorgu(
    `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira, elle_istasyon_id, elle_kaynak, yazan_kisi_id)
     VALUES ($1, $2, NULL, $3, $3::timestamptz + interval '50 minutes', false, false, NULL, NULL, false, $4)`, [isEmriId, makineId, bas, durum().yoneticiId]));
  const surumArtir = () => vt().tx((db) => db.sorgu('UPDATE plan_durumu SET surum = surum + 1'));

  async function canliPlan(): Promise<PlanCevabi> {
    const p = await taslaktaOner();
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${String(s.id)}/canliya-al`, { surum: s.surum, dortSaatGerekcesi: GEREKCE });
    return planOku();
  }
  // Canlıdaki işi yeni taslakta taşır (taslak verilmeyen komut taslak açar); taslağın kimliği ve sürümü döner.
  async function taslaktaTasi(isEmriId: number, makineId: number, bas: Date): Promise<{ id: number; surum: number }> {
    const canli = await planOku();
    const p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(isEmriId)}/tasi`,
      { taslak: null, kaynak: { tur: 'makine', id: makineId }, baslangic: bas.toISOString(), planSurumu: canli.surum });
    return { id: p.taslak!.id, surum: p.taslak!.surum };
  }
  async function onaylaVeAl(t: { id: number; surum: number }) {
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(t.id)}/onaya-gonder`, { surum: t.surum }))
      .senaryolar.find((x) => x.id === t.id)!;
    return istek(c.mudur, 'POST', `/plan/senaryolar/${String(s.id)}/canliya-al`, { surum: s.surum, cakismalariKabul: true, dortSaatGerekcesi: GEREKCE });
  }

  test('B-2483-1: kabulde arada canlıda yeri değişen iş geri dönmez, canlıya sonradan giren iş silinmez', async () => {
    const { makineA } = durum();
    const [x] = await isEmirleriAc([yeniAdim()]);
    const [y] = await isEmirleriAc([yeniAdim()]);
    await canliPlan();
    const t = await taslaktaTasi(x!, makineA, ileri(3, 10));

    const yYeni = ileri(2, 10);
    await canliTasi(y!, yYeni);
    const [z] = await isEmirleriAc([yeniAdim()]);
    const zYeri = ileri(4, 10);
    await canliyaEkle(z!, makineA, zYeri);
    await surumArtir();

    const r = await onaylaVeAl(t);
    assert.equal(r.statusCode, 200, r.body);
    const p = await planOku();
    assert.equal(Date.parse(yer(p, x!).baslangic), ileri(3, 10).getTime(), 'taslağın değiştirdiği iş canlıya geçer');
    assert.equal(Date.parse(yer(p, y!).baslangic), yYeni.getTime(), 'arada canlıda taşınan iş geri dönmez');
    assert.ok(p.yerlesimler.some((v) => v.isEmriId === z), 'canlıya sonradan giren iş silinmez');
    assert.equal(Date.parse(yer(p, z!).baslangic), zYeri.getTime());
  });

  test('B-2483-2: korunan canlı iş ile taslaktan gelen iş aynı makinede üst üste binerse 409, canlı değişmez', async () => {
    const { makineA } = durum();
    const [x] = await isEmirleriAc([yeniAdim()]);
    const [y] = await isEmirleriAc([yeniAdim()]);
    await canliPlan();
    const hedef = ileri(5, 10);
    const t = await taslaktaTasi(x!, makineA, hedef);
    await canliTasi(y!, new Date(hedef.getTime() + 10 * 60 * 1000));
    await surumArtir();
    const once = await planOku();

    const r = await onaylaVeAl(t);
    assert.equal(r.statusCode, 409, r.body);
    assert.match(r.json<{ mesaj?: string; hata?: string }>().mesaj ?? r.body, /üst üste/);
    const p = await planOku();
    assert.equal(p.surum, once.surum, 'canlı plan sürümü artmaz');
    assert.equal(yer(p, x!).baslangic, yer(once, x!).baslangic, 'taslaktaki iş canlıya geçmez');
  });

  test('B-2483-2: canlıda önceden kalmış çakışma, taslakta yeri değişmeyen işlerdeyse canlıya almayı durdurmaz', async () => {
    const { makineA } = durum();
    const [x] = await isEmirleriAc([yeniAdim()]);
    const [y] = await isEmirleriAc([yeniAdim()]);
    const [w] = await isEmirleriAc([yeniAdim()]);
    await canliPlan();
    // y ile w canlıda zaten üst üste (eski veri); taslak yalnız x'i başka güne taşır.
    const bas = ileri(6, 10);
    await canliTasi(y!, bas);
    await canliTasi(w!, new Date(bas.getTime() + 5 * 60 * 1000));
    await surumArtir();
    const t = await taslaktaTasi(x!, makineA, ileri(7, 10));
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(t.id)}/onaya-gonder`, { surum: t.surum }))
      .senaryolar.find((v) => v.id === t.id)!;
    const r = await istek(c.mudur, 'POST', `/plan/senaryolar/${String(s.id)}/canliya-al`, { surum: s.surum, dortSaatGerekcesi: GEREKCE });
    assert.equal(r.statusCode, 200, r.body);
  });
});
