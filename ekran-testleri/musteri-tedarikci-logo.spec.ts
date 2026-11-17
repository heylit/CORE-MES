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

// 3359 a ve 3391 a: CRM satış müşterisi durumu. Örnek veride bağlı firma yok: liste ve ayrıntı cevabında bir müşteri bağlı gösterilir,
// CRM cevabı yönlendirilir (Logo'ya istek yok). Uydurma kodlar ORN-C-3001, ORN-CRM-.
async function bagliGoster(page: Page, f: FirmaSatiri, kodlar: { kodlar: string[]; sayi: number; secilebilir?: boolean } | null): Promise<string[]> {
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
    return r.fulfill({ json: { durumlar: [{ firmaId: f.id, durum: 'var', neden: null, kodlar: kodlar && { secilebilir: false, ...kodlar } }] } });
  });
  return crm;
}

test.describe('Logo CRM durumu (3359, 3391)', () => {
  test('CRM varsa listede bağlı rozetinin yanında "CRM", ayrıntıda kod; taşma yok', async ({ page, ag, ac }) => {
    const f = await firmaBul(page, 'ORN-MUS-02');
    const crm = await bagliGoster(page, f, { kodlar: ['ORN-CRM-3001'], sayi: 1 });
    await ac('/musteri-tedarikci/musteriler');
    const rozet = page.getByText('CRM', { exact: true }).filter({ visible: true }).first();
    await expect(rozet).toBeVisible();
    await rozet.scrollIntoViewIfNeeded();
    expect(crm.every((q) => q.split(',').includes(String(f.id)))).toBe(true);
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('crm-liste.png') });
    await ac(`/musteri-tedarikci/musteriler?firma=${String(f.id)}`);
    const pencere = page.getByRole('dialog', { name: f.ad, exact: true });
    await expect(pencere.getByText('Logo CRM satış müşterisi')).toBeVisible();
    await expect(pencere.getByText('ORN-CRM-3001', { exact: true })).toBeVisible();
    await expect(pencere.getByText('(tekliflerde kullanılır)')).toHaveCount(0);
    await pencere.getByText('Logo CRM satış müşterisi').scrollIntoViewIfNeeded();
    expect((await tasmaOlc(page)).belge, 'ayrıntıda yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('crm-ayrinti.png') });
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('cari birden fazla CRM müşterisine bağlıysa listede "CRM ×N", ayrıntıda ilki ve uyarı; kod bölünmez, taşma yok', async ({ page, ag, ac }) => {
    const f = await firmaBul(page, 'ORN-MUS-02');
    const kodlar = Array.from({ length: 20 }, (_, i) => `ORN-CRM-UZUN-KOD-${String(3002 + i)}`);
    await bagliGoster(page, f, { kodlar, sayi: 22 });
    await ac('/musteri-tedarikci/musteriler');
    const rozet = page.getByText('CRM ×22', { exact: true }).filter({ visible: true }).first();
    await expect(rozet).toBeVisible();
    await rozet.scrollIntoViewIfNeeded();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('crm-cok-liste.png') });
    await ac(`/musteri-tedarikci/musteriler?firma=${String(f.id)}`);
    const pencere = page.getByRole('dialog', { name: f.ad, exact: true });
    await expect(pencere.getByText('(tekliflerde kullanılır)')).toBeVisible();
    const uyari = pencere.getByRole('status').filter({ hasText: 'CRM müşterisine bağlı' });
    await expect(uyari).toContainText("Bu cari Logo'da 22 CRM müşterisine bağlı. Teklif ilkiyle gider; yanlışsa Logo'da fazla bağı kaldırın. ORN-CRM-UZUN-KOD-3002, ");
    await expect(uyari).toContainText('ORN-CRM-UZUN-KOD-3021, +2 kod daha');
    const ilk = uyari.getByText('ORN-CRM-UZUN-KOD-3002', { exact: true });
    const kutu = await ilk.boundingBox();
    expect(kutu, 'kod görünür').not.toBeNull();
    expect(await ilk.evaluate((e) => e.getClientRects().length), 'kod bölünmez').toBe(1);
    await uyari.scrollIntoViewIfNeeded();
    expect((await tasmaOlc(page)).belge, 'ayrıntıda yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('crm-cok-ayrinti.png') });
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('Logo CRM seçimi (3391-2)', () => {
  test('çok bağlı caride seçim penceresi Logo\'daki kodları listeler; kaydedince seçilen kod yazar; taşma yok', async ({ page, ag, ac }) => {
    const f = await firmaBul(page, 'ORN-MUS-02');
    await bagliGoster(page, f, { kodlar: ['ORN-CRM-UZUN-KOD-3002', 'ORN-CRM-UZUN-KOD-3017'], sayi: 2, secilebilir: true });
    let govde: unknown = null;
    await page.route(`**/api/musteri-tedarikci/firmalar/${String(f.id)}/logo-crm-sec`, async (r) => {
      govde = r.request().postDataJSON();
      const c = await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/${String(f.id)}`);
      const g = await c.json() as { firma: object };
      await r.fulfill({ json: { firma: { ...g.firma, logoCariKodu: 'ORN-C-3001', logoKayitNo: 3001, logoCrmKodu: 'ORN-CRM-UZUN-KOD-3017' } } });
    });
    await ac(`/musteri-tedarikci/musteriler?firma=${String(f.id)}`);
    const pencere = page.getByRole('dialog', { name: f.ad, exact: true });
    await pencere.getByRole('button', { name: 'CRM müşterisini seç' }).click();
    const secim = page.getByRole('dialog', { name: 'Tekliflerde kullanılacak CRM müşterisi' });
    await expect(secim.getByRole('radio')).toHaveCount(3);
    await secim.getByRole('radio', { name: 'ORN-CRM-UZUN-KOD-3017' }).check();
    expect((await tasmaOlc(page)).belge, 'pencerede yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('crm-secim.png') });
    await secim.getByRole('button', { name: 'Kaydet' }).click();
    await expect(secim).toBeHidden();
    expect(govde).toMatchObject({ kod: 'ORN-CRM-UZUN-KOD-3017' });
    await expect(pencere.getByText('(seçildi, tekliflerde kullanılır)')).toBeVisible();
    await pencere.getByText('Logo CRM satış müşterisi').scrollIntoViewIfNeeded();
    expect((await tasmaOlc(page)).belge, 'ayrıntıda yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('crm-secildi.png') });
    expect(ag.yazmalar).toEqual([`POST /api/musteri-tedarikci/firmalar/${String(f.id)}/logo-crm-sec`]);
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
