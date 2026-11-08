import { expect, test } from './ortak.ts';

// 2311 S1, 2320 d: "şu an X düzenliyor" şeridi Planlama'nın tek üst alanında, öteki şeritlerle alt alta durur; üç genişlikte sayfa taşmaz ve
// görünüm alanı şeridin altında kalır. Başkasının son yazması ağ katmanında verilir (page.route): yazma gönderilmez, veri uydurmadır.
test.use({ hesap: 'ornek.yonetici' });

for (const yol of ['/plan', '/plan/studio']) {
  test(`düzenleyen şeridi üst alanda (${yol}); sayfa taşmaz, yazma gitmez`, async ({ page, ac, ag }) => {
    await page.route('**/api/plan/planlama-calismasi/duzenleyen', (r) => r.fulfill({
      json: { kisiId: 2_000_000_000, kisi: 'Deneme planlayici', zaman: new Date().toISOString(), surum: 2_000_000_000 },
    }));
    await ac(yol);
    const serit = page.getByRole('region', { name: 'Düzenleyen' });
    await expect(serit).toBeVisible();
    await expect(serit).toContainText('Şu an Deneme planlayici bu planı düzenliyor');
    await expect(page.locator('.tc-py-ust').getByRole('region', { name: 'Düzenleyen' })).toHaveCount(1);
    const s = (await serit.boundingBox())!, g = (await page.locator('.tc-py-gorunum').boundingBox())!;
    expect(g.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
    expect(g.height).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => y.includes('/plan/'))).toEqual([]);
  });
}
