import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALISMA_DURUMLARI, EMIR_DURUMLARI, IS_EMRI_DURUMLARI } from './uretim-emirleri.ts';
import { CALISMA_DURUMU, EMIR_DURUMU, IS_EMRI_DURUMU, emirDurumuGosterimi } from './emir-durumu.ts';

test('sözlük sözleşmedeki her durumu bir kez adlandırır', () => {
  assert.deepEqual(Object.keys(EMIR_DURUMU).sort(), [...EMIR_DURUMLARI].sort());
  assert.deepEqual(Object.keys(IS_EMRI_DURUMU).sort(), [...IS_EMRI_DURUMLARI].sort());
  assert.deepEqual(Object.keys(CALISMA_DURUMU).sort(), [...CALISMA_DURUMLARI].sort());
  const adlar = Object.values(EMIR_DURUMU).map((d) => d.etiket);
  assert.equal(new Set(adlar).size, adlar.length);
});

test('başlamış emirde ilk kelime "Başladı", canlı durum ikinci parça', () => {
  assert.deepEqual(emirDurumuGosterimi({ durum: 'basladi', calisma: 'durdu' }), { etiket: 'Başladı · Durdu', ton: 'hata' });
  assert.deepEqual(emirDurumuGosterimi({ durum: 'basladi', calisma: null }), { etiket: 'Başladı', ton: 'uyari' });
  assert.equal(emirDurumuGosterimi({ durum: 'planli', calisma: 'calisiyor' }).etiket, 'Planlı');
});

test('kapanış sonucu yalnız bitmiş emirde adı değiştirir', () => {
  assert.equal(emirDurumuGosterimi({ durum: 'bitti', kapanisSonucu: null }).etiket, 'Üretimi bitti');
  assert.equal(emirDurumuGosterimi({ durum: 'bitti', kapanisSonucu: 'tamamlandi' }).etiket, 'Tamamlandı');
  assert.equal(emirDurumuGosterimi({ durum: 'bitti', kapanisSonucu: 'saglamsiz' }).etiket, 'Kapandı (sağlamsız)');
  assert.equal(emirDurumuGosterimi({ durum: 'iptal', kapanisSonucu: 'tamamlandi' }).etiket, 'İptal');
});
