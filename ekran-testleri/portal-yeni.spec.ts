import { expect, tasmaOlc, test } from './ortak.ts';

// Portal TS ekranı (soru 199 b): ikinci yolda, yalnız yeni ekran kapısından geçene açılır. Her genişlikte açılır, yatay taşmaz,
// konsol ve API hatası vermez; açılışta yalnız portal kullanıcısını hazırlama yazması olur.
const GENISLIKLER = [360, 768, 1280] as const;

for (const genislik of GENISLIKLER) {
  test(`Portal yeni ekran: iş merkezi ${String(genislik)} genişlikte açılır`, async ({ page, ag, ac }) => {
    await page.setViewportSize({ width: genislik, height: 900 });
    await ac('/portal/yeni');
    await expect(page.getByRole('tablist', { name: 'Bölümler' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Yapılacaklar' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar.filter((y) => !['POST /api/portal/ben/hazirla', 'POST /api/portal/kurulum'].includes(y))).toEqual([]);
  });
}

test.describe('kapı', () => {
  test.use({ hesap: 'ornek.satis' });
  test('Portal yeni ekran: kapıdan geçemeyen kişiye hazırlanıyor der', async ({ page, ac }) => {
    await ac('/portal/yeni');
    await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
  });
});
