import { expect, test, ustCubukCakisanlar } from './ortak.ts';

// Üst çubukta sayfa başlığı 768 ile 1280 arasındaki her genişlikte tam okunur (gerekirse iki satıra iner, kesilmez) ve
// kısayol ipucu arama kutusundan taşıp yandaki düğmenin üstüne binmez. Genişlikleri test kendisi kurar; bir projede koşar.
const GENISLIKLER = [768, 800, 1024, 1100, 1180, 1280] as const;
const SAYFALAR = [
  { yol: '/finans', baslik: 'Finans ve Muhasebe' },
  { yol: '/cnc-kurulum', baslik: 'CNC Kurulum Motoru' },
] as const;

for (const genislik of GENISLIKLER) {
  test(`${String(genislik)} genişlikte üst çubukta başlık kesilmez, düğmeler üst üste binmez`, async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
    await page.setViewportSize({ width: genislik, height: 800 });
    for (const s of SAYFALAR) {
      await ac(s.yol);
      const baslik = page.locator('h1.tc-kabuk-baslik');
      await expect(baslik).toHaveText(s.baslik);
      const olcu = await baslik.evaluate((e) => ({ yatay: e.scrollWidth - e.clientWidth, dikey: e.scrollHeight - e.clientHeight, en: e.clientWidth }));
      expect(olcu.en, `${s.yol} başlığın genişliği`).toBeGreaterThan(0);
      expect(olcu.yatay, `${s.yol} başlık yatayda kesiliyor`).toBeLessThanOrEqual(0);
      expect(olcu.dikey, `${s.yol} başlık dikeyde kesiliyor`).toBeLessThanOrEqual(0);
      expect(await ustCubukCakisanlar(page), `${s.yol} üst çubukta üst üste binen düğmeler`).toEqual([]);
      const kutu = await page.locator('.tc-kabuk-ust > .tc-arama').boundingBox();
      const tus = page.locator('.tc-kabuk-ust .tc-arama-tus');
      if (kutu !== null && await tus.isVisible()) {
        const t = await tus.boundingBox();
        expect(t === null ? 0 : t.x + t.width, `${s.yol} Ctrl K ipucu arama kutusundan taşıyor`).toBeLessThanOrEqual(kutu.x + kutu.width);
      }
    }
  });
}

// Telefonda düğmeler bir satırı doldurur; sayfa adı onların altındaki kendi satırında tam okunur.
test('360 genişlikte sayfa adı düğmelerin altında kendi satırında kesilmeden okunur', async ({ page, ac }, bilgi) => {
  test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
  await page.setViewportSize({ width: 360, height: 800 });
  // Uzun adlar 360'ta tek satıra sığmaz; ad üç noktayla kesilmez, iki satıra iner (borç #322).
  const uzun = [{ yol: '/malzemeler', baslik: 'Malzemeler ve Hizmetler' }, { yol: '/portal', baslik: 'Müşteri ve Tedarikçi Portalı' }];
  for (const s of [...SAYFALAR, ...uzun, { yol: '/stok', baslik: 'Stok Merkezi' }, { yol: '/uretim-terminali', baslik: 'Üretim Terminali' }]) {
    await ac(s.yol);
    const baslik = page.locator('h1.tc-kabuk-baslik');
    await expect(baslik).toHaveText(s.baslik);
    const olcu = await baslik.evaluate((e) => ({ yatay: e.scrollWidth - e.clientWidth, dikey: e.scrollHeight - e.clientHeight, en: e.clientWidth }));
    expect(olcu.en, `${s.yol} başlığın genişliği`).toBeGreaterThan(0);
    expect(olcu.yatay, `${s.yol} başlık yatayda kesiliyor`).toBeLessThanOrEqual(0);
    expect(olcu.dikey, `${s.yol} başlık dikeyde kesiliyor`).toBeLessThanOrEqual(0);
    const b = await baslik.boundingBox();
    const geri = await page.locator('.tc-kabuk-ust > .tc-arama').boundingBox();
    expect(b !== null && geri !== null && b.y >= geri.y + geri.height, `${s.yol} başlık düğmelerin altında değil`).toBe(true);
    expect(await ustCubukCakisanlar(page), `${s.yol} üst çubukta üst üste binen düğmeler`).toEqual([]);
  }
});

