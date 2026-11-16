import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// 3344: Logo'ya gidiş rozeti listede ve belge başlığında. Durum cevabı yönlendirilir (örnek veride Logo kaydı yoktur); sırayla her
// durum bir satıra düşer. 360, 768 ve 1280 genişlikte sayfa yatay taşmaz. Veriler uydurmadır (ORN-).
test.use({ hesap: 'ornek.yonetici' });

const SIRA = [
  { durum: 'durdu', kayitNo: null, neden: 'Birim Logo\'da yok' },
  { durum: 'logoda', kayitNo: '4211', neden: null },
  { durum: 'sirada', kayitNo: null, neden: null },
  { durum: 'proje-bekliyor', kayitNo: null, neden: 'Proje kartı Logo\'ya gidince gönderilir' },
  { durum: 'yeniden-denenecek', kayitNo: null, neden: 'Logo yardımcısına ulaşılamadı' },
] as const;

async function rozetleriYonlendir(page: Page) {
  await page.route('**/api/logo/belge-durumlari?*', (r) => {
    const idler = (new URL(r.request().url()).searchParams.get('id') ?? '').split(',').filter(Boolean).map(Number);
    return r.fulfill({ json: { durumlar: idler.map((id, i) => ({ id, ...SIRA[i % SIRA.length] })) } });
  });
}

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

test('malzeme kataloğunda Logo sütunu durum ve nedeni yazar', async ({ page, ag, ac }) => {
  await rozetleriYonlendir(page);
  await ac('/malzemeler');
  const tablo = page.getByRole('table', { name: 'Malzeme kataloğu' });
  await expect(tablo.getByText('Durdu').first()).toBeVisible();
  await expect(tablo.getByText('Logo\'da').first()).toBeVisible();
  // Geniş ekranda tablo yatay kayar; Logo sütunu görüntüde görünsün.
  await tablo.getByText('Durdu').first().scrollIntoViewIfNeeded();
  await page.locator('.tc-tablo-kap').first().evaluate((k) => { k.scrollLeft = k.scrollWidth; });
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('katalog.png') });
  expect(ag.hatalar).toEqual([]);
});

test('proje listesinde Logo sütunu', async ({ page, ag, ac }) => {
  await rozetleriYonlendir(page);
  await ac('/projeler');
  await expect(page.getByText('Durdu').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('projeler.png') });
  expect(ag.hatalar).toEqual([]);
});

test('sipariş başlığında "Logo: Durdu" ve listede Logo sütunu', async ({ page, ag, ac }) => {
  const id = await siparisAc(page);
  await rozetleriYonlendir(page);
  await ac(`/siparisler/${String(id)}`);
  await expect(page.getByText('Logo: Durdu').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('siparis-baslik.png') });
  await ac('/siparisler');
  await expect(page.getByText('Durdu').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('siparisler.png') });
  expect(ag.hatalar).toEqual([]);
});
