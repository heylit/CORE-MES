import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Adım Durumu matrisi ve toplu tablo (3604): 1280'de tam matris ve sağ panel, 768'de simge hücre ve alt çekmece, 360'ta emir kartları ve OP çipleri.
// Okuma ve seçim yazmaz; yazma yolu sahte cevapla denenir (toplu uç tek istekte kalem listesi alır).
test.use({ hesap: 'ornek.planlama' });

const sayfaTasmaz = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sayfa yatay taşmaz').toBeLessThanOrEqual(0);
};

test('Matris: görünüm adreste, hücre seçilir, toplu şerit statüyü ister, onay sayımı gösterilir, yazma yapılmaz', async ({ page, ag, ac }) => {
  await ac('/adim-durumu?gorunum=matris');
  await expect(page.getByRole('tab', { name: 'Matris' })).toHaveAttribute('aria-selected', 'true');
  const genislik = page.viewportSize()?.width ?? 0;
  const telefon = genislik < 768;
  const hucre = telefon ? page.getByRole('list', { name: 'Emirler' }).getByRole('button', { name: /OP \d+/ }).first() : page.getByRole('table').getByRole('button', { name: /^\S+, OP \d+/ }).first();
  await expect(hucre).toBeVisible();
  await expect(page.getByText('Elle statü, sistem statüsü değişince düşer.')).toBeVisible();
  if (telefon) await expect(page.getByRole('table')).toHaveCount(0);
  // Y1: dar ekranda hücre ve çip parmak boyunda.
  if (genislik < 1024) expect((await hucre.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // Y1: simge yalnız hücrenin anlamı lejantla verilir.
  await expect(page.getByRole('list', { name: 'Statü simgeleri' })).toBeVisible();
  const oncekiGenislik = telefon ? 0 : (await page.getByRole('region', { name: 'Adım matrisi' }).boundingBox())?.width ?? 0;
  await hucre.click();
  await expect(page.getByText('1 seçili')).toBeVisible();
  await expect(page.getByText('Operatör terminalde yalnız statüyü görür; not ve kişi terminale gitmez.')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Adım ayrıntısı' })).toBeVisible();
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
  await ac('/adim-durumu?gorunum=tablo');
  const satir = page.getByRole('checkbox', { name: /OP 30 seç$/ }).first();
  await expect(satir).toBeVisible();
  await satir.check();
  await page.getByLabel('Elle statü').selectOption('cizim');
  await page.getByRole('button', { name: /adıma Çizim revizyonu bekleniyor yaz$/ }).click();
  const onay = page.getByRole('region', { name: 'Yazma onayı' });
  const yenileme = page.waitForResponse((r) => r.request().method() === 'GET' && r.url().includes('/adimli-emirler/adim-matrisi'));
  await onay.getByRole('button', { name: /^\d+ adıma yaz$/ }).click();
  await expect(page.getByText(/^Son yazım: \d+ adım yazıldı/)).toBeVisible();
  expect(govdeler).toHaveLength(1);
  // Yazımdan sonra liste yenilenir; Geri al yenileme bittikten sonra da etkin kalır ve ikinci istek olarak gider.
  await yenileme;
  await expect(page.getByRole('button', { name: 'Geri al' })).toBeEnabled();
  await page.getByRole('button', { name: 'Geri al' }).click();
  await expect(page.getByText('Son yazım geri alındı.')).toBeVisible();
  expect(govdeler).toHaveLength(2);
  await sayfaTasmaz(page);
});

test('Tablo: adım başına satır, başlıktan sıralanır, sayfa taşmaz', async ({ page, ag, ac }) => {
  await ac('/adim-durumu?gorunum=tablo');
  const telefon = (page.viewportSize()?.width ?? 0) < 768;
  if (telefon) {
    await expect(page.getByRole('list', { name: 'Adımlar' }).getByRole('listitem').first()).toBeVisible();
  } else {
    const tablo = page.getByRole('table');
    await expect(tablo.getByRole('row').nth(1)).toBeVisible();
    await tablo.getByRole('button', { name: 'Termin' }).click();
    await expect(tablo.getByRole('columnheader', { name: /Termin/ })).toHaveAttribute('aria-sort', 'ascending');
  }
  await sayfaTasmaz(page);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test.describe('kalite (yalniz okur)', () => {
  test.use({ hesap: 'ornek.kalite' });
  test('seçim kapalı, nedeni görünür', async ({ page, ac }) => {
    await ac('/adim-durumu?gorunum=matris');
    await expect(page.getByText('Statü yazma yetkiniz yok. Yalnız okuyabilirsiniz.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tümünü seç' })).toBeDisabled();
  });
});

// Düzeltme turu (3604): çoklu seçimde panel kapanır, toplu şerit ile sonuç şeridi aynı kapta durur, tablo sabit sütunlu ve onay kutusu parmak boyundadır.
test('Çoklu seçimde panel kapanır; seçili şerit ve sonuç şeridi aynı yerde; görüntü alınır', async ({ page, ac }) => {
  const genislik = page.viewportSize()?.width ?? 0;
  const klasor = process.env['TMIV2_EKRAN_GORUNTU_KLASORU'];
  const resim = async (ad: string): Promise<void> => { if (klasor) await page.screenshot({ path: `${klasor}/${ad}-${String(genislik)}.png`, fullPage: false }); };
  await page.route('**/api/adimli-emirler/statu-toplu', async (r) => {
    const g = r.request().postDataJSON() as { kalemler: { emirId: number; isEmriId: number; statu: string | null }[] };
    await r.fulfill({ json: { kalemler: g.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: k.statu === null ? 'kaldirildi' : 'yazildi', neden: null })) } });
  });
  await ac('/adim-durumu?gorunum=matris');
  const telefon = genislik < 768;
  const hucre = telefon ? page.getByRole('list', { name: 'Emirler' }).getByRole('button', { name: /OP 30/ }).first() : page.getByRole('table').getByRole('button', { name: /^\S+, OP 30/ }).first();
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
  await expect(kap.getByRole('button', { name: 'Geri al' })).toBeVisible();
  await resim('3-yazma-sonucu-serit');
  await sayfaTasmaz(page);
});

test('Tablo: onay kutusu parmak boyunda, ilk sütunlar sabit, sayfa kaymaz', async ({ page, ac }) => {
  const genislik = page.viewportSize()?.width ?? 0;
  test.skip(genislik < 768, 'telefonda adım kartları');
  await ac('/adim-durumu?gorunum=tablo');
  const kutu = page.getByRole('checkbox', { name: /OP 30 seç$/ }).first();
  await expect(kutu).toBeVisible();
  const hedef = await kutu.locator('xpath=ancestor::label').boundingBox();
  expect(hedef?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(hedef?.height ?? 0).toBeGreaterThanOrEqual(44);
  const ilk = await page.getByRole('table').getByRole('button', { name: /^MM-/ }).first().boundingBox();
  const klasor = process.env['TMIV2_EKRAN_GORUNTU_KLASORU'];
  if (klasor) await page.screenshot({ path: `${klasor}/4-tablo-${String(genislik)}.png` });
  await page.getByRole('region', { name: 'Adım tablosu' }).evaluate((e) => { e.scrollLeft = 200; });
  if (klasor) await page.screenshot({ path: `${klasor}/4-tablo-kaydirilmis-${String(genislik)}.png` });
  const sonra = await page.getByRole('table').getByRole('button', { name: /^MM-/ }).first().boundingBox();
  expect(Math.abs((sonra?.x ?? 0) - (ilk?.x ?? 0)), 'Emir sütunu kaydırmada yerinde').toBeLessThan(2);
  await sayfaTasmaz(page);
});

test('Matris: panel açıkken hücre adı harf ortasında bölünmez', async ({ page, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'yan panel yalnız 1024 ve üstünde');
  await ac('/adim-durumu?gorunum=matris');
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

test('Matris: tam hücrede "…" düğmesi hücreyi itmez, hücre en az 7 rem', async ({ page, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'tam hücre yalnız 1024 ve üstünde');
  await ac('/adim-durumu?gorunum=matris');
  const hucre = page.getByRole('table').getByRole('button', { name: /^\S+, OP 30/ }).first();
  expect((await hucre.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(110);
  await hucre.click();
  const sonra = await hucre.boundingBox();
  const menu = page.getByRole('button', { name: /statü işlemleri/ });
  const m = await menu.boundingBox();
  expect((m?.x ?? 0) + (m?.width ?? 0), 'düğme hücrenin içinde').toBeLessThanOrEqual((sonra?.x ?? 0) + (sonra?.width ?? 0) + 1);
  expect(m?.x ?? 0, 'düğme hücreye biner, yan hücreye taşmaz').toBeGreaterThanOrEqual(sonra?.x ?? 0);
});

// Gerçek veride emir no uzundur (örn. sipariş öneki + emir no); sabit satır başlığı taşıp yandaki hücrenin tıklamasını yakalamamalı.
test('Matris: uzun emir no sabit başlığı taşırmaz, ilk hücre tıklanır', async ({ page, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, 'telefonda emir kartları');
  await page.route('**/api/adimli-emirler/adim-matrisi*', async (r) => {
    const res = await r.fetch();
    const j = await res.json() as { emirler: { emirNo: string }[] };
    j.emirler.forEach((e, i) => { e.emirNo = `SS_2026_003-MM-ORN-0000${String(i)}-26-11-006`; });
    await r.fulfill({ response: res, json: j });
  });
  await ac('/adim-durumu?gorunum=matris');
  const hucre = page.getByRole('table').getByRole('button', { name: /^\S+, OP \d+/ }).first();
  await expect(hucre).toBeVisible();
  await hucre.click({ timeout: 5000 });
  await expect(page.getByText(/^1 seçili$/)).toBeVisible();
  await sayfaTasmaz(page);
});
