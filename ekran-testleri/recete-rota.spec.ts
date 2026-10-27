import { cerceve, expect, test } from './ortak.ts';

// Kaynak: kayit/recete-rota/akislar.md R0 (açılış ve plan şeridi), R1 adım 1 (ürün seçimi), durum ekranları.
// Bilinen yanlış davranış (açılışta yazma) burada sınanmaz: degisecek.spec.ts. Reçete ve Rota bölümlerinin çerçevesi eski adrestedir
// (541: menü adresi yeni ekranı açar, recete-rota-yeni.spec.ts). Planlama plan modülünün sayfasıdır (658 b).
test.use({ hesap: 'ornek.yonetici' });

test('Ürün ve rotalar: plan şeridi, ürün seçimi ve görünüm düğmeleri', async ({ page, ag, ac }) => {
  await ac('/recete-rota/eski/schema');
  const f = await cerceve(page);
  const serit = f.getByRole('status').filter({ hasText: /CANLIYA ALINMADI|ONAY BEKLİYOR|PLAN CANLI/ }).first();
  await expect(serit).toBeVisible();
  await expect(f.getByRole('button', { name: 'Onaya gönder' })).toBeVisible();

  await f.getByRole('combobox', { name: 'Şemadaki ürün' }).selectOption({ label: 'MM-ORN-00002 ORNEK Flanş' });
  await expect(f.getByText('MM-ORN-00002 rotası', { exact: true })).toBeVisible();
  await expect(f.getByRole('group', { name: 'Revizyonlar' }).getByRole('button', { name: /Rev A\s*Yürürlükte/ })).toBeVisible();
  await expect(f.getByRole('button', { name: /^10 Torna \(CNC\) ORN-TORNA-2/ })).toBeVisible();

  const gorunum = f.getByRole('group', { name: 'Görünüm' });
  // Prototip arka planda bütün sayfayı yeniden çizebilir (plan sürümü yoklaması: başka bir test planı canlıya alınca). Çizim basma
  // ile bırakma arasına düşerse tıklama düğmeye ulaşmaz; düğme aynı durumu yeniden seçtiği için durum gelene kadar yeniden basılır.
  for (const ad of ['Akış tablosu', 'Akış şeması']) {
    await expect(async () => {
      await gorunum.getByRole('button', { name: ad }).click();
      await expect(gorunum.getByRole('button', { name: ad })).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  }
  expect(ag.hatalar).toEqual([]);
});

test('R1.1: ürün seçicide yalnız mamul ve yarımamul kartı vardır', async ({ page, ac }) => {
  await ac('/recete-rota/eski/schema');
  const f = await cerceve(page);
  const secenekler = await f.getByRole('combobox', { name: 'Şemadaki ürün' }).locator('option').allInnerTexts();
  expect(secenekler.length).toBeGreaterThan(1);
  expect(secenekler.filter((s) => /^(HZ|SF)-/.test(s))).toEqual([]);
});

test('ikinci menüden bölümler arasında geçilir; Reçete ve Rota maddesi yeni ekranı açar', async ({ page, ag, ac }) => {
  await ac('/recete-rota/eski/schema');
  await cerceve(page);
  const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
  // Planlama ayrı sayfadır (658 b): Reçete ve Rota menüsünde planlama maddesi yoktur.
  await expect(menu.locator('a[href="/recete-rota/plan"]')).toHaveCount(0);
  await menu.locator('a[href="/recete-rota/schema"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL((u) => u.pathname === '/recete-rota/schema');
  await expect(page.getByRole('region', { name: 'Ürün ve rotalar' }).locator('[data-parca="R1"]')).toBeVisible({ timeout: 30_000 });
  expect(ag.hatalar).toEqual([]);
});

test.describe('planlama işlemi olmayan', () => {
  test.use({ hesap: 'ornek.kalite' });

  test('planlama sayfası menüde görünmez (353 a, 195 a)', async ({ page, ac }) => {
    // Eski görünüm yalnız yöneticidedir (681 a): şerit yeni ekranda denenir, eski adres kapalıdır.
    await ac('/recete-rota/eski/schema');
    await expect(page.getByRole('heading', { name: 'Yetkiniz yok' })).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
    await ac('/recete-rota/schema');
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).locator('a[href="/plan"]')).toHaveCount(0);
    const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
    await expect(menu.locator('a[href="/recete-rota/schema"]').first()).toBeAttached();
    await expect(menu.locator('a[href="/recete-rota/plan"]')).toHaveCount(0);
  });
});

// 195 a: planlama rolü planlama sayfalarını görür; maliyet ve kâr sayfaları birim maliyet okumasını ister (200 a).
test.describe('planlama rolü', () => {
  test.use({ hesap: 'ornek.planlama' });

  test('planlama sayfası açılır; maliyet sayfası açılmaz, menüde görünmez', async ({ page, ac }) => {
    await ac('/plan/maliyet');
    await expect(page.getByText('Bu bölümü görme yetkiniz yok.')).toBeVisible();
    await ac('/plan');
    await expect(page.locator('[data-gorunum="plan"]')).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Planlama menüsü' });
    await expect(menu.locator('a[href="/plan"]').first()).toBeAttached();
    await expect(menu.locator('a[href="/plan/maliyet"]')).toHaveCount(0);
  });
});
