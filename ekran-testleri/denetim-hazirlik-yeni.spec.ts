import { expect, tasmaOlc, test } from './ortak.ts';

// Denetim Hazırlığı yeni ekranı (199 b). Her parça yalnız kendi `test.describe` bloğuna yazar (PARCA-SOZLESMESI); iskelet Y0'ındır.
// Yeni ekran alıma kadar yalnız yöneticide açılır (YeniEkranKapisi).
test.use({ hesap: 'ornek.yonetici' });

test.describe('Y0 iskelet', () => {
  test('bölümler açılır, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/denetim-hazirlik/yeni/bugun');
    const bolumler = page.getByRole('tablist', { name: 'Bölümler' });
    await expect(bolumler).toBeVisible();
    for (const ad of ['Denetimler', 'KYS', 'İç denetim', 'Kalibrasyon', 'Takvim', 'Performans', 'Ayarlar', 'Bugün']) {
      await bolumler.getByRole('tab', { name: ad }).click();
      await expect(bolumler.getByRole('tab', { name: ad, selected: true })).toBeVisible();
      expect((await tasmaOlc(page)).belge, `${ad}: yatay taşma`).toBeLessThanOrEqual(0);
    }
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('P1 bugun ve program', () => {
  // P1 yazar.
});

test.describe('P2 KYS', () => {
  // P2 yazar.
});

test.describe('P3 ic denetim, takvim, performans, kalibrasyon, ayarlar', () => {
  // P3 yazar.
});
