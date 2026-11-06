import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanAnaliziCevabi } from '#paylasilan/sozlesme/plan-analiz.ts';
import { tesisGunBasi } from '#paylasilan/zaman.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

const SA = 3_600_000;
const GUN = 24 * SA;

// 2151: planlama analizi ucu gerçek PostgreSQL'de. Canlı yerleşim ve makine kullanımı elle eklenir; veriler uydurmadır.
describe('plan (gerçek PostgreSQL): planlama analizi ucu (2151)', () => {
  const { c, vt, istek, tamam, isEmirleriAc, yeniAdim, durum } = planTestOrtami();
  const yol = '/plan/analiz';

  test('geçmiş haftada gerçek kullanım, ileri haftada canlı plan yükü takvime oranla; yalnız okur; planlama ve müdür okur, operatör 403, oturumsuz 401', async () => {
    const { istasyonA, makineA, operatorId } = durum();
    const bos = await tamam<PlanAnaliziCevabi>(c.planlama, 'GET', yol);
    assert.equal(bos.haftalar.length, 16);
    assert.equal(bos.zamaninda.ornek, 0);
    assert.equal(bos.zamaninda.uyari, null, 'ölçüm yokken uyarı uydurulmaz');
    const a0 = bos.istasyonlar.find((s) => s.istasyonId === istasyonA)!;
    assert.ok(a0.hucreler[9]!.kapasiteDk! > 0, 'tam gün çalışan merkezin gelecek haftası kapasiteli');

    // Gelecek hafta pazartesi 08:00-18:00 makine A'da canlı plan; geçen hafta salı 2 saat gerçek kullanım.
    const gelecekPzt = tesisGunBasi(bos.haftalar[9]!.baslangic);
    const gecenPzt = tesisGunBasi(bos.haftalar[7]!.baslangic);
    const [is] = await isEmirleriAc([yeniAdim()], 5);
    await vt().tx(async (db) => {
      await db.sorgu('INSERT INTO plan_yerlesimi (is_emri_id, makine_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5)',
        [is, makineA, new Date(gelecekPzt + 8 * SA).toISOString(), new Date(gelecekPzt + 18 * SA).toISOString(), operatorId]);
      await db.sorgu(
        `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
         SELECT uretim_emri_id, id, $2, $3, $4, $5::timestamptz, $6::timestamptz, $4 FROM uretim_emirleri_is_emri WHERE id = $1`,
        [is, istasyonA, makineA, operatorId, new Date(gecenPzt + GUN + 10 * SA).toISOString(), new Date(gecenPzt + GUN + 12 * SA).toISOString()]);
    });

    const r = await tamam<PlanAnaliziCevabi>(c.planlama, 'GET', yol);
    const a = r.istasyonlar.find((s) => s.istasyonId === istasyonA)!;
    assert.equal(a.hucreler[9]!.yukDk, 600);
    assert.equal(a.hucreler[9]!.oran, Math.round((600 / a.hucreler[9]!.kapasiteDk!) * 1000) / 10);
    assert.equal(a.hucreler[7]!.yukDk, 120);
    assert.equal(a.hucreler[10]!.yukDk, 0, 'plan olmayan ileri hafta gerçek sıfırdır');
    assert.ok(r.darbogaz !== null);

    const m = await tamam<PlanAnaliziCevabi>(c.mudur, 'GET', yol);
    assert.deepEqual(m.istasyonlar, r.istasyonlar, 'okuma yazmaz; müdür aynı ölçüleri görür');
    assert.equal((await istek(c.operator, 'GET', yol)).statusCode, 403);
    assert.equal((await istek('', 'GET', yol)).statusCode, 401);
  });
});
