import { expect, tasmaOlc, test } from './ortak.ts';

// Ortak arayüz sistemi (kart 2155): ikinci menü yana kayar; sığmayan sekmeler "Diğer N" düğmesinin açılır listesindedir, şerit ve
// içerik yerinden oynamaz (karar 2155-7, 2155-12). Pano sayısı büyük ve kalın, veri yokken sayı boyunda yazı çıkmaz (karar 2, 9).
test.use({ hesap: 'ornek.yonetici' });

test('ikinci menü: Diğer listesi görünmeyen sekmeleri verir, şerit yerinde kalır, seçilen sekmeye gider', async ({ page, ag, ac }) => {
  await ac('/stok');
  const kap = page.locator('.tc-ikinci-kap');
  const nav = page.getByRole('navigation', { name: /menüsü$/ });
  await expect(nav).toBeVisible();
  const tasiyor = await nav.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  test.skip(!tasiyor, 'bu genişlikte şerit sığıyor');

  const diger = kap.getByRole('button', { name: /^Diğer sekmeler: \d+$/ });
  await expect(diger).toBeVisible();
  const once = await kap.boundingBox();
  await diger.click();
  const liste = page.getByRole('menu', { name: /^Diğer sekmeler/ });
  await expect(liste).toBeVisible();
  const ogeler = liste.getByRole('menuitem');
  expect(await ogeler.count()).toBeGreaterThan(0);
  // Şerit boyu değişmez; liste ekrandan taşmaz.
  expect((await kap.boundingBox())?.height).toBe(once?.height);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

  const ad = (await ogeler.last().innerText()).replace(/\s*\(\d+\)$/, '').trim();
  await ogeler.last().click();
  await expect(liste).toBeHidden();
  await expect(nav.getByRole('link', { name: new RegExp(ad) })).toHaveAttribute('aria-current', 'page');
  expect(ag.hatalar).toEqual([]);
});

test('sayı kartı: sayı ortak boyda, veri yokken tire ve küçük açıklama', async ({ page, ag, ac }) => {
  // Yöneticinin ana sayfası ortak sayı kartlarıyla dolar.
  await ac('/');
  const kartlar = page.locator('.tc-sayi-karti:visible');
  await expect(kartlar.first()).toBeVisible();
  const olcu = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tc-sayi-deger')].map((d) => ({
    sayisal: d.hasAttribute('data-sayisal'),
    bos: d.hasAttribute('data-bos'),
    boy: parseFloat(getComputedStyle(d).fontSize),
    bosBoy: parseFloat(getComputedStyle(d.querySelector('.tc-sayi-bos') ?? d).fontSize),
  })));
  for (const o of olcu) {
    if (o.sayisal) expect(o.boy).toBe(28);
    if (o.bos) expect(o.bosBoy).toBeLessThanOrEqual(14);
  }
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});
