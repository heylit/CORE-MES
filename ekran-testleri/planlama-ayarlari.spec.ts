import { expect, tasmaOlc, test } from './ortak.ts';

// 3561: Planlama ayarları tek sayfadır (Ana ve ayrıntı): solda ayar grupları, sağda seçili grup; telefonda önce gruplar, sonra grup.
// Her genişlikte (360, 768, 1280) tam işlevlidir; yatay taşma yoktur.
const GRUPLAR = ['Kontrol: tüm ayarlar', 'Planlama yönü ve zaman', 'Tampon ve risk', 'Kısıtlar', 'Motor', 'Öncelik ve bedel', 'Sistem'] as const;

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('Planlama ayarları: gruplar açılır, adres seçili grubu taşır, Kontrol tablosu ilk maddedir; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
    await ac('/plan/ayarlar');
    await expect(page.getByRole('heading', { name: 'Planlama ayarları' })).toBeVisible({ timeout: 20_000 });
    const gruplar = page.getByRole('navigation', { name: 'Ayar grupları' });
    await expect(gruplar).toBeVisible();
    for (const g of GRUPLAR) await expect(gruplar.getByRole('link', { name: new RegExp(g.split(':')[0]!) }).first()).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3561-ayarlar-liste-${bilgi.project.name}.png` });

    const gec = async (ad: RegExp, bolum: string): Promise<void> => {
      // Telefonda grup listesi görünür kalmayabilir; liste adımındaysa önce ona dönülür.
      if (!(await gruplar.isVisible())) await page.getByRole('link', { name: /Gruplar/ }).first().click();
      await gruplar.getByRole('link', { name: ad }).first().click();
      await expect(page).toHaveURL(new RegExp(`bolum=${bolum}`));
      expect((await tasmaOlc(page)).belge, bolum).toBeLessThanOrEqual(0);
    };

    await gec(/Planlama yönü ve zaman/, 'zaman');
    await expect(page.locator('.tc-pya-bolum').first()).toBeVisible();
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3561-ayarlar-zaman-${bilgi.project.name}.png` });

    await gec(/Motor/, 'motor');
    await expect(page.getByLabel('Sıralama kuralı')).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3561-ayarlar-motor-${bilgi.project.name}.png` });

    await gec(/^Sistem|Sistem/, 'sistem');
    await expect(page.getByLabel('Plan motorunun ufku (gün)')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Plan motorunun zaman dilimi')).toBeVisible();
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3561-ayarlar-sistem-${bilgi.project.name}.png` });

    // Eski adres yeni sayfaya yönlenir.
    await ac('/plan/motor-ayarlari');
    await expect(page).toHaveURL(/\/plan\/ayarlar\?bolum=motor/);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('planlama müdürü', () => {
  test.use({ hesap: 'ornek.mudur' });

  test('Sistem grubunda dört göz kuralı yalnız okunur; yatay taşma yok', async ({ page, ac, ag }, bilgi) => {
    await ac('/plan/ayarlar?bolum=sistem');
    await expect(page.getByRole('heading', { name: 'Planlama ayarları' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Plan onayında dört göz kuralı')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Plan onayında dört göz kuralı')).toHaveCount(0);
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `/tmp/tmiv2-ekran/3561-ayarlar-sistem-mudur-${bilgi.project.name}.png` });
    expect(ag.hatalar).toEqual([]);
  });
});
