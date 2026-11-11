import { expect, test } from './ortak.ts';

// Telefonda ortak tablo araç çubuğu: süzgeç çipleri tek satırda yana kayar, sağ kenar solar; yazı alanı iOS'u büyütmez.
test.use({ hesap: 'ornek.depo' });

test('Telefon: süzgeç çipleri tek satır, yana kayar; arama yazısı 16 px altına inmez', async ({ page, ag, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon genişliği');
  await ac('/stok/malzemeler');
  const grup = page.getByRole('group', { name: 'Durum' });
  await expect(grup).toBeVisible();
  const satir = await grup.evaluate((e) => {
    const kutu = e.closest('.tc-tablo-cipler') ?? e;
    const s = getComputedStyle(kutu);
    const ustler = new Set([...kutu.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top)));
    return { sarma: s.flexWrap, tasma: s.overflowX, maske: s.maskImage, satirSayisi: ustler.size };
  });
  expect(satir.sarma).toBe('nowrap');
  expect(satir.tasma).toBe('auto');
  expect(satir.maske, 'sağ kenar solmuyor').toContain('linear-gradient');
  expect(satir.satirSayisi, 'çipler alt satıra indi').toBe(1);
  const arama = page.getByRole('searchbox').first();
  await expect(arama).toBeVisible();
  expect(await arama.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});
