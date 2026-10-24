import { ADRES, expect, test } from './ortak.ts';

// Üretim Hazırlık TS ekranı (Soru 271 c). Ölçüt bugünkü çerçevedir: her sayfanın testi parçasıyla gelir ve eski ekranda bugün
// çalışan davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar; bölümlerin içine bakmaz.
test.use({ hesap: 'ornek.yonetici' });

test.describe('A0 iskelet', () => {
  test('kök adres Pano\'yu açar; sekmeden sayfa değişir; çerçeve yok, başka kökene istek yok, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    const disari: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(ADRES) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) disari.push(r.url()); });
    await ac('/arkon/yeni');
    await expect(page).toHaveURL(/\/arkon\/yeni\/pano$/);
    const serit = page.getByRole('tablist', { name: 'Üretim Hazırlık' });
    await expect(serit.getByRole('tab').first()).toHaveText('Operatör');
    await expect(page.getByRole('region', { name: 'Pano' })).toBeVisible();
    await serit.getByRole('tab', { name: 'Kalite' }).click();
    await expect(page).toHaveURL(/\/arkon\/yeni\/kalite$/);
    await expect(page.getByRole('region', { name: 'Kalite' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(disari).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

// Parça yazarları kendi bölümlerini doldurur (yeni/PARCA-SOZLESMESI.md); bölüm boşken atlanır.
for (const [parca, sayfalar] of [
  ['A1 Operatör', 'Operatör, Önizleme'],
  ['A2 Hazırlık', 'Üretim Terminali Hazırlık'],
  ['A5 Çizim', 'Çizim'],
  ['A6 Ayarlar ve çağrı bandı', 'Ayarlar, çağrı bandı'],
] as const) {
  test.describe(parca, () => {
    test(`${sayfalar}: bugünkü davranış`, () => {
      test.fixme(true, 'parça teslim edilince dolar');
    });
  });
}

// A3 ve A4: her sayfa üç genişlikte açılır, bölümü görünür, yatay taşmaz, açılışta belge yazmaz (eski ekran açılışta numuneyi "Ölçülüyor"
// yapıyordu; yeni ekran seçilince yapar). Örnek veritabanının içeriğine bağlı değildir.
const GENISLIKLER = [360, 768, 1280] as const;
const belgeYazmalari = (l: readonly string[]) => l.filter((y) => /^POST \/api\/arkon\/belgeler\/.+\/(yaz|sil)$/.test(y));

for (const [parca, sayfalar] of [
  ['A3 Pano ve kuyruk', [['pano', 'Pano'], ['planlama', 'Plan Kuyruğu'], ['kuyruk', 'Kuyruk'], ['anomali', 'Üretim Anomalisi']]],
  ['A4 Kalite, bakım, raporlar', [['kalite', 'Kalite'], ['bakim', 'Bakım'], ['raporlar', 'Raporlar']]],
] as const) {
  test.describe(parca, () => {
    for (const [anahtar, ad] of sayfalar) {
      for (const genislik of GENISLIKLER) {
        test(`${ad} ${String(genislik)} genişlikte açılır, taşmaz, açılışta yazmaz`, async ({ page, ag, ac }) => {
          await page.setViewportSize({ width: genislik, height: 900 });
          await ac(`/arkon/yeni/${anahtar}`);
          const bolum = page.getByRole('region', { name: ad });
          await expect(bolum).toBeVisible();
          await expect(bolum.getByRole('heading').first()).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
          expect(belgeYazmalari(ag.yazmalar)).toEqual([]);
          expect(ag.hatalar).toEqual([]);
        });
      }
    }
  });
}

test.describe('A3 Pano ve kuyruk · yetki', () => {
  test('yönetici Plan Kuyruğu\'nda planlı duruş ekleyebilir; Kuyruk salt okunurdur', async ({ page, ac }) => {
    await ac('/arkon/yeni/planlama');
    const bolum = page.getByRole('region', { name: 'Plan Kuyruğu' });
    await bolum.getByRole('button', { name: /Planlı duruşlar/ }).click();
    await expect(bolum.getByRole('button', { name: 'Planlı duruş ekle' })).toBeVisible();
    await ac('/arkon/yeni/kuyruk');
    await expect(page.getByRole('region', { name: 'Kuyruk' }).getByRole('button', { name: /^(Yukarı|Aşağı)$/ })).toHaveCount(0);
  });
});

test.describe('A4 Kalite, bakım, raporlar · yetki', () => {
  test('yönetici Bakım\'da arıza açabilir ve plan ekleyebilir; Kalite görünümleri yetkiye göre gelir', async ({ page, ac }) => {
    await ac('/arkon/yeni/bakim');
    const bakim = page.getByRole('region', { name: 'Bakım' });
    await bakim.getByRole('button', { name: 'Arızalar' }).click();
    await expect(bakim.getByRole('button', { name: 'Arıza kaydı aç' })).toBeVisible();
    await bakim.getByRole('button', { name: /Periyodik bakım/ }).click();
    await expect(bakim.getByRole('button', { name: 'Bakım planı ekle' })).toBeVisible();
    await ac('/arkon/yeni/kalite');
    const kalite = page.getByRole('group', { name: 'Kalite görünümü' });
    for (const ad of ['Numuneler', 'SPC · rapor', 'Onaylar', 'Ölçü aletleri']) await expect(kalite.getByRole('button', { name: new RegExp(`^${ad}`) })).toBeVisible();
  });
});
