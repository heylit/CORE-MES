import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { ISCI_BELLEK_SINIRI_MB, ISCI_HAVUZU, beklerkenBitti, hataSonucu, hesapBasladi, isciSinirlari, isciYeriIste, planHesapDurumu, yerHavuzu } from './isci-izleme.ts';
import { teklifDenemesi } from './teklif-denemesi.ts';

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

  test('ortak sınır: en çok sınır kadar yer verilir, sıradaki geliş sırasıyla alır, bekleyen vazgeçebilir', async () => {
    const h = yerHavuzu(2);
    const alinan: string[] = [];
    const a = h.yerIste(); const b = h.yerIste(); const c = h.yerIste(); const d = h.yerIste(); const e = h.yerIste();
    for (const [ad, y] of [['a', a], ['b', b], ['c', c], ['d', d], ['e', e]] as const) void y.hazir.then(() => { alinan.push(ad); });
    await new Promise((coz) => setImmediate(coz));
    assert.deepEqual(alinan, ['a', 'b']);
    assert.deepEqual(h.durum(), { calisan: 2, bekleyen: 3 });
    d.birak();
    assert.deepEqual(h.durum(), { calisan: 2, bekleyen: 2 });
    a.birak();
    a.birak();
    await new Promise((coz) => setImmediate(coz));
    assert.deepEqual(alinan, ['a', 'b', 'c']);
    b.birak();
    await new Promise((coz) => setImmediate(coz));
    assert.deepEqual(alinan, ['a', 'b', 'c', 'e']);
    c.birak(); e.birak();
    assert.deepEqual(h.durum(), { calisan: 0, bekleyen: 0 });
  });

  test('ortak havuz 4 yerdir; dolu havuzda bekleyen hesap süresi dolunca iş parçacığı açmadan zaman aşımı sayılır, kurulamayan hata', async () => {
    assert.equal(ISCI_HAVUZU, 4);
    const dolu = Array.from({ length: ISCI_HAVUZU }, () => isciYeriIste());
    await Promise.all(dolu.map((y) => y.hazir));
    const once = planHesapDurumu().teklif;
    await assert.rejects(teklifDenemesi({} as never, 30), /ms içinde bitmedi/);
    const sonra = planHesapDurumu().teklif;
    assert.deepEqual({ c: sonra.calisan, t: sonra.toplam - once.toplam, z: sonra.zamanAsimi - once.zamanAsimi, h: sonra.hata - once.hata, s: sonra.sonSureMs },
      { c: 0, t: 1, z: 1, h: 0, s: once.sonSureMs });
    for (const y of dolu) y.birak();
    const bos = isciYeriIste();
    await bos.hazir;
    bos.birak();
    const d0 = planHesapDurumu().degerlendirme;
    beklerkenBitti('degerlendirme', 'hata');
    const d1 = planHesapDurumu().degerlendirme;
    assert.deepEqual({ t: d1.toplam - d0.toplam, z: d1.zamanAsimi - d0.zamanAsimi, h: d1.hata - d0.hata }, { t: 1, z: 0, h: 1 });
  });
});
