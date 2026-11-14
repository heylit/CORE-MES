import { randomUUID } from 'node:crypto';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// Teklif formu (3245 d): fiyatı gören satış hesabı sürümü verilmiş teklifte formu açar; kâğıt pencereye sığacak kadar küçülür,
// 360, 768 ve 1280 genişlikte yatay taşma yoktur. Form yalnız okur; basım tarayıcının işidir, burada açılmaz.
test.use({ hesap: 'ornek.satis' });

test('Teklif formu: satış hesabı şablonla formu açar, toplamlar ve kâğıt taşmadan çizilir', async ({ page, ag, ac }) => {
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  const kart = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number }[] }).satirlar[0];
  test.skip(firma === undefined || kart === undefined, 'örnek veride müşteri firması ya da satılan kart yok');
  const ekle = await page.request.post(`${ADRES}/api/siparisler/teklifler/ekle`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: { firmaId: firma?.id, baslik: 'Ekran testi teklif formu', satirlar: [{ malzemeNo: kart?.no, tanim: `Ekran testi ${randomUUID().slice(0, 8)}`, miktar: '40' }] },
  });
  expect(ekle.status(), await ekle.text()).toBe(200);
  const t = await ekle.json() as { id: number; no: string; surum: number; satirlar: { id: number }[] };
  const ver = await page.request.post(`${ADRES}/api/siparisler/teklifler/${String(t.id)}/surum-ver`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: { surum: t.surum, fiyatlar: [{ satirId: t.satirlar[0]?.id, birimFiyat: '10' }], teslimGun: 14, gecerlilik: '2099-01-01' },
  });
  expect(ver.status(), await ver.text()).toBe(200);

  await ac(`/siparisler/teklifler/${String(t.id)}`);
  await page.getByRole('button', { name: 'Teklif formu' }).click();
  const pencere = page.getByRole('dialog', { name: new RegExp(`Teklif formu · ${t.no}`) });
  await expect(pencere.getByRole('article', { name: `Teklif ${t.no}` })).toBeVisible();
  await expect(pencere.getByText('400,00').first()).toBeVisible();
  await expect(pencere.getByText('480,00 TRY')).toBeVisible();
  await expect(pencere.getByRole('button', { name: 'Yazdır / PDF' })).toBeEnabled();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});
