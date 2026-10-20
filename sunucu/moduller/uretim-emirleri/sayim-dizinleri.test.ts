import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';

// Kişi, iş emri ve makine kırılımı sayımı zaman aralığında okur (Arkon operatör özeti, anomali). Dizin yokken yıllık hacimde her okuma
// tabloyu baştan sona tarıyordu (yük testi 2026-10-18).
describe('uretim_sayimi dizinleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => { ortam = await testVeritabaniKur('sayimdizin'); });
  after(async () => { await ortam?.kaldir(); });

  const dizinler = async (): Promise<Map<string, string>> => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const satirlar = await ortam.sahip.sorgu<{ ad: string; tanim: string }>(
      `SELECT indexname AS ad, indexdef AS tanim FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'uretim_sayimi'`,
    );
    return new Map(satirlar.map((s) => [s.ad, s.tanim.replace(/^.* USING btree /, '')]));
  };

  test('kişi, iş emri ve zaman dizinleri var; sütun sırası kırılım kimliği, sonra zaman', async () => {
    const d = await dizinler();
    assert.equal(d.get('uretim_sayimi_kisi_zaman_idx'), '(kisi_id, zaman)');
    assert.equal(d.get('uretim_sayimi_is_emri_zaman_idx'), '(is_emri_id, zaman)');
    assert.equal(d.get('uretim_sayimi_zaman_idx'), '(zaman)');
    // Var olan dizinler yerinde kalır.
    assert.equal(d.get('uretim_sayimi_emir_idx'), '(emir_id, id)');
    assert.equal(d.get('uretim_sayimi_istasyon_zaman_idx'), '(istasyon_id, zaman)');
  });
});
