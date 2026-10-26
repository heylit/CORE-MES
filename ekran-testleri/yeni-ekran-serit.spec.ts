import { expect, tasmaOlc, test } from './ortak.ts';

// Yeni ekranda kabuk ikinci menü şeridini çizmez (soru 315 a): menünün maddeleri ekranın kendi sekmeleridir, üst üste iki şerit
// kalmaz. Eski ekranda şerit durur. Adresler istemci/src/ortak/rota/yeni-ekran-menusu.ts'deki listedir.
test.use({ hesap: 'ornek.yonetici' });

const YENI_EKRANLAR = [
  '/recete-rota/planlama-yeni', '/finans/yeni',
  '/ik/yeni', '/ik-islemlerim/yeni', '/mesaj/yeni', '/portal/yeni', '/denetim-hazirlik/yeni', '/cnc-kurulum/yeni',
];

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

test('Planlama yeni ekranında seçili olan yalnız ekranın kendi görünümüdür', async ({ page, ac }) => {
  await ac('/recete-rota/planlama-yeni/plan');
  await expect(page.getByRole('tablist', { name: 'Planlama görünümleri' }).getByRole('tab', { name: 'Planlama motoru', selected: true }))
    .toBeVisible();
  await expect(page.locator('.tc-ikinci-madde-etkin')).toHaveCount(0);
});

test('eski ekranda kabuğun ikinci menü şeridi durur', async ({ page, ac }) => {
  await ac('/ik');
  await expect(page.getByRole('navigation', { name: 'İnsan Kaynakları menüsü' })).toBeVisible();
  await ac('/recete-rota/plan');
  const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[aria-current="page"]')).toContainText('Planlama motoru');
});

// Reçete ve Rota'nın yeni ekranı kendi sekmesini çizmez, kabuğun şeridi durur (553 1 a): Planlama sayfalarına yol kalır.
for (const [yol, madde] of [['/recete-rota', 'Üretim emirleri'], ['/recete-rota/res', 'Kaynaklar'], ['/recete-rota/eski/res', 'Kaynaklar']] as const) {
  test(`${yol}: Reçete ve Rota yeni ekranında kabuğun şeridi durur, tek şerit vardır`, async ({ page, ac }) => {
    await ac(yol);
    const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
    await expect(menu, yol).toBeVisible();
    await expect(menu.locator('[aria-current="page"]'), yol).toHaveText(new RegExp(`^${madde}`));
    await expect(page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' }), yol).toHaveCount(0);
  });
}

// Üretim Hazırlık, Üretim Terminali, Kuyruk, Malzemeler ve Kalite Merkezi de öyle (553 1 a, 2; 572, 582): eski görünümde de seçili madde aynıdır.
const SERITLI = [
  ['/arkon/pano', 'Üretim Hazırlık', 'Pano'], ['/arkon/eski/kalite', 'Üretim Hazırlık', 'Kalite'], ['/arkon/kalite', 'Üretim Hazırlık', 'Kalite'],
  ['/uretim-terminali', 'Üretim Terminali', 'Operatör'], ['/uretim-terminali/eski', 'Üretim Terminali', 'Operatör'],
  ['/kuyruk', 'Kuyruk', 'Plan Kuyruğu'], ['/kuyruk/eski', 'Kuyruk', 'Plan Kuyruğu'],
  ['/malzemeler', 'Malzemeler ve Hizmetler', 'Katalog'], ['/malzemeler/eski/ayarlar', 'Malzemeler ve Hizmetler', 'Malzeme ayarları'],
  ['/kalite-merkezi/dof', 'Kalite Merkezi', 'DÖF'], ['/kalite-merkezi/eski/dof', 'Kalite Merkezi', 'DÖF'],
] as const;
for (const [yol, menuAdi, madde] of SERITLI) {
  test(`${yol}: yeni ekranda kabuğun şeridi durur`, async ({ page, ac }) => {
    await ac(yol);
    const menu = page.getByRole('navigation', { name: `${menuAdi} menüsü` });
    await expect(menu, yol).toBeVisible();
    await expect(menu.locator('[aria-current="page"]'), yol).toHaveText(new RegExp(`^${madde}`));
    await expect(page.getByRole('tablist', { name: 'Üretim Hazırlık' }), yol).toHaveCount(0);
  });
}
