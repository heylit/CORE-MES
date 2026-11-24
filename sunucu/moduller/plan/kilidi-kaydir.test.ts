import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanliyaAlOnizlemesiCevabi, PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3669 dilim 2: öncülünden önce başlayan kilitli adım için sunucu kaydırma önerir; kaydırma yalnız sahibin açık taslağında ve kilitleme yetkisiyle
// yazılır, kilitli kalır, "geri al" eski saate döner. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): kilitli adımı öncülünün sonuna kaydır (3669)', () => {
  const { c, vt, istek, tamam, isEmirleriAc, yeniAdim, taslaktaOner, yer, durum } = planTestOrtami();
  const gun = (n: number) => { const d = new Date(Date.now() + n * 86400_000); d.setUTCHours(6, 0, 0, 0); return d.toISOString(); };
  const girdi = (p: PlanCevabi) => ({ id: p.taslak!.id, surum: p.taslak!.surum });

  // İki adımlı emir: ardıl (kilitli) 4. günde, öncül ise sonradan 5. güne çekilir (taşı sıraya aykırılığı reddeder; ihlal veritabanında kurulur).
  const kur = async () => {
    const { makineA, makineB } = durum();
    const [i1, i2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 2 }), yeniAdim({ kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: 30, birimSureDk: 2 })]);
    let p = await taslaktaOner();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(i2)}/tasi`, { taslak: girdi(p), kaynak: { tur: 'makine', id: makineB }, baslangic: gun(4), planSurumu: p.surum });
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(i1)}/tasi`, { taslak: girdi(p), kaynak: { tur: 'makine', id: makineA }, baslangic: gun(2), planSurumu: p.surum });
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(i2)}/kilitle`, { taslak: girdi(p) });
    await vt().tx((db) => db.sorgu(
      "UPDATE plan_senaryo_yerlesimi SET baslangic = baslangic + interval '3 days', bitis = bitis + interval '3 days' WHERE senaryo_id = $1 AND is_emri_id = $2", [p.taslak!.id, i1]));
    return { i1: i1!, i2: i2!, p };
  };
  const onizle = (cerez: string, p: PlanCevabi) => tamam<CanliyaAlOnizlemesiCevabi>(cerez, 'GET', `/plan/senaryolar/${String(p.taslak!.id)}/canliya-al-onizlemesi`);

  test('önizleme kilitli ihlali için öneri verir; uygulanınca adım öncülün bitişinde başlar, kilitli kalır; geri al eski saate döner', async () => {
    const { i1, i2, p } = await kur();
    const once = await onizle(c.planlama, p);
    assert.equal(once.ihlaller.length, 1);
    assert.deepEqual([once.ihlaller[0]!.isEmriId, once.ihlaller[0]!.kilitli, once.kilitYetkisi, once.oneriNedeni], [i2, true, true, null]);
    const oneri = once.oneri!;
    assert.equal(oneri.adimlar.length, 1);
    const a = oneri.adimlar[0]!;
    const okunan = await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(p.taslak!.id)}`);
    assert.ok(Date.parse(a.yeniBaslangic) >= Date.parse(yer(okunan, i1).bitis) - 60_000, 'öncülün bitişinden önce değil');
    assert.equal(a.eskiBaslangic, yer(okunan, i2).baslangic);
    assert.equal(oneri.kalanIhlal, 0);
    assert.ok(Date.parse(oneri.emirler[0]!.sonra!) > Date.parse(oneri.emirler[0]!.once!), 'emir bitişi ertelenir');

    const k = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kilitli-adimlari-kaydir', { taslak: girdi(okunan), adimlar: [{ isEmriId: i2, baslangic: a.yeniBaslangic }], geriAl: false });
    assert.equal(yer(k, i2).baslangic, a.yeniBaslangic);
    assert.equal(yer(k, i2).bitis, a.yeniBitis);
    assert.equal(yer(k, i2).kilitli, true);
    const sonra = await onizle(c.planlama, k);
    assert.deepEqual([sonra.ihlaller, sonra.oneri], [[], null]);

    const yanlis = await istek(c.planlama, 'POST', '/plan/kilitli-adimlari-kaydir', { taslak: girdi(k), adimlar: [{ isEmriId: i2, baslangic: gun(1) }], geriAl: true });
    assert.equal(yanlis.statusCode, 409, `kayıttaki eski saatten başka saatle geri alınmaz: ${yanlis.body}`);
    const geri = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kilitli-adimlari-kaydir', { taslak: girdi(k), adimlar: [{ isEmriId: i2, baslangic: a.eskiBaslangic }], geriAl: true });
    assert.equal(yer(geri, i2).baslangic, a.eskiBaslangic);
    assert.equal(yer(geri, i2).kilitli, true);
    assert.equal((await onizle(c.planlama, geri)).ihlaller.length, 1, 'eski saatte ihlal yine var');
    // Aynı geri alma ikinci kez yapılamaz: adım artık kaydırmanın yeni saatinde değil.
    const tekrar = await istek(c.planlama, 'POST', '/plan/kilitli-adimlari-kaydir', { taslak: girdi(geri), adimlar: [{ isEmriId: i2, baslangic: a.eskiBaslangic }], geriAl: true });
    assert.equal(tekrar.statusCode, 409, tekrar.body);
  });

  test('öncülden önceye kaydırma (geri al değil) 409; kilitsiz adım 409; kilitleme yetkisi olmayan 403', async () => {
    const { i1, i2, p } = await kur();
    const bas = (await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(p.taslak!.id)}`));
    const erken = await istek(c.planlama, 'POST', '/plan/kilitli-adimlari-kaydir', { taslak: girdi(bas), adimlar: [{ isEmriId: i2, baslangic: gun(4) }], geriAl: false });
    assert.equal(erken.statusCode, 409, erken.body);
    const kilitsiz = await istek(c.planlama, 'POST', '/plan/kilitli-adimlari-kaydir', { taslak: girdi(bas), adimlar: [{ isEmriId: i1, baslangic: gun(9) }], geriAl: false });
    assert.equal(kilitsiz.statusCode, 409, kilitsiz.body);
    // Geri al bayrağı serbest taşıma yolu değildir: kaydırma kaydı yokken ya da kayıttaki eski saatten başka saatle 409.
    const bayrak = await istek(c.planlama, 'POST', '/plan/kilitli-adimlari-kaydir', { taslak: girdi(bas), adimlar: [{ isEmriId: i2, baslangic: gun(1) }], geriAl: true });
    assert.equal(bayrak.statusCode, 409, bayrak.body);
    const yetkisiz = await istek(c.cam, 'POST', '/plan/kilitli-adimlari-kaydir', { taslak: girdi(bas), adimlar: [{ isEmriId: i2, baslangic: gun(9) }], geriAl: false });
    assert.equal(yetkisiz.statusCode, 403, yetkisiz.body);
  });
});
