import { expect, test } from './ortak.ts';

// Reçete ve Rota menüsü ve yetki. Bölümlerin ekranı recete-rota-yeni.spec.ts'tedir; eski çerçeve 805 ile kalktı. Planlama plan modülünün
// sayfasıdır (658 b).
test.use({ hesap: 'ornek.yonetici' });

test('ikinci menüden bölümler arasında geçilir', async ({ page, ag, ac }) => {
  await ac('/recete-rota/stock');
  const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
  // Planlama ayrı sayfadır (658 b): Reçete ve Rota menüsünde planlama maddesi yoktur.
  await expect(menu.locator('a[href="/recete-rota/plan"]')).toHaveCount(0);
  await menu.locator('a[href="/recete-rota/schema"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL((u) => u.pathname === '/recete-rota/schema');
  await expect(page.getByRole('region', { name: 'Ürün ve rotalar' }).locator('[data-parca="R1"]')).toBeVisible({ timeout: 30_000 });
  expect(ag.hatalar).toEqual([]);
});

test.describe('planlama işlemi olmayan', () => {
  test.use({ hesap: 'ornek.kalite' });

  test('planlama sayfası menüde görünmez (353 a, 195 a)', async ({ page, ac }) => {
    await ac('/recete-rota/schema');
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).locator('a[href="/plan"]')).toHaveCount(0);
    const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
    await expect(menu.locator('a[href="/recete-rota/schema"]').first()).toBeAttached();
    await expect(menu.locator('a[href="/recete-rota/plan"]')).toHaveCount(0);
  });
});

// 195 a: planlama rolü planlama sayfalarını görür; maliyet ve kâr sayfaları birim maliyet okumasını ister (200 a).
test.describe('planlama rolü', () => {
  test.use({ hesap: 'ornek.planlama' });

  test('planlama sayfası açılır; maliyet sayfası açılmaz, menüde görünmez', async ({ page, ac }) => {
    await ac('/plan/maliyet');
    await expect(page.getByText('Bu bölümü görme yetkiniz yok.')).toBeVisible();
    await ac('/plan');
    await expect(page.locator('[data-gorunum="plan"]')).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Planlama menüsü' });
    await expect(menu.locator('a[href="/plan"]').first()).toBeAttached();
    await expect(menu.locator('a[href="/plan/maliyet"]')).toHaveCount(0);
  });
});
