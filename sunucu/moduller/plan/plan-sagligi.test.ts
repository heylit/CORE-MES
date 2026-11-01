import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1478: plan sağlığı ucu gerçek PostgreSQL'de. Ölçüm satırları canlıya almanın yazdığı biçimde (1470) elle eklenir; veriler uydurmadır.

const GUN = 86_400_000;

describe('plan (gerçek PostgreSQL): plan sağlığı ucu', () => {
  const { c, vt, istek, tamam, isEmirleriAc, yeniAdim, taslaktaOner } = planTestOrtami();
  const yol = '/plan/plan-sagligi';

  test('1478: biten emrin termini, ölçüm kaydından tutarlılık ve kayma; yalnız okur; planlama ve müdür okur, operatör 403, oturumsuz 401', async () => {
    const bos = await tamam<PlanSagligiCevabi>(c.planlama, 'GET', yol);
    assert.equal(bos.termin.yuzde, null, 'biten emir yokken sıfır değil boş');
    assert.equal(bos.tutarlilik.yuzde, null);
    assert.equal(bos.veri.sonOlcum, null);

    // Üç gün önce terminli emir dün bitti: geç. Tek adımlı emir, adım bitince emir de bitmiş sayılır.
    const simdi = Date.now();
    const [biten] = await isEmirleriAc([yeniAdim()], 5, tesisGunu(simdi - 3 * GUN));
    await vt().tx((db) => db.sorgu(
      "UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = $2::timestamptz, bitis = $3::timestamptz, saglam_adet = 5 WHERE id = $1",
      [biten, new Date(simdi - 2 * GUN).toISOString(), new Date(simdi - GUN).toISOString()],
    ));
    // Planlı ikinci emir taslağa önerilir; ölçüm satırı o taslağın canlıya alınışı gibi yazılır.
    const [planli] = await isEmirleriAc([yeniAdim()], 5, tesisGunu(simdi + 10 * GUN));
    const p = await taslaktaOner();
    const uretimEmriId = p.yerlesimler.find((y) => y.isEmriId === planli)!.uretimEmriId;
    await vt().tx(async (db) => {
      const kisi = (await db.tek<{ id: number }>('SELECT min(id) AS id FROM kisi'))!.id;
      for (const [gunOnce, degisen, tahmin] of [[3, 0, 5], [1, 1, 7]] as const) {
        const o = (await db.tek<{ id: number }>(
          `INSERT INTO plan_olcumu (plan_surumu, senaryo_id, yazan_kisi_id, zaman, toplam_is, yerlesmeyen_is, geciken_emir, zamaninda_yuzde,
                                    agirlikli_gecikme_saat, degisen_is, yakin_degisen_is, yeni_is, vardiyasiz_is, gelirsiz_emir)
           VALUES (1, $1, $2, $3::timestamptz, 4, 1, 0, NULL, 0, $4, $4, 0, 0, 2) RETURNING id::int AS id`,
          [p.taslak!.id, kisi, new Date(simdi - gunOnce * GUN).toISOString(), degisen],
        ))!.id;
        await db.sorgu('INSERT INTO plan_olcumu_emri (olcum_id, uretim_emri_id, tahmini_bitis, termin) VALUES ($1, $2, $3::timestamptz, NULL)',
          [o, uretimEmriId, new Date(simdi + tahmin * GUN).toISOString()]);
      }
    });

    const r = await tamam<PlanSagligiCevabi>(c.planlama, 'GET', yol);
    assert.deepEqual([r.termin.emir, r.termin.gecKalan, r.termin.yuzde, r.termin.ortancaGecikmeGun], [1, 1, 0, 2]);
    assert.equal(r.tutarlilik.canliyaAlma, 2);
    assert.equal(r.tutarlilik.yuzde, 12.5);
    assert.equal(r.veri.gelirsizEmir, 2);
    assert.equal(r.veri.yerlesmeyenIs, 1);
    assert.equal(r.soz.izlenenEmir, 1);
    assert.equal(r.kayanEmirler.length, 1);
    assert.equal(r.kayanEmirler[0]!.kaymaSaat, 48);
    assert.equal(r.kayanEmirler[0]!.gecmis.length, 2);

    const m = await tamam<PlanSagligiCevabi>(c.mudur, 'GET', yol);
    // Veri eksikleri okuyanın yetkisiyle sayılır (veri sağlığı); ölçüler aynıdır.
    assert.deepEqual([m.termin, m.soz, m.tutarlilik, m.uyum, m.kayanEmirler], [r.termin, r.soz, r.tutarlilik, r.uyum, r.kayanEmirler], 'okuma yazmaz; müdür aynı ölçüleri görür');
    assert.equal((await istek(c.operator, 'GET', yol)).statusCode, 403);
    assert.equal((await istek('', 'GET', yol)).statusCode, 401);
  });
});
