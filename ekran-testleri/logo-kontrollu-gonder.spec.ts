import { expect, tasmaOlc, test } from './ortak.ts';

// 3626: belirsiz belgede iki adım (kontrol sonucu görünür, gönderme ayrı onay) ve Tek kayıt oku kartı; Logo cevapları sahte, 360/768/1280.
test.use({ hesap: 'ornek.yonetici' });
const zaman = '2026-11-16T09:30:00.000Z';

test('3626 belirsiz belge: önce kontrol sonucu, sonra ayrı onayla gönderme', async ({ page, ag, ac }) => {
  await page.route('**/api/logo/giden', (r) => r.fulfill({ json: {
    sayac: { durdu: 0, yenidenDenenecek: 1, kartBekliyor: 0, projeBekliyor: 0, sirada: 0 },
    belgeler: [{ belge: 'satin-alma-talebi', belgeAdi: 'Satın alma talebi ST-ORN-912', no: 912, islem: 'gonder', durum: 'yeniden-denenecek', neden: 'Logo belgeyi alıp almadığını bilmiyoruz.',
      neYapmali: 'Önce Logo\'da aranır.', yenidenGonderilebilir: false, kontrolEdilebilir: true, denemeSayisi: 1, sonDeneme: zaman, sonrakiDeneme: zaman }],
    kesildi: false,
  } }));
  await page.route('**/api/logo/giden/kontrol?*', (r) => r.fulfill({ json: { karar: 'yok', ileti: "Logo'da bu numaralı belge yok; gönderilebilir.", logoKayitNo: null } }));
  let uygulandi = false;
  await page.route('**/api/logo/giden/kontrollu-gonder', (r) => { uygulandi = true; return r.fulfill({ json: { sonuc: 'gonderime-alindi', ileti: "Logo'da yok; gönderime alındı. İlk turda gider.", logoKayitNo: null } }); });
  await ac('/guvenlik/baglantilar');
  await page.getByRole('table', { name: 'Gitmeyen belgeler' }).getByText('Satın alma talebi ST-ORN-912').click();
  await page.screenshot({ path: test.info().outputPath('kontrol-oncesi.png'), fullPage: true });
  await page.getByRole('button', { name: "Logo'da kontrol et" }).click();
  await expect(page.getByText("Logo'da bu numaralı belge yok; gönderilebilir.")).toBeVisible();
  expect(uygulandi).toBe(false);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('kontrol-sonucu.png'), fullPage: true });
  await page.getByRole('button', { name: "Logo'da yok, şimdi gönder" }).click();
  await expect.poll(() => uygulandi).toBe(true);
  expect(ag.hatalar).toEqual([]);
});

test('3626 tek kayıt oku: kısa kodda düğme kapalı ve nedeni yazılı; sonuç görünür', async ({ page, ag, ac }) => {
  await page.route('**/api/logo/yonetim/akislar/malzeme-karti/kayit?*', (r) => r.fulfill({ json: { sonuc: 'okundu', ileti: 'ORN-MLZ-1 okundu.' } }));
  await page.route('**/api/logo/yonetim/akislar/malzeme-karti/kayit-yaz', (r) => r.fulfill({ json: { sonuc: 'okundu', ileti: 'ORN-MLZ-1 (ORN mil): aynaya yeni eklendi.' } }));
  await ac('/logo');
  const kart = page;
  await page.getByRole('heading', { name: 'Tek kayıt oku' }).scrollIntoViewIfNeeded();
  await expect(kart.getByText('En az 3 karakter yazın.')).toBeVisible();
  await expect(kart.getByRole('button', { name: "Logo'dan oku" })).toBeDisabled();
  await kart.getByLabel('Stok kodu').fill('ORN-MLZ-1');
  await kart.getByRole('button', { name: "Logo'dan oku" }).click();
  await expect(kart.getByText('ORN-MLZ-1 (ORN mil): aynaya yeni eklendi.').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('tek-kayit.png'), fullPage: true });
  expect(ag.hatalar).toEqual([]);
});
