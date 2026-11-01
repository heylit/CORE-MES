import { expect, tasmaOlc, test } from './ortak.ts';

// Planlama P4: Malzeme satın alma planı (/plan/malzplan). Ekran yalnız okur (222 a); örnek veride plan
// kurulmamış olabilir, o zaman boş ısı haritası ve "Önce plan kurulmalı." ya da "Planlama çalışması yok." görünür. Üç genişlikte (360, 768, 1280) koşar.
test.use({ hesap: 'ornek.yonetici' });

test.describe('P4 malzeme planı', () => {
  test('görünüm adresiyle açılır, yazmaz, hata vermez, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/plan/malzplan');
    await expect(page.locator('[data-gorunum="malzplan"]')).toBeVisible();
    const serit = page.getByRole('navigation', { name: 'Planlama menüsü' });
    await expect(serit.getByRole('link', { name: /^Malzeme satın alma planı/ })).toHaveAttribute('aria-current', 'page');
    // Isı haritası katmanı başta, asıl sayfa "Tüm satırlar" içinde (zz30-isi).
    const plan = page.getByRole('heading', { name: /Malzeme satın alma planı/ });
    await expect(plan.or(page.getByText('Planlama çalışması yok.'))).toBeVisible();
    if (await plan.isVisible()) await page.getByText('Tüm satırlar').click();
    if (await page.getByRole('table', { name: 'Verilecek siparişler' }).isVisible()) {
      const kirilim = page.getByRole('group', { name: 'Kırılım' });
      await kirilim.getByRole('button', { name: 'Hafta' }).click();
      await expect(kirilim.getByRole('button', { name: 'Hafta' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('Plan motoru bağlanınca açılır.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Hesapla' })).toBeDisabled();
    }
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    // Stok uçlarının yetkisi olmayan hesapta 403 beklenir (ekran planın kopyasına döner); onun dışında hata yok.
    expect(ag.hatalar.filter((h) => !/^403 GET \/api\/stok\//.test(h))).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });

  test.describe('yetki', () => {
    test.use({ hesap: 'ornek.depo' });
    test('yönetici olmayan kişi yeni ekranı görmez', async ({ page, ac }) => {
      await ac('/plan/malzplan');
      await expect(page.locator('[data-gorunum="malzplan"]')).toHaveCount(0);
    });
  });
});
