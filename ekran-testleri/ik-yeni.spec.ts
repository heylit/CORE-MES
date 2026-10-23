import { expect, test } from './ortak.ts';

// İK'nın TS ekranı (199 b, 209 a): alıma kadar /ik/yeni ve /ik-islemlerim/yeni adresinde, yalnız yöneticide. Her parça (P1-P6)
// kendi ana akışını aşağıda kendi `test.describe` bloğuna ekler; bloklar birbirine dokunmaz.

test.describe('Y0 iskelet', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('İK yeni ekranı açılır, sekmeler ikinci menünün maddeleridir, ağ hatası yok', async ({ page, ag, ac }) => {
    await ac('/ik/yeni');
    await expect(page.getByRole('tab', { name: 'Pano', selected: true })).toBeVisible();
    await page.getByRole('tab', { name: 'İzinler' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/izinler$/);
    await ac('/ik-islemlerim/yeni');
    await expect(page.getByRole('tab', { name: 'Benim sayfam', selected: true })).toBeVisible();
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});

test.describe('Y0 iskelet: kapı', () => {
  test.use({ hesap: 'ornek.mudur' });

  test('yönetici olmayan hesapta "Bu ekran hazırlanıyor" der', async ({ page, ac }) => {
    await ac('/ik-islemlerim/yeni');
    await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
  });
});

// P1 personel
// P2 izin-devam
// P3 bordro
// P4 isealim
// P5 analiz
// P6 islemlerim
