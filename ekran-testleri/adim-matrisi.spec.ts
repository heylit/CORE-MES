import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Adım Durumu tek matris (3604, 3738): her genişlikte satır emir, sütun OP, matris yana kayar; 1280'de tam hücre ve sağ panel, 768 ve 360'ta simge hücre ve alttan panel.
// Okuma ve seçim yazmaz; yazma yolu sahte cevapla denenir (toplu uç tek istekte kalem listesi alır).
test.use({ hesap: 'ornek.planlama' });

const sayfaTasmaz = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sayfa yatay taşmaz').toBeLessThanOrEqual(0);
};

test('Matris: görünüm adreste, hücre seçilir, toplu şerit statüyü ister, onay sayımı gösterilir, yazma yapılmaz', async ({ page, ag, ac }) => {
  await ac('/adim-durumu');
  await expect(page.getByRole('tab', { name: 'Adımlar' })).toHaveAttribute('aria-selected', 'true');
  const genislik = page.viewportSize()?.width ?? 0;
  const hucre = page.getByRole('table').getByRole('button', { name: /^\S+, OP \d+/ }).first();
  await expect(hucre).toBeVisible();
  await expect(page.getByText('Elle statü, sistem statüsü değişince düşer.')).toBeVisible();
  // 360'ta da kart yok: aynı matris yana kayar.
  await expect(page.getByRole('table')).toHaveCount(1);
  // Y1: dar ekranda hücre ve çip parmak boyunda.
  if (genislik < 1024) expect((await hucre.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // Y1: simge yalnız hücrenin anlamı lejantla verilir.
  await expect(page.getByRole('list', { name: 'Statü simgeleri' })).toBeVisible();
  const oncekiGenislik = (await page.getByRole('region', { name: 'Adım matrisi' }).boundingBox())?.width ?? 0;
  await hucre.click();
  if (genislik < 768) {
    // Telefonda tek dokunuş yalnız paneli açar; toplu şerit Çoklu seç açılınca gelir.
    await expect(page.getByRole('complementary', { name: 'Adım ayrıntısı' })).toBeVisible();
    await expect(page.getByText('1 seçili')).toBeHidden();
    await page.getByRole('button', { name: 'Çoklu seç' }).click();
  }
  await expect(page.getByText('1 seçili')).toBeVisible();
  await expect(page.getByText('Operatör terminalde yalnız statüyü görür; not ve kişi terminale gitmez.')).toBeVisible();
  if (genislik >= 768) await expect(page.getByRole('complementary', { name: 'Adım ayrıntısı' })).toBeVisible();
  // Y2: ayrıntı açılınca matris yatayda çökmez ve sayfa taşmaz.
  if (genislik >= 1024) expect((await page.getByRole('region', { name: 'Adım matrisi' }).boundingBox())?.width ?? 0).toBeGreaterThan(oncekiGenislik * 0.55);
  await sayfaTasmaz(page);
  const yaz = page.getByRole('button', { name: /^Yaz$/ });
  await expect(yaz).toBeDisabled();
  await page.getByLabel('Elle statü').selectOption('malzeme');
  await page.getByRole('button', { name: /adıma Malzeme bekliyor yaz$/ }).click();
  const onay = page.getByRole('region', { name: 'Yazma onayı' });
  await expect(onay).toContainText(/1 seçili: \d yazılır/);
  await onay.getByRole('button', { name: 'Vazgeç' }).click();
  await page.getByRole('button', { name: 'Seçimi temizle' }).click();
  await expect(page.getByText('1 seçili')).toBeHidden();
  await sayfaTasmaz(page);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'seçim ve onay sayımı yazmaz').toEqual([]);
});

test('Matris: onaylanan yazım tek toplu istektir; sonuç kalıcı şeritte, Geri al ikinci istektir', async ({ page, ac }) => {
  const govdeler: unknown[] = [];
  await page.route('**/api/adimli-emirler/statu-toplu', async (r) => {
    const g = r.request().postDataJSON() as { kalemler: { emirId: number; isEmriId: number; statu: string | null }[] };
    govdeler.push(g);
    await r.fulfill({ json: { kalemler: g.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: k.statu === null ? 'kaldirildi' : 'yazildi', neden: null })) } });
  });
  await ac('/adim-durumu');
  const satir = page.getByRole('table').getByRole('button', { name: /^\S+, OP 30/ }).first();
  await expect(satir).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole('button', { name: 'Çoklu seç' }).click();
  await satir.click();
  await page.getByLabel('Elle statü').selectOption('cizim');
  await page.getByRole('button', { name: /adıma Çizim revizyonu bekleniyor yaz$/ }).click();
  const onay = page.getByRole('region', { name: 'Yazma onayı' });
  const yenileme = page.waitForResponse((r) => r.request().method() === 'GET' && r.url().includes('/adimli-emirler/adim-matrisi'));
  await onay.getByRole('button', { name: /^\d+ adıma yaz$/ }).click();
  await expect(page.getByText(/^Son yazım: \d+ adım yazıldı/)).toBeVisible();
  expect(govdeler).toHaveLength(1);
  // Yazımdan sonra liste yenilenir; Geri al yenileme bittikten sonra da etkin kalır ve ikinci istek olarak gider.
  await yenileme;
  await expect(page.getByRole('button', { name: 'Geri al', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Geri al', exact: true }).click();
  await expect(page.getByText('Son yazım geri alındı.')).toBeVisible();
  expect(govdeler).toHaveLength(2);
  await sayfaTasmaz(page);
});

test('Mercek: Hazırlık merceği hücrede tamamı/toplamı gösterir, adreste durur; hücre paneli hazırlık maddelerini listeler; yazılmaz', async ({ page, ag, ac }) => {
  await ac('/adim-durumu?mercek=hazirlik');
  await expect(page.getByRole('button', { name: 'Hazırlık', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const hucre = page.getByRole('table').getByRole('button', { name: /^\S+, OP \d+ .*: hazırlık \d+\/\d+/ }).first();
  await expect(hucre).toBeVisible();
  await expect(page.getByRole('list', { name: 'Hazırlık kareleri' })).toBeVisible();
  // Y1: dar ekranda hücre parmak boyunda.
  if ((page.viewportSize()?.width ?? 0) < 1024) expect((await hucre.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await hucre.click();
  const panel = page.getByRole('complementary', { name: 'Adım ayrıntısı' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Hazırlık maddeleri' }).getByRole('listitem').first()).toBeVisible();
  for (const d of await panel.getByRole('button', { name: /: (onayla|eksik işaretle|elle değeri geri al)$/ }).all()) {
    expect((await d.boundingBox())?.height ?? 0, 'madde düğmesi parmak boyunda').toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Durum', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Statü simgeleri' })).toBeVisible();
  await sayfaTasmaz(page);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test.describe('kalite (yalniz okur)', () => {
  test.use({ hesap: 'ornek.kalite' });
  test('seçim kapalı, nedeni görünür', async ({ page, ac }) => {
    await ac('/adim-durumu');
    await expect(page.getByText('Statü yazma yetkiniz yok. Yalnız okuyabilirsiniz.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tümünü seç' })).toBeDisabled();
  });
});

// Düzeltme turu (3604): çoklu seçimde panel kapanır, toplu şerit ile sonuç şeridi aynı kapta durur, emir sütunu sabittir.
test('Çoklu seçimde panel kapanır; seçili şerit ve sonuç şeridi aynı yerde; görüntü alınır', async ({ page, ac }) => {
  const genislik = page.viewportSize()?.width ?? 0;
  const klasor = process.env['TMIV2_EKRAN_GORUNTU_KLASORU'];
  const resim = async (ad: string): Promise<void> => { if (klasor) await page.screenshot({ path: `${klasor}/${ad}-${String(genislik)}.png`, fullPage: false }); };
  await page.route('**/api/adimli-emirler/statu-toplu', async (r) => {
    const g = r.request().postDataJSON() as { kalemler: { emirId: number; isEmriId: number; statu: string | null }[] };
    await r.fulfill({ json: { kalemler: g.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: k.statu === null ? 'kaldirildi' : 'yazildi', neden: null })) } });
  });
  // Seçim sayısı ortak veritabanına bağlı olmasın: yalnız ilk iki emir gösterilir; Tümünü seç 100 kalem sınırını aşmaz.
  await page.route('**/api/adimli-emirler/adim-matrisi*', async (r) => {
    const res = await r.fetch();
    const j = await res.json() as { emirler: unknown[] };
    j.emirler = j.emirler.slice(0, 2);
    await r.fulfill({ response: res, json: j });
  });
  await ac('/adim-durumu');
  const telefon = genislik < 768;
  const hucre = page.getByRole('table').getByRole('button', { name: /^\S+, OP \d+/ }).first();
  await hucre.click();
  const panel = page.getByRole('complementary', { name: 'Adım ayrıntısı' });
  await expect(panel).toBeVisible();
  if (telefon) {
    // 360: ayrıntı alttaki yapışan şeridin içinde, katlanır.
    expect(await panel.evaluate((e) => e.closest('.tc-am-seritlar') !== null)).toBe(true);
    await panel.locator('summary').click();
    await expect(panel.getByRole('link', { name: 'Emri aç' })).toBeHidden();
    await panel.locator('summary').click();
    await expect(panel.getByRole('link', { name: 'Emri aç' })).toBeVisible();
  }
  await resim('1-tek-secim-panel');
  await page.getByRole('button', { name: 'Tümünü seç' }).click();
  await expect(page.getByText(/^\d+ seçili$/)).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Adım ayrıntısı' })).toBeHidden();
  if (genislik >= 1024) expect((await page.getByRole('region', { name: 'Adım matrisi' }).boundingBox())?.width ?? 0).toBeGreaterThan(genislik * 0.6);
  await page.getByLabel('Elle statü').selectOption('cizim');
  await resim('2-coklu-secim-serit');
  await page.getByRole('button', { name: /adıma Çizim revizyonu bekleniyor yaz$/ }).click();
  await page.getByRole('region', { name: 'Yazma onayı' }).getByRole('button', { name: /^\d+ adıma yaz$/ }).click();
  const son = page.getByText(/^Son yazım: \d+ adım yazıldı/);
  await expect(son).toBeVisible();
  const kap = page.locator('.tc-am-seritlar');
  await expect(kap.getByRole('button', { name: 'Geri al', exact: true })).toBeVisible();
  await resim('3-yazma-sonucu-serit');
  await sayfaTasmaz(page);
  // Yazımdan sonraki liste yenilemesi test bitince yarım kalmasın.
  await page.unrouteAll({ behavior: 'wait' });
});

test('Matris: emir sütunu yana kaydırmada sabit, sayfa kaymaz', async ({ page, ac }) => {
  const genislik = page.viewportSize()?.width ?? 0;
  await ac('/adim-durumu');
  const emir = () => page.getByRole('table').getByRole('button', { name: /: bu emrin adımlarını seç$/ }).first();
  await expect(emir()).toBeVisible();
  const ilk = await emir().boundingBox();
  const klasor = process.env['TMIV2_EKRAN_GORUNTU_KLASORU'];
  if (klasor) await page.screenshot({ path: `${klasor}/4-matris-${String(genislik)}.png` });
  await page.getByRole('region', { name: 'Adım matrisi' }).evaluate((e) => { e.scrollLeft = 200; });
  if (klasor) await page.screenshot({ path: `${klasor}/4-matris-kaydirilmis-${String(genislik)}.png` });
  const sonra = await emir().boundingBox();
  expect(Math.abs((sonra?.x ?? 0) - (ilk?.x ?? 0)), 'Emir sütunu kaydırmada yerinde').toBeLessThan(2);
  await sayfaTasmaz(page);
});

test('Matris: panel açıkken hücre adı harf ortasında bölünmez', async ({ page, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'yan panel yalnız 1024 ve üstünde');
  await ac('/adim-durumu');
  await page.getByRole('table').getByRole('button', { name: /^\S+, OP 30/ }).first().click();
  await expect(page.getByRole('complementary', { name: 'Adım ayrıntısı' })).toBeVisible();
  const kelimeler = await page.locator('.tc-am-panelli .tc-am-hucre-ad').evaluateAll((es) => es.map((e) => {
    const r = document.createRange(); r.selectNodeContents(e);
    const satirlar = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    return { ad: e.textContent ?? '', satirlar, en: Math.round(e.getBoundingClientRect().width) };
  }));
  // "Terminale gönderilmedi" en çok iki satıra sarar (kelime sınırında); 4-5 satır harf kırılmasıdır.
  for (const k of kelimeler) expect(k.satirlar, `${k.ad} ${String(k.en)}px`).toBeLessThanOrEqual(3);
});

test('Matris: tam hücre en az 7 rem; panelde statü seçimi ve Otomatiğe dön hücreyi itmez', async ({ page, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'tam hücre yalnız 1024 ve üstünde');
  await ac('/adim-durumu');
  const hucre = page.getByRole('table').getByRole('button', { name: /^\S+, OP 30/ }).first();
  const once = (await hucre.boundingBox())?.width ?? 0;
  expect(once).toBeGreaterThanOrEqual(110);
  await hucre.click();
  const panel = page.getByRole('complementary', { name: 'Adım ayrıntısı' });
  await expect(panel.getByLabel('Statü değiştir')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Otomatiğe dön' })).toBeVisible();
  expect(Math.abs(((await hucre.boundingBox())?.width ?? 0) - once), 'seçim hücre genişliğini oynatmaz').toBeLessThan(40);
});

// Gerçek veride emir no uzundur (örn. sipariş öneki + emir no); sabit satır başlığı taşıp yandaki hücrenin tıklamasını yakalamamalı.
test('Matris: uzun emir no sabit başlığı taşırmaz, ilk hücre tıklanır', async ({ page, ac }) => {
  await page.route('**/api/adimli-emirler/adim-matrisi*', async (r) => {
    const res = await r.fetch();
    const j = await res.json() as { emirler: { emirNo: string }[] };
    j.emirler.forEach((e, i) => { e.emirNo = `SS_2026_003-MM-ORN-0000${String(i)}-26-11-006`; });
    await r.fulfill({ response: res, json: j });
  });
  await ac('/adim-durumu');
  const hucre = page.getByRole('table').getByRole('button', { name: /^\S+, OP \d+/ }).first();
  await expect(hucre).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 768) await page.getByRole('button', { name: 'Çoklu seç' }).click();
  await hucre.click({ timeout: 5000 });
  await expect(page.getByText(/^1 seçili$/)).toBeVisible();
  await sayfaTasmaz(page);
});

// 50'den çok adımda ek onay kutusu zorunlu: yazma düğmesi kutu işaretlenene kadar pasif kalır, sonra tek toplu istek gider (100 sınırı altında).
test('Matris: 60 üstü adımda ek onay kutusu işaretlenmeden yazılmaz, işaretlenince tek istekle yazılır', async ({ page, ac }) => {
  const govdeler: { kalemler: { emirId: number; isEmriId: number; statu: string | null }[] }[] = [];
  await page.route('**/api/adimli-emirler/adim-matrisi*', async (r) => {
    const res = await r.fetch();
    const j = await res.json() as { emirler: { emirId: number; emirNo: string; durum: string; adimlar: { isEmriId: number; sistemStatusu: string; elle: unknown }[] }[] };
    const kalip = j.emirler.find((e) => e.adimlar.length > 0 && e.durum !== 'bitti' && e.durum !== 'iptal');
    if (kalip === undefined) { await r.fulfill({ response: res, json: j }); return; }
    // Sentetik emirler: her adım yazılabilir (baslayabilir, elle yok); toplam 66 adım, ek onay eşiği 50 ve toplu sınır 100 arasında.
    const adet = Math.ceil(66 / kalip.adimlar.length);
    j.emirler = Array.from({ length: adet }, (_, i) => ({
      ...kalip, emirId: 900000 + i, emirNo: `ORN-EKONAY-${String(i)}`,
      adimlar: kalip.adimlar.map((a, k) => ({ ...a, isEmriId: 900000 + i * 100 + k, sistemStatusu: 'baslayabilir', elle: null })),
    }));
    await r.fulfill({ response: res, json: j });
  });
  await page.route('**/api/adimli-emirler/statu-toplu', async (r) => {
    const g = r.request().postDataJSON() as (typeof govdeler)[number];
    govdeler.push(g);
    await r.fulfill({ json: { kalemler: g.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: 'yazildi', neden: null })) } });
  });
  await ac('/adim-durumu');
  await expect(page.getByRole('table').getByRole('button', { name: /^ORN-EKONAY-0, OP \d+/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Tümünü seç' }).click();
  await expect(page.getByText(/^\d+ seçili$/)).toBeVisible();
  const sayi = Number((await page.getByText(/^\d+ seçili$/).textContent())?.match(/\d+/)?.[0] ?? 0);
  expect(sayi).toBeGreaterThan(50);
  expect(sayi).toBeLessThanOrEqual(100);
  await page.getByLabel('Elle statü').selectOption('cizim');
  await page.getByRole('button', { name: /adıma Çizim revizyonu bekleniyor yaz$/ }).click();
  const onay = page.getByRole('region', { name: 'Yazma onayı' });
  const yaz = onay.getByRole('button', { name: /^\d+ adıma yaz$/ });
  await expect(onay.getByRole('checkbox', { name: /bu 50 adımdan çok/ })).not.toBeChecked();
  await expect(yaz, 'ek onay işaretlenmeden pasif').toBeDisabled();
  await onay.getByRole('checkbox', { name: /bu 50 adımdan çok/ }).check();
  await expect(yaz).toBeEnabled();
  await yaz.click();
  await expect(page.getByText(/^Son yazım: \d+ adım yazıldı/)).toBeVisible();
  expect(govdeler, 'tek toplu istek').toHaveLength(1);
  expect(govdeler[0]?.kalemler.length).toBe(sayi);
  expect(govdeler[0]?.kalemler.every((k) => k.statu === 'cizim')).toBe(true);
  await page.unrouteAll({ behavior: 'wait' });
});

test('Telefon: süzgeç Filtre düğmesiyle katlanır; panel alttan açılır ve alt çubuğun üstünde durur; Çoklu seç panelle çift çubuk yapmaz', async ({ page, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon');
  await ac('/adim-durumu');
  const filtre = page.getByRole('button', { name: /^Filtre/ });
  await expect(filtre).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Statü', { exact: true })).toBeHidden();
  await filtre.click();
  await expect(page.getByLabel('Statü', { exact: true })).toBeVisible();
  await filtre.click();
  await page.getByRole('table').getByRole('button', { name: /^\S+, OP \d+/ }).first().click();
  const panel = page.getByRole('complementary', { name: 'Adım ayrıntısı' });
  await expect(panel).toBeVisible();
  const alt = await panel.boundingBox();
  const sinir = (page.viewportSize()?.height ?? 0) - 64;
  expect((alt?.y ?? 0) + (alt?.height ?? 0), 'panel alt çubuğa binmez').toBeLessThanOrEqual(sinir + 1);
  await expect(page.getByText(/^\d+ seçili$/)).toBeHidden();
  await page.getByRole('button', { name: 'Çoklu seç' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByText('1 seçili')).toBeVisible();
});
