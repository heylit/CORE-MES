import { expect, test } from './ortak.ts';

// Kaynak: kayit/stok/ozellikler.md:71 (Durum ve teslim paneli sekmeleri kesilmez).
test.use({ hesap: 'ornek.depo' });

// 2905: Durum süzgeci tablonun araç çubuğunda çip grubudur (tür sekmeleriyle iki sekme satırı olmasın); çipler sarar, kesilmez.
// Telefonda (2997 a) çipler tek satırda yana kayar: her çip kaydırınca görünür, hiçbiri solda kesik başlamaz.
test('Malzemeler: Durum çiplerinin hepsi görünür', async ({ page, ag, ac }) => {
  await ac('/stok/malzemeler');
  const grup = page.getByRole('group', { name: 'Durum' });
  await expect(grup).toBeVisible();
  const genislik = page.viewportSize()?.width ?? 0;
  if (genislik < 768) {
    const cipler = grup.getByRole('button');
    expect(await cipler.count()).toBeGreaterThan(1);
    for (const c of await cipler.all()) {
      await c.scrollIntoViewIfNeeded();
      const k = await c.boundingBox();
      expect(k, `${await c.innerText()} çipi çizilmedi`).not.toBeNull();
      if (k === null) continue;
      expect(k.x, `${await c.innerText()} çipi solda kesik`).toBeGreaterThanOrEqual(0);
      expect(k.x + k.width, `${await c.innerText()} çipi kaydırınca da sağda kesik`).toBeLessThanOrEqual(genislik);
    }
    await expect(cipler.filter({ hasText: 'Tümü' })).toHaveAttribute('aria-pressed', 'true');
    expect(ag.hatalar).toEqual([]);
    return;
  }
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
  // 372 a, 809: ayrı QR tuşu yok; okuyucu kutucuklardan önce görünür. 3096 a: geniş ekranda iki sütun, okuyucu solda.
  await expect(page.getByRole('button', { name: 'QR okut', exact: true })).toHaveCount(0);
  const kod = panel.getByRole('textbox', { name: /Kod/ }).first();
  await expect(kod).toBeVisible();
  const gelen = panel.getByRole('button', { name: /^Bana gelen/ });
  expect(await kod.evaluate((el, s) => s !== null && Boolean(el.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING), await gelen.elementHandle()),
    'okuyucu belge sırasında kutucuklardan önce').toBe(true);
  const [k, s] = [await kod.boundingBox(), await gelen.boundingBox()];
  const ikiSutun = (page.viewportSize()?.width ?? 0) >= 760;
  if (ikiSutun) expect(k !== null && s !== null && k.x + k.width <= s.x, 'iki sütunda okuyucu sol sütunda, kutucuklar sağda').toBe(true);
  else expect(k !== null && s !== null && k.y + k.height <= s.y, 'tek sütunda okuyucu kutucukların üstünde').toBe(true);
  for (const [ad, baslik] of [[/^Bana gelen/, 'Bana gelen'], [/^Elimdekiler/, 'Elimdekiler'], [/^Malzeme iste/, 'Malzeme iste']] as const) {
    await panel.getByRole('button', { name: ad }).click();
    await expect(page.getByRole('dialog', { name: baslik })).toBeVisible();
    await page.getByRole('button', { name: 'Kameraya dön' }).click();
  }
  // Depocunun recete-rota statü okuması 403 alıyor; degisecek.spec.ts'te ayrıca izlenir.
  expect(ag.hatalar.filter((h) => !h.includes('/api/recete-rota/statuler') && !h.includes('status of 403'))).toEqual([]);
  expect(ag.yazmalar, 'paneli açmak ve sekme değiştirmek yazmaz').toEqual([]);
});

// 3089: alttaki Okut / Transfer / Malzeme istekleri çubuğu kalktı; Transfer ve Malzeme istekleri ikinci menüde, Okut üst çubukta.
test('Alt kısayol çubuğu yok; Transfer ve Malzeme istekleri ikinci menüde, sayfa yana taşmaz', async ({ page, ag, ac }) => {
  await ac('/stok/malzemeler');
  await expect(page.getByRole('table', { name: 'Malzeme stokları' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Depocu kısayolları' })).toHaveCount(0);
  await expect(page.locator('a[href="/stok/sepet"]').first()).toBeAttached();
  await expect(page.locator('a[href="/stok/hazirlik"]').first()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sayfa yana taşıyor').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});
