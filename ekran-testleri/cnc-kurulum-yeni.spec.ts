import { expect, test } from './ortak.ts';

// CNC Kurulum TS ekranı (soru 199 b, 209 a). Ölçüt bugünkü çerçevedir (208 a): her görünümün testi parçasıyla gelir ve
// eski ekranda bugün çalışan davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar.
test.use({ hesap: 'ornek.yonetici' });

const GORUNUMLER = ['Ana Sayfa', 'Kurulum', 'Hazırlık', 'Kütüphane', 'Ham Malzeme', 'Oto-CAM', 'G-Kod Sim.', 'Takım Ömrü'];

test.describe('iskelet', () => {
  test('görünüm şeridi tam, her görünüm adresiyle açılır, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni');
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/ana-sayfa$/);
    const serit = page.getByRole('tablist', { name: 'CNC Kurulum görünümleri' });
    await expect(serit.getByRole('tab')).toHaveText(GORUNUMLER);
    await serit.getByRole('tab', { name: 'Takım Ömrü' }).click();
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/takim-omru$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

// Parça yazarları kendi bölümlerini doldurur (PARCA-SOZLESMESI); bölüm boşken atlanır.
for (const [parca, gorunumler] of [
  ['P1 Kurulum ve Hazırlık', 'Kurulum, Hazırlık'],
  ['P2 Kütüphane, Tanımlar, Ana Sayfa', 'Kütüphane, Tanımlar, Ana Sayfa'],
  ['P3 Ham Malzeme ve G-Kod', 'Ham Malzeme, G-Kod Sim.'],
  ['P4 Oto-CAM', 'Oto-CAM'],
  ['P5 Takım Ömrü', 'Takım Ömrü'],
] as const) {
  test.describe(parca, () => {
    test(`${gorunumler}: bugünkü davranış`, () => {
      test.fixme(true, 'parça teslim edilince dolar');
    });
  });
}
