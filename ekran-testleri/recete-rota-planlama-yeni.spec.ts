import { expect, test } from './ortak.ts';

// Planlama ekranı (soru 199 b, 270 a; 658 b: plan modülünün sayfası, görünüm şeridi kabuğun ikinci menüsü). Ölçüt bugünkü çerçevedir: her görünümün testi parçasıyla gelir ve eski ekranda bugün çalışan
// davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar; yer tutucu metnine bağlı değildir (görünüm kabın data-gorunum'undan okunur).
test.use({ hesap: 'ornek.yonetici' });

// Şeridin son üç maddesi görünüm değil, ayrı sayfalardır: salt okunur raporlar (782, 1478) ve motor ayarları (811), menünün ikinci grubu.
const GORUNUMLER = ['Planlama motoru', 'Planlama atölyesi', 'Siparişler', 'Maliyetler', 'Genel gider', 'Ek mesai planı', 'Fason planı',
  'Malzeme satın alma planı', 'Terminler', 'Termin ve kâr', 'Yıllık plan', 'Ufuk', 'Sevkiyat', 'Veri sağlığı', 'Plan sağlığı', 'Motor ayarları'];

test.describe('iskelet', () => {
  test('görünüm şeridi tam, her görünüm adresiyle açılır, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/plan');
    await expect(page).toHaveURL(/\/plan$/);
    const serit = page.getByRole('navigation', { name: 'Planlama menüsü' });
    await expect(serit.getByRole('link')).toHaveText(GORUNUMLER.map((g) => new RegExp(`^${g}`)));
    await serit.getByRole('link', { name: /^Sevkiyat/ }).click();
    await expect(page).toHaveURL(/\/plan\/sevkiyat$/);
    await expect(page.locator('[data-gorunum="sevkiyat"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

// Parça yazarları kendi bölümlerini bu dosyada kendi test.describe('P<n> ...') bloğuna yazar (PARCA-SOZLESMESI.md).

// Düzen (kart #517): sade sayfalar eskideki gibi görünüm alanının kenarından içeride durur (1280'de 24px, dar ekranda 16px).
test.describe('düzen', () => {
  test('sade sayfa görünüm alanının kenarından içeride, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/plan/sevkiyat');
    const kok = page.locator('[data-gorunum="sevkiyat"] .tc-py-gorunum > .tc-pyv');
    await expect(kok).toBeVisible();
    const pay = await kok.evaluate((e) => e.getBoundingClientRect().left - (e.parentElement?.getBoundingClientRect().left ?? 0));
    const genis = page.viewportSize()?.width ?? 0;
    expect(pay).toBe(genis < 768 ? 16 : 24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
