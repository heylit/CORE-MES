import { kapaliModulYoluMu } from '#paylasilan/kapali-moduller.ts';
import { expect, tasmaOlc, test } from './ortak.ts';

// Yeni ekranda kabuk ikinci menü şeridini çizmez (soru 315 a): menünün maddeleri ekranın kendi sekmeleridir, üst üste iki şerit
// kalmaz. Şeridi kendi menüsü olan ekranda şerit durur. Adresler istemci/src/ortak/rota/yeni-ekran-menusu.ts'deki listedir.
test.use({ hesap: 'ornek.yonetici' });

const YENI_EKRANLAR = [
  '/finans',
  '/ik', '/ik-islemlerim', '/mesaj/yeni', '/portal/yeni', '/denetim-hazirlik', '/cnc-kurulum/yeni', '/cnc-kurulum',
].filter((yol) => !kapaliModulYoluMu(yol));

// Ekran başına ayrı test: her açılış kendi süresini alır (tek testte art arda açılış 360'ta sınırı aşıyordu).
for (const yol of YENI_EKRANLAR) {
  test(`${yol}: yeni ekranda kabuğun ikinci menü şeridi yoktur, sayfa yatay taşmaz`, async ({ page, ag, ac }) => {
    await ac(yol);
    await expect(page.locator('.tc-kabuk-icerik')).toBeVisible();
    await expect(page.locator('.tc-ikinci'), yol).toHaveCount(0);
    expect((await tasmaOlc(page)).belge, `${yol}: yatay taşma`).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
  });
}

// Planlama ayrı sayfadır (658 b): şeridi kabuğun Planlama menüsüdür; ekran kendi sekmesini çizmez, tek şerit vardır.
test('Planlama ekranında kabuğun Planlama şeridi durur, seçili madde görünümdür', async ({ page, ac }) => {
  await ac('/plan/terminler');
  const menu = page.getByRole('navigation', { name: 'Planlama menüsü' });
  await expect(menu.locator('[aria-current="page"]')).toHaveText(/^Terminler/);
  await expect(page.locator('.tc-ikinci')).toHaveCount(1);
});

test('eski ekranda kabuğun ikinci menü şeridi durur', async ({ page, ac }) => {
  await ac('/ik');
  await expect(page.getByRole('navigation', { name: 'İnsan Kaynakları menüsü' })).toBeVisible();
});

// Reçete ve Rota'nın yeni ekranı kendi sekmesini çizmez, kabuğun şeridi durur (553 1 a).
for (const [yol, madde] of [['/recete-rota', 'Üretim emirleri'], ['/recete-rota/res', 'Kaynaklar']] as const) {
  test(`${yol}: Reçete ve Rota yeni ekranında kabuğun şeridi durur, tek şerit vardır`, async ({ page, ac }) => {
    await ac(yol);
    const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
    await expect(menu, yol).toBeVisible();
    await expect(menu.locator('[aria-current="page"]'), yol).toHaveText(new RegExp(`^${madde}`));
    await expect(page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' }), yol).toHaveCount(0);
  });
}

// Üretim Hazırlık, Üretim Terminali, Kuyruk, Malzemeler ve Kalite Merkezi de öyle (553 1 a, 2; 979 a). Eski `/eski` adreslerinin
// yeni adrese gitmesi arkon, arkon-yeni ve uretim-terminali testlerinde sınanır (1392 a).
const SERITLI = [
  ['/arkon/pano', 'Üretim Hazırlık', 'Pano'], ['/arkon/kalite', 'Üretim Hazırlık', 'Kalite'],
  ['/uretim-terminali', 'Üretim Terminali', 'Operatör'],
  ['/kuyruk', 'Kuyruk', 'Plan Kuyruğu'],
  ['/malzemeler', 'Malzemeler ve Hizmetler', 'Katalog'], ['/malzemeler/ayarlar', 'Malzemeler ve Hizmetler', 'Malzeme ayarları'],
  ['/kalite-merkezi/dof', 'Kalite Merkezi', 'DÖF'],
] as const;
const TEK_MADDELI = new Set<string>(['Üretim Terminali', 'Kuyruk']);
for (const [yol, menuAdi, madde] of SERITLI) {
  test(`${yol}: yeni ekranda kabuğun şeridi durur`, async ({ page, ac }) => {
    await ac(yol);
    // Telefonda tek maddelik şerit çizilmez (618c); madde DOM'da kalır, seçili madde aynıdır.
    const menu = page.locator(`nav[aria-label="${menuAdi} menüsü"]`);
    if (TEK_MADDELI.has(menuAdi) && (page.viewportSize()?.width ?? 0) < 768) await expect(menu, yol).toBeHidden();
    else await expect(menu, yol).toBeVisible();
    await expect(menu.locator('[aria-current="page"]'), yol).toHaveText(new RegExp(`^${madde}`));
    await expect(page.getByRole('tablist', { name: 'Üretim Hazırlık' }), yol).toHaveCount(0);
  });
}
