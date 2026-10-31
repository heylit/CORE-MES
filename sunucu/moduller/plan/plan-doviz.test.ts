import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1397 a: döviz sipariş satırının tutarı plan gününün kuruyla TL'ye çevrilir; kur yoksa emrin bedeli bilinmez, sıfır sayılmaz ve ayrıca
// sayılır. Ayrı dosyadır: finans kuru silinemez, bu dosyanın şemasında kalır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): döviz siparişin bedeli plan gününün kuruyla (1397 a)', () => {
  const { c, tamam, yeniAdim, isEmirleriAc, planOku, taslaktaOner, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  before(() => { ({ ortam, yoneticiId } = durum()); });

  test('kursuz EUR emir bedeli bilinmez sayılır, toplama girmez; kur girilince TL karşılığıyla girer ve kurla ölçeklenir', async () => {
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-04-10');
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 1397', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      // Satırın termini 10 gün geçmiş: ceza (%1/gün) işler; tutar EUR.
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, para_birimi, kdv_orani, gecikme_ceza_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-1397', 'onayli', $1, current_date - 40, current_date - 10, 'EUR', 20, 1, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 6000) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
    });
    const p = await taslaktaOner(c.yonetici);
    try {
      assert.equal(p.gostergeler.bedeliBilinmeyenEmir, 1, 'kur yokken bedeli bilinmeyen emir');
      const kursuz = p.gostergeler.maliyetTl!;
      assert.equal(typeof kursuz, 'number');
      const kurYaz = (tarih: string, kur: number) => ortam!.sahip.tx((db) => db.sorgu(
        'INSERT INTO finans_kur (para_birimi, tarih, kur, olusturan_id) VALUES ($1, $2::date, $3, $4)', ['EUR', tarih, kur, yoneticiId]));
      await kurYaz('2000-01-01', 40);
      const kur40 = (await planOku(p.taslak!.id, c.yonetici)).gostergeler;
      assert.equal(kur40.bedeliBilinmeyenEmir, 0, 'kur girilince bedel bilinir');
      assert.ok(kur40.maliyetTl! > kursuz, `${kur40.maliyetTl} > ${kursuz}: EUR emir artık bedava değil`);
      // Daha yeni kur (bugünden önceki son kur geçerlidir) iki katı: ceza TL karşılığıyla iki katına çıkar.
      await ortam!.sahip.tx((db) => db.sorgu("INSERT INTO finans_kur (para_birimi, tarih, kur, olusturan_id) VALUES ('EUR', current_date - 1, 80, $1)", [yoneticiId]));
      const kur80 = (await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl!;
      assert.ok(Math.abs((kur80 - kursuz) - 2 * (kur40.maliyetTl! - kursuz)) <= 2, `${kur80} - ${kursuz} = 2 x (${kur40.maliyetTl} - ${kursuz})`);
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
    }
  });
});
