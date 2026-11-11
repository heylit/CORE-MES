import { expect, test } from './ortak.ts';

// Telefonda vardiya matrisi ve Reçete ve Rota malzeme tablosu 360'ta sayfayı taşırmaz; gün düğmeleri parmak boyundadır.
const tasma = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

for (const yol of ['/ik/vardiya', '/istasyonlar/vardiyalar']) {
  test(`Telefon: ${yol} haftalık matris sayfayı taşırmaz, gün düğmeleri 44 px boyda`, async ({ page, ag, ac }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon genişliği');
    await ac(yol);
    const dugmeler = page.locator('.tc-vr-haftalik .tc-vr-vd');
    await expect(dugmeler.first()).toBeVisible();
    expect(await page.evaluate(tasma)).toBeLessThanOrEqual(0);
    const boylar = await dugmeler.evaluateAll((d) => d.map((e) => e.getBoundingClientRect().height));
    expect(Math.min(...boylar)).toBeGreaterThanOrEqual(44);
    expect(ag.hatalar).toEqual([]);
  });
}

test('Telefon: Reçete ve Rota malzeme listesi sayfayı taşırmaz', async ({ page, ag, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon genişliği');
  await ac('/recete-rota/items');
  await expect(page.locator('.tc-rr2-kaydir').first()).toBeAttached();
  expect(await page.evaluate(tasma)).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});
