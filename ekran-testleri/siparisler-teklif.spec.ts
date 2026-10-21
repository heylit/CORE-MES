import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// Teklif termin ve fiyat ekranı (44): 360, 768 ve 1280 genişlikte yatay taşma yok, termin, kâr ve sürüm düğmesi görünür.
// Örnek ortamda planlama motoru kayıtlı değildir: plan yolu deneme cevabı yönlendirilerek, elle yol gerçek sunucuyla çizilir.
test.use({ hesap: 'ornek.yonetici' });

const DENEME = {
  durum: 'hazir', planSurumu: '1', gecerlilik: null, istenenTermin: null, planTermini: '2099-07-14', termin: '2099-07-14', terminGun: null,
  yetisir: null, onayGerekli: false, satinalmaGerekli: true, maliyetToplami: '400.00', genelGiderSaatBasi: '10.00',
  kayanlar: [{ siparis: 'ORN-SS-1', once: '2099-07-01T10:00:00+03:00', sonra: '2099-07-04T10:00:00+03:00', termin: '2099-07-02', gecikir: true }],
};

// Örnek veriden müşteri firması ve satılan kart seçilir; teklif API'den açılır (ekran kaydı yazmaz, yalnız çizer).
async function teklifAc(page: Page): Promise<{ id: number; satirId: number; tanim: string }> {
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  const kart = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number; ad: string | null }[] }).satirlar[0];
  test.skip(firma === undefined || kart === undefined, 'örnek veride müşteri firması ya da satılan kart yok');
  const tanim = `Ekran testi ${randomUUID().slice(0, 8)}`;
  const c = await page.request.post(`${ADRES}/api/siparisler/teklifler/ekle`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: { firmaId: firma?.id, baslik: 'Ekran testi teklifi', satirlar: [{ malzemeNo: kart?.no, tanim, miktar: '40' }] },
  });
  expect(c.status(), await c.text()).toBe(200);
  const t = await c.json() as { id: number; satirlar: { id: number }[] };
  return { id: t.id, satirId: t.satirlar[0]?.id ?? 0, tanim };
}

test('Teklif termin ve fiyat: plan denemesiyle termin, maliyet, kâr ve fiyat taşmadan çizilir', async ({ page, ag, ac }) => {
  const t = await teklifAc(page);
  await page.route(`**/api/siparisler/teklifler/${String(t.id)}/termin-denemesi**`, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ...DENEME,
      istenenTermin: new URL(r.request().url()).searchParams.get('istenenTermin'),
      kalemler: [{
        satirId: t.satirId, sira: 1, tanim: t.tanim, malzemeNo: 1, adet: '40', plansiz: false, yerlesti: true, bitis: '2099-07-10T16:00:00+03:00', planTermini: '2099-07-14',
        malzemeGelisi: '2099-07-03T08:00:00+03:00', satinalma: [{ kod: 'ORN-HM', miktar: '12.5', birim: 'kg', gelis: '2099-07-03T08:00:00+03:00' }],
        birimMaliyet: '10.0000', toplamMaliyet: '400.00', eksikVeri: [],
        dokum: [{ tur: 'malzeme', ad: 'Malzeme', tezgah: null, saat: null, tutar: '100.00' }, { tur: 'isleme', ad: '10', tezgah: 'ORN-T1', saat: '2.00', tutar: '300.00' }],
      }],
    }),
  }));
  await ac(`/siparisler/teklifler/${String(t.id)}`);
  const form = page.getByRole('form', { name: 'Sürüm formu' });
  await expect(form.getByText('14.07.2099').first()).toBeVisible();
  await expect(form.getByRole('group', { name: 'Kâr oranı' })).toBeVisible();
  await expect(form.getByRole('table', { name: 'Maliyet dökümü' })).toBeVisible();
  await expect(form.getByLabel(new RegExp(`^${t.tanim} birim fiyat`))).toHaveValue('12,50');
  await form.getByLabel(/Başka termin/).check();
  await form.getByLabel('İstenen termin').fill('2099-07-05');
  await expect(form.getByRole('table', { name: 'Bitişi değişen siparişler' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Teklifi ver' })).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('Teklif termin ve fiyat: motor bağlı değilken elle fiyat ve termin taşmadan çizilir', async ({ page, ag, ac }) => {
  const t = await teklifAc(page);
  await ac(`/siparisler/teklifler/${String(t.id)}`);
  const form = page.getByRole('form', { name: 'Sürüm formu' });
  await expect(form.getByText('Termin denemesi kullanılamıyor')).toBeVisible();
  await expect(form.getByLabel('Termin tarihi')).toBeVisible();
  await expect(form.getByLabel(new RegExp(`^${t.tanim} birim fiyat`))).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});
