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
  // 372 a, 809: ayrı QR tuşu yok; okuyucu kutucuklardan önce görünür. 3339 a: geniş ekranda okuyucu solda, sepet bölmesi sağda,
  // kutucuklar altta; dar ekranda kutucuklar okuyucunun altında, sepet (doluysa) altta sabit çubuk.
  await expect(page.getByRole('button', { name: 'QR okut', exact: true })).toHaveCount(0);
  const kod = panel.getByRole('textbox', { name: /Kod/ }).first();
  await expect(kod).toBeVisible();
  const gelen = panel.getByRole('button', { name: /^Bana gelen/ });
  expect(await kod.evaluate((el, s) => s !== null && Boolean(el.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING), await gelen.elementHandle()),
    'okuyucu belge sırasında kutucuklardan önce').toBe(true);
  const [k, s] = [await kod.boundingBox(), await gelen.boundingBox()];
  const ikiSutun = (page.viewportSize()?.width ?? 0) >= 760;
  expect(k !== null && s !== null && k.y + k.height <= s.y, 'okuyucu kutucukların üstünde').toBe(true);
  if (ikiSutun) {
    const sepet = panel.getByRole('region', { name: 'Sepetim' });
    await expect(sepet).toBeVisible();
    const b = await sepet.boundingBox();
    expect(k !== null && b !== null && k.x + k.width <= b.x, 'iki sütunda sepet okuyucunun sağında').toBe(true);
  }
  expect(await panel.evaluate((e) => e.scrollWidth - e.clientWidth), 'panel yana taşmaz').toBeLessThanOrEqual(0);
  for (const [ad, baslik] of [[/^Bana gelen/, 'Bana gelen'], [/^Elimdekiler/, 'Elimdekiler'], [/^Malzeme iste/, 'Malzeme iste']] as const) {
    await panel.getByRole('button', { name: ad }).click();
    await expect(page.getByRole('dialog', { name: baslik })).toBeVisible();
    await page.getByRole('button', { name: 'Kameraya dön' }).click();
  }
  expect(ag.hatalar, 'depocu yetkisiz istek göndermez (statü listesi 403 düzeldi)').toEqual([]);
  expect(ag.yazmalar, 'paneli açmak ve sekme değiştirmek yazmaz').toEqual([]);
});

// DataMatrix geçişi (dilim 1): özet kod (CM1) okutulup sunucuya ulaşılamazsa etiketin kendi bilgisi Türkçe alan adlarıyla, "Çevrimdışı bilgi"
// başlığıyla görünür; üç genişlikte taşmaz. Ağ kesintisi isteği düşürerek benzetilir.
test('Okut paneli: özet kodda sunucuya ulaşılamazsa çevrimdışı bilgi okunur ve taşmaz', async ({ page, ac }) => {
  await page.route('**/api/stok/teslim-kutusu/kod-coz**', (r) => r.abort('failed'));
  await ac('/stok');
  await page.getByRole('button', { name: /^Okut(, \d+ gelen teslim)?$/ }).filter({ visible: true }).first().click();
  const panel = page.getByRole('dialog', { name: 'Okut' });
  await expect(panel).toBeVisible();
  await panel.getByRole('textbox', { name: /Kod/ }).first().fill('CM1/LOT:ORN-LT-2041/TPN:ORN-TPN-77812/DKM:ORN-DKM-5531/SRT:ORN-SRT-310/SKT:270527/MK:ORN-MK-0045/GT:261118/TDR:ORN-TD-07/DRM:KBK/BT:261122');
  await panel.getByRole('button', { name: 'Bul' }).first().click();
  const bant = panel.getByText(/Çevrimdışı bilgi · basım 22\.11\.2026 · güncel olmayabilir/);
  await expect(bant).toBeVisible();
  for (const ad of ['Tedarikçi lotu', 'Döküm no', 'Sertifika no', 'Son kullanma', 'Mal kabul no', 'Giriş tarihi', 'Tedarikçi', 'Durum']) await expect(panel.getByText(ad, { exact: true })).toBeVisible();
  await expect(panel.getByText('Karar bekliyor')).toBeVisible();
  await expect(panel.getByText('doğrulanmadı')).toBeVisible();
  await expect(panel.getByText('27.05.2027')).toBeVisible();
  const genislik = page.viewportSize()?.width ?? 0;
  for (const kutu of [await bant.boundingBox(), await panel.getByText('ORN-TPN-77812', { exact: true }).boundingBox()]) {
    expect(kutu, 'çevrimdışı bilgi çizilmedi').not.toBeNull();
    if (kutu !== null) { expect(kutu.x).toBeGreaterThanOrEqual(0); expect(kutu.x + kutu.width).toBeLessThanOrEqual(genislik); }
  }
  expect(await panel.evaluate((e) => e.scrollWidth - e.clientWidth), 'panel yana taşmaz').toBeLessThanOrEqual(0);
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
