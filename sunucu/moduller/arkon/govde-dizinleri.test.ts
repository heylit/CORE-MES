import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { PAKET_ISTEKLERI_SQL, PAKET_KONUMLARI_NO_SQL } from './sorgular.ts';

// Emir numarasıyla paket ve paketle istek aramaları gövde alanına bakar; belge sayısı büyüdükçe depoyu taramamalı.
describe('Arkon gövde alanı aramaları', () => {
  let ortam: TestVeritabani | undefined;

  before(async () => {
    ortam = await testVeritabaniKur('arkongovde');
    const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'deneme-yonetici', parola: 'dogru-parola-1' }));
    await ortam.sahip.sorgu(
      `INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id)
       SELECT 'pkgs', 'p-' || g, jsonb_build_object('no', 'E-' || g, 'machine', 'M' || (g % 20)), 1, $1 FROM generate_series(1, 20000) g`, [kisiId]);
    await ortam.sahip.sorgu(
      `INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id)
       SELECT 'requests', 'r-' || g, jsonb_build_object('pkgId', 'p-' || (g % 5000)), 1, $1 FROM generate_series(1, 20000) g`, [kisiId]);
    await ortam.sahip.sorgu('ANALYZE arkon_belge');
  });

  after(async () => { await ortam?.kaldir(); });

  for (const [ad, sql, dizin] of [
    ['emir numarasıyla paket konumu', PAKET_KONUMLARI_NO_SQL, 'arkon_belge_paket_no_idx'],
    ['paketin istekleri', PAKET_ISTEKLERI_SQL, 'arkon_belge_istek_paket_idx'],
  ] as const) {
    test(`${ad} 40 bin belgede depoyu taramaz`, async () => {
      const plan = JSON.stringify(await ortam?.vt.sorgu(`EXPLAIN (FORMAT JSON) ${sql}`, [ad === 'paketin istekleri' ? 'p-7' : 'E-7']));
      assert.ok(!/"Node Type":"Seq Scan"/.test(plan), plan.slice(0, 600));
      assert.ok(plan.includes(dizin), plan.slice(0, 600));
    });
  }
});
