import { expect, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// CNC Kurulum TS ekranı (soru 199 b, 209 a). Ölçüt bugünkü çerçevedir (208 a): her görünümün testi parçasıyla gelir ve
// eski ekranda bugün çalışan davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar.
test.use({ hesap: 'ornek.yonetici' });

const GORUNUMLER = ['Ana Sayfa', 'Kurulum', 'Hazırlık', 'Kütüphane', 'Ham Malzeme', 'Oto-CAM', 'G-Kod Sim.', 'Takım Ömrü'];

test.describe('iskelet', () => {
  test('görünüm şeridi tam, her görünüm adresiyle açılır, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni');
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/ana-sayfa$/);
    const serit = page.getByRole('tablist', { name: 'CNC Kurulum görünümleri' });
    await expect(serit.getByRole('tab')).toHaveText(GORUNUMLER);
    await serit.getByRole('tab', { name: 'Takım Ömrü' }).click();
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/takim-omru$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

// Parça yazarları kendi bölümlerini doldurur (PARCA-SOZLESMESI); bölüm boşken atlanır.
for (const [parca, gorunumler] of [
  ['P1 Kurulum ve Hazırlık', 'Kurulum, Hazırlık'],
  ['P2 Kütüphane, Tanımlar, Ana Sayfa', 'Kütüphane, Tanımlar, Ana Sayfa'],
  ['P4 Oto-CAM', 'Oto-CAM'],
  ['P5 Takım Ömrü', 'Takım Ömrü'],
] as const) {
  test.describe(parca, () => {
    test(`${gorunumler}: bugünkü davranış`, () => {
      test.fixme(true, 'parça teslim edilince dolar');
    });
  });
}

test.describe('P3 Ham Malzeme ve G-Kod', () => {
  const tasmaz = async (page: Page) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };

  test('Ham Malzeme: örnek parça hesaplanır, G-Kod simülasyonuna ham olarak geçer', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni/hammadde');
    await expect(page.getByText('Model yok', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Örnek parça' }).click();
    await expect(page.getByText('Örnek: flanşlı mil (Ø80 × 120)').first()).toBeVisible();
    await expect(page.getByText(/Hammadde ölçüsü · Yuvarlak çubuk/)).toBeVisible();
    await page.getByRole('button', { name: 'G-Kod simülasyonunda kullan' }).click();
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/simulasyon$/);
    await expect(page.getByRole('radio', { name: /Ham Malzeme sayfasından/ })).toBeChecked();
  });

  test('G-Kod Sim.: örnek program yüklenir, takım değişimine gidilir, oynatılır', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni/simulasyon');
    await page.getByRole('button', { name: 'Örnek ISO' }).click();
    await expect(page.getByText('O1001 (ISO)').first()).toBeVisible();
    await page.getByRole('button', { name: /^2\. değişim/ }).click();
    await expect(page.getByText(/^T3 · /).first()).toBeVisible();
    await page.getByRole('button', { name: 'Oynat / duraklat (Boşluk)' }).click();
    await page.keyboard.press('Space');
    await expect(page.getByRole('slider', { name: 'Program zamanı' })).not.toHaveAttribute('aria-valuenow', '0');
  });

  // Projeler her testi 360, 768 ve 1280 genişlikte koşar.
  test('iki görünüm de yatay taşmaz', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni/hammadde');
    await page.getByRole('button', { name: 'Örnek parça' }).click();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible();
    await tasmaz(page);
    await ac('/cnc-kurulum/yeni/simulasyon');
    await expect(page.getByRole('button', { name: 'Program yükle' })).toBeVisible();
    await tasmaz(page);
  });
});
