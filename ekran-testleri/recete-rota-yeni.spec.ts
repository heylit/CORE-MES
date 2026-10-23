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
