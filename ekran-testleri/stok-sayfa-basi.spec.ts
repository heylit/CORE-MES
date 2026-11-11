import { expect, test } from './ortak.ts';

// Stok sayfa başı: telefonda sabit açıklama iki satırda kesilir ve "Devamı" ile açılır; geniş ekranda kesilmez, düğme yoktur.
// Düğmeler tek satırda yana kayar; birincil eylem ilk yazılır.
test.use({ hesap: 'ornek.yonetici' });

test('Sayfa başı açıklaması: telefonda "Devamı" ile açılır, geniş ekranda tamdır', async ({ page, ag, ac }) => {
  // Stokun en uzun sabit açıklaması bu sayfadadır; 360'ta iki satıra sığmaz.
  await ac('/stok/sahipsiz-statulu');
  const aciklama = page.locator('.tc-stok-aciklama');
  await expect(aciklama).toBeVisible();
  const devami = page.getByRole('button', { name: 'Devamı' });
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    await expect(devami).toHaveCount(0);
    expect(await aciklama.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
  } else {
    await expect(devami).toBeVisible();
    await expect(devami).toHaveAttribute('aria-expanded', 'false');
    await expect(devami).toHaveAttribute('aria-controls', await aciklama.getAttribute('id') ?? '');
    const kisa = (await aciklama.boundingBox())?.height ?? 0;
    expect((await devami.boundingBox())?.height ?? 0, 'dokunma boyu').toBeGreaterThanOrEqual(44);
    await devami.click();
    const kisalt = page.getByRole('button', { name: 'Kısalt' });
    await expect(kisalt).toHaveAttribute('aria-expanded', 'true');
    expect((await aciklama.boundingBox())?.height ?? 0).toBeGreaterThan(kisa);
    expect(await aciklama.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
    await kisalt.click();
    await expect(page.getByRole('button', { name: 'Devamı' })).toBeVisible();
  }
  expect(ag.hatalar).toEqual([]);
});

test('Konumlar: "Konum aç" düğme satırında ilk; telefonda satır tek sıra ve sayfa taşmaz', async ({ page, ag, ac }) => {
  await ac('/stok/konumlar');
  const satir = page.locator('.tc-stok-bas > .tc-stok-eylem');
  await expect(satir.getByRole('button', { name: 'Konum aç' })).toBeVisible();
  expect(await satir.evaluate((e) => (e.firstElementChild?.textContent ?? '').trim())).toBe('Konum aç');
  if ((page.viewportSize()?.width ?? 0) < 768) {
    expect(await satir.evaluate((e) => getComputedStyle(e).flexWrap)).toBe('nowrap');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
  expect(ag.hatalar).toEqual([]);
});
