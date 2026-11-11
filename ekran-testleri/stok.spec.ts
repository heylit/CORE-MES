import { expect, test } from './ortak.ts';

// Kaynak: kayit/stok/ozellikler.md:128 (depocu çubuğu sayfalamayı örtmez) ve :71 (Durum ve teslim paneli sekmeleri kesilmez).
test.use({ hesap: 'ornek.depo' });

type Kutu = { x: number; y: number; width: number; height: number };
const kesisir = (a: Kutu, b: Kutu): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;

test('Hareketler: kayarken depocu çubuğu sayfalamayı örtmez', async ({ page, ag, ac }) => {
  // Sayfalama yalnız satır varken çizilir; stok modülünün örnek verisi yok (sunucu/moduller/stok/ornek-veri.ts).
  test.fixme(true, 'stok örnek verisi gelince açılır');
  await ac('/stok/hareketler');
  const sayfalama = page.locator('.tc-stok nav.tc-sayfalama');
  const cubuk = page.getByRole('navigation', { name: 'Depocu kısayolları' });
  await expect(sayfalama).toBeVisible();
  await expect(cubuk).toBeVisible();
  const yukseklik = page.viewportSize()?.height ?? 0;
  const toplam = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= toplam; y += Math.max(1, Math.floor(yukseklik / 3))) {
    await page.evaluate((konum) => { window.scrollTo(0, konum); }, y);
    const [s, c] = [await sayfalama.boundingBox(), await cubuk.boundingBox()];
    if (s !== null && c !== null) expect(kesisir(s, c), `kaydırma ${String(y)} px'te çubuk sayfalamanın üstünde`).toBe(false);
  }
  expect(ag.hatalar).toEqual([]);
});

// 2905: Durum süzgeci tablonun araç çubuğunda çip grubudur (tür sekmeleriyle iki sekme satırı olmasın); çipler sarar, kesilmez.
test('Malzemeler: Durum çiplerinin hepsi görünür', async ({ page, ag, ac }) => {
  await ac('/stok/malzemeler');
  const grup = page.getByRole('group', { name: 'Durum' });
  await expect(grup).toBeVisible();
  const genislik = page.viewportSize()?.width ?? 0;
  expect(await grup.evaluate((e) => e.scrollWidth - e.clientWidth), 'çip grubunda gizli kaydırma').toBeLessThanOrEqual(0);
  const cipler = grup.getByRole('button');
  expect(await cipler.count()).toBeGreaterThan(1);
  for (const c of await cipler.all()) {
    const k = await c.boundingBox();
    expect(k, `${await c.innerText()} çipi çizilmedi`).not.toBeNull();
    if (k === null) continue;
    expect(k.x, `${await c.innerText()} çipi solda kesik`).toBeGreaterThanOrEqual(0);
    expect(k.x + k.width, `${await c.innerText()} çipi sağda kesik`).toBeLessThanOrEqual(genislik);
  }
  await expect(cipler.filter({ hasText: 'Tümü' })).toHaveAttribute('aria-pressed', 'true');
  expect(ag.hatalar).toEqual([]);
});

test('Okut paneli: kamera önce, kutucuklar görünür ve ekranlarını açar', async ({ page, ag, ac }) => {
  await ac('/stok');
  await page.getByRole('button', { name: /^Okut(, \d+ gelen teslim)?$/ }).filter({ visible: true }).first().click();
  const panel = page.getByRole('dialog', { name: 'Okut' });
  await expect(panel).toBeVisible();
  // 372 a, 809: ayrı QR tuşu yok; okuyucu pencerenin üstünde, kutucuklardan önce görünür.
  await expect(page.getByRole('button', { name: 'QR okut', exact: true })).toHaveCount(0);
  const kod = panel.getByRole('textbox', { name: /Kod/ }).first();
  await expect(kod).toBeVisible();
  const gelen = panel.getByRole('button', { name: /^Bana gelen/ });
  const [k, s] = [await kod.boundingBox(), await gelen.boundingBox()];
  expect(k !== null && s !== null && k.y < s.y, 'okuyucu kutucukların üstünde').toBe(true);
  for (const [ad, baslik] of [[/^Bana gelen/, 'Bana gelen'], [/^Elimdekiler/, 'Elimdekiler'], [/^Malzeme iste/, 'Malzeme iste']] as const) {
    await panel.getByRole('button', { name: ad }).click();
    await expect(page.getByRole('dialog', { name: baslik })).toBeVisible();
    await page.getByRole('button', { name: 'Kameraya dön' }).click();
  }
  // Depocunun recete-rota statü okuması 403 alıyor; degisecek.spec.ts'te ayrıca izlenir.
  expect(ag.hatalar.filter((h) => !h.includes('/api/recete-rota/statuler') && !h.includes('status of 403'))).toEqual([]);
  expect(ag.yazmalar, 'paneli açmak ve sekme değiştirmek yazmaz').toEqual([]);
});
