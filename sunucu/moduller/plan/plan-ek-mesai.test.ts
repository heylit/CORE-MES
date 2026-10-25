import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { haftaBasi } from './kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 507 2 a, 508 1 a: ek vardiya taslakta; haftalık bütçe sonucu; canlıya alınınca canlının ek vardiyası olur. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): ek mesai taslakta', () => {
  const { c, tamam, istek, yeniAdim, isEmirleriAc, planOku, taslaktaOner, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  let makineA = 0;
  let gece = 0;
  let sabah = 0;
  before(async () => {
    ({ ortam, makineA } = durum());
    gece = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Deneme gece', '22:00', '06:00') RETURNING id"))!.id;
    sabah = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Deneme sabah', '06:00', '08:30') RETURNING id"))!.id;
  });
  const gonder = async (id: number, surum: number) =>
    (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  const yaz = (p: PlanCevabi, satirlar: unknown[], cerez = c.planlama) =>
    istek(cerez, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/ek-mesai`, { surum: p.taslak!.surum, satirlar });

  test('PL-507-2: ek vardiya taslağa yazılır, haftalık sınırı aşan hafta döner; yetkisiz, başkasının taslağı ve eski sürüm reddedilir; canlıya geçer', async () => {
    await isEmirleriAc([yeniAdim()], 5);
    const p = await taslaktaOner();
    assert.deepEqual(p.ekMesai, { satirlar: [], toplamSaat: 0, haftaSiniriSaat: 8, haftalar: [], asanHaftalar: [], asildi: false });
    const g1 = tesisGunu(Date.now() + 2 * 86_400_000);
    const g2 = tesisGunu(Date.now() + 3 * 86_400_000);
    const satirlar = [{ makineId: makineA, gun: g1, vardiyaId: gece }, { makineId: makineA, gun: g2, vardiyaId: sabah }];

    assert.equal((await yaz(p, satirlar, c.kalite)).statusCode, 403, 'plan.yaz yok');
    assert.equal((await yaz(p, satirlar, c.planlama2)).statusCode, 403, 'başkasının taslağı');
    assert.equal((await yaz(p, [{ makineId: makineA, gun: g1, vardiyaId: 999_999 }])).statusCode, 400, 'olmayan vardiya');
    assert.equal((await yaz(p, [satirlar[0], satirlar[0]])).statusCode, 400, 'aynı satır iki kez');

    const r = await yaz(p, satirlar);
    assert.equal(r.statusCode, 200, r.body);
    const y = r.json<PlanCevabi>();
    assert.equal(y.taslak!.surum, p.taslak!.surum + 1);
    assert.deepEqual(y.ekMesai!.satirlar, [{ makineId: makineA, gun: g1, vardiyaId: gece, saat: 8 }, { makineId: makineA, gun: g2, vardiyaId: sabah, saat: 2.5 }]);
    assert.equal(y.ekMesai!.toplamSaat, 10.5);
    const ayniHafta = haftaBasi(g1) === haftaBasi(g2);
    assert.equal(y.ekMesai!.asildi, ayniHafta, 'aynı haftada 10,5 saat 8 saatlik sınırı aşar');
    assert.deepEqual((await planOku(p.taslak!.id)).ekMesai, y.ekMesai, 'okuma aynı');
    assert.equal((await yaz(p, satirlar)).statusCode, 409, 'eski sürüm');

    await ortam!.sahip.sorgu('UPDATE plan_ayari SET ek_mesai_hafta_saat = 1');
    assert.equal((await planOku(p.taslak!.id)).ekMesai!.asildi, true, 'sınır 1 saat aşılır');
    await ortam!.sahip.sorgu('UPDATE plan_ayari SET ek_mesai_hafta_saat = 0');
    const sinirsiz = (await planOku(p.taslak!.id)).ekMesai!;
    assert.deepEqual([sinirsiz.haftaSiniriSaat, sinirsiz.asildi, sinirsiz.asanHaftalar], [0, false, []], 'sınır 0: sınır yok (eski motor)');
    await ortam!.sahip.sorgu('UPDATE plan_ayari SET ek_mesai_hafta_saat = 20');
    assert.equal((await planOku(p.taslak!.id)).ekMesai!.asildi, false, 'sınır plan ayarından');
    assert.equal((await planOku()).ekMesai!.satirlar.length, 0, 'canlı değişmedi');

    const s = await gonder(y.taslak!.id, y.taslak!.surum);
    assert.equal((await istek(c.mudur, 'POST', `/plan/senaryolar/${String(y.taslak!.id)}/canliya-al`, { surum: s, cakismalariKabul: true })).statusCode, 200);
    assert.deepEqual((await planOku()).ekMesai!.satirlar, y.ekMesai!.satirlar, 'canlıya geçti');
    const yeni = await taslaktaOner();
    assert.deepEqual(yeni.ekMesai!.satirlar, y.ekMesai!.satirlar, 'yeni taslak canlının ek vardiyasıyla açılır');
    const bos = await yaz(yeni, []);
    assert.equal(bos.statusCode, 200, bos.body);
    assert.equal(bos.json<PlanCevabi>().ekMesai!.toplamSaat, 0);
    const at = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(yeni.taslak!.id)}/degisiklikleri-at`, { surum: bos.json<PlanCevabi>().taslak!.surum });
    assert.ok(at.senaryolar.some((x) => x.id === yeni.taslak!.id));
    assert.equal((await planOku(yeni.taslak!.id)).ekMesai!.satirlar.length, 2, 'değişiklikleri at canlının ek vardiyasına döndürür');
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM plan_senaryo_ek_mesai WHERE senaryo_id = $1', [y.taslak!.id]), /değişmez/, 'kapanmış taslağınki değişmez');
  });

  test('PL-512: kabul edilen ek vardiya kuyruklarla tek işlemde yazılır ve makinenin kapasitesine girer; defter kaydı düşer, kaldırınca canlıya döner; yetkisiz ve eski sürüm reddedilir', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'EM-IM', ad: 'Deneme ek mesai merkezi', aciklama: null });
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'EM-I', ad: 'Deneme ek mesai', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'EM-M', ad: 'Deneme ek mesai makinesi', istasyonId: ist })).id;
    const v = await tamam<{ vardiyalar: { id: number; ad: string }[] }>(c.yonetici, 'POST', '/vardiyalar', { ad: 'EM sabah', baslangic: '08:00', bitis: '12:00', molalar: [], aktif: true });
    const vardiya = v.vardiyalar.find((x) => x.ad === 'EM sabah')!.id;
    for (let gun = 1; gun <= 7; gun++) await tamam(c.yonetici, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkez.id, gun, vardiyaId: vardiya, acik: true });
    const ogle = (await tamam<{ vardiyalar: { id: number; ad: string }[] }>(c.yonetici, 'POST', '/vardiyalar', { ad: 'EM ogle', baslangic: '12:00', bitis: '20:00', molalar: [], aktif: true }))
      .vardiyalar.find((x) => x.ad === 'EM ogle')!.id;
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 60, birimSureDk: 30 })], 10);
    const p = await taslaktaOner();
    const y0 = p.yerlesimler.find((x) => x.isEmriId === i1)!;
    const kuyruk = { kaynak: { tur: 'makine', id: makine }, baslangic: new Date(Date.now() + 3_600_000).toISOString(), isler: [{ emirNo: y0.emirNo, opNo: y0.opNo, dondurulmus: false }] };
    const ekMesai = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ makineId: makine, gun: tesisGunu(Date.now() + n * 86_400_000), vardiyaId: ogle }));
    const govde = (t: PlanCevabi, ek?: unknown[]) => ({ taslak: { id: t.taslak!.id, surum: t.taslak!.surum }, kuyruklar: [kuyruk], ...(ek ? { ekMesai: ek } : {}) });
    const yol = '/plan/kuyruklari-yaz';

    // Ek vardiyasız: 6 saatlik iş günde 4 saatlik vardiyada iki güne yayılır.
    assert.equal((await istek(c.planlama, 'POST', yol, govde(p))).statusCode, 200);
    const once = await planOku(p.taslak!.id);
    const bitisOnce = Date.parse(once.yerlesimler.find((x) => x.isEmriId === i1)!.bitis);

    assert.equal((await istek(c.kalite, 'POST', yol, govde(once, ekMesai))).statusCode, 403, 'plan.yaz yok');
    assert.equal((await istek(c.planlama, 'POST', yol, govde(p, ekMesai))).statusCode, 409, 'eski taslak sürümü');
    assert.equal((await istek(c.planlama, 'POST', yol, govde(once, [{ makineId: makine, gun: ekMesai[0]!.gun, vardiyaId: 999_999 }]))).statusCode, 400, 'olmayan vardiya');
    assert.equal((await planOku(p.taslak!.id)).ekMesai!.satirlar.filter((x) => x.makineId === makine).length, 0, 'reddedilen yazma ek vardiya bırakmaz');

    const r = await istek(c.planlama, 'POST', yol, govde(once, ekMesai));
    assert.equal(r.statusCode, 200, r.body);
    const sonra = await planOku(p.taslak!.id);
    assert.deepEqual(sonra.ekMesai!.satirlar.map((x) => [x.makineId, x.vardiyaId, x.saat]), ekMesai.map(() => [makine, ogle, 8]));
    const bitisSonra = Date.parse(sonra.yerlesimler.find((x) => x.isEmriId === i1)!.bitis);
    assert.ok(bitisSonra < bitisOnce, `ek vardiya kapasiteye girer: ${new Date(bitisSonra).toISOString()} < ${new Date(bitisOnce).toISOString()}`);

    const s1 = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === p.taslak!.id)!;
    const kayit = s1.degisiklikler.filter((d) => d.tur === 'ek_mesai');
    assert.equal(kayit.length, 1, 'aynı liste yeniden yazılmaz, tek kayıt');
    assert.match(kayit[0]!.ozet, /7 vardiya, 56 saat/);
    const kaldir = await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/degisiklikler/${String(kayit[0]!.id)}/kaldir`, { surum: s1.surum });
    assert.ok(kaldir.senaryolar.some((x) => x.id === p.taslak!.id));
    assert.deepEqual((await planOku(p.taslak!.id)).ekMesai!.satirlar, (await planOku()).ekMesai!.satirlar, 'kaydı kaldırmak canlının ek vardiyasına döndürür');
  });
});
