import { expect, tasmaOlc, test } from './ortak.ts';

// Portal TS ekranı, müşteri teklifleri (P1): liste ve yeni teklif formu her genişlikte açılır, yatay taşmaz, konsol ve API hatası
// vermez; açılışta portal kullanıcısını hazırlama dışında yazma olmaz.
const GENISLIKLER = [360, 768, 1280] as const;
const ACILIS_YAZMALARI = ['POST /api/portal/ben/hazirla', 'POST /api/portal/kurulum'];

for (const genislik of GENISLIKLER) {
  test(`Portal yeni ekran: müşteri teklifleri ${String(genislik)} genişlikte açılır`, async ({ page, ag, ac }) => {
    await page.setViewportSize({ width: genislik, height: 900 });
    await ac('/portal/yeni/sales');
    await expect(page.getByRole('heading', { name: 'Müşteri teklif talepleri' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Teklif süzgeci' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: /Yeni teklif/ }).click();
    await expect(page.getByRole('form', { name: 'Yeni teklif' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Talebi aç' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma (yeni teklif)').toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar.filter((y) => !ACILIS_YAZMALARI.includes(y))).toEqual([]);
  });
}
