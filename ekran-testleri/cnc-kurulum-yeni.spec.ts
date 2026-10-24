import { expect, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// CNC Kurulum TS ekranı (soru 199 b, 209 a). Ölçüt bugünkü çerçevedir (208 a): her görünümün testi parçasıyla gelir ve
// eski ekranda bugün çalışan davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar.
test.use({ hesap: 'ornek.yonetici' });

const GORUNUMLER = ['Ana Sayfa', 'Kurulum', 'Hazırlık', 'Kütüphane', 'Ham Malzeme', 'Oto-CAM', 'G-Kod Sim.', 'Takım Ömrü'];

test.describe('iskelet', () => {
  test('görünüm şeridi tam, her görünüm adresiyle açılır, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni');
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/ana-sayfa$/);
    const serit = page.getByRole('tablist', { name: 'CNC Kurulum görünümleri' });
    await expect(serit.getByRole('tab')).toHaveText(GORUNUMLER);
    await serit.getByRole('tab', { name: 'Takım Ömrü' }).click();
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/takim-omru$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('P1 Kurulum ve Hazırlık', () => {
  // Bugünkü akış (prototip 17512-17882, 20916-21793): çark adım adım iner, Hazırlık seçili kurulumun adımlarını sırayla açar.
  // Bakmak ve gezinmek sunucuya yazmaz (kayıt ilk kullanıcı eyleminden sonra ve yalnız değişince yazılır).
  test('Kurulum: çark ok tuşlarıyla adım değiştirir, kurulum kartı ve önizleme açıktır', async ({ page, ac, ag }) => {
    await ac('/cnc-kurulum/yeni/kurulum');
    await expect(page.getByText(/^ADIM 1 \//)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByText(/^ADIM 2 \//)).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByText(/^ADIM 1 \//)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Magazin' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Üretim emri/ })).toBeVisible();
    expect(ag.hatalar).toEqual([]);
  });

  test('Hazırlık: adımlar sırayla açılır, rayda gruplar vardır, son adım denemedir', async ({ page, ac, ag }) => {
    await ac('/cnc-kurulum/yeni/hazirlik');
    // Hazırlık son açık adımı kayda yazar ve kayıt ortaktır: başka genişlikteki koşu adımı ilerletmiş olabilir. Önce raydan ilk adıma gidilir.
    // Kabuğun da Geri düğmesi var; adım düğmeleri Hazırlık'ın eylem çubuğunda aranır.
    const eylem = page.locator('.tc-ck-hz-eylem'), ray = page.locator('.tc-ck-hz-ray');
    await expect(page.getByText(/^HAZIRLIK · ADIM \d+ \//)).toBeVisible();
    await ray.getByRole('button', { name: /^Tezgâh/ }).click();
    await expect(page.getByText(/^HAZIRLIK · ADIM 1 \//)).toBeVisible();
    await expect(eylem.getByRole('button', { name: 'Geri' })).toBeDisabled();
    await eylem.getByRole('button', { name: 'İleri' }).click();
    await expect(page.getByText(/^HAZIRLIK · ADIM 2 \//)).toBeVisible();
    await ray.getByRole('button', { name: /Deneme/ }).click();
    await expect(page.getByText('Kesim ve takım ömrü denemesi').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hazırlık formu' }).or(page.getByText('Onay kaydı')).first()).toBeVisible();
    expect(ag.hatalar).toEqual([]);
  });

  for (const genislik of [360, 768, 1280]) {
    test(`Kurulum ve Hazırlık ${String(genislik)} genişlikte taşmaz, panel erişilir`, async ({ page, ac }) => {
      await page.setViewportSize({ width: genislik, height: 800 });
      for (const yol of ['kurulum', 'hazirlik']) {
        await ac(`/cnc-kurulum/yeni/${yol}`);
        await expect(page.locator('.tc-ck-yan')).toBeAttached();
        if (genislik < 768) await expect(page.locator('.tc-ck-cekmece')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      }
    });
  }
});

// Parça yazarları kendi bölümlerini doldurur (PARCA-SOZLESMESI); bölüm boşken atlanır.
for (const [parca, gorunumler] of [
  ['P4 Oto-CAM', 'Oto-CAM'],
  ['P5 Takım Ömrü', 'Takım Ömrü'],
] as const) {
  test.describe(parca, () => {
    test(`${gorunumler}: bugünkü davranış`, () => {
      test.fixme(true, 'parça teslim edilince dolar');
    });
  });
}

test.describe('P3 Ham Malzeme ve G-Kod', () => {
  const tasmaz = async (page: Page) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };

  test('Ham Malzeme: örnek parça hesaplanır, G-Kod simülasyonuna ham olarak geçer', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni/hammadde');
    await expect(page.getByText('Model yok', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Örnek parça' }).click();
    await expect(page.getByText('Örnek: flanşlı mil (Ø80 × 120)').first()).toBeVisible();
    await expect(page.getByText(/Hammadde ölçüsü · Yuvarlak çubuk/)).toBeVisible();
    await page.getByRole('button', { name: 'G-Kod simülasyonunda kullan' }).click();
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/simulasyon$/);
    await expect(page.getByRole('radio', { name: /Ham Malzeme sayfasından/ })).toBeChecked();
  });

  test('G-Kod Sim.: örnek program yüklenir, takım değişimine gidilir, oynatılır', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni/simulasyon');
    await page.getByRole('button', { name: 'Örnek ISO' }).click();
    await expect(page.getByText('O1001 (ISO)').first()).toBeVisible();
    await page.getByRole('button', { name: /^2\. değişim/ }).click();
    await expect(page.getByText(/^T3 · /).first()).toBeVisible();
    await page.getByRole('button', { name: 'Oynat / duraklat (Boşluk)' }).click();
    await page.keyboard.press('Space');
    await expect(page.getByRole('slider', { name: 'Program zamanı' })).not.toHaveAttribute('aria-valuenow', '0');
  });

  // Projeler her testi 360, 768 ve 1280 genişlikte koşar.
  test('iki görünüm de yatay taşmaz', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni/hammadde');
    await page.getByRole('button', { name: 'Örnek parça' }).click();
    await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible();
    await tasmaz(page);
    await ac('/cnc-kurulum/yeni/simulasyon');
    await expect(page.getByRole('button', { name: 'Program yükle' })).toBeVisible();
    await tasmaz(page);
  });
});

// P2: kütüphane, Tanımlar ve Ana Sayfa (prototip 17883-18432, 21794-21896). Eklenen kalem ve tezgâh test sonunda silinir.
test.describe('P2 Kütüphane, Tanımlar, Ana Sayfa', () => {
  test('Kütüphane: yeni kalem, liste görünümünde adet, Stok CSV ve silme', async ({ page, ac }) => {
    const ad = `Deneme kalem ${String(Date.now())}`;
    await ac('/cnc-kurulum/yeni/kutuphane');
    await expect(page.getByText('Hangi tezgâhta aktif')).toBeVisible();
    await page.getByRole('button', { name: 'Yeni kalem' }).click();
    await page.getByLabel('Ad', { exact: true }).fill(ad);
    await page.getByLabel('Başlangıç stok adedi').fill('4');
    await page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(page.getByRole('heading', { name: ad })).toBeVisible();
    await expect(page.getByLabel('Toplam adet')).toHaveValue('4');

    await page.getByRole('button', { name: 'Artır' }).click();
    await expect(page.getByLabel('Toplam adet')).toHaveValue('5');

    await page.getByRole('searchbox', { name: 'Kütüphanede ara' }).fill(ad);
    await page.getByRole('button', { name: 'Liste' }).click();
    const adet = page.getByLabel(`${ad}: adet`);
    await expect(adet).toHaveValue('5');
    await adet.fill('2');
    await adet.press('Enter');
    await expect(adet).toHaveValue('2');

    const indirme = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Stok CSV' }).click();
    expect((await indirme).suggestedFilename()).toMatch(/^CNC_Stok_\d{4}-\d{2}-\d{2}\.csv$/);

    await page.getByRole('button', { name: new RegExp(ad) }).first().click();
    await page.getByRole('button', { name: 'Sil', exact: true }).click();
    const onay = page.getByRole('dialog', { name: 'Kalemi sil' });
    await expect(onay).toContainText(`“${ad}” kütüphaneden silinsin mi?`);
    await onay.getByRole('button', { name: 'Sil' }).click();
    await expect(page.getByText('Filtreye uyan malzeme yok').first()).toBeVisible();
  });

  test('Tanımlar: özel tezgâh eklenir, Kütüphane süzgecinde görünür, silinir', async ({ page, ac }) => {
    const ad = `Deneme tezgah ${String(Date.now())}`;
    await ac('/cnc-kurulum/yeni/kutuphane');
    await page.getByRole('button', { name: 'Tanımlar' }).click();
    const pencere = page.getByRole('dialog', { name: 'Tanımlar' });
    await pencere.getByRole('button', { name: 'Yeni tezgâh' }).click();
    await pencere.getByLabel('Ad', { exact: true }).fill(ad);
    await pencere.getByRole('button', { name: 'Kaydet' }).click();
    await expect(pencere.getByText(ad)).toBeVisible();
    await pencere.getByRole('tab', { name: 'İş Malzemeleri' }).click();
    await expect(pencere.getByRole('button', { name: 'Yeni malzeme' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox', { name: 'Tezgâh' })).toContainText(ad);

    await page.getByRole('button', { name: 'Tanımlar' }).click();
    await pencere.locator('tr').filter({ hasText: ad }).getByRole('button', { name: 'Sil' }).click();
    await page.getByRole('dialog', { name: 'Tezgâhı sil' }).getByRole('button', { name: 'Sil' }).click();
    await expect(pencere.getByText(ad)).toHaveCount(0);
  });

  test('Ana Sayfa: sayı kartları, tezgâh kartları ve görünümlere geçiş', async ({ page, ac }) => {
    await ac('/cnc-kurulum/yeni/ana-sayfa');
    await expect(page.getByRole('heading', { name: 'Ana sayfa' })).toBeVisible();
    for (const baslik of ['Tezgâhlar', 'Ömrü dolan takım', 'Yakında değişecek', 'Depo uyarısı', 'Bugünkü üretim']) {
      await expect(page.getByText(baslik, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Hazırla' }).first()).toBeVisible();
    await page.getByRole('link', { name: /Depo uyarısı/ }).click();
    await expect(page).toHaveURL(/\/cnc-kurulum\/yeni\/kutuphane$/);
  });

  for (const genislik of [360, 768, 1280]) {
    test(`${String(genislik)} genişlikte Kütüphane ve Ana Sayfa yatay taşmaz`, async ({ page, ac }) => {
      await page.setViewportSize({ width: genislik, height: 900 });
      for (const yol of ['kutuphane', 'ana-sayfa']) {
        await ac(`/cnc-kurulum/yeni/${yol}`);
        await expect(page.getByRole('tablist', { name: 'CNC Kurulum görünümleri' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      }
    });
  }
});
