import { expect, kesilenBasliklar, tasmaOlc, test } from './ortak.ts';

// Ortak Dosyalar, kayda bağlı klasörler (kart 3288): klasör görünümü ve yönetici Ayarlar'ı 360, 768 ve 1280'de taşmadan açılır.
// Yalnız gezinir; komut düğmelerine basılmaz (örnek veri değişmez).
test.describe('ortak dosyalar, kayda bağlı klasörler', () => {
  test('klasör görünümü: ağaç araması görünür, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/ortak-dosyalar');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Ortak Dosyalar' })).toBeVisible();
    await expect(page.getByLabel('Dosya ara')).toBeVisible();
    if ((page.viewportSize()?.width ?? 0) <= 860) await page.getByRole('button', { name: 'Klasörler', exact: true }).click();
    await expect(page.getByLabel('Klasör ara')).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    expect(await kesilenBasliklar(page)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });

  test('Ayarlar: ikinci menüde, kartları görünür, dosya araması yok, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/ortak-dosyalar/ayarlar');
    await expect(page.getByRole('navigation', { name: /Ortak Dosyalar menüsü/ }).locator('[aria-current="page"]')).toHaveText(/Ayarlar/);
    for (const baslik of ['Müşteriler klasörü', 'Alt klasör şablonu', 'Açılamayan klasörler', 'Mevcut kayıtlar için klasör aç']) {
      await expect(page.getByText(baslik, { exact: true })).toBeVisible();
    }
    await expect(page.getByLabel('Dosya ara')).toHaveCount(0);
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    expect(await kesilenBasliklar(page)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
