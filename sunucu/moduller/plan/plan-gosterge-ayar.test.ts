import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { ONCELIK_AGIRLIGI, oncelikSinifi } from './kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 507 1 a: /plan göstergelerinde eski motorun ayar saati ve öncelik ağırlıklı gecikmesi (salt okuma). Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): ayar saati ve öncelik ağırlıklı gecikme', () => {
  const { c, tamam, yeniAdim, isEmirleriAc, planOku, taslaktaOner } = planTestOrtami();

  test('PL-507-1: taslağın göstergesi yerleşen işin ayarını ve teslimi aşan saati öncelik ağırlığıyla verir; boş canlıda sıfır', async () => {
    const canli = await planOku();
    assert.deepEqual([canli.gostergeler.ayarSaat, canli.gostergeler.agirlikliGecikmeSaat], [0, 0], 'canlıda yerleşen iş yok');
    const dun = tesisGunu(Date.now() - 2 * 86_400_000);
    await isEmirleriAc([yeniAdim({ ayarSuresiDk: 30, birimSureDk: 6 }), yeniAdim({ ayarSuresiDk: 45, birimSureDk: 6 })], 10, dun);
    const p = await taslaktaOner();
    assert.equal(p.gostergeler.ayarSaat, 1.3, '30 + 45 dakika');
    const e = p.emirler.find((x) => x.teslim === dun)!;
    // Teslim sınırı sunucudaki gunSonu ile aynı: ertesi gün başından 1 sn önce. 1 sn fark ağırlıkla çarpılıp bir ondalığa yuvarlanınca sonucu kaydırır.
    const gecikme = (Date.parse(e.bitis!) - (tesisGunBasi(tesisGunu(Date.parse(`${dun}T12:00:00Z`) + 86_400_000)) - 1000)) / 3_600_000;
    assert.ok(gecikme > 0);
    // F-7: ağırlık ham öncelikle değil öncelik sınıfıyladır (öncelik 3 Normal: sınıf 2, ağırlık 2).
    const sinif = oncelikSinifi(e.oncelik);
    assert.ok(sinif !== null && sinif !== e.oncelik, `öncelik ${String(e.oncelik)} sınıfından farklı olmalı`);
    assert.equal(p.gostergeler.agirlikliGecikmeSaat, Math.round(gecikme * (ONCELIK_AGIRLIGI[sinif] ?? 1) * 10) / 10);
    const okunan = await tamam<typeof p>(c.planlama, 'GET', `/plan?taslak=${String(p.taslak!.id)}`);
    assert.deepEqual([okunan.gostergeler.ayarSaat, okunan.gostergeler.agirlikliGecikmeSaat], [p.gostergeler.ayarSaat, p.gostergeler.agirlikliGecikmeSaat], 'okuma aynı göstergeyi verir');
  });
});
