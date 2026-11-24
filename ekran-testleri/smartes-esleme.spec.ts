import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// 3655: Kod eşlemeleri ekranı (iş merkezi sekmesi, operasyon tipinde önek ve açık emir uyarısı, miras gösterimi, aktarım penceresi).
// SmartES verisi sahte cevapla gelir (örnek veride SmartES izi yok); kodlar ve adlar uydurmadır.
test.use({ hesap: 'ornek.yonetici' });

const satir = (ek: Record<string, unknown>) => ({
  tmiId: 1, tmiKod: 'ORN-X', tmiAd: 'ORN ad', aktif: true, smartesKod: null, surum: null, oneri: null, acikIsEmri: null, altIstasyonlar: null, miras: null, ...ek,
});

async function sahteCevaplar(page: Page) {
  await page.route(/\/api\/smartes\/eslemeler\?tur=/, (r) => {
    const tur = new URL(r.request().url()).searchParams.get('tur');
    const satirlar = tur === 'operasyon-tipi'
      ? [
        satir({ tmiId: 1, tmiKod: 'TRN', tmiAd: 'ORN Tornalama', smartesKod: 'TRN', surum: 1, acikIsEmri: 3 }),
        satir({ tmiId: 2, tmiKod: 'FRZ', tmiAd: 'ORN Frezeleme', oneri: { kod: 'FRZ', ad: null, gerekce: 'ayni-kod' }, acikIsEmri: 2 }),
        satir({ tmiId: 3, tmiKod: 'MNT', tmiAd: 'ORN Montaj', acikIsEmri: 0 }),
      ]
      : tur === 'is-merkezi'
        ? [satir({
          tmiId: 1, tmiKod: 'ORN-FRZ', tmiAd: 'ORN Freze merkezi', smartesKod: 'ORN-FRZ', surum: 1,
          altIstasyonlar: [{ kod: 'ORN-FRZ-A', ad: 'ORN Freze A', kendiKodu: null }, { kod: 'ORN-FRZ-B', ad: 'ORN Freze B', kendiKodu: 'ORN-FRZ-ST' }],
        })]
        : [
          satir({ tmiId: 1, tmiKod: 'ORN-FRZ-A', tmiAd: 'ORN Freze A', miras: { merkezKodu: 'ORN-FRZ', smartesKod: 'ORN-FRZ' } }),
          satir({ tmiId: 2, tmiKod: 'ORN-FRZ-B', tmiAd: 'ORN Freze B', smartesKod: 'ORN-FRZ-ST', surum: 2 }),
        ];
    void r.fulfill({ json: { tur, satirlar, smartesListesi: null } });
  });
  await page.route(/\/api\/smartes\/gelen-adlar\/aktarim\?/, (r) => {
    void r.fulfill({ json: {
      tur: 'fire', listeVar: true, eklenecek: 2, eslenecek: 1, zatenEslenmis: 3, adFarkli: 1, atlanan: 1,
      satirlar: [
        { anahtar: 'id:1', ad: 'ORN Ölçü dışı', eylem: 'esle', kod: 'H-01', kategori: null, aktif: true, coreAdi: 'Ölçü dışı', not: null },
        { anahtar: 'id:9', ad: 'ORN Yeni fire', eylem: 'ekle', kod: 'SME-9', kategori: null, aktif: true, coreAdi: 'ORN Yeni fire', not: null },
        { anahtar: 'id:10', ad: 'ORN Eski fire', eylem: 'ekle', kod: 'SME-10', kategori: null, aktif: false, coreAdi: 'ORN Eski fire', not: null },
        { anahtar: 'id:4', ad: 'ORN Çapak', eylem: 'ad-farkli', kod: null, kategori: null, aktif: true, coreAdi: 'Çapak', not: 'Eşlenirken adı "Çapak (eski)" idi' },
        { anahtar: 'id:123456789', ad: 'ORN Uzun kimlik', eylem: 'atla', kod: null, kategori: null, aktif: true, coreAdi: null, not: 'SmartES kimliği çok uzun (kod 12 karakteri aşar)' },
      ],
    } });
  });
  await page.route(/\/api\/smartes\/gelen-adlar\?tur=fire/, (r) => {
    void r.fulfill({ json: { tur: 'fire', satirlar: [], nedenler: [], islemeBagli: true, sonOkuma: null, sonHata: null } });
  });
}

async function resim(page: Page, ad: string) {
  await page.screenshot({ path: test.info().outputPath(`${ad}-${test.info().project.name}.png`), fullPage: true });
}

async function yanaTasmaz(page: Page) {
  const tasma = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(tasma, 'sayfa yana taşmaz').toBeLessThanOrEqual(1);
}

test('operasyon tipi: örnek kod, önek uyarısı açık emir sayısıyla; öneriyi kabul onay penceresi açar', async ({ page, ag, ac }) => {
  await sahteCevaplar(page);
  await ac('/smartes/eslemeler');
  await page.getByRole('tab', { name: 'Operasyon tipi' }).click();
  await expect(page.getByText('TRN10, TRN20 …').first()).toBeVisible();
  await resim(page, 'operasyon-tipi');
  await page.getByRole('button', { name: 'Kabul' }).click();
  const pencere = page.getByRole('dialog');
  await expect(pencere.getByText(/2 açık iş emrinin SmartES operasyon kodu değişir/)).toBeVisible();
  await resim(page, 'operasyon-tipi-onay');
  await yanaTasmaz(page);
  expect(ag.hatalar).toEqual([]);
});

test('iş merkezi ve istasyon: altındaki istasyonlar, kendi eşlemesi ve miras görünür', async ({ page, ag, ac }) => {
  await sahteCevaplar(page);
  await ac('/smartes/eslemeler');
  await expect(page.getByText('iş merkezinden: ORN-FRZ')).toBeVisible();
  await resim(page, 'istasyon');
  await page.getByRole('tab', { name: 'İş merkezi' }).click();
  await expect(page.getByText('kendi eşlemesi: ORN-FRZ-ST')).toBeVisible();
  await resim(page, 'is-merkezi');
  await yanaTasmaz(page);
  expect(ag.hatalar).toEqual([]);
});

test('fire: aktarım önizlemesi sayıları, satırları ve düğme etiketini gösterir', async ({ page, ag, ac }) => {
  await sahteCevaplar(page);
  await ac('/smartes/eslemeler');
  await page.getByRole('tab', { name: 'Fire' }).click();
  await page.getByRole('button', { name: 'SmartES listesini CORE’a aktar' }).click();
  const pencere = page.getByRole('dialog');
  await expect(pencere.getByRole('button', { name: '2 neden ekle, 1 ad eşle' })).toBeVisible();
  await expect(pencere.getByText('SME-9')).toBeVisible();
  await resim(page, 'aktarim');
  await yanaTasmaz(page);
  expect(ag.hatalar).toEqual([]);
});
