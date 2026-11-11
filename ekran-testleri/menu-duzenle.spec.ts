import { expect, test } from './ortak.ts';

// Ana menü (2946, 2951): yönetici olmayan rolde bütün sayfalar açılır gruplardadır; kişi "Menüyü düzenle" ile kendi sık
// kullanılanlarını seçer, seçim sunucuda kişiye yazılır ve yeniden açılışta aynı sırayla menünün üstünde durur.
// Seçim aynı hesaba yazdığı için yalnız masaüstü genişliğinde koşar; şerit görünümü aynı testte daraltılmış genişlikte bakılır.
test.use({ hesap: 'ornek.depo' });

test('gruplar açılıp kapanır; Menüyü düzenle seçimi kaydeder ve menünün üstünde tutar; şeritte grup başlığı simgeli düğmedir', async ({ page, ac, ag }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1280, 'kişiye yazan test tek genişlikte koşar');
  await ac('/stok');
  const menu = page.getByRole('navigation', { name: 'Ana menü' });

  // Açık sayfanın grubu açık gelir ve kapatılabilir; başka grup kapalı gelir, açılınca sayfaları görünür.
  const stok = menu.getByRole('button', { name: 'Stok', exact: true });
  await expect(stok).toHaveAttribute('aria-expanded', 'true');
  await stok.click();
  await expect(stok).toHaveAttribute('aria-expanded', 'false');
  await stok.click();
  const planlama = menu.getByRole('button', { name: 'Planlama', exact: true });
  await expect(planlama).toHaveAttribute('aria-expanded', 'false');
  await expect(menu.getByRole('link', { name: 'Sevkiyat' })).toBeHidden();
  await planlama.click();
  await expect(planlama).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('link', { name: 'Sevkiyat' })).toBeVisible();

  // Seçim: önce temizlenir (önceki koşu kalmış olabilir), sonra iki sayfa seçilir ve sırası değiştirilir.
  const sik = page.getByRole('group', { name: 'Sık kullanılanlar' });
  const duzenle = async () => {
    await menu.getByRole('button', { name: 'Menüyü düzenle' }).click();
    return page.getByRole('dialog', { name: 'Menüyü düzenle' });
  };
  let pencere = await duzenle();
  const temizle = pencere.getByRole('button', { name: 'Temizle' });
  if (await temizle.isVisible()) await temizle.click();
  await pencere.getByRole('checkbox', { name: 'Stok Merkezi' }).check();
  await pencere.getByRole('checkbox', { name: 'Sevkiyat' }).check();
  await pencere.getByRole('button', { name: 'Sevkiyat yukarı' }).click();
  await pencere.getByRole('button', { name: 'Kaydet' }).click();
  await expect(pencere).toBeHidden();
  await expect(sik.getByRole('link')).toHaveText(['Sevkiyat', 'Stok Merkezi']);
  expect(ag.yazmalar).toContain('POST /api/profil/menu-sec');

  // Seçim kişinindir: sayfa yeniden açılınca aynı sırayla gelir.
  await ac('/stok');
  await expect(sik.getByRole('link')).toHaveText(['Sevkiyat', 'Stok Merkezi']);

  // Daraltılmış genişlikte grup başlığı adını ipucu olarak taşır ve tıklanınca açılır.
  await page.setViewportSize({ width: 800, height: 900 });
  const uretim = menu.getByRole('button', { name: 'Üretim', exact: true });
  await expect(uretim).toHaveAttribute('title', 'Üretim');
  await expect(uretim.locator('svg').first()).toBeVisible();
  await uretim.click();
  await expect(uretim).toHaveAttribute('aria-expanded', 'true');
  await page.setViewportSize({ width: 1280, height: 900 });

  // Hesap sonraki koşulara boş bırakılır.
  pencere = await duzenle();
  await pencere.getByRole('button', { name: 'Temizle' }).click();
  await pencere.getByRole('button', { name: 'Kaydet' }).click();
  await expect(pencere).toBeHidden();
  await expect(sik).toHaveCount(0);
  expect(ag.hatalar).toEqual([]);
});
