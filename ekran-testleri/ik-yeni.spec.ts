import { expect, tasmaOlc, test } from './ortak.ts';

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
test.describe('P4 performans, eğitim, işe alım', () => {
  test.use({ hesap: 'ornek.yonetici' });

  // Motor (211 a) gelene kadar ekran "Hesap motoru hazırlanıyor" der; geldiğinde aynı sayfa başlığıyla açılır. İkisinde de taşma yok.
  for (const [yol, sekme, baslik] of [
    ['/ik/yeni/performans', 'Performans', 'Performans'], ['/ik/yeni/egitim', 'Eğitim', 'Eğitim'], ['/ik/yeni/ise-alim', 'İşe alım', 'İşe alım'],
  ] as const) {
    test(`${sekme} açılır, yatay taşma ve ağ hatası yok, kendiliğinden yazmaz`, async ({ page, ag, ac }) => {
      await ac(yol);
      await expect(page.getByRole('tab', { name: sekme, selected: true })).toBeVisible();
      await expect(page.getByText('Hesap motoru hazırlanıyor').or(page.getByRole('heading', { name: baslik, exact: true }))).toBeVisible();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
      expect(ag.hatalar).toEqual([]);
      expect(ag.yazmalar).toEqual([]);
    });
  }
});
// P5 analiz
// P6 islemlerim
