import { expect, test } from './ortak.ts';

// Planlama TS ekranı (soru 199 b, 270 a). Ölçüt bugünkü çerçevedir: her görünümün testi parçasıyla gelir ve eski ekranda bugün çalışan
// davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar; yer tutucu metnine bağlı değildir (görünüm kabın data-gorunum'undan okunur).
test.use({ hesap: 'ornek.yonetici' });

const GORUNUMLER = ['Planlama motoru', 'Planlama atölyesi', 'Siparişler', 'Maliyetler', 'Genel gider', 'Ek mesai planı', 'Fason planı',
  'Malzeme satın alma planı', 'Terminler', 'Termin ve kâr', 'Yıllık plan', 'Ufuk', 'Sevkiyat'];

test.describe('iskelet', () => {
  test('görünüm şeridi tam, her görünüm adresiyle açılır, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/recete-rota/planlama-yeni');
    await expect(page).toHaveURL(/\/recete-rota\/planlama-yeni\/plan$/);
    const serit = page.getByRole('tablist', { name: 'Planlama görünümleri' });
    await expect(serit.getByRole('tab')).toHaveText(GORUNUMLER);
    await serit.getByRole('tab', { name: 'Sevkiyat' }).click();
    await expect(page).toHaveURL(/\/recete-rota\/planlama-yeni\/sevkiyat$/);
    await expect(page.locator('[data-gorunum="sevkiyat"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

// Parça yazarları kendi bölümlerini bu dosyada kendi test.describe('P<n> ...') bloğuna yazar (PARCA-SOZLESMESI.md).

// Düzen (kart #517): sade sayfalar eskideki gibi görünüm alanının kenarından içeride durur (1280'de 24px, dar ekranda 16px).
test.describe('düzen', () => {
  test('sade sayfa görünüm alanının kenarından içeride, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/recete-rota/planlama-yeni/sevkiyat');
    const kok = page.locator('[data-gorunum="sevkiyat"] .tc-py-gorunum > .tc-pyv');
    await expect(kok).toBeVisible();
    const pay = await kok.evaluate((e) => e.getBoundingClientRect().left - (e.parentElement?.getBoundingClientRect().left ?? 0));
    const genis = page.viewportSize()?.width ?? 0;
    expect(pay).toBe(genis < 768 ? 16 : 24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
