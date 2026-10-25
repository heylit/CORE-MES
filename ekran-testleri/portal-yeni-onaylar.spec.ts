import { expect, tasmaOlc, test } from './ortak.ts';

// Portal TS ekranı, onaylar (P3): onay kutusu ve olmayan onayın sayfası her genişlikte açılır, yatay taşmaz, konsol ve API hatası
// vermez; açılışta portal kullanıcısını hazırlama dışında yazma olmaz.
const GENISLIKLER = [360, 768, 1280] as const;
const ACILIS_YAZMALARI = ['POST /api/portal/ben/hazirla', 'POST /api/portal/kurulum'];

for (const genislik of GENISLIKLER) {
  test(`Portal yeni ekran: onaylar ${String(genislik)} genişlikte açılır`, async ({ page, ag, ac }) => {
    await page.setViewportSize({ width: genislik, height: 900 });
    await ac('/portal/yeni/approvals');
    await expect(page.getByRole('heading', { name: 'Onay kutum' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Onay süzgeci' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Geçerli onay kuralları' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await ac('/portal/yeni/approvals?id=olmayan-onay');
    await expect(page.getByText('Onay kaydı bulunamadı.')).toBeVisible();
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar.filter((y) => !ACILIS_YAZMALARI.includes(y))).toEqual([]);
  });
}
