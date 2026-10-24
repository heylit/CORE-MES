import { expect, test } from './ortak.ts';

// TS geçişi (199 b, 209 a): Malzemeler'in doğal ekranı ikinci yolda (/malzemeler/yeni-ekran), alıma kadar yalnız yöneticide.
// Her parça kendi `test.describe('M<n> ...')` bloğunu ekler (PARCA-SOZLESMESI.md); M0 yalnız kapıyı ve sekmeleri sınar.
test.describe('M0 iskelet', () => {
  test('yönetici yeni ekranı açar; sekmeler tam görünür, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/malzemeler/yeni-ekran');
    const serit = page.getByRole('tablist', { name: 'Malzemeler ve Hizmetler' });
    await expect(serit).toBeVisible();
    await expect(serit.getByRole('tab', { name: 'Katalog' })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test.describe('kapı', () => {
    test.use({ hesap: 'ornek.depo' });
    test('yönetici olmayan kişi "Bu ekran hazırlanıyor" görür', async ({ page, ac }) => {
      await ac('/malzemeler/yeni-ekran');
      await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
    });
  });
});
