import { expect, test } from './ortak.ts';

// Kalite Merkezi'nin TS ekranı (199 b): alıma kadar /kalite-merkezi/yeni yolunda, yalnız yöneticide. Bölüm testleri K1-K4 parçalarıyla
// kendi describe bloklarına eklenir; örnek veri değiştiren akış burada yazılmaz.
// Ayarlar sekmesi "Ayarlar ve yedek" adını taşır ama bugünkü gibi "Ayarlar ve veri" penceresini açar; başlık pencereden aranır.

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
      await expect(page.getByRole('heading', { name: 'İş emirleri ve siparişler' })).toBeVisible();
      // Örnek veride iş emri yoksa liste boş durumunu gösterir; varsa tablo.
      await expect(page.getByRole('table', { name: 'İş emirleri ve siparişler' }).or(page.getByRole('status').filter({ hasText: 'CSV olarak aktarabilir' }))).toBeVisible();
    });
  });
  test.describe('K3 Uygunsuzluk, DÖF, Formlar', () => {});
  test.describe('K4 Kaynaklar ve Raporlar', () => {
    for (const [yol, baslik] of [
      ['cihazlar', 'Ölçüm cihazları'], ['tedarikciler', 'Tedarikçi kalitesi'], ['belgeler', 'Belgeler ve sertifikalar'],
      ['kullanicilar', 'Kullanıcılar'], ['gostergeler', 'Kalite göstergeleri'], ['degisiklik-izi', 'Değişiklik izi'],
      ['arsiv', 'Arşiv'], ['ayarlar', 'Ayarlar ve veri'],
    ] as const) {
      test(`${baslik} açılır`, async ({ page, ac }) => {
        await ac(`/kalite-merkezi/yeni/${yol}`);
        await expect(page.getByRole('heading', { name: baslik, exact: true })).toBeVisible();
      });
    }

    test('ölçüm cihazları Kalibrasyon sayfasına götürür', async ({ page, ac }) => {
      await ac('/kalite-merkezi/yeni/cihazlar');
      await page.getByRole('button', { name: 'Kalibrasyon sayfasına git' }).click();
      await expect(page).toHaveURL(/\/kalibrasyon$/);
    });
  });
});
