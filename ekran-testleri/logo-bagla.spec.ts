import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// 3360-2 a: ayrıntıda "Logo'da ara ve bağla" ve elle bağlanmış belgenin görünüşü. Rozet, arama ve bağlama cevabı yönlendirilir
// (Logo'ya istek yok); 360, 768 ve 1280 genişlikte pencere ve sayfa yatay taşmaz. Veriler uydurmadır (ORN-).
test.use({ hesap: 'ornek.yonetici' });

const gun = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function siparisAc(page: Page): Promise<number> {
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  const kart = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number }[] }).satirlar[0];
  test.skip(firma === undefined || kart === undefined, 'örnek veride müşteri firması ya da satılan kart yok');
  const c = await page.request.post(`${ADRES}/api/siparisler/ekle`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: {
      firmaId: firma?.id, musteriSiparisNo: null, siparisTarihi: gun(0), termin: gun(30), kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: kart?.no, miktar: '40', birimFiyat: '10', termin: null, aciklama: null }],
    },
  });
  expect(c.status(), await c.text()).toBe(200);
  return (await c.json() as { id: number }).id;
}

const bulgu = (ref: number, no: string, tarih: string, bagla: { uygun: boolean; neden: string | null }) => ({
  logoKayitNo: ref, no, belgeNo: null, tarih, cariKodu: 'ORN-C-1001', cariAdi: 'ORN Deneme Makina Sanayi ve Ticaret',
  projeKodu: null, projeAdi: null, aciklama: null, tutar: '48000', dovizTuru: null, iptal: !bagla.uygun, satirSayisi: 1,
  satirlar: [{ kod: 'ORN-MLZ-0042', ad: 'ORNEK Mil Ø40 uzun açıklamalı kart adı', miktar: '40', birim: 'ADET', aciklama: null }],
  core: null, bagla,
});

async function rozetYonlendir(page: Page, durum: 'sirada' | 'logoda'): Promise<void> {
  await page.route('**/api/logo/belge-durumlari?*', (r) => {
    const idler = (new URL(r.request().url()).searchParams.get('id') ?? '').split(',').filter(Boolean).map(Number);
    return r.fulfill({ json: { durumlar: idler.map((id) => (durum === 'logoda'
      ? { id, durum, kayitNo: '41', neden: null, elle: true }
      : { id, durum, kayitNo: null, neden: null, elle: false })) } });
  });
  await page.route('**/api/logo/belge-arama-durumu', (r) => r.fulfill({ json: { acik: true, neden: null } }));
}

test("sipariş ayrıntısında Logo'da ara ve bağla: uygun kayıtta Bağla, onayda tarih farkı", async ({ page, ag, ac }) => {
  const id = await siparisAc(page);
  await rozetYonlendir(page, 'sirada');
  const sorulan: string[] = [];
  await page.route('**/api/logo/belge-ara?*', (r) => {
    sorulan.push(new URL(r.request().url()).search);
    return r.fulfill({ json: {
      durum: 'tamam', ileti: null, fiyatGorunur: true,
      baglanacak: { no: 'ORN-SS-0007', tarih: gun(0), engel: null },
      belgeler: [
        bulgu(41, 'ORN-SS-141', '2026-11-12', { uygun: true, neden: null }),
        bulgu(42, 'ORN-SS-142', '2026-11-10', { uygun: false, neden: "Logo'da iptal ya da pasif; bağlanamaz." }),
      ],
    } });
  });
  let govde: unknown = null;
  await page.route('**/api/logo/belge-bagla', (r) => { govde = r.request().postDataJSON(); return r.fulfill({ json: { kayitNo: '41' } }); });
  await ac(`/siparisler/${String(id)}`);
  const dugme = page.getByRole('button', { name: "Logo'da ara ve bağla" });
  await expect(dugme).toBeVisible();
  await dugme.click();
  const pencere = page.getByRole('dialog', { name: "Logo'da satış siparişi ara" });
  await pencere.getByLabel('Aranan').fill('ORN-MLZ-0042');
  await pencere.getByRole('button', { name: 'Ara', exact: true }).click();
  await expect(pencere.getByText('ORN-SS-141')).toBeVisible();
  expect(sorulan).toEqual([`?tur=satis-siparisi&q=ORN-MLZ-0042&belge=${String(id)}`]);
  await expect(pencere.getByText("ORN-SS-0007 Logo'ya gitmedi.", { exact: false })).toBeVisible();
  await expect(pencere.getByText("Logo'da iptal ya da pasif; bağlanamaz.")).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('bagla-arama.png') });
  await pencere.getByRole('button', { name: 'Bağla', exact: true }).click();
  const onay = page.getByRole('dialog', { name: 'ORN-SS-0007 ↔ ORN-SS-141 bağlansın mı?' });
  await expect(onay).toBeVisible();
  await expect(onay.getByText(/^Fark var: tarih CORE .+, Logo 12\.11\.2026\.$/)).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('bagla-onay.png') });
  await onay.getByRole('button', { name: 'Bağla', exact: true }).click();
  await expect(onay).toBeHidden();
  expect(govde).toEqual({ tur: 'satis-siparisi', belgeId: id, logoKayitNo: 41 });
  expect(ag.yazmalar).toEqual(['POST /api/logo/belge-bagla']);
  expect(ag.hatalar).toEqual([]);
});

test('elle bağlanmış sipariş "elle bağlandı" ve yöneticide "Bağı kaldır" gösterir', async ({ page, ag, ac }) => {
  const id = await siparisAc(page);
  await rozetYonlendir(page, 'logoda');
  await ac(`/siparisler/${String(id)}`);
  await expect(page.getByText('elle bağlandı', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: "Logo'da ara ve bağla" })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bağı kaldır' }).click();
  await expect(page.getByRole('dialog', { name: 'Logo bağı kaldırılsın mı?' })).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('elle-bagli.png') });
  expect(ag.yazmalar).toEqual([]);
  expect(ag.hatalar).toEqual([]);
});
