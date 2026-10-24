import { expect, tasmaOlc, test } from './ortak.ts';

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

  test.describe('K1 Bugün, Parçalar, Teknik kütüphane, Terimler', () => {
    // Rol ayrımı (muayeneci, mühendis, okuyan) birim testlerindedir: yeni ekran alıma kadar yalnız yöneticide açılır.
    const K1 = [
      ['/kalite-merkezi/yeni', /^(Merhaba .+|Bugün)$/],
      ['/kalite-merkezi/yeni/parcalar', 'Parçalar'],
      ['/kalite-merkezi/yeni/kutuphane', 'Teknik kütüphane'],
      ['/kalite-merkezi/yeni/terimler', 'Terimler'],
    ] as const;
    for (const [yol, baslik] of K1) {
      test(`${yol} açılır, başlığı görünür, hata vermez, taşmaz`, async ({ page, ag, ac }) => {
        await ac(yol);
        await expect(page.getByRole('heading', { level: 2, name: baslik }).filter({ visible: true }).first()).toBeVisible();
        expect(ag.hatalar, 'konsol ve API hataları').toEqual([]);
        expect((await tasmaOlc(page)).belge, 'sayfa yatay taşması').toBe(0);
      });
    }

    test('Terimler araması süzer; kütüphanede sabit bölümler görünür', async ({ page, ac }) => {
      await ac('/kalite-merkezi/yeni/terimler');
      await page.getByLabel('Terim ara').fill('Cpk');
      // Arama açıklamada da arar: Cp'nin açıklaması Cpk geçtiği için o da kalır; terim adı tam eşleşmeyle bakılır.
      await expect(page.getByText('Cpk', { exact: true })).toBeVisible();
      await expect(page.getByText('Cp', { exact: true })).toBeVisible();
      await expect(page.getByText('Kabul edilebilir kalite seviyesi', { exact: false })).toHaveCount(0);
      await ac('/kalite-merkezi/yeni/kutuphane');
      await expect(page.getByRole('heading', { name: 'Geometrik toleranslar (ASME Y14.5 / ISO 1101)' })).toBeVisible();
    });

    test('Bugün ölçüm kısayolu eski çerçevedeki stüdyoya gider, yazma isteği atmaz', async ({ page, ag, ac }) => {
      await ac('/kalite-merkezi/yeni');
      ag.sifirla();
      await page.getByRole('button', { name: /^Ölçüm yap/ }).click();
      await expect(page).toHaveURL(/\/kalite-merkezi\/resimler$/);
      expect(ag.yazmalar).toEqual([]);
    });
  });
  test.describe('K2 Muayene, Lot kabul, Ölçüm analizi, İş emirleri', () => {
    test('muayeneler açılır, yeni muayene formu kaydetmeden kapanır', async ({ page, ac }) => {
      await ac('/kalite-merkezi/yeni/muayeneler');
      await expect(page.getByRole('heading', { name: 'Muayene ve FAI' })).toBeVisible();
      await page.getByRole('button', { name: 'Muayene kaydet' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Dar ekranda Vazgeç gizlidir (bugünkü gibi); pencerenin kapatma düğmesi her genişlikte vardır.
      await page.getByRole('dialog').getByRole('button', { name: 'Kapat' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
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
