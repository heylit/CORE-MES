import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

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

test.describe('Listeden Logo\'da arama (3343)', () => {
  test('"Logo\'da ara" aramayı Logo\'da sürdürür; sonuç penceresi taşmaz', async ({ page, ag, ac }) => {
    const oneri = { kod: 'ORN-C-2001', ad: 'ORN Deneme Logo Cari', tur: 'musteri', ulkeKodu: 'TR', vergiNo: null, vergiDairesi: null, adres: null,
      ilce: null, il: 'Deneme Il', postaKodu: null, telefon: null, ePosta: null, logoCariKodu: 'ORN-C-2001' };
    await page.route('**/api/musteri-tedarikci/logo-cari/ara?*', (r) => r.fulfill({ json: { durum: 'tamam', ileti: null, cariler: [
      { logoKayitNo: 1, kod: 'ORN-C-2001', ad: 'ORN Deneme Logo Cari', aktif: true, vergiNo: null, il: 'Deneme Il', telefon: null, eslesme: null, alinamaz: null, oneri },
    ] } }));
    await ac('/musteri-tedarikci/musteriler');
    await page.getByRole('searchbox', { name: 'Ara' }).fill('ORN Deneme');
    await expect(page.getByRole('button', { name: "Logo'da ara" })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('liste-logo-ara.png') });
    await page.getByRole('button', { name: "Logo'da ara" }).click();
    const pencere = page.getByRole('dialog', { name: "Logo'da cari ara" });
    await expect(pencere.getByText('ORN Deneme Logo Cari').first()).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'pencerede yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('liste-logo-pencere.png') });
    await pencere.getByRole('button', { name: 'Forma al' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Yeni firma' })).toBeVisible();
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

// 3359 a: CRM satış müşterisi durumu. Örnek veride bağlı firma yok: liste ve ayrıntı cevabında bir müşteri bağlı gösterilir,
// CRM cevabı yönlendirilir (Logo'ya istek yok). Uydurma kod ORN-C-3001.
test.describe('Logo CRM durumu (3359)', () => {
  test('CRM varsa listede bağlı rozetinin yanında ve ayrıntıda "CRM"; taşma yok', async ({ page, ag, ac }) => {
    const f = await firmaBul(page, 'ORN-MUS-02');
    const bagli = { logoKayitNo: 3001, logoCariKodu: 'ORN-C-3001' };
    await page.route('**/api/musteri-tedarikci/firmalar?*', async (r) => {
      const c = await r.fetch();
      const g = await c.json() as { satirlar: FirmaSatiri[] };
      await r.fulfill({ response: c, json: { ...g, satirlar: g.satirlar.map((x) => (x.id === f.id ? { ...x, ...bagli } : x)) } });
    });
    await page.route(`**/api/musteri-tedarikci/firmalar/${String(f.id)}`, async (r) => {
      const c = await r.fetch();
      const g = await c.json() as { firma: object };
      await r.fulfill({ response: c, json: { ...g, firma: { ...g.firma, ...bagli, logoGonderimDurumu: 'gonderildi' } } });
    });
    const crm: string[] = [];
    await page.route('**/api/logo/cari-crm?*', (r) => {
      crm.push(new URL(r.request().url()).searchParams.get('id') ?? '');
      return r.fulfill({ json: { durumlar: [{ firmaId: f.id, durum: 'var', neden: null }] } });
    });
    await ac('/musteri-tedarikci/musteriler');
    const rozet = page.getByText('CRM', { exact: true }).filter({ visible: true }).first();
    await expect(rozet).toBeVisible();
    await rozet.scrollIntoViewIfNeeded();
    expect(crm.every((q) => q.split(',').includes(String(f.id)))).toBe(true);
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('crm-liste.png') });
    await ac(`/musteri-tedarikci/musteriler?firma=${String(f.id)}`);
    const pencere = page.getByRole('dialog', { name: f.ad, exact: true });
    await expect(pencere.getByText('Logo CRM')).toBeVisible();
    await expect(pencere.getByText('CRM', { exact: true })).toBeVisible();
    await pencere.getByText('Logo CRM').scrollIntoViewIfNeeded();
    expect((await tasmaOlc(page)).belge, 'ayrıntıda yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('crm-ayrinti.png') });
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
