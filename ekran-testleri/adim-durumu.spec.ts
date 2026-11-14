import { expect, test } from './ortak.ts';

// Adım Durumu (2893, düzen 2955): açık emir listeden seçilir, adımlar rota sırasıyla görünür, adım ayrıntısı yan pencerede açılır.
// Dar ekranda (1024 altı) emir seçilince liste gizlenir, "Emirler" düğmesi listeye döner.
test.use({ hesap: 'ornek.planlama' });

test('emir seçilir, adımlar ve sayaç görünür, adım ayrıntısı yan pencerede açılır', async ({ page, ag, ac }) => {
  await ac('/adim-durumu');
  const liste = page.getByRole('list', { name: 'Açık emirler' });
  const ilk = liste.getByRole('button').first();
  await expect(ilk).toBeVisible();
  await ilk.click();
  await expect(page).toHaveURL(/emir=\d+/);

  const adimlar = page.getByRole('list', { name: 'Adımlar' });
  await expect(adimlar.getByRole('listitem').first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Adım özeti' })).toBeVisible();
  const dar = (page.viewportSize()?.width ?? 0) < 1024;
  if (dar) await expect(liste).toBeHidden();
  else await expect(ilk).toHaveAttribute('aria-current', 'true');

  await adimlar.getByRole('button').first().click();
  const pencere = page.getByRole('dialog');
  await expect(pencere.getByText('Neden bekliyor')).toBeVisible();
  await expect(pencere.getByRole('heading', { name: 'Hazırlık', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pencere).toBeHidden();

  await page.getByRole('button', { name: 'Matris' }).click();
  await expect(page.getByRole('table', { name: 'Hazırlık matrisi' })).toBeVisible();

  if (dar) {
    await page.getByRole('button', { name: 'Emirler' }).click();
    await expect(liste).toBeVisible();
    await expect(page).not.toHaveURL(/emir=/);
  }
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'okuma ve seçim yazmaz').toEqual([]);
});

// Uzun emir no kartın dışına taşmaz ve durum etiketiyle üst üste binmez; kısaltılmaz (tamamı okunur).
test('uzun emir no listede tam okunur, kart dışına taşmaz, etiketle çakışmaz', async ({ page, ag, ac }) => {
  const uzun = 'ORN-000000-XX-ORN-00001-26-11-002';
  await page.route('**/api/adimli-emirler', async (r) => {
    const c = await r.fetch();
    const g = (await c.json()) as { emirler: { emirNo: string }[] };
    await r.fulfill({ response: c, json: { ...g, emirler: g.emirler.map((e) => ({ ...e, emirNo: uzun })) } });
  });
  await ac('/adim-durumu');
  const liste = page.getByRole('list', { name: 'Açık emirler' });
  const kart = liste.getByRole('button').first();
  await expect(kart).toBeVisible();
  const kod = kart.locator('.tc-emir-kod');
  await expect(kod).toHaveText(uzun);
  const k = await kart.boundingBox();
  const n = await kod.boundingBox();
  const r = await kart.locator('.tc-rozet').first().boundingBox();
  if (!k || !n || !r) throw new Error('kutu yok');
  expect(n.x + n.width).toBeLessThanOrEqual(k.x + k.width);
  expect(r.x + r.width).toBeLessThanOrEqual(k.x + k.width);
  const cakisir = n.x < r.x + r.width && r.x < n.x + n.width && n.y < r.y + r.height && r.y < n.y + n.height;
  expect(cakisir, 'emir no ile durum etiketi üst üste').toBe(false);
  expect(ag.hatalar).toEqual([]);
});

// Matris hücresi (müdür): eksik hücre düğmedir, pencerede gerekçe ister; Vazgeç yazmadan kapatır. Yazma bu testte yapılmaz.
test.describe('müdür', () => {
  test.use({ hesap: 'ornek.mudur' });
  test('matriste eksik hücreye tıklanır, elle onay penceresi açılır, Vazgeç yazmaz', async ({ page, ag, ac }) => {
    await ac('/adim-durumu');
    await page.getByRole('list', { name: 'Açık emirler' }).getByRole('button').first().click();
    await page.getByRole('button', { name: 'Matris' }).click();
    const tablo = page.getByRole('table', { name: 'Hazırlık matrisi' });
    const hucre = tablo.getByRole('button', { name: /Elle onayla$/ }).first();
    await hucre.scrollIntoViewIfNeeded();
    await hucre.click();
    const pencere = page.getByRole('dialog');
    await expect(pencere.getByText('Sistemin dediği', { exact: true })).toBeVisible();
    await expect(pencere.getByRole('button', { name: 'Elle onayla' })).toBeDisabled();
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(pencere).toBeHidden();
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar, 'Vazgeç yazmaz').toEqual([]);
  });
});

// 3249 b: açılan satır (müdür). Satırın okuyla liste açılır; madde satırı ve ekleme düğmeleri görünür, sayfa yatay taşmaz,
// telefonda tik satırı ve düğmeler parmak boyundadır (44 px). Yazma yapılmaz; Madde penceresi Vazgeç ile kapanır.
test.describe('müdür, açılan satır', () => {
  test.use({ hesap: 'ornek.mudur' });
  test('satır açılır, madde ekleme penceresi açılıp kapanır, sayfa taşmaz', async ({ page, ag, ac }) => {
    await ac('/adim-durumu');
    await page.getByRole('list', { name: 'Açık emirler' }).getByRole('button').first().click();
    await page.getByRole('button', { name: 'Matris' }).click();
    const tablo = page.getByRole('table', { name: 'Hazırlık matrisi' });
    const ac1 = tablo.getByRole('button', { name: /^OP \d+ maddeleri$/ }).first();
    await ac1.click();
    await expect(ac1).toHaveAttribute('aria-expanded', 'true');
    const madde = tablo.getByRole('button', { name: 'Madde', exact: true }).first();
    await expect(madde).toBeVisible();
    const genislik = page.viewportSize()?.width ?? 0;
    // OP kodu tek satırdır (Arayüz K1): kodun yüksekliği bir satırı geçmez.
    const kod = tablo.locator('.tc-ad-mx-ad .tc-emir-kod').first();
    const satir = await kod.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight) || e.getBoundingClientRect().height);
    expect((await kod.boundingBox())?.height ?? 0).toBeLessThanOrEqual(satir + 1);
    if (genislik < 1024) expect((await madde.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    const telefon = genislik < 768;
    if (telefon) {
      for (const k of [await ac1.boundingBox(), await madde.boundingBox()]) expect(k?.height ?? 0).toBeGreaterThanOrEqual(44);
      const kutu = tablo.getByRole('checkbox').first();
      if (await kutu.count() > 0) expect((await kutu.locator('xpath=..').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const tasma = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(tasma, 'sayfa yatay taşmaz').toBeLessThanOrEqual(0);
    await madde.click();
    const pencere = page.getByRole('dialog');
    await expect(pencere.getByRole('button', { name: 'Ekle' })).toBeDisabled();
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(pencere).toBeHidden();
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar, 'açmak ve Vazgeç yazmaz').toEqual([]);
  });
});
