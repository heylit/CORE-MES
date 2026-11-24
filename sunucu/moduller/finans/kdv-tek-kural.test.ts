import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { belgeToplami } from '#paylasilan/finans-motor/kdv.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

describe('KDV tek kural (3674, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  before(async () => {
    ortam = await testVeritabaniKur('finans_kdv_tek_kural');
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('KDV-01: ortak işlev, belge sütunlarıyla (KDV, tevkifat, toplam) her tutar, oran ve tevkifat çiftinde kuruşu kuruşuna aynıdır', async () => {
    const vt = ortam?.vt;
    if (!vt) throw new Error('Test veritabanı açılamadı.');
    const tutarlar = ['0.01', '0.02', '0.07', '0.33', '1.05', '33.33', '99.99', '1000.00', '12345.67', '987654.32'];
    const oranlar = ['0', '1', '8', '10', '18', '20'];
    const tevkifatlar: Array<[number, number] | null> = [null, [2, 10], [5, 10], [7, 10], [9, 10]];
    let sayac = 0;
    for (const tutar of tutarlar) for (const oran of oranlar) for (const tev of tevkifatlar) {
      const satir: { kdv: string; tev: string; toplam: string } | null = await vt.tek<{ kdv: string; tev: string; toplam: string }>(
        `INSERT INTO finans_belge (yon, tur, kategori, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, tevkifat_pay, tevkifat_payda, olusturan_id)
         VALUES ('gider', 'faturasiz', 'personel', '2026-10-01', '2026-10-01', 'TRY', 1, $1, $2, $3, $4, $5)
         RETURNING kdv_tutari::text AS kdv, tevkifat_tutari::text AS tev, toplam::text AS toplam`,
        [tutar, oran, tev?.[0] ?? null, tev?.[1] ?? null, kisiId]);
      const beklenen = belgeToplami(tutar, oran, tev?.[0] ?? null, tev?.[1] ?? null);
      assert.deepEqual({ kdv: satir?.kdv, tev: satir?.tev, toplam: satir?.toplam }, { kdv: beklenen.kdv, tev: beklenen.tevkifat, toplam: beklenen.toplam }, `${tutar} %${oran} ${tev === null ? '-' : `${tev[0]}/${tev[1]}`}`);
      sayac += 1;
    }
    assert.equal(sayac, 300);
  });
});
