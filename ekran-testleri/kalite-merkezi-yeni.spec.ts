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
  test.describe('K2 Muayene, Lot kabul, Ölçüm analizi, İş emirleri', () => {});
  test.describe('K3 Uygunsuzluk, DÖF, Formlar', () => {
    const GORUNUMLER = [
      ['uygunsuzluklar', /Uygunsuzluklar \(NCR\)/],
      ['dof', /DÖF \/ 8D/],
      ['formlar', /Formlar ve kontrol listeleri/],
    ] as const;

    for (const [yol, baslik] of GORUNUMLER) {
      for (const genislik of [360, 768, 1280]) {
        test(`${yol} ${genislik} genişlikte açılır, yatay taşmaz`, async ({ page, ac }) => {
          await page.setViewportSize({ width: genislik, height: 800 });
          await ac(`/kalite-merkezi/yeni/${yol}`);
          await expect(page.getByRole('heading', { name: baslik })).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        });
      }
    }
  });
  test.describe('K4 Kaynaklar ve Raporlar', () => {});
});
