import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Planlama P1 (kart #536): Planlama motoru ve Planlama atölyesi. Örnek veride planlama çalışması ya da çözülmüş plan olabilir de olmayabilir
// de; test iki hali de kabul eder, yazma göndermez (genişlikler aynı veritabanında paralel koşar). Motor gerektiren düğmeler kapalıdır (357 b).
test.use({ hesap: 'ornek.yonetici' });

const tasmaz = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
};

test.describe('P1 Planlama motoru ve atölye', () => {
  test('Planlama motoru açılır: plan varsa özet ve tezgâh haritası, yoksa boş durum; motor düğmesi kapalı, sayfa taşmaz', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan');
    const kap = page.locator('[data-gorunum="plan"]');
    await expect(kap).toBeVisible();
    const ozet = page.getByRole('heading', { name: 'Plan nasıl gidiyor?' });
    const bos = page.getByRole('heading', { name: 'Plan henüz kurulmadı' }).or(page.getByText('Planlama çalışması yok.', { exact: false }));
    await expect(ozet.or(bos).first()).toBeVisible();
    if (await ozet.isVisible()) {
      await expect(page.getByRole('heading', { name: 'Tezgâh haritası' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Planı iyileştir' })).toBeDisabled();
      await page.getByRole('button', { name: 'Çizelge' }).click();
      await expect(page.getByRole('group', { name: 'Tezgâh çizelgesi' })).toBeVisible();
    } else if (await page.getByRole('button', { name: 'Planı kur' }).count()) {
      await expect(page.getByRole('button', { name: 'Planı kur' })).toBeDisabled();
    }
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });

  test('Planlama atölyesi: akış, tezgâh panosu ve Onay ve canlı sekmesi; sayfa taşmaz', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/studio');
    await expect(page.locator('[data-gorunum="studio"]')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Akış' })).toBeVisible();
    await tasmaz(page);
    await page.getByRole('tab', { name: 'Onay ve canlı' }).click();
    await expect(page.getByRole('heading', { name: 'Canlı plan' }).or(page.getByText('Plan senaryoları okunamadı.')).first()).toBeVisible();
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});
