import { expect, kesilenBasliklar, tasmaOlc, test } from './ortak.ts';

// TS geçişi (199 b, 209 a): Malzemeler'in doğal ekranı ikinci yolda (/malzemeler/yeni-ekran), alıma kadar yalnız yöneticide.
// Her parça kendi `test.describe('M<n> ...')` bloğunu ekler (PARCA-SOZLESMESI.md); M0 yalnız kapıyı ve sekmeleri sınar.
test.describe('M0 iskelet', () => {
  test('yönetici yeni ekranı açar; sekmeler tam görünür, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/malzemeler/yeni-ekran');
    const serit = page.getByRole('tablist', { name: 'Malzemeler ve Hizmetler' });
    await expect(serit).toBeVisible();
    await expect(serit.getByRole('tab', { name: 'Katalog' })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test.describe('kapı', () => {
    test.use({ hesap: 'ornek.depo' });
    test('yönetici olmayan kişi "Bu ekran hazırlanıyor" görür', async ({ page, ac }) => {
      await ac('/malzemeler/yeni-ekran');
      await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
    });
  });
});

test.describe('M1 yeni kart sihirbazı', () => {
  // Yalnız gezinir; kayıt düğmesine basılmaz (örnek veri değişmez).
  test('sihirbaz taşmadan açılır; adımlar, gövde ve alt çubuk görünür, föy dar ekranda açılıp kapanır', async ({ page, ag, ac }) => {
    await ac('/malzemeler/yeni-ekran/kart');
    await expect(page.getByRole('heading', { name: 'Yeni malzeme kartı' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Adımlar' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sihirbaz' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    const genislik = page.viewportSize()?.width ?? 0;
    const foyDugmesi = page.getByRole('button', { name: /Föyü (göster|gizle)/ });
    if (genislik < 1100) {
      await expect(foyDugmesi).toBeVisible();
      await foyDugmesi.click();
      await expect(foyDugmesi).toHaveAttribute('aria-expanded', 'true');
    } else {
      await expect(foyDugmesi).toBeHidden();
    }
    expect(await kesilenBasliklar(page)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });

  test('türle açılış (sarf): İleri düğmesi ekranın içinde, yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/malzemeler/yeni-ekran/kart?tur=sarf');
    await expect(page.getByRole('heading', { name: 'Yeni malzeme kartı' })).toBeVisible();
    const ileri = page.getByRole('navigation', { name: 'Sihirbaz' }).getByRole('button', { name: 'İleri' });
    await expect(ileri).toBeVisible();
    const k = await ileri.boundingBox();
    const g = page.viewportSize();
    expect(k && g && k.x + k.width <= g.width, 'İleri düğmesi ekranda').toBeTruthy();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
