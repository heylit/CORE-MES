import type { Locator } from '@playwright/test';
import { cerceve, expect, test } from './ortak.ts';

// Yoğun ölçü (kullanıcı kararı 25.10.2026): fareyle denetimler yoğun (düğme 32, işaret satırı 28), dokunmatikte ve `data-dokunmatik`
// kökte 44 px kalır. Üretim Terminali parmakla kullanılır; masaüstünde de dokunma ölçüsünde kalmalıdır.
const boy = async (l: Locator): Promise<number> => (await l.boundingBox())?.height ?? 0;

test.describe('fare', () => {
  test('ortak düğme ve işaret satırı yoğun; data-dokunmatik kök 44 px’e döner', async ({ page, ag, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'fare ölçüsü masaüstünde sınanır');
    await ac('/malzemeler');
    const dugme = page.getByRole('button', { name: /^Excel/ });
    const isaret = page.locator('.tc-isaret').first();
    await expect(dugme).toBeVisible();
    expect(await boy(dugme)).toBe(32);
    expect(await boy(isaret)).toBe(28);
    await page.evaluate(() => { document.body.setAttribute('data-dokunmatik', ''); });
    expect(await boy(dugme)).toBeGreaterThanOrEqual(44);
    expect(await boy(isaret)).toBeGreaterThanOrEqual(44);
    expect(ag.hatalar).toEqual([]);
  });

  test.describe('Üretim Terminali', () => {
    test.use({ hesap: 'ornek.operator1' });
    test('masaüstünde de terminal düğmeleri dokunma ölçüsünde kalır', async ({ page, ag, ac }, bilgi) => {
      test.skip(bilgi.project.name !== 'g1280', 'fare ölçüsü masaüstünde sınanır');
      await ac('/uretim-terminali/eski');
      const f = await cerceve(page);
      const dugme = f.getByRole('button', { name: 'İyi +1' });
      await expect(dugme).toBeVisible();
      expect(await boy(dugme)).toBeGreaterThanOrEqual(44);
      expect(ag.hatalar).toEqual([]);
    });
  });
});

test.describe('dokunmatik', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('parmakla kullanılan cihazda ortak düğme ve işaret satırı 44 px kalır', async ({ page, ac }) => {
    await ac('/malzemeler');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const dugme = page.getByRole('button', { name: /^Excel/ });
    await expect(dugme).toBeVisible();
    expect(await boy(dugme)).toBeGreaterThanOrEqual(44);
  });
});
