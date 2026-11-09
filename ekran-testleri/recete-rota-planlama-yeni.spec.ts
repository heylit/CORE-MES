import { expect, test } from './ortak.ts';

// Planlama ekranı (soru 199 b, 270 a; 658 b: plan modülünün sayfası, görünüm şeridi kabuğun ikinci menüsü). Ölçüt bugünkü çerçevedir: her görünümün testi parçasıyla gelir ve eski ekranda bugün çalışan
// davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar; yer tutucu metnine bağlı değildir (görünüm kabın data-gorunum'undan okunur).
test.use({ hesap: 'ornek.yonetici' });

// 2535 a, 2538 b: Atölye ilk maddedir ve kök adrestir; Analiz ve Plan ayarları görünüm değil, ayrı sayfalardır.
const GORUNUMLER = ['Atölye', 'Motor', 'Siparişler', 'Ufuk', 'Sevkiyat', 'Ek mesai planı', 'Fason planı', 'Malzeme', 'Maliyetler', 'Genel gider',
  'Analiz', 'Plan ayarları'];

test.describe('iskelet', () => {
  test('görünüm şeridi tam, her görünüm adresiyle açılır, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/plan');
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.locator('[data-gorunum="studio"]')).toBeVisible();
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

// 2538 b: Analiz tek sayfadır, üç rapor sekmesidir; eski adresler sekmeye gider (2482 ön bakış 1: boş sayfa yok).
test.describe('Analiz sayfası', () => {
  test('eski Plan sağlığı ve Veri sağlığı adresleri Analiz sekmesine gider; sekmeler arasında geçilir, sayfa taşmaz', async ({ page, ac, ag }) => {
    const sekmeler = page.getByRole('tablist', { name: 'Analiz sekmeleri' });
    const menu = page.getByRole('navigation', { name: 'Planlama menüsü' });
    for (const [eski, yeni, ad] of [['/plan/plan-sagligi', '/plan/analiz/plan-sagligi', 'Plan sağlığı'], ['/plan/veri-sagligi', '/plan/analiz/veri-sagligi', 'Veri sağlığı']] as const) {
      await ac(eski);
      await expect(page).toHaveURL(new RegExp(`${yeni}$`));
      await expect(sekmeler.getByRole('tab', { name: new RegExp(`^${ad}`) })).toHaveAttribute('aria-selected', 'true');
      await expect(menu.locator('[aria-current="page"]')).toHaveText(/^Analiz/);
    }
    await sekmeler.getByRole('tab', { name: /^Planlama analizi/ }).click();
    await expect(page).toHaveURL(/\/plan\/analiz$/);
    await expect(page.getByRole('heading', { name: 'Planlama analizi' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar).toEqual([]);
  });
});
