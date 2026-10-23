import { expect, test } from './ortak.ts';

// Kalite Merkezi'nin TS ekranı (199 b): alıma kadar /kalite-merkezi/yeni yolunda, yalnız yöneticide. Bölüm testleri K1-K4 parçalarıyla
// kendi describe bloklarına eklenir; örnek veri değiştiren akış burada yazılmaz.

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('yeni ekran açılır, bölüm sekmeleri görünür', async ({ page, ac }) => {
    await ac('/kalite-merkezi/yeni');
    await expect(page.getByRole('tab', { name: /Uygunsuzluk/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Kaynaklar/ })).toBeVisible();
  });

  test.describe('K1 Bugün, Parçalar, Teknik kütüphane, Terimler', () => {});
  test.describe('K2 Muayene, Lot kabul, Ölçüm analizi, İş emirleri', () => {
    test('muayeneler açılır, yeni muayene formu kaydetmeden kapanır', async ({ page, ac }) => {
      await ac('/kalite-merkezi/yeni/muayeneler');
      await expect(page.getByRole('heading', { name: 'Muayene ve FAI' })).toBeVisible();
      await page.getByRole('button', { name: 'Muayene kaydet' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Vazgeç' }).click();
    });

    test('lot kabul sihirbazı plan çıkarır', async ({ page, ac }) => {
      await ac('/kalite-merkezi/yeni/lot-kabul');
      await page.getByLabel('Parti büyüklüğü').fill('500');
      await expect(page.getByText(/Kod harfi/).first()).toBeVisible();
    });

    test('ölçüm analizi ve iş emirleri açılır', async ({ page, ac }) => {
      await ac('/kalite-merkezi/yeni/olcum-analizi');
      await expect(page.getByRole('heading', { name: 'Ölçüm analizi (SPC)' })).toBeVisible();
      await ac('/kalite-merkezi/yeni/is-emirleri');
      await expect(page.getByRole('table', { name: 'İş emirleri ve siparişler' })).toBeVisible();
    });
  });
  test.describe('K3 Uygunsuzluk, DÖF, Formlar', () => {});
  test.describe('K4 Kaynaklar ve Raporlar', () => {});
});
