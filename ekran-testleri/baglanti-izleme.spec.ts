import { expect, tasmaOlc, test } from './ortak.ts';

// Bağlantı izleme (3313): üç kart, görünüm çipleri ve liste her genişlikte taşmasız; akışlarda okunmamış gelen akış "Henüz okunmadı".
test.use({ hesap: 'ornek.yonetici' });

test('bağlantı izleme: kartlar, çipler ve liste taşmaz; ayrıntı paneli açılır', async ({ page, ag, ac }) => {
  await ac('/guvenlik/baglantilar');
  await expect(page.getByRole('region', { name: 'Gitmeyen belgeler' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Logo yardımcısı' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  const satir = page.getByRole('table', { name: 'Gitmeyen belgeler' }).getByRole('row').nth(1);
  if (await satir.count() > 0 && !(await satir.textContent())?.includes('Gitmeyen belge yok')) {
    await satir.click();
    await expect(page.getByRole('heading', { name: 'Ne yapmalı' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Akışlar' }).click();
  await expect(page.getByText('Henüz okunmadı').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});
