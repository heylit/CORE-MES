import { expect, tasmaOlc, test } from './ortak.ts';

// Planlama P4: Malzeme satın alma planı (/recete-rota/planlama-yeni/malzplan). Ekran yalnız okur (222 a); örnek veride plan
// kurulmamış olabilir, o zaman "Önce plan kurulmalı." ya da "Planlama çalışması yok." görünür. Üç genişlikte (360, 768, 1280) koşar.
test.use({ hesap: 'ornek.yonetici' });

test.describe('P4 malzeme planı', () => {
  test('görünüm adresiyle açılır, yazmaz, hata vermez, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/recete-rota/planlama-yeni/malzplan');
    await expect(page.locator('[data-gorunum="malzplan"]')).toBeVisible();
    const serit = page.getByRole('tablist', { name: 'Planlama görünümleri' });
    await expect(serit.getByRole('tab', { name: 'Malzeme satın alma planı' })).toHaveAttribute('aria-selected', 'true');
    const plan = page.getByRole('heading', { name: 'Malzeme planı' });
    await expect(plan.or(page.getByText('Planlama çalışması yok.'))).toBeVisible();
    if (await page.getByRole('table', { name: 'Satın alma planı' }).isVisible()) {
      await expect(page.getByRole('tablist', { name: 'Kırılım' })).toBeVisible();
      await page.getByRole('tab', { name: 'Haftalık' }).click();
      await expect(page.getByRole('tab', { name: 'Haftalık' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByText('Plan motoru bağlanınca açılır.')).toBeVisible();
    }
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    // Stok uçlarının yetkisi olmayan hesapta 403 beklenir (ekran planın kopyasına döner); onun dışında hata yok.
    expect(ag.hatalar.filter((h) => !/^403 GET \/api\/stok\//.test(h))).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });

  test.describe('yetki', () => {
    test.use({ hesap: 'ornek.depo' });
    test('yönetici olmayan kişi yeni ekranı görmez', async ({ page, ac }) => {
      await ac('/recete-rota/planlama-yeni/malzplan');
      await expect(page.locator('[data-gorunum="malzplan"]')).toHaveCount(0);
    });
  });
});
