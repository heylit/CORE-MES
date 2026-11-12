import { expect, tasmaOlc, test } from './ortak.ts';

// Kart 3025: Etiket Merkezi Pano ile açılır; tek "Bas" düğmesi ve tek yazıcı listesi; "Otomatik baskılar" olaydan doğan etiketleri gösterir.
// Tek sütunda (telefon, tablet) Bas düğmesi panel boyunca alt şeritte kalır; iki sütunlu masaüstünde ilk ekranda görünür.

test('Pano açılır, sayılar ve hızlı bas görünür; okuma yazmaz, yatay taşma yok', async ({ page, ag, ac }) => {
  await ac('/etiket-merkezi');
  await expect(page.getByRole('link', { name: /^Tek dokunuşla basan iş/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Basılacak etiket/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Etiket türü' }).getByRole('link').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('Otomatik baskılar olay tablosunu ve kendiliğinden basılmadığını gösterir', async ({ page, ag, ac }) => {
  await ac('/etiket-merkezi/otomatik');
  await expect(page.getByText(/Etiketler kendiliğinden basılmaz/)).toBeVisible();
  await expect(page.getByText('Mal kabul kaydedilince').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('eski adres seçimiyle Etiket bas\'a gider', async ({ page, ac }) => {
  await ac('/etiket-merkezi?tur=lot');
  await expect(page).toHaveURL(/\/etiket-merkezi\/bas\?tur=lot$/);
  await expect(page.getByRole('heading', { name: '1. Ne basılacak' })).toBeVisible();
});

test('kayıt seçiliyken Bas düğmesi tek sütunda alt şeritte kalır, masaüstünde ilk ekrandadır; yazıcı tek listededir', async ({ page, ag, ac }) => {
  const cevap = await page.request.get('/api/stok/konumlar?sayfa=1&sayfaBoyu=2');
  expect(cevap.ok()).toBe(true);
  const { satirlar } = await cevap.json() as { satirlar: { id: number }[] };
  test.skip(satirlar.length === 0, 'örnek veride konum yok');
  await ac(`/etiket-merkezi/bas?tur=konum&id=${satirlar.map((s) => s.id).join(',')}`);
  const secim = page.getByRole('combobox', { name: 'Yazıcı' });
  await expect(secim).toBeVisible();
  await expect(secim.getByRole('option', { name: 'Bu bilgisayar · Windows yazdırma' })).toBeAttached();
  const bas = page.getByRole('button', { name: /^Bas · \d+ etiket$/ });
  await expect(bas).toBeVisible();
  const yukseklik = page.viewportSize()?.height ?? 0;
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    // Sayfa ortasında da düğme görünür ve üstünü kabuğun alt çubuğu örtmez.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await expect(bas).toBeInViewport();
    const ustteki = await bas.evaluate((d) => {
      const k = d.getBoundingClientRect();
      const e = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2);
      return e !== null && (d === e || d.contains(e));
    });
    expect(ustteki, 'Bas düğmesinin üstünde başka öğe var').toBe(true);
    await page.screenshot({ path: test.info().outputPath('bas-orta.png') });
    // Sayfa sonunda panelin son satırı (Gelişmiş) şeridin ya da kabuğun alt çubuğunun altında kalmaz.
    const son = page.locator('.tc-etk-gelismis > summary').first();
    await son.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(son).toBeInViewport();
    const sonGorunur = await son.evaluate((d) => {
      const k = d.getBoundingClientRect();
      return [0.1, 0.5, 0.9].every((x) => {
        const e = document.elementFromPoint(k.left + k.width * x, k.top + k.height / 2);
        return e !== null && (d === e || d.contains(e));
      });
    });
    expect(sonGorunur, 'son satırın üstünde Bas şeridi ya da alt çubuk var').toBe(true);
    const serit = await page.locator('.tc-etk-bas-cubuk').boundingBox();
    const sonKutu = await son.boundingBox();
    expect((sonKutu?.y ?? 0) + (sonKutu?.height ?? 0), 'son satır şeridin üstünde biter').toBeLessThanOrEqual(serit?.y ?? Infinity);
  } else {
    const k = await bas.boundingBox();
    expect((k?.y ?? Infinity) + (k?.height ?? 0), 'Bas ilk ekranda').toBeLessThanOrEqual(yukseklik);
  }
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

// Yetkiye göre görünenler (yönetici olmayan hesap): depocu basar ve okur, yazıcı tanımlayamaz. "Yazıcı ata" yalnız bu cihazın seçimidir
// (etiket-merkezi.bas); Pano'nun sayıları okuma ister.
test.describe('depocu (bas + oku, yazıcı yazmaz)', () => {
  test.use({ hesap: 'ornek.depo' });

  test('Pano sayıları ve Otomatik baskılar\'da "Yazıcı ata" görünür; Yazıcılar\'da ekleme yoktur', async ({ page, ag, ac }) => {
    await ac('/etiket-merkezi');
    await expect(page.getByRole('link', { name: /^Basılacak etiket/ })).toBeVisible();
    await ac('/etiket-merkezi/otomatik');
    await expect(page.getByRole('button', { name: 'Yazıcı ata' }).first()).toBeVisible();
    await ac('/etiket-merkezi/yazicilar');
    await expect(page.getByRole('heading', { name: 'Yazıcılar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yazıcı ekle' })).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});

// 3011 a: standart dışı rulo. Etiket bas ekranında girilen ölçüye tasarım orantılı ölçeklenir; okunmayan ölçü basılmaz.
// Yalnız önizleme istenir; baskı düğmesine basılmaz (örnek veri değişmez).
test.describe('Standart dışı ölçü (3011)', () => {
  test('ölçü girilince önizleme o ölçüde çizilir, oran yazılır; ölçü bu cihazda kalır; sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/etiket-merkezi?tur=lot');
    const kutu = page.getByLabel('Standart dışı etikete bas');
    await expect(kutu).not.toBeChecked();
    await kutu.check();
    await page.getByLabel('Etiket eni (mm)').fill('60');
    await page.getByLabel('Etiket boyu (mm)').fill('40');
    await expect(page.getByText(/tasarım 60x40 mm etikete orantılı küçültülür ve ortalanır/)).toBeVisible();
    await expect(page.locator('svg[viewBox="0 0 60 40"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Standart ölçüye dön (100x50 mm)' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.reload();
    await expect(page.getByLabel('Standart dışı etikete bas')).toBeChecked();
    await expect(page.getByLabel('Etiket eni (mm)')).toHaveValue('60');
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });

  test('okunmayan ölçüde sunucu iletisi görünür, yeniden deneme sunulmaz', async ({ page, ag, ac }) => {
    await ac('/etiket-merkezi?tur=lot');
    await page.getByLabel('Standart dışı etikete bas').check();
    await page.getByLabel('Etiket eni (mm)').fill('20');
    await page.getByLabel('Etiket boyu (mm)').fill('10');
    await expect(page.getByText(/Bu ölçüde (QR|yazı) okunmaz .* Bu etiket için en küçük ölçü \d+x\d+ mm\./)).toBeVisible();
    await expect(page.getByRole('button', { name: /Yeniden dene/ })).toHaveCount(0);
    // Yazarken geçen ara ölçüler de (20x50) reddedilir; beklenen yalnız bu ölçü isteklerinin 400'üdür.
    const beklenen = (h: string) => /^400 GET \/api\/etiket-merkezi\/sablonlar\/malzeme-etiketi-100x50\/cikti\?.*&en=20&boy=(10|50)$/.test(h)
      || h === 'konsol: Failed to load resource: the server responded with a status of 400 (Bad Request)';
    expect(ag.hatalar.some((h) => h.endsWith('&en=20&boy=10'))).toBe(true);
    expect(ag.hatalar.filter((h) => !beklenen(h))).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
