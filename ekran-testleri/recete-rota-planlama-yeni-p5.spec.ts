import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Planlama TS ekranı, P5 (Yıllık plan, Ufuk). Örnek veride planlama çalışması ya da çözülmüş plan olmayabilir; ekran o durumda "yok" der.
// Ölçüt: görünüm açılır, sayfa yatay taşmaz, açılış yazma yapmaz ve hata vermez (her genişlikte: 360, 768, 1280).
test.use({ hesap: 'ornek.yonetici' });

const tasma = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('P5 yıllık plan ve ufuk', () => {
  test('yıllık plan açılır; bölümler arasında geçilir, sayfa taşmaz, açılış yazmaz', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/yillik');
    const gorunum = page.locator('[data-gorunum="yillik"]');
    await expect(gorunum).toBeVisible();
    const bolumler = gorunum.getByRole('tablist', { name: 'Yıllık plan bölümleri' });
    const yok = gorunum.getByText(/Planlama çalışması yok|başlangıç günü okunamadı/);
    await expect(bolumler.or(yok).first()).toBeVisible();
    if (await bolumler.isVisible()) {
      await expect(gorunum.getByRole('heading', { name: 'Şimdi ne yapmalı' })).toBeVisible();
      await bolumler.getByRole('tab', { name: 'Tüm ayrıntılar' }).click();
      await expect(gorunum.getByRole('heading', { name: 'Varsayımlar' })).toBeVisible();
      await expect(gorunum.getByRole('group', { name: 'Talep tahmini' })).toBeVisible();
    }
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('ufuk açılır; plan varsa yük ızgarası ve malzeme görünümü, yoksa "önce plan" der; sayfa taşmaz', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/ufuk');
    const gorunum = page.locator('[data-gorunum="ufuk"]');
    await expect(gorunum).toBeVisible();
    const secim = gorunum.getByRole('group', { name: 'Görünüm' });
    const yok = gorunum.getByText(/Önce plan kurulmalı|Planlama çalışması yok|başlangıç günü okunamadı/);
    await expect(secim.or(yok).first()).toBeVisible();
    if (await secim.isVisible()) {
      await secim.getByRole('button', { name: 'Malzeme' }).click();
      await expect(secim.getByRole('button', { name: 'Malzeme' })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
