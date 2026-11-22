import { expect, test } from './ortak.ts';

// Adım Durumu (2893, 3581): açık emir listeden seçilir, adımlar tek tabloda satır satır görünür, ayrıntı satırın altında açılır.
// Dar ekranda (1024 altı) emir seçilince liste gizlenir, "Emirler" düğmesi listeye döner.
test.use({ hesap: 'ornek.planlama' });

test('emir seçilir, adımlar ve sayaç görünür, adım ayrıntısı satırın altında açılır', async ({ page, ag, ac }) => {
  await ac('/adim-durumu');
  const liste = page.getByRole('list', { name: 'Açık emirler' });
  const ilk = liste.getByRole('button').first();
  await expect(ilk).toBeVisible();
  await ilk.click();
  await expect(page).toHaveURL(/emir=\d+/);

  const tablo = page.getByRole('table');
  await expect(tablo.getByRole('row').nth(1)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Adım özeti' })).toBeVisible();
  const dar = (page.viewportSize()?.width ?? 0) < 1024;
  if (dar) await expect(liste).toBeHidden();
  else await expect(ilk).toHaveAttribute('aria-current', 'true');

  const ac1 = tablo.getByRole('button', { name: /^OP \d+ .* ayrıntısı$/ }).first();
  // 3581 Test B1: tablo kapsayıcısından geniş olmaz (kapalı ve açık satırda), açma düğmesi kesilmez.
  const tasmaz = async (): Promise<void> => {
    const t = await page.evaluate(() => { const k = document.querySelector('.tc-at-kap'); const tb = k?.querySelector('table'); return { kap: k?.clientWidth ?? 0, tablo: tb?.scrollWidth ?? 0 }; });
    expect(t.tablo, 'tablo kapsayıcıdan geniş olmaz').toBeLessThanOrEqual(t.kap);
  };
  await tasmaz();
  await ac1.click();
  await expect(ac1).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: /^OP \d+ .* ayrıntısı$/ })).toBeVisible();
  await tasmaz();
  // Test B2: dar ekranda madde çipi parmak boyunda.
  if ((page.viewportSize()?.width ?? 0) < 1024) expect((await tablo.getByRole('button', { name: /Ayrıntıyı aç$/ }).first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('region', { name: /^OP \d+ durum$/ })).toBeVisible();
  await ac1.click();
  await expect(ac1).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sayfa yatay taşmaz').toBeLessThanOrEqual(0);

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

// 3322, 3581 (müdür): hazırlık çipi satırın altını açar; Elle değiştir gerekçe ister, Vazgeç yazmaz. Yazma bu testte yapılmaz.
test.describe('müdür', () => {
  test.use({ hesap: 'ornek.mudur' });
  test('çipe basılır, ayrıntı ve elle değiştirme alanı açılır, Vazgeç yazmaz', async ({ page, ag, ac }) => {
    await ac('/adim-durumu');
    await page.getByRole('list', { name: 'Açık emirler' }).getByRole('button').first().click();
    const cip = page.getByRole('table').getByRole('button', { name: /^OP \d+ .*Ayrıntıyı aç$/ }).first();
    await cip.scrollIntoViewIfNeeded();
    await cip.click();
    const bolge = page.getByRole('region', { name: /^OP \d+ .* ayrıntısı$/ });
    await expect(bolge.getByText(/^Kaynak: /).first()).toBeVisible();
    await bolge.getByRole('button', { name: /^Elle değiştir…/ }).first().click();
    const kutu = bolge.getByRole('group', { name: /elle değiştir$/ });
    await expect(kutu).toBeVisible();
    await kutu.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(kutu).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sayfa yatay taşmaz').toBeLessThanOrEqual(0);
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
    const tablo = page.getByRole('table');
    const ac1 = tablo.getByRole('button', { name: /^OP \d+ .* ayrıntısı$/ }).first();
    await ac1.click();
    await expect(ac1).toHaveAttribute('aria-expanded', 'true');
    const madde = tablo.getByRole('button', { name: 'Madde', exact: true }).first();
    await expect(madde).toBeVisible();
    const genislik = page.viewportSize()?.width ?? 0;
    // OP kodu tek satırdır (Arayüz K1): kodun yüksekliği bir satırı geçmez.
    const kod = tablo.locator('.tc-at-op .tc-emir-kod').first();
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

// 3249-2 a (müdür): türlü kontrol satırları ve elle eklenmiş madde görünür. Örnek veride türlü madde olmadığından adım durumu cevabına
// uydurma ORN- maddeler eklenir; yetki bayrakları sunucunun gerçek cevabıdır. Elle eklenmiş maddede Kaldır sorar (3494-3 a), sınır dışı
// ölçüm metniyle okunur, ölçüm penceresi uyarır; Vazgeç yazmaz; sayfa üç genişlikte yatay taşmaz.
test.describe('müdür, türlü kontrol', () => {
  test.use({ hesap: 'ornek.mudur' });
  test('kanıt hücreleri, elle maddeyi kaldır sorusu, ölçüm ve kontrol adımı pencereleri; sayfa taşmaz, yazmaz', async ({ page, ag, ac }) => {
    const taban = { aciklama: null, asama: 'hazirlik', tamam: false, kisiAdi: null, zaman: null, kaynak: null, kanit: null, ekleyenAdi: null, eklenme: null, olcum: null, secim: null, fotoOzet: null, sinirDisi: null };
    let yetki = { sablon: false };
    await page.route('**/api/adimli-emirler/*/adim-durumu', async (r) => {
      const c = await r.fetch();
      const g = (await c.json()) as { yetki: typeof yetki; adimlar: { liste: unknown[]; sablon: unknown }[] };
      yetki = g.yetki;
      const [ilk, ...kalan] = g.adimlar;
      if (!ilk) throw new Error('adım yok');
      const liste = [
        ...ilk.liste,
        { ...taban, adimId: 990001, ad: 'ORN delik çapı', kontrol: { tur: 'olcum', ad: 'ORN delik çapı', alt: 12, ust: 12.018, birim: 'mm' } },
        { ...taban, adimId: 990002, ad: 'ORN toplam boy', tamam: true, kisiAdi: 'ORN Kişi', zaman: '2026-11-15T05:00:00.000Z', kaynak: 'adim-durumu', kontrol: { tur: 'olcum', ad: 'ORN toplam boy', alt: 24.95, ust: 25.05, birim: 'mm' }, olcum: 25.07, sinirDisi: true },
        { ...taban, adimId: 990003, ad: 'ORN çapak durumu', kontrol: { tur: 'secim', secenekler: ['Çapaksız', 'Hafif, temizlendi', 'Çapaklı'] } },
        { ...taban, adimId: 990004, ad: 'ORN bağlama fotoğrafı', kontrol: { tur: 'foto', aciklama: 'Ayna ve pabuçlar görünsün' } },
        { ...taban, adimId: 990005, ad: 'ORN özel sıkma pabucu', kontrol: null, ekleyenAdi: 'ORN Kişi', eklenme: '2026-11-15T04:00:00.000Z' },
      ];
      await r.fulfill({ response: c, json: { ...g, adimlar: [{ ...ilk, liste, sablon: { id: 990021, kod: 'ORN-HAZ', ad: 'ORN hazırlık' } }, ...kalan] } });
    });
    await ac('/adim-durumu');
    await page.getByRole('list', { name: 'Açık emirler' }).getByRole('button').first().click();
    const tablo = page.getByRole('table');
    await tablo.getByRole('button', { name: /^OP \d+ .* ayrıntısı$/ }).first().click();
    await expect(tablo.getByText(/25,07 mm · sınır dışı \(\+0,02\)/).filter({ visible: true })).toBeVisible();
    await expect(tablo.getByRole('radiogroup', { name: 'ORN çapak durumu' })).toBeVisible();
    await expect(tablo.getByRole('button', { name: 'Fotoğraf ekle' })).toBeVisible();
    await expect(tablo.getByRole('checkbox', { name: /ORN özel sıkma pabucu$/ })).toBeEnabled();
    await tablo.getByRole('button', { name: 'Kaldır: ORN özel sıkma pabucu' }).click();
    const soru = tablo.getByRole('group', { name: 'ORN özel sıkma pabucu kaldırılsın mı?' });
    await expect(soru).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'soru açıkken sayfa taşmaz').toBeLessThanOrEqual(0);
    await soru.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(soru).toBeHidden();
    const genislik = page.viewportSize()?.width ?? 0;
    if (genislik < 768) {
      for (const d of [tablo.getByRole('button', { name: 'Değer gir' }), tablo.getByRole('radio', { name: 'Çapaksız' })]) {
        expect((await d.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
    const tasma = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await tasma(), 'sayfa yatay taşmaz').toBeLessThanOrEqual(0);
    await tablo.getByRole('button', { name: 'Değer gir' }).click();
    // 3581: ölçüm girişi açılan satırda satır içi açılır (pencere değil).
    const olcum = tablo.locator('.tc-ad-hucre-pencere').filter({ has: page.getByLabel('Ölçülen değer (mm)') });
    await olcum.getByLabel('Ölçülen değer (mm)').fill('12,024');
    await expect(olcum.getByRole('status')).toContainText('Sınır dışı.');
    await olcum.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(olcum).toBeHidden();
    await tablo.getByRole('button', { name: 'Kontrol adımı', exact: true }).first().click();
    const pencere = page.getByRole('dialog');
    await pencere.getByRole('radio', { name: 'Seçim' }).click();
    await expect(pencere.getByRole('textbox', { name: 'Seçenek 2' })).toBeVisible();
    await pencere.getByRole('radio', { name: 'Ölçüm' }).click();
    await expect(pencere.getByLabel('Alt sınır')).toBeVisible();
    await expect(pencere.getByLabel('Şablona da ekle')).toHaveCount(yetki.sablon ? 1 : 0);
    if (yetki.sablon) await expect(pencere.getByLabel('Şablona da ekle')).not.toBeChecked();
    expect(await tasma(), 'pencere açıkken sayfa yatay taşmaz').toBeLessThanOrEqual(0);
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(pencere).toBeHidden();
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar, 'açmak ve Vazgeç yazmaz').toEqual([]);
  });
});
