import { ADRES, expect, test } from './ortak.ts';

// Üretim Hazırlık TS ekranı (Soru 271 c). Ölçüt bugünkü çerçevedir: her sayfanın testi parçasıyla gelir ve eski ekranda bugün
// çalışan davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar; bölümlerin içine bakmaz.
test.use({ hesap: 'ornek.yonetici' });

test.describe('A0 iskelet', () => {
  test('kök adres Pano\'yu açar; sekmeden sayfa değişir; çerçeve yok, başka kökene istek yok, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    const disari: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(ADRES) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) disari.push(r.url()); });
    await ac('/arkon/yeni');
    await expect(page).toHaveURL(/\/arkon\/yeni\/pano$/);
    const serit = page.getByRole('tablist', { name: 'Üretim Hazırlık' });
    await expect(serit.getByRole('tab').first()).toHaveText('Operatör');
    await expect(page.getByRole('region', { name: 'Pano' })).toBeVisible();
    await serit.getByRole('tab', { name: 'Kalite' }).click();
    await expect(page).toHaveURL(/\/arkon\/yeni\/kalite$/);
    await expect(page.getByRole('region', { name: 'Kalite' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(disari).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

// Parça yazarları kendi bölümlerini doldurur (yeni/PARCA-SOZLESMESI.md); bölüm boşken atlanır.
for (const [parca, sayfalar] of [
  ['A1 Operatör', 'Operatör, Önizleme'],
  ['A2 Hazırlık', 'Üretim Terminali Hazırlık'],
  ['A3 Pano ve kuyruk', 'Pano, Plan Kuyruğu, Kuyruk, Üretim Anomalisi'],
  ['A4 Kalite, bakım, raporlar', 'Kalite, Bakım, Raporlar'],
  ['A5 Çizim', 'Çizim'],
  ['A6 Ayarlar ve çağrı bandı', 'Ayarlar, çağrı bandı'],
] as const) {
  test.describe(parca, () => {
    test(`${sayfalar}: bugünkü davranış`, () => {
      test.fixme(true, 'parça teslim edilince dolar');
    });
  });
}
