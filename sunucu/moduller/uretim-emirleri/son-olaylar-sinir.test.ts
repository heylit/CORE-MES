import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { sonOlaylarGetir } from './sorgular/sureler/sorgular.ts';

// Son olaylar her defterde ayrı sınırlanır (2216 İP-6): ilk N satır, sınırsız okumanın ilk N satırıyla aynı olmalıdır; aynı an,
// karışık defter ve "sonra" süzgeci dahil.
describe('uretim-emirleri son olaylar: kol başına sınır sonucu değiştirmez (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  before(async () => {
    ortam = await testVeritabaniKur('uretim_son_olay_sinir');
    const s = o().sahip;
    const kisi = (await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Sınır Deneme') RETURNING id"))!.id;
    const merkez = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SOS', 'Deneme') RETURNING id"))!.id;
    const ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SOSI', 'Deneme', $1) RETURNING id", [merkez]))!.id;
    const emir = (await s.tek<{ id: number }>(
      "INSERT INTO uretim_emri (emir_no, parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('SOS-1', 'P', 'Parça', 10, $1, $2) RETURNING id",
      [ist, kisi]))!.id;
    const neden = (await s.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('SOS-H', 'Deneme', 1) RETURNING id"))!.id;
    // 40 dakikaya yayılmış üç defter; her dakikada birden çok satır ve aynı anda başlatma ile bitirme (eşit an, sıra kuralı).
    const t0 = Date.parse('2026-11-01T06:00:00Z');
    for (let d = 0; d < 40; d += 1) {
      const an = new Date(t0 + d * 60_000).toISOString();
      await s.sorgu("INSERT INTO uretim_kaydi (emir_id, kisi_id, istasyon_id, olay, saglam_adet, zaman) VALUES ($1, $2, $3, 'baslat', NULL, $4)", [emir, kisi, ist, an]);
      if (d % 2 === 0) await s.sorgu("INSERT INTO uretim_kaydi (emir_id, kisi_id, istasyon_id, olay, saglam_adet, zaman) VALUES ($1, $2, $3, 'bitir', 1, $4)", [emir, kisi, ist, an]);
      if (d % 3 === 0) await s.sorgu("INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, zaman) VALUES ($1, $2, $3, $4, $5)", [emir, kisi, ist, d % 6 === 0 ? 'duraklat' : 'devam', an]);
      if (d % 4 === 1) await s.sorgu("INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, zaman) VALUES ($1, $2, $3, 'saglam', 1, $4)", [emir, kisi, ist, an]);
      if (d % 7 === 2) await s.sorgu("INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman) VALUES ($1, $2, $3, 'hurda', 1, $4, false, $5)", [emir, kisi, ist, neden, an]);
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('her N için ilk N satır sınırsız okumanın ilk N satırıdır', async () => {
    const tumu = await sonOlaylarGetir(o().vt, null, 10_000);
    assert.ok(tumu.length > 80, `yeterli satır: ${tumu.length}`);
    for (const n of [1, 3, 7, 20, 50, tumu.length]) assert.deepEqual(await sonOlaylarGetir(o().vt, null, n), tumu.slice(0, n), `n=${n}`);
  });

  test('"sonra" süzgeciyle de aynıdır', async () => {
    const sonra = '2026-11-01T06:15:00Z';
    const tumu = await sonOlaylarGetir(o().vt, sonra, 10_000);
    assert.ok(tumu.every((x) => Date.parse(x.zaman) > Date.parse(sonra)));
    for (const n of [2, 10, 30]) assert.deepEqual(await sonOlaylarGetir(o().vt, sonra, n), tumu.slice(0, n), `n=${n}`);
  });
});
