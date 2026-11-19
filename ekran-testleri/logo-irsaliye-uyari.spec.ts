import type { Page } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3453: son irsaliye okuması reddedildiyse nedeni listenin üstünde yazar. Logo sayfasını açamayan (depo) bağlantı görmez,
// "Sistem yöneticisine iletin." okur; açabilen (yönetici) Logo sayfası bağlantısını görür. Cevap yönlendirilir (örnek veride
// Logo okuması yoktur); her genişlik projesinde (360, 768, 1280) sayfa yatay taşmaz. Veriler uydurmadır.
const ILETI = 'Logo yardımcısı eski sürümde (404), bu okumayı tanımıyor; Logo bilgisayarındaki yardımcı programı güncelleyin.';

async function hataliOkuma(page: Page): Promise<void> {
  await page.route('**/api/logo/irsaliyeler?*', (r) => r.fulfill({
    json: {
      satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50, turler: [{ tur: 1, ad: 'Satın alma', sayi: 0 }], durumlar: [],
      okuma: { acik: true, sonOkuma: null, sonHata: { zaman: new Date().toISOString(), ileti: ILETI } },
    },
  }));
}

test.describe('depo (Logo sayfası yok)', () => {
  test.use({ hesap: 'ornek.depo' });

  test('ret nedeni ve "Sistem yöneticisine iletin." görünür; Logo sayfası bağlantısı yok', async ({ page, ag, ac }) => {
    await hataliOkuma(page);
    await ac('/logo-irsaliyeleri');
    const uyari = page.getByRole('alert').filter({ hasText: 'yapılamadı' });
    await expect(uyari).toContainText(ILETI);
    await expect(uyari).toContainText('Sistem yöneticisine iletin.');
    await expect(uyari.getByRole('link')).toHaveCount(0);
    await expect(page.getByText('Son okuma yapılamadığı için liste güncel olmayabilir.')).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('uyari.png') });
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('ret nedeninin yanında Logo sayfası bağlantısı çıkar', async ({ page, ag, ac }) => {
    await hataliOkuma(page);
    await ac('/logo-irsaliyeleri');
    const uyari = page.getByRole('alert').filter({ hasText: 'yapılamadı' });
    await expect(uyari.getByRole('link', { name: 'Logo sayfasını aç' })).toHaveAttribute('href', '/logo');
    expect(ag.hatalar).toEqual([]);
  });
});
