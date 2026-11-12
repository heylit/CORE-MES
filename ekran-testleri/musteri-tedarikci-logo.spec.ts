import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, test } from './ortak.ts';

// Firma listesinde Logo bağı ve yan kutunun sığması (3065). Örnek veride Logo'ya bağlı firma yoktur (bağ yalnız Logo
// köprüsüyle kurulur); "Bağlı" rozeti istemci ve sunucu testlerinde ölçülür, burada bağlı olmayan satır ölçülür.

interface FirmaSatiri { id: number; kod: string | null; ad: string; logoKayitNo: number | null }
interface Ayrinti { firma: { id: number; surum: number }; adresler: { id: number; ad: string }[] }

async function firmaBul(page: Page, kod: string): Promise<FirmaSatiri> {
  const c = await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar?ara=${kod}`);
  expect(c.status(), await c.text()).toBe(200);
  const f = (await c.json() as { satirlar: FirmaSatiri[] }).satirlar.find((s) => s.kod === kod);
  if (f === undefined) throw new Error(`örnek veride ${kod} yok`);
  return f;
}

test.describe('Liste satırında Logo bağı', () => {
  test('bağlı olmayan firmada satırdaki "Logo\'ya bağla" ayrıntıyı açmadan Logo penceresini açar', async ({ page, ag, ac }) => {
    const f = await firmaBul(page, 'ORN-MUS-02');
    test.skip(f.logoKayitNo !== null, 'örnek firma bu veritabanında Logo\'ya bağlanmış');
    await ac('/musteri-tedarikci/musteriler');
    await page.getByRole('button', { name: `${f.ad} firmasını Logo'ya bağla` }).filter({ visible: true }).click();
    const pencere = page.getByRole('dialog', { name: `Logo'ya bağla: ${f.ad}` });
    await expect(pencere).toBeVisible();
    await expect(pencere.getByLabel("Logo'da ara")).toBeVisible();
    await expect(page.getByRole('dialog', { name: f.ad, exact: true })).toHaveCount(0);
    await pencere.getByRole('button', { name: 'Kapat' }).last().click();
    await expect(pencere).toHaveCount(0);
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('Yazamayan rol', () => {
  test.use({ hesap: 'ornek.depo' });
  test('bağlı olmayan firmada düğme yok, "Bağlı değil" yazar', async ({ page, ag, ac }) => {
    const f = await firmaBul(page, 'ORN-TED-02');
    test.skip(f.logoKayitNo !== null, 'örnek firma bu veritabanında Logo\'ya bağlanmış');
    await ac('/musteri-tedarikci/tedarikciler');
    const satir = page.getByRole('row').filter({ hasText: f.ad }).filter({ visible: true }).first();
    await expect(satir.getByText('Bağlı değil')).toBeVisible();
    await expect(page.getByRole('button', { name: /Logo'ya bağla/ })).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
  });
});

// Uzun adresli ek adres yan kutuyu genişletiyordu (gövde 440 px'te 660 px). Her genişlik kendi firmasına yazar: paralel
// koşu aynı kartın sürümünde çakışmasın. Eklenen adres test sonunda kaldırılır.
const GENISLIK_FIRMASI: Record<string, string> = { g360: 'ORN-TED-02', g768: 'ORN-MUS-02', g1280: 'ORN-TED-01' };

test('firma ayrıntısı yan kutuya sığar: yatay taşma yok, adresler kutuda kalır', async ({ page, ag, ac }, bilgi) => {
  const kod = GENISLIK_FIRMASI[bilgi.project.name] ?? 'ORN-TED-01';
  const f = await firmaBul(page, kod);
  const once = await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/${String(f.id)}`)).json() as Ayrinti;
  const ad = `EKRAN TESTI ${randomUUID().slice(0, 8).toUpperCase()} GENEL MUDURLUK DEPOSU`;
  const ekle = await page.request.post(`${ADRES}/api/musteri-tedarikci/firmalar/${String(f.id)}/adresler/ekle`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: {
      tur: 'teslim', ad, adres: 'Ornek Mahallesi Ornek Caddesi No: 296 Kat: 16, 06200 Ornek Ilce / Ornek Il', ilce: 'Ornek Ilce',
      il: 'ORNEK IL', postaKodu: '06200', surum: once.firma.surum,
    },
  });
  expect(ekle.status(), await ekle.text()).toBe(200);
  const sonra = await ekle.json() as Ayrinti;
  const adres = sonra.adresler.find((a) => a.ad === ad);
  try {
    await ac('/musteri-tedarikci');
    await page.getByRole('row').filter({ hasText: f.ad }).filter({ visible: true }).first().click();
    const kutu = page.getByRole('dialog', { name: f.ad, exact: true });
    await expect(kutu.getByText(ad)).toBeVisible();
    const olcu = await kutu.locator('.tc-pencere-govde').evaluate((g) => ({ en: g.scrollWidth, kutu: g.clientWidth }));
    expect(olcu.en).toBeLessThanOrEqual(olcu.kutu);
    expect(ag.hatalar).toEqual([]);
  } finally {
    if (adres !== undefined) {
      const guncel = await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/${String(f.id)}`)).json() as Ayrinti;
      await page.request.post(`${ADRES}/api/musteri-tedarikci/firmalar/${String(f.id)}/adresler/${String(adres.id)}/kaldir`, {
        data: { surum: guncel.firma.surum },
      });
    }
  }
});
