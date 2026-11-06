import { expect, tasmaOlc, test } from './ortak.ts';

// Ortak arayüz sistemi (kart 2155): ikinci menüde sığmayan sekmeler "Diğer" düğmesiyle satırlara açılır (karar 2155-7), pano sayısı
// büyük ve kalın, veri yokken sayı boyunda yazı çıkmaz (karar 2, 9). Ölçüt her genişlikte aynıdır: açık şerit yatay taşmaz.
test.use({ hesap: 'ornek.yonetici' });

test('ikinci menü: Diğer düğmesi kalan sekmeleri açar, sekme seçilince şerit kapanır', async ({ page, ag, ac }) => {
  await ac('/stok');
  const kap = page.locator('.tc-ikinci-kap');
  const nav = page.getByRole('navigation', { name: /menüsü$/ });
  await expect(nav).toBeVisible();
  const tasiyor = await nav.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  test.skip(!tasiyor, 'bu genişlikte şerit sığıyor');

  const diger = kap.getByRole('button', { name: /^Diğer sekmeler/ });
  await expect(diger).toBeVisible();
  expect((await diger.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(28);
  await diger.click();
  await expect(kap).toHaveAttribute('data-acik', '');
  await expect(kap.getByRole('button', { name: 'Sekmeleri daralt' })).toHaveAttribute('aria-expanded', 'true');

  // Açık şeritte her sekme görünür alandadır ve sayfa yatay taşmaz.
  const sekmeler = nav.getByRole('link');
  const kutu = await nav.boundingBox();
  if (kutu === null) throw new Error('şerit görünmüyor');
  for (const s of await sekmeler.all()) {
    const k = await s.boundingBox();
    expect(k, await s.innerText()).not.toBeNull();
    expect((k?.x ?? 0) + (k?.width ?? 0)).toBeLessThanOrEqual(kutu.x + kutu.width + 1);
  }
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

  await sekmeler.last().click();
  await expect(kap).not.toHaveAttribute('data-acik', '');
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
