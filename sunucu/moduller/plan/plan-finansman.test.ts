import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1383 a: planın finansman oranı finansın TRY faizidir (aylık x 12 / 365, günlük yüzde); finansta yoksa elle oran kalır. Ayrı dosyadır:
// finans faizi silinemez, bu dosyanın şemasında kalır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): finansman oranı finanstan (1383 a)', () => {
  const { c, tamam, yeniAdim, isEmirleriAc, planOku, taslaktaOner, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  before(() => { ({ ortam, yoneticiId } = durum()); });

  test('finansta TRY faizi yokken elle oran, varken finansın oranı işler; planlama çalışması aynı oranı taşır', async () => {
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-04-10');
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 1412', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-1412', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 240000) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
      await db.sorgu('UPDATE plan_ayari SET finansman_orani_gun = 0.12');
    });
    const p = await taslaktaOner(c.yonetici);
    try {
      const elle = p.gostergeler.maliyetTl;
      assert.equal(typeof elle, 'number');
      // Aylık %36,5 = günlük %1,2: elle oranın (0,12) on katı.
      await ortam!.sahip.tx((db) => db.sorgu(
        "INSERT INTO finans_faiz (para_birimi, gecerlilik_baslangic, aylik_yuzde, olusturan_id) VALUES ('TRY', DATE '2000-01-01', 36.5, $1)", [yoneticiId]));
      const finansli = (await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl!;
      assert.ok(finansli > elle!, `${finansli} > ${elle}`);
      await tamam(c.planlama, 'POST', '/plan/planlama-calismasi/olustur');
      const calisma = (await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi')).calisma as { D: { planAgirlik?: { fin?: number } } } | null;
      assert.ok(calisma !== null);
      assert.ok(Math.abs(calisma.D.planAgirlik!.fin! - (36.5 * 12) / 365) < 1e-9, JSON.stringify(calisma.D.planAgirlik));
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET finansman_orani_gun = NULL'));
    }
  });
});
