import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { isEmriYayinDurumlari } from './disari.ts';

// 2227b: hazırlık matrisinin "yayın" maddesi. Kural kayıt kapısıyla aynıdır (2189-1 a): yalnız taslak (draft) paket ve kaydı olmayan
// paket (TMI taslağı) yayınlanmamıştır; Onayda ve Yayında olan başlar. Paket ve kişi verisi uydurmadır.
describe('arkon iş emri paket yayını, hazırlık maddesi (2227, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const paket = (kimlik: string, status: unknown) => o().sahip.sorgu(
    "INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('pkgs', $1, $2, 1, $3)",
    [kimlik, JSON.stringify({ id: kimlik, no: 'IE-DENEME', status }), kisiId],
  );

  before(async () => {
    ortam = await testVeritabaniKur('arkon_hazirlik_yayin');
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    await paket('tmi-ie-901', 'draft');
    await paket('tmi-ie-902', 'published');
    await paket('tmi-ie-903', 'review');
    await paket('tmi-ie-905-p1', 'published');
    await paket('tmi-ie-905-p2', 'published');
    await paket('tmi-ie-906-p1', 'published');
    await paket('tmi-ie-906-p2', 'draft');
    await paket('tmi-ie-9070', 'published');
  });
  after(async () => { await ortam?.kaldir(); });

  test('taslak ve kaydı olmayan paket yok, yayında ve onayda tamam; istenen her iş emri haritada', async () => {
    const d = await o().vt.okumaTx((db) => isEmriYayinDurumlari(db, [901, 902, 903, 904, 905, 906, 907, 902]));
    assert.deepEqual([...d].sort(([a], [b]) => a - b), [
      [901, { durum: 'yok', secildi: true }],
      [902, { durum: 'tamam', secildi: true }],
      [903, { durum: 'tamam', secildi: true }],
      [904, { durum: 'yok', secildi: true }],
      // Bütünün kaydı yoksa bölünmüş işin parçaları: hepsi yayınlanmışsa tamam, biri taslaksa yok.
      [905, { durum: 'tamam', secildi: true }],
      [906, { durum: 'yok', secildi: true }],
      // Başka iş emrinin kimliği (9070) önek olarak eşleşmez.
      [907, { durum: 'yok', secildi: true }],
    ]);
    assert.equal((await o().vt.okumaTx((db) => isEmriYayinDurumlari(db, []))).size, 0);
  });
});
