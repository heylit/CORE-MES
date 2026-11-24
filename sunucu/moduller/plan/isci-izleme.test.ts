import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { ISCI_BELLEK_SINIRI_MB, hataSonucu, hesapBasladi, isciSinirlari, planHesapDurumu } from './isci-izleme.ts';

describe('plan iş parçacığı izlemesi', () => {
  test('hesap sayaçları: çalışan, toplam, zaman aşımı, bellek ve süre; sıfır uydurulmaz', () => {
    assert.equal(planHesapDurumu().teklif.sonSureMs, null);
    let an = 100;
    const bitir = hesapBasladi('teklif', () => an);
    assert.equal(planHesapDurumu().teklif.calisan, 1);
    an = 350;
    bitir('zaman-asimi');
    bitir('hata');
    const d = planHesapDurumu().teklif;
    assert.deepEqual({ c: d.calisan, t: d.toplam, z: d.zamanAsimi, b: d.bellek, h: d.hata, s: d.sonSureMs, e: d.enUzunSureMs }, { c: 0, t: 1, z: 1, b: 0, h: 0, s: 250, e: 250 });
    hesapBasladi('teklif', () => an)('bellek');
    assert.equal(planHesapDurumu().teklif.bellek, 1);
  });

  test('bellek sınırını aşan iş parçacığı yalnız kendisi ölür, süreç sürer ve hata bellek olarak sınıflanır', async () => {
    const isci = new Worker('const a = []; for (;;) a.push(new Array(1e6).fill(1));', { eval: true, resourceLimits: { ...isciSinirlari(), maxOldGenerationSizeMb: 32 } });
    const hata = await new Promise<unknown>((coz) => { isci.once('error', coz); });
    assert.equal(hataSonucu(hata), 'bellek');
    assert.equal(hataSonucu(new Error('x')), 'hata');
    assert.equal(ISCI_BELLEK_SINIRI_MB, 2048);
  });
});
