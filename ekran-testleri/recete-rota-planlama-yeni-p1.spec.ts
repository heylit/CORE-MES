import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Planlama P1a (kart #536): Planlama motoru kabuğu, plan çubuğu ve nabız, görünüm ve dönem çubuğu, Başka menüsü, Özet'in altı bölümü ve
// Yapılacaklar. Örnek veride çözülmüş plan olabilir de olmayabilir de; test iki hali de kabul eder, yazma göndermez (genişlikler aynı
// veritabanında paralel koşar). Motor gerektiren düğmeler yerinde ve pasiftir (357 b).
test.use({ hesap: 'ornek.yonetici' });

const tasmaz = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => { const g = document.querySelector('.tc-py-gorunum'); return g ? g.scrollWidth - g.clientWidth : 0; })).toBeLessThanOrEqual(0);
};
const BOLUMLER = ['Plan nasıl gidiyor?', 'Siparişler nerede bekliyor?', 'Ne yapmalıyım?', 'Hangi gün hangi tezgâh dolu?', 'Siparişler zamanında bitiyor mu?', 'Süre nereye gidiyor?'];

test.describe('P1a Planlama motoru', () => {
  test('Özet: altı bölüm ve tezgâh haritası ya da boş durum; çubuklar ve Başka menüsü; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan');
    await expect(page.locator('[data-gorunum="plan"]')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Görünüm' }).or(page.getByText('Planlama çalışması yok.')).first()).toBeVisible();
    const ozet = page.getByRole('region', { name: 'Plan nasıl gidiyor?' });
    if (await page.getByText('Planlama çalışması yok.').isVisible()) { await tasmaz(page); return; }
    await expect(ozet.or(page.getByText(/Henüz plan yok/)).first()).toBeVisible();
    if (await ozet.isVisible()) {
      for (const ad of BOLUMLER) await expect(page.getByRole('region', { name: ad })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Tezgâh haritası' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Planı iyileştir' })).toHaveAttribute('aria-disabled', 'true');
      await ozet.getByRole('button', { name: 'Nasıl okunur' }).click();
      await expect(ozet.getByText('Her kart bir ölçü.', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: /Yapılacaklar/ }).click();
      await expect(page.getByRole('dialog', { name: 'Yapılacaklar' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Yapılacaklar' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('button', { name: 'Planı kur' })).toHaveAttribute('aria-disabled', 'true');
    }
    await tasmaz(page);
    await page.getByRole('button', { name: /Başka/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await tasmaz(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ay', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ay', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Keşfet' }).click();
    await expect(page.getByText(/Henüz plan yok|Keşfet: Hazırlanıyor/).first()).toBeVisible();
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});
