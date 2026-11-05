import { expect, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// Ok tuşları odaktaki gezinme öğesine değil görünüme gider (kart 1922): üst şeritte sekmeye fareyle tıklanınca odak sekmede kalır;
// sağ ve sol ok sekmeyi değiştirmemeli, çarkın seçimini değiştirmelidir. Tab ile sekmeye gelen kullanıcı sekmelerde gezinir.
test.use({ hesap: 'ornek.yonetici' });

const odakSirasi = (page: Page): Promise<number> => page.evaluate(() => {
  const kart = document.querySelector('.tc-cy-ka-satir[data-aktif] [data-odak]');
  return kart?.parentElement ? [...kart.parentElement.children].indexOf(kart) : -1;
});

test('fareyle seçilen sekmede oklar çarkı gezer, sekme değişmez', async ({ page, ac, ag }) => {
  await ac('/cnc-kurulum/yeni/ana-sayfa');
  const sekme = page.getByRole('tab', { name: 'Kurulum' });
  await sekme.click();
  await expect(sekme).toBeFocused();
  const aktifNo = page.locator('.tc-cy-ka-satir[data-aktif] .tc-cy-ka-no');
  await expect(aktifNo).toHaveText('01');
  const kartSayisi = await page.locator('.tc-cy-ka-satir[data-aktif] .tc-cy-ka-kart').count();
  const once = await odakSirasi(page);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/kurulum$/);
  await expect(sekme).toHaveAttribute('aria-selected', 'true');
  expect(kartSayisi).toBeGreaterThan(1);
  await expect.poll(() => odakSirasi(page)).not.toBe(once);
  await page.keyboard.press('ArrowDown');
  await expect(aktifNo).toHaveText('02');
  await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/kurulum$/);
  expect(ag.hatalar).toEqual([]);
});

test('Tab ile gelinen sekmede oklar sekmeler arasında gezer', async ({ page, ac }) => {
  await ac('/cnc-kurulum/yeni/ana-sayfa');
  const sekme = page.getByRole('tab', { name: 'Kurulum' });
  await sekme.click();
  await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/kurulum$/);
  // Adres şeritten önce değişir; şerit seçimi çizmeden basılan tuş eski sekme sırasında (Kurulum tabindex -1) gezer.
  await expect(sekme).toHaveAttribute('aria-selected', 'true');
  // Odak sekmeden bir önceki durağa çıkar, sonra tek Tab ile sekmeye döner. Gövdeden Tab'la yürümek bütün ana menüden geçer;
  // menüye her sayfa eklendiğinde adım sayısı değişirdi.
  await page.keyboard.press('Shift+Tab');
  await expect(sekme).not.toBeFocused();
  await page.keyboard.press('Tab');
  await expect(sekme).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/hazirlik$/);
});
