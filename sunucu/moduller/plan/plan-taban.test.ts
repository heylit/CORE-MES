import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { canliPlan, tabanPlani } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 33 a (kullanıcı kararı, 2026-10-21): taban plan, adımın ilk canlıya alınan yeri; canlıya almayla aynı işlemde yazılır, hiç değişmez.
describe('plan (gerçek PostgreSQL): taban plan', () => {
  const { c, tamam, istek, yeniAdim, isEmirleriAc, planOku, yer, tg, taslaktaOner, durum } = planTestOrtami();
  // PL-ONAY: canlıya yalnız onaydaki taslak alınır; sahibi (varsayılan planlamacı) gönderir, onaydaki sürüm döner. Zaten onaydaysa yeniden
  // gönderilmez.
  const gonder = async (id: number, surum: number, sahip = c.planlama) => {
    const s = (await tamam<SenaryolarCevabi>(sahip, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  let ortam: TestVeritabani | undefined;
  let makineA = 0;
  let makineB = 0;
  before(() => { ({ ortam, makineA, makineB } = durum()); });

  const sahip = () => ortam!.sahip;
  const taban = (isEmriIdleri: number[]) => ortam!.vt.tx((db) => tabanPlani(db, { isEmriIdleri }));
  const reddedilir = (sql: string, params: unknown[] = []) => assert.rejects(sahip().sorgu(sql, params), /yalnız ekleme|değişmez/);
  const canliyaAl = async (p: PlanCevabi, cerez = c.mudur) =>
    tamam<SenaryolarCevabi>(cerez, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
  const planSurumu = async () => (await sahip().tek<{ surum: number }>('SELECT surum FROM plan_durumu'))!.surum;

  test('33-1: ilk canlıya almada adımın yeri, yeni canlı sürüm, senaryo ve kişi tabana yazılır; emirle okunur', async () => {
    const [ie1, ie2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } }), yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    assert.deepEqual(await taban([ie1!, ie2!]), [], 'canlıya almadan taban yok');
    const p = await taslaktaOner();
    assert.deepEqual(await taban([ie1!, ie2!]), [], 'taslak tabana yazmaz');
    await canliyaAl(p);
    const canli = await planOku();
    const t = await taban([ie1!, ie2!]);
    assert.equal(t.length, 2);
    const mudur = (await sahip().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'mudur'"))!.id;
    for (const ie of [ie1!, ie2!]) {
      const s = t.find((x) => x.isEmriId === ie)!;
      assert.deepEqual(s.kaynak, yer(canli, ie).kaynak);
      assert.equal(Date.parse(s.baslangic), Date.parse(yer(canli, ie).baslangic));
      assert.equal(Date.parse(s.bitis), Date.parse(yer(canli, ie).bitis));
      assert.equal(s.planSurumu, await planSurumu());
      assert.equal(s.senaryoId, p.taslak!.id);
      assert.equal(s.yazanKisiId, mudur, 'kişi sunucudan');
      assert.ok(Math.abs(Date.parse(s.zaman) - Date.now()) < 60_000, 'zaman sunucudan');
    }
    assert.equal(t[0]!.uretimEmriId, t[1]!.uretimEmriId, 'iki adım aynı emrin');
    const emirle = await ortam!.vt.tx((db) => tabanPlani(db, { uretimEmriIdleri: [t[0]!.uretimEmriId] }));
    assert.deepEqual(emirle.map((x) => x.isEmriId).sort(), [ie1!, ie2!].sort());
    assert.deepEqual(await ortam!.vt.tx((db) => tabanPlani(db, {})), [], 'süzgeçsiz okuma boş döner');
  });

  test('750-1: güncel canlı yer iş emriyle okunur, taşıyınca değişir; canlıda olmayan adım ve boş girdi boş döner', async () => {
    const [ie] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    const canli = (ids: number[]) => ortam!.vt.tx((db) => canliPlan(db, ids));
    assert.deepEqual(await canli([ie!]), [], 'canlıya almadan yok');
    await canliyaAl(await taslaktaOner());
    const ilk = await canli([ie!]);
    assert.equal(ilk.length, 1);
    assert.equal(Date.parse(ilk[0]!.baslangic), Date.parse(yer(await planOku(), ie!).baslangic));
    let p = await taslaktaOner();
    const yeniBaslangic = new Date(Date.parse(yer(p, ie!).baslangic) + 24 * 3600_000).toISOString();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${ie!}/tasi`, { taslak: tg(p), kaynak: { tur: 'makine', id: makineB }, baslangic: yeniBaslangic });
    await canliyaAl(p);
    const sonra = await canli([ie!]);
    assert.equal(Date.parse(sonra[0]!.baslangic), Date.parse(yer(await planOku(), ie!).baslangic));
    assert.notEqual(sonra[0]!.baslangic, ilk[0]!.baslangic, 'canlı değişti, taban değil');
    assert.deepEqual((await canli([ie!, ie! + 100_000])).map((x) => x.isEmriId), [ie!], 'canlıda olmayan adım yok');
    assert.deepEqual(await canli([]), []);
  });

  test('33-2: sonraki canlıya alma yeri değiştirse de taban değişmez; sonradan plana giren adım kendi ilk yerini alır', async () => {
    const [ie] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    await canliyaAl(await taslaktaOner());
    const once = await taban([ie!]);
    let p = await taslaktaOner();
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${ie!}/tasi`, {
      taslak: tg(p), kaynak: { tur: 'makine', id: makineB }, baslangic: new Date(Date.parse(yer(p, ie!).baslangic) + 24 * 3600_000).toISOString(),
    });
    await canliyaAl(p);
    assert.equal(yer(await planOku(), ie!).kaynak.id, makineB, 'canlı değişti');
    assert.deepEqual(await taban([ie!]), once, 'taban değişmedi');

    const [yeni] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    await canliyaAl(await taslaktaOner());
    const t = await taban([yeni!]);
    assert.equal(t.length, 1);
    assert.equal(t[0]!.planSurumu, await planSurumu());
    assert.ok(t[0]!.planSurumu > once[0]!.planSurumu);
  });

  test('33-3: taban değiştirilemez, silinmez, boşaltılmaz; adım başına ikinci satır kısıtla reddedilir; emir silinse de kalır', async () => {
    const [ie] = await isEmirleriAc([yeniAdim()]);
    await canliyaAl(await taslaktaOner());
    assert.equal((await taban([ie!])).length, 1);
    await reddedilir('UPDATE plan_taban SET baslangic = baslangic - interval \'1 hour\' WHERE is_emri_id = $1', [ie]);
    await reddedilir('DELETE FROM plan_taban WHERE is_emri_id = $1', [ie]);
    await reddedilir('TRUNCATE plan_taban');
    await assert.rejects(sahip().sorgu(
      `INSERT INTO plan_taban (is_emri_id, uretim_emri_id, makine_id, baslangic, bitis, plan_surumu, senaryo_id, yazan_kisi_id)
       SELECT is_emri_id, uretim_emri_id, makine_id, baslangic, bitis, plan_surumu + 1, senaryo_id, yazan_kisi_id FROM plan_taban WHERE is_emri_id = $1`, [ie]),
    /plan_taban_is_emri_tek/);
    await sahip().tx(async (db) => {
      await db.sorgu('DELETE FROM emir_adimi WHERE is_emri_id = $1', [ie]);
      await db.sorgu("DELETE FROM uretim_emirleri_is_emri WHERE id = $1 AND durum = 'bekliyor'", [ie]);
    });
    assert.equal((await taban([ie!])).length, 1, 'emir silinse de taban kalır');
  });

  test('33-4: eşzamanlı iki canlıya almada adımın tabanı tektir ve önce canlıya alınanındır; ikincinin taslağı kardeş olarak kapanır, 409 alır', async () => {
    const [ie] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    const p1 = await taslaktaOner(c.planlama);
    const p2 = await taslaktaOner(c.planlama2);
    assert.notEqual(p1.taslak!.id, p2.taslak!.id);
    const surumlar = [await gonder(p1.taslak!.id, p1.taslak!.surum), await gonder(p2.taslak!.id, p2.taslak!.surum, c.planlama2)];
    const cevaplar = await Promise.all([p1, p2].map((p, i) =>
      istek(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: surumlar[i], cakismalariKabul: true })));
    // 502 a: iki taslak aynı tabandan; kilit sırası plan sürümü önce olduğundan sonuç zamanlamaya bağlı değildir: biri canlıya alınır,
    // öbürü onun kardeşi olarak kapanır ve anlamlı 409 alır.
    assert.deepEqual(cevaplar.map((x) => x.statusCode).sort(), [200, 409]);
    assert.match(cevaplar.find((x) => x.statusCode === 409)!.body, /başka bir taslak canlıya alındığı için kapandı/);
    const t = await taban([ie!]);
    assert.equal(t.length, 1);
    const durumlar = await sahip().sorgu<{ id: number; durum: string }>(
      'SELECT id, durum FROM plan_senaryosu WHERE id = ANY($1::int[]) ORDER BY id', [[p1.taslak!.id, p2.taslak!.id]]);
    const alinan = durumlar.find((x) => x.durum === 'canliya_alindi');
    assert.deepEqual(durumlar.map((x) => x.durum).sort(), ['canliya_alindi', 'vazgecildi']);
    assert.equal(t[0]!.senaryoId, alinan!.id, 'taban canlıya alınan senaryonun');
  });

  test('33-5: yetkisiz canlıya alma tabana yazmaz; vazgeçilen taslak tabana yazmaz', async () => {
    const [ie] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const gonderilen = await gonder(p.taslak!.id, p.taslak!.surum);
    const red = await istek(c.operator, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: gonderilen, cakismalariKabul: true });
    assert.equal(red.statusCode, 403);
    const cekilen = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaydan-cek`, { surum: gonderilen }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!.surum;
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: cekilen });
    assert.deepEqual(await taban([ie!]), []);
  });
});
