import { expect, tasmaOlc, test } from './ortak.ts';

// Portal TS ekranı, firma belgeleri (P2): belge takibi ve belge ekleme penceresi her genişlikte açılır, yatay taşmaz, konsol ve
// API hatası vermez; vazgeçilen pencere yazmaz.
const GENISLIKLER = [360, 768, 1280] as const;
const ACILIS_YAZMALARI = ['POST /api/portal/ben/hazirla', 'POST /api/portal/kurulum'];

for (const genislik of GENISLIKLER) {
  test(`Portal yeni ekran: firma belgeleri ${String(genislik)} genişlikte açılır`, async ({ page, ag, ac }) => {
    await page.setViewportSize({ width: genislik, height: 900 });
    await ac('/portal/yeni/docs');
    await expect(page.getByRole('heading', { name: 'Belge takibi' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Belge süzgeci' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: /Belge ekle/ }).click();
    const pencere = page.getByRole('dialog', { name: 'Belge ekle' });
    await expect(pencere).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma (belge ekle)').toBeLessThanOrEqual(0);
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(pencere).toBeHidden();
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar.filter((y) => !ACILIS_YAZMALARI.includes(y))).toEqual([]);
  });
}
