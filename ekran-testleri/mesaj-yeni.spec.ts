import { expect, test } from './ortak.ts';

// Mesaj yeni ekranı (TS geçişi, 199 b; 209 a): her parça yalnız kendi `test.describe('M<n> ...')` bloğuna yazar.
// Yeni yol alıma kadar yalnız yöneticide açılır (YeniEkranKapisi).

test.describe('M0 iskelet', () => {
  for (const genislik of [360, 768, 1280]) {
    test(`bölüm sekmeleri ${genislik} genişlikte taşmadan açılır`, async ({ page, ac }) => {
      await page.setViewportSize({ width: genislik, height: 800 });
      await ac('/mesaj/yeni');
      const serit = page.getByRole('tablist', { name: 'Mesaj bölümleri' });
      await expect(serit).toBeVisible();
      await expect(serit.getByRole('tab')).toHaveCount(6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'yatay taşma').toBeLessThanOrEqual(0);
    });
  }

  test.describe('operatör', () => {
    test.use({ hesap: 'ornek.operator1' });
    test('yönetici olmayan kişi yeni yolu göremez', async ({ page, ac }) => {
      await ac('/mesaj/yeni');
      await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
      await expect(page.getByRole('tablist', { name: 'Mesaj bölümleri' })).toHaveCount(0);
    });
  });
});
