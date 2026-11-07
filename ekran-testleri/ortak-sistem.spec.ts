import { expect, tasmaOlc, test } from './ortak.ts';

// Ortak arayüz sistemi (kart 2155): ikinci menü yana kayar; gizli sekme olan kenarda ok çıkar, tıklanınca şerit sekme sınırına
// hizalı bir sayfa kayar, yarım sekmeyle başlamaz; fareyle okta beklemek sürekli kaydırır (karar 2225-1 b). Pano sayısı büyük
// ve kalın, veri yokken sayı boyunda yazı çıkmaz (karar 2, 9).
test.use({ hesap: 'ornek.yonetici' });

test('ikinci menü: sağ ok sekme sınırına hizalı bir sayfa kaydırır, sol ok geri getirir', async ({ page, ag, ac }) => {
  await ac('/stok');
  const kap = page.locator('.tc-ikinci-kap');
  const nav = page.getByRole('navigation', { name: /menüsü$/ });
  await expect(nav).toBeVisible();
  const tasiyor = await nav.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  test.skip(!tasiyor, 'bu genişlikte şerit sığıyor');

  await expect(kap.getByRole('button', { name: /Diğer/ })).toHaveCount(0);
  const sag = kap.locator('.tc-ikinci-ok-sag');
  const sol = kap.locator('.tc-ikinci-ok-sol');
  await expect(sag).toBeVisible();
  await expect(sol).toBeHidden();
  const once = await kap.boundingBox();
  await sag.click();
  await expect.poll(() => nav.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(sol).toBeVisible();
  // Kayma bitince sol okun hemen sağındaki ilk sekme tam görünür: yarım sekmeyle başlayan sayfa olmaz.
  await expect.poll(() => nav.evaluate((el) => {
    const pay = el.parentElement?.querySelector<HTMLElement>('.tc-ikinci-ok-sol')?.offsetWidth ?? 0;
    const sinir = el.getBoundingClientRect().left + pay;
    const ilk = [...el.querySelectorAll<HTMLElement>('a[data-anahtar]')].map((a) => a.getBoundingClientRect()).find((k) => k.right > sinir + 1);
    return ilk ? Math.round(ilk.left - sinir) : null;
  })).toBeGreaterThanOrEqual(-1);
  expect((await kap.boundingBox())?.height).toBe(once?.height);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

  for (let i = 0; i < 20 && await sol.isVisible(); i += 1) {
    await sol.click();
    await page.waitForTimeout(400);
  }
  await expect.poll(() => nav.evaluate((el) => el.scrollLeft)).toBeLessThanOrEqual(1);
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
