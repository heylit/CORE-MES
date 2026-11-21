import { expect, tasmaOlc, test } from './ortak.ts';

// Planlama P4: Malzeme satın alma planı (/plan/malzplan). Ekran yalnız okur (222 a); örnek veride plan
// kurulmamış olabilir, o zaman "Önce plan kurulmalı." ya da "Planlama çalışması yok." görünür. Üç genişlikte (360, 768, 1280) koşar.
test.use({ hesap: 'ornek.yonetici' });

test.describe('P4 malzeme planı', () => {
  test('görünüm adresiyle açılır, yazmaz, hata vermez, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/plan/malzplan');
    await expect(page.locator('[data-gorunum="malzplan"]')).toBeVisible();
    const serit = page.getByRole('navigation', { name: 'Planlama menüsü' });
    await expect(serit.getByRole('link', { name: /^Malzeme satın alma planı/ })).toHaveAttribute('aria-current', 'page');
    // 3537 a: Kokpit dili. Liste başta (malzeme başına tek satır, süzgeç ve arama); Takvim ısı haritasıdır (telefonda yok); Bütçe sayaç,
    // grafik, dağılım, günlük tüketim ve öne çekmedir. Plan yoksa "Önce plan kurulmalı." ve Kokpit bağlantısı.
    const plan = page.getByRole('heading', { name: /Malzeme satın alma planı/ });
    await expect(plan.or(page.getByText('Planlama çalışması yok.'))).toBeVisible();
    await expect(page.getByText('Tüm satırlar')).toHaveCount(0);
    const liste = page.getByRole('table', { name: 'Malzemeler' });
    await expect(liste.or(page.getByText('Önce plan kurulmalı.')).or(page.getByText('Planlama çalışması yok.'))).toBeVisible();
    if (await liste.isVisible()) {
      await expect(page.getByRole('searchbox', { name: 'Ara' })).toBeVisible();
      expect((await tasmaOlc(page)).belge, 'yatay taşma (Liste)').toBeLessThanOrEqual(0);
      const gorunum = page.getByRole('group', { name: 'Görünüm' });
      const genis = (page.viewportSize()?.width ?? 0) >= 768;
      // Telefonda ısı haritasına yer yok: Takvim seçeneği yalnız 768 ve üstünde.
      await expect(gorunum.getByRole('button', { name: 'Takvim' })).toHaveCount(genis ? 1 : 0);
      if (genis) {
        await gorunum.getByRole('button', { name: 'Takvim' }).click();
        await expect(page.getByRole('group', { name: 'Malzeme × gün, stok yetiyor mu' }).or(page.getByText(/karşılananlar/))).toBeVisible();
      }
      await page.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Bütçe' }).click();
      const kirilim = page.getByRole('group', { name: 'Kırılım' });
      await kirilim.getByRole('button', { name: 'Hafta' }).click();
      await expect(kirilim.getByRole('button', { name: 'Hafta' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Hesapla' })).toBeEnabled();
    }
    // 3485 a: günlük tüketim ve toplu plan kartı; toplama düğmesi seçilir, talep açılmaz (sayfa yazmaz).
    if (await page.getByRole('table', { name: 'Günlük tüketim' }).isVisible()) {
      const topla = page.getByRole('group', { name: 'Talebi topla' }).or(page.getByRole('combobox', { name: 'Talebi topla' }));
      await expect(topla).toBeVisible();
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
      // 3485 a: talep açma şeridi ve seçim kutusu da yoktur.
      await expect(page.getByRole('region', { name: 'Toplu talep' })).toHaveCount(0);
    });
  });
});
