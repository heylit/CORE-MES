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
  // Her genişlik projesinde (360, 768, 1280) P1 görünümleri açılır, içerik çizilir, sayfa yatay taşmaz.
  const GORUNUMLER: readonly [string, RegExp][] = [
    ['bugun', /Yapılacaklar/], ['genel-bakis', /Sıradaki adımlar/], ['simulasyon', /Puanınız/], ['oz-degerlendirme', /Kapsama/],
    ['haftalik-program', /Uçtan uca iz sürme/], ['mulakat-kartlari', /İlerleme/], ['aksiyonlar', /Rapor|Aksiyon planı/], ['rehber', /Bulgu nasıl yazılır/],
  ];
  test('P1 görünümleri açılır, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    for (const [yol, metin] of GORUNUMLER) {
      await ac(`/denetim-hazirlik/yeni/${yol}`);
      await expect(page.getByText(metin).first(), `${yol}: içerik`).toBeVisible();
      expect((await tasmaOlc(page)).belge, `${yol}: yatay taşma`).toBeLessThanOrEqual(0);
    }
    expect(ag.hatalar).toEqual([]);
  });

  test('simülasyonda puan ölçeği beş seçenekle çizilir', async ({ page, ac }) => {
    await ac('/denetim-hazirlik/yeni/simulasyon');
    const olcek = page.getByRole('group', { name: 'Puan' });
    await expect(olcek.getByRole('button')).toHaveCount(5);
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  });
});

test.describe('P2 KYS', () => {
  test('dokuz alt sekme ve şema türleri açılır, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/denetim-hazirlik/yeni/kys');
    const kys = page.getByRole('tablist', { name: 'KYS bölümleri' });
    await expect(kys).toBeVisible();
    for (const ad of ['Kurulum yol haritası', 'Yapı taşları', 'Süreçler', 'Doküman üretici', 'Dosyalama', 'Görev tanımları', 'Rutin görevler', 'Şemalar ve grafikler', 'Genel bakış']) {
      await kys.getByRole('tab', { name: ad }).click();
      await expect(page.getByRole('heading', { level: 2, name: ad })).toBeVisible();
      expect((await tasmaOlc(page)).belge, `${ad}: yatay taşma`).toBeLessThanOrEqual(0);
    }
    await kys.getByRole('tab', { name: 'Şemalar ve grafikler' }).click();
    const tur = page.getByRole('tablist', { name: 'Şema türü' });
    for (const ad of ['Akış şemaları', 'Süreç etkileşimi', 'Kaplumbağa', 'Organizasyon', 'Dosya ağacı', 'Pano']) {
      await tur.getByRole('tab', { name: ad }).click();
      await expect(tur.getByRole('tab', { name: ad, selected: true })).toBeVisible();
      expect((await tasmaOlc(page)).belge, `${ad}: yatay taşma`).toBeLessThanOrEqual(0);
    }
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('P3 ic denetim, takvim, performans, kalibrasyon, ayarlar', () => {
  // P3 yazar.
});
