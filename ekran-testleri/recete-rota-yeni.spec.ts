import { expect, tasmaOlc, test } from './ortak.ts';

// Yeni Reçete ve Rota ekranı (TS geçişi). Alıma kadar yalnız yöneticiye açıktır; parça yazarları (R1-R3) kendi describe bloğunu ekler.
// Bölümler parçalarca doldurulur: iskelet testi yer tutucu metnine değil, bölgeye ve parçanın işaretine bakar.
const BOLUMLER = [
  { sekme: 'Üretim emirleri', parca: 'R3' }, { sekme: 'Stok', parca: 'R3' }, { sekme: 'Ürün ve rotalar', parca: 'R1' },
  { sekme: 'Operasyonlar', parca: 'R1' }, { sekme: 'Süreler', parca: 'R2' }, { sekme: 'Malzemeler', parca: 'R2' }, { sekme: 'Kaynaklar', parca: 'R2' },
] as const;

test.describe('R0 iskelet', () => {
  test('yönetici açar: başlık, yedi sekme ve her bölüm; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/recete-rota/yeni');
    const ekran = page.locator('.tc-rry');
    await expect(ekran.getByRole('heading', { name: 'Üretim emirleri', level: 2 })).toBeVisible();
    const sekmeler = page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' });
    await expect(sekmeler.getByRole('tab')).toHaveCount(BOLUMLER.length);
    for (const b of BOLUMLER) {
      await sekmeler.getByRole('tab', { name: b.sekme }).click();
      const bolge = page.getByRole('region', { name: b.sekme });
      await expect(bolge.locator(`[data-parca="${b.parca}"]`)).toBeVisible({ timeout: 15_000 });
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    }
    expect(ag.hatalar).toEqual([]);
  });

  test.describe('kapı', () => {
    // Planlama rolü sayfayı görür ama kapı işlemi yoktur: kabuk değil yeni ekranın kapısı durdurur.
    test.use({ hesap: 'ornek.planlama' });
    test('yönetici olmayana yeni ekran açılmaz', async ({ page, ag, ac }) => {
      await ac('/recete-rota/yeni');
      await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
      expect(ag.hatalar).toEqual([]);
    });
  });
});

test.describe('R1 Ürün ve rotalar, Operasyonlar', () => {
  // Açılışta yazma yok: bölümleri gezmek rota modülüne ve operasyon kataloğuna istek yollamaz.
  const yazma = (u: string, yontem: string) => yontem === 'POST' && /\/api\/(rota\/(urunler|revizyonlar)|operasyon-tipleri)/.test(u);
  // Genişlikler (360, 768, 1280) yapılandırmanın projeleridir.
  test('şema, düzenleme paneli, ürün listesi ve operasyonlar açılır; yatay taşma yok', async ({ page, ag, ac }) => {
    const yazmalar: string[] = [];
    page.on('request', (r) => { if (yazma(r.url(), r.method())) yazmalar.push(r.url()); });
    await ac('/recete-rota/yeni/schema');
    const sema = page.getByRole('region', { name: 'Ürün ve rotalar' });
    await expect(sema.locator('[data-parca="R1"]')).toBeVisible({ timeout: 15_000 });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    const kutu = sema.locator('.tc-rr1-opbox').first();
    if (await kutu.count() > 0) {
      await kutu.click();
      await expect(sema.getByRole('complementary', { name: 'Düzenleme paneli' })).toBeVisible();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    }
    await sema.getByRole('button', { name: 'Ürün listesi' }).click();
    await expect(sema.getByRole('table', { name: 'Ürünler ve rotaları' }).or(sema.getByText('Henüz ürün yok', { exact: false }))).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' }).getByRole('tab', { name: 'Operasyonlar' }).click();
    const ops = page.getByRole('region', { name: 'Operasyonlar' });
    await expect(ops.locator('[data-parca="R1"]')).toBeVisible({ timeout: 15_000 });
    await expect(ops.getByRole('table', { name: 'Rota revizyonları' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('R3 Üretim emirleri ve Stok', () => {
  // Veri tabanı boş da olabilir: test bölgeye ve parçanın işaretine bakar, varsa ilk emri açar. GET dışı istek ag.hatalar'a düşer.
  test('iki bölüm açılır, emir ayrıntısı açılır; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/recete-rota/yeni');
    const emirler = page.getByRole('region', { name: 'Üretim emirleri' });
    await expect(emirler.locator('[data-parca="R3"]')).toBeVisible({ timeout: 15_000 });
    const ilk = emirler.locator('.tc-rr3-emir').first();
    if (await ilk.count()) {
      await ilk.click();
      await expect(ilk).toHaveAttribute('aria-expanded', 'true');
    }
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' }).getByRole('tab', { name: 'Stok' }).click();
    const stok = page.getByRole('region', { name: 'Stok' });
    await expect(stok.locator('[data-parca="R3"]')).toBeVisible({ timeout: 15_000 });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
  });
});
