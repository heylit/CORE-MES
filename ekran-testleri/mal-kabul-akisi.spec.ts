import { expect, test } from './ortak.ts';

// Kart 3676 dilim 2c: telefonda kalem kalem mal kabul. Açık sipariş satırları ve kabul gönderimi sahte yanıtla verilir (örnek veride
// açık sipariş yok). Geniş ekranda akış düğmesi görünmez; form olduğu gibi kalır.
test.use({ hesap: 'ornek.depo' });

const satir = (id: number, ad: string, kalan: string) => ({
  id, siparisNo: `ORN-SIP-${String(id)}`, talepNo: '', tedarikciAdi: 'ORN Tedarikçi', malzemeId: 1, malzemeTur: 'hammadde', kalemAdi: ad,
  miktar: kalan, kalanMiktar: kalan, birim: 'adet', beklenenTeslim: '2026-12-01', stokBirimi: 'adet', donusum: null,
});

test('telefonda kalem kalem sayılır, fazla teslim uyarılır, sonuç sunucudan gelince başarı görünür', async ({ page, ag, ac }) => {
  await page.route('**/api/stok/acik-siparis-satirlari', (r) => r.fulfill({ json: { satirlar: [satir(9001, 'ORN kalem A', '10'), satir(9002, 'ORN kalem B', '5')] } }));
  const govdeler: { satirlar: { siparisSatirId?: number }[] }[] = [];
  let deneme = 0;
  await page.route('**/api/stok/mal-kabul', async (r) => {
    if (r.request().method() !== 'POST') { await r.fallback(); return; }
    deneme += 1;
    if (deneme === 1) { await r.fulfill({ status: 422, json: { hata: { kod: 'gecersiz', mesaj: 'Sunucu kabul etmedi' } } }); return; }
    govdeler.push(r.request().postDataJSON() as (typeof govdeler)[number]);
    await r.fulfill({ json: { belge: { id: 1, no: 'ORN-MK-1', tur: 'satin_alma', irsaliyeNo: null, irsaliyeTarihi: null, zaman: new Date().toISOString(), kisiAd: null, satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [1] } });
  });
  await ac('/stok/mal-kabul');
  const genislik = page.viewportSize()?.width ?? 0;
  const baslat = page.getByRole('button', { name: 'Kalem kalem say ve kabul et' });
  const secimler = page.getByRole('button', { name: 'Seç', exact: true });
  await expect(secimler.first()).toBeVisible();
  if (genislik >= 768) {
    await secimler.first().click();
    await expect(baslat).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
    return;
  }
  await secimler.nth(0).click();
  await secimler.nth(1).click();
  await baslat.click();
  const akis = page.getByRole('dialog', { name: 'Kalem kalem mal kabul' });
  const sonraki = akis.getByRole('button', { name: 'Sonraki' });
  await expect(akis.getByText('Miktar girin ya da kalem gelmediyse atlayın')).toBeVisible();
  await expect(sonraki).toBeDisabled();
  // Sonraki düğmesi kısa ekranda da görünür.
  await page.setViewportSize({ width: genislik, height: 560 });
  await expect(sonraki).toBeInViewport();
  await page.setViewportSize({ width: genislik, height: 700 });
  for (const t of ['1', '2']) await akis.getByRole('button', { name: t, exact: true }).click();
  await expect(akis.getByRole('alert')).toContainText('fazla teslim olarak yazılır');
  await expect(sonraki).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('akis-fazla.png') });
  await sonraki.click();
  await akis.getByRole('button', { name: 'Gelmedi' }).click();
  await expect(akis.getByText('1 kalem kabul edilecek, 1 kalem gelmedi')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('akis-ozet.png') });
  await akis.getByRole('button', { name: 'Kabul et' }).click();
  await expect(akis.getByText('Kabul kaydedilemedi. Girdiğiniz miktarlar korundu.')).toBeVisible();
  await expect(akis.getByText('Mal kabul kaydedildi')).toHaveCount(0);
  // Hata tek yerde: sayfa içi kutu; bildirim (toast) çıkmaz.
  await expect(page.getByRole('alert')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('akis-hata.png') });
  await akis.getByRole('button', { name: 'Tekrar dene' }).click();
  await expect(akis.getByText('Mal kabul kaydedildi')).toBeVisible();
  // Başarı ekranında eski hata yok; başarı bildirimi akış metniyle çiftlenmez.
  await expect(page.getByText('Kabul kaydedilemedi')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(govdeler[0]?.satirlar).toHaveLength(1);
  expect(govdeler[0]?.satirlar[0]?.siparisSatirId).toBe(9001);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sayfa yatay taşmaz').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('akis-basari.png') });
});

test('telefonda çıkışta girdiler silinsin mi sorulur', async ({ page, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'akış yalnız telefonda');
  await page.route('**/api/stok/acik-siparis-satirlari', (r) => r.fulfill({ json: { satirlar: [satir(9001, 'ORN kalem A', '10')] } }));
  await ac('/stok/mal-kabul');
  await page.getByRole('button', { name: 'Seç', exact: true }).first().click();
  await page.getByRole('button', { name: 'Kalem kalem say ve kabul et' }).click();
  const akis = page.getByRole('dialog', { name: 'Kalem kalem mal kabul' });
  await akis.getByRole('button', { name: '4', exact: true }).click();
  await akis.getByRole('button', { name: 'Kapat' }).click();
  const soru = page.getByRole('dialog', { name: 'Girdiler silinsin mi?' });
  await expect(soru).toBeVisible();
  await soru.getByRole('button', { name: 'Sil ve çık' }).click();
  await expect(akis).toHaveCount(0);
});
