import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// 3658: İş emri gönderimi üretim emri başına gruplu, operasyon operasyon. SmartES verisi sahte cevapla gelir; kodlar ve adlar uydurmadır.
test.use({ hesap: 'ornek.yonetici' });

const adim = (ek: Record<string, unknown>) => ({
  isEmriId: 1, opNo: 10, ad: 'ORN Tornalama', durum: 'gonderildi', gonderilmez: null, kapandi: false, smartesIsEmriNo: 'ORN-1-10', coreIstasyonKodu: 'ORN-TRN-1',
  smartesIstasyonKodu: 'TRN-ORN', istasyonEslemesi: 'istasyon', operasyonTipi: 'TRN', operasyonOneki: 'TRN', operasyonKodu: 'TRN10', kodKaynagi: 'onek', makineKodu: 'ORN-M1',
  adet: 25, denemeSayisi: 1, sonDeneme: '2026-11-24T08:00:00.000Z', sonrakiDeneme: null, neden: null,
  gidecekKod: 'TRN10', gidecekNedenKodu: null, gidecekNeden: null, eskiKural: false,
  alanlar: [{ ad: 'WorkOrderNo', deger: 'ORN-1-10' }, { ad: 'WorkstationCode', deger: 'TRN-ORN' }, { ad: 'OperationCode', deger: 'TRN10' }, { ad: 'Quantity', deger: '25' }], ...ek,
});

const CEVAP = {
  toplam: 3, sayfa: 1, sayfaBoyu: 20, sorunlu: 2,
  emirler: [
    { emirId: 7, emirNo: 'ORN-E-1', sorunlu: true, gonderilen: 1, adimSayisi: 3, adimlar: [
      adim({}),
      adim({ isEmriId: 2, opNo: 20, ad: 'ORN Frezeleme', durum: 'durdu', operasyonTipi: 'FRZ', operasyonOneki: null, kodKaynagi: 'tip-kodu', coreIstasyonKodu: 'ORN-FRZ-A',
        smartesIstasyonKodu: 'ORN-FRZ', istasyonEslemesi: 'is-merkezi', makineKodu: null, denemeSayisi: 3, neden: 'SmartES reddetti: Operasyon kodu tanımsız (FRZ20)', operasyonKodu: '20', gidecekKod: 'FRZ20', eskiKural: true }),
      adim({ isEmriId: 3, opNo: 30, ad: 'ORN Taşlama', durum: 'yeniden-denenecek', operasyonTipi: null, operasyonOneki: null, operasyonKodu: null, kodKaynagi: null, denemeSayisi: 2,
        sonrakiDeneme: '2026-11-24T09:00:00.000Z', neden: 'Adımın operasyon tipi yok', gidecekKod: null, gidecekNedenKodu: 'tip-yok', gidecekNeden: 'Adımın operasyon tipi yok', alanlar: [] }),
    ] },
    { emirId: 8, emirNo: 'ORN-E-2', sorunlu: true, gonderilen: 0, adimSayisi: 1, adimlar: [
      adim({ isEmriId: 4, durum: 'yeniden-denenecek', denemeSayisi: 1, sonrakiDeneme: '2026-11-24T09:00:00.000Z', neden: 'SmartES’te TRN90 operasyonu yok', operasyonKodu: 'TRN90', gidecekKod: 'TRN90', gidecekNedenKodu: 'smartes-kodu-yok', gidecekNeden: 'Son okunan SmartES listesinde TRN90 yok' }),
    ] },
    { emirId: 9, emirNo: 'ORN-E-3', sorunlu: false, gonderilen: 2, adimSayisi: 2, adimlar: [adim({ isEmriId: 5 }), adim({ isEmriId: 6, opNo: 20, operasyonKodu: 'TRN20' })] },
  ],
};

const resim = (page: Page, ad: string) => page.screenshot({ path: test.info().outputPath(`${ad}-${test.info().project.name}.png`), fullPage: true });

test('gruplu tablo: sorunlu emirler açık, adım ayrıntıları ve neden görünür; yana taşmaz; gönderilen alanlar açılır', async ({ page, ag, ac }) => {
  await page.route(/\/api\/smartes\/giden\/emirler/, (r) => { void r.fulfill({ json: CEVAP }); });
  await ac('/smartes/giden');
  await expect(page.getByText('ORN-E-1').first()).toBeVisible();
  await expect(page.getByText('FRZ20').first()).toBeVisible();
  await expect(page.getByText('Bu hata eski kod kuralıyla alındı; yeniden gönderince bugünkü kodla denenir.')).toBeVisible();
  await expect(page.getByText('iş merkezinden').first()).toBeVisible();
  await expect(page.getByText('SmartES reddetti: Operasyon kodu tanımsız (FRZ20)')).toBeVisible();
  // Bağlantı sunucudan gelen neden koduyla çıkar (smartes-kodu-yok) ve Operasyon tipi sekmesini açar.
  await expect(page.getByRole('link', { name: 'Eşlemeyi aç' })).toHaveAttribute('href', '/smartes/eslemeler?tur=operasyon-tipi');
  await expect(page.getByRole('button', { name: 'Yeniden gönder' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'ORN-E-3 adımları' })).toHaveCount(0);
  await resim(page, 'giden-gruplu');
  await page.getByRole('button', { name: 'Alanlar' }).first().click();
  await expect(page.getByText('OperationCode').first()).toBeVisible();
  await resim(page, 'giden-alanlar');
  const tasma = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(tasma, 'sayfa yana taşmaz').toBeLessThanOrEqual(1);
  expect(ag.hatalar).toEqual([]);
});