// Bugünkü adlardan uzun bir ad 360'ta tek satıra sığmaz; üç noktayla kesilmez, satıra bölünür (borç #322).
test('360 genişlikte tek satıra sığmayan sayfa adı kesilmez, alt satıra iner', async ({ page, ac }, bilgi) => {
  test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
  await page.setViewportSize({ width: 360, height: 800 });
  await ac('/portal');
  const baslik = page.locator('h1.tc-kabuk-baslik');
  await expect(baslik).toHaveText('Müşteri ve Tedarikçi Portalı');
  const olcu = await baslik.evaluate((e) => {
    const tekSatir = e.getBoundingClientRect().height;
    e.textContent = 'Müşteri ve Tedarikçi Portalı Onay ve Belge Ayarları';
    return { yatay: e.scrollWidth - e.clientWidth, dikey: e.scrollHeight - e.clientHeight, tekSatir, simdi: e.getBoundingClientRect().height };
  });
  expect(olcu.yatay, 'uzun ad yatayda kesiliyor').toBeLessThanOrEqual(0);
  expect(olcu.dikey, 'uzun ad dikeyde kesiliyor').toBeLessThanOrEqual(0);
  expect(olcu.simdi, 'uzun ad alt satıra inmiyor').toBeGreaterThan(olcu.tekSatir);
  expect(await ustCubukCakisanlar(page), 'üst çubukta üst üste binen düğmeler').toEqual([]);
});

test.describe('yetkisiz sayfa', () => {
  test.use({ hesap: 'ornek.operator1' });
  test('yetkisi olmayan sayfanın adresinde üst çubuk o sayfanın adını göstermez', async ({ page, ac }) => {
    await ac('/finans');
    await expect(page.getByText('Yetkiniz yok').first()).toBeVisible();
    await expect(page.locator('h1.tc-kabuk-baslik')).not.toHaveText('Finans ve Muhasebe');
  });
});

// Telefonda yalnız içerik alanı kayar; belge kaymaz, alt menü ekranın altında sabit kalır. Gizli tablo başlığı ya da
// grafik tablosu taşıyan sayfalar belgeyi uzatıyordu.
test('360 genişlikte uzun sayfada belge kaymaz, alt menü ekranın altında kalır', async ({ page, ac }, bilgi) => {
  test.skip(bilgi.project.name !== 'g360', 'telefon düzeni');
  for (const yol of ['/oee', '/istasyonlar', '/guvenlik']) {
    await ac(yol);
    await page.mouse.wheel(0, 2000);
    const olcu = await page.evaluate(() => ({
      tasma: document.documentElement.scrollHeight - innerHeight,
      kayma: scrollY,
      altKenar: Math.round(document.querySelector('.tc-kabuk-alt')?.getBoundingClientRect().bottom ?? -1),
      yukseklik: innerHeight,
    }));
    expect(olcu.tasma, `${yol} belge ekrandan uzun`).toBeLessThanOrEqual(0);
    expect(olcu.kayma, `${yol} belge kaydı`).toBe(0);
    expect(olcu.altKenar, `${yol} alt menü ekranın altında değil`).toBe(olcu.yukseklik);
  }
});

// Üst çubukta yalnız sık kullanılanlar durur (516 a): geri/ileri, başlık, arama, Kayıt gir, Malzeme, Bildirim, kişi; tam ekran
// yalnız çerçeveli sayfada. Seyrek kullanılanlar Hesap menüsündedir.
test.describe('sade üst çubuk', () => {
  test.use({ hesap: 'ornek.yonetici' });
  test('geniş ekranda çubukta yedi düğme kalır; seyrek kullanılanlar Hesap menüsündedir', async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
    await page.setViewportSize({ width: 1440, height: 800 });
    for (const [yol, sayi] of [['/stok', 6], ['/ik', 7]] as const) {
      await ac(yol);
      const ust = page.locator('.tc-kabuk-ust');
      await expect(ust.getByRole('button', { name: 'Ne oldu? Kayıt gir' })).toHaveText('Kayıt gir');
      const gorunen = await ust.locator('button:visible').evaluateAll((l) => l.map((d) => d.getAttribute('aria-label') ?? d.textContent));
      expect(gorunen.length, `${yol}: ${gorunen.join(', ')}`).toBeLessThanOrEqual(sayi);
      for (const ad of ['Yardım ve rehber', 'Ziyaretçilerim', 'Şikayet, istek ve öneri', 'Son yerler']) {
        await expect(ust.getByRole('button', { name: ad, exact: true }), `${yol}: ${ad}`).toBeHidden();
      }
      expect(await ustCubukCakisanlar(page), `${yol} üst çubukta üst üste binen düğmeler`).toEqual([]);
    }
    await page.locator('.tc-kabuk-ust').getByRole('button', { name: 'Hesap', exact: true }).click();
    for (const ad of ['Ziyaretçilerim', 'Şikayet, istek ve öneri', 'Sistem durumu', 'Yardım ve rehber']) {
      await expect(page.getByRole('menuitem', { name: ad }), ad).toBeVisible();
    }
    await page.getByRole('menuitem', { name: 'Ziyaretçilerim' }).click();
    await expect(page.getByRole('dialog', { name: 'Ziyaretçilerim' })).toBeVisible();
  });
});
