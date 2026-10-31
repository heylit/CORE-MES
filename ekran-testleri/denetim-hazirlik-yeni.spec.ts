import { expect, tasmaOlc, test } from './ortak.ts';

// Denetim Hazırlığı ekranı (199 b, 1392 a). Her parça yalnız kendi `test.describe` bloğuna yazar (PARCA-SOZLESMESI); iskelet Y0'ındır.
// Ekran menünün kökünde açılır ve sayfa yetkisi olan her role açıktır; yönetici dışı hesaplar en altta.
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
  test('beş ekran açılır, sayfa yatay taşmaz; yıkıcı ayarlar yöneticide görünür', async ({ page, ag, ac }) => {
    const ekranlar = [['ic-denetim', 'İç denetim'], ['takvim', 'Takvim'], ['performans', 'Performans'], ['kalibrasyon', 'Kalibrasyon'], ['ayarlar', 'Ayarlar']] as const;
    for (const [yol, sekme] of ekranlar) {
      await ac(`/denetim-hazirlik/yeni/${yol}`);
      await expect(page.getByRole('tablist', { name: 'Bölümler' }).getByRole('tab', { name: sekme, selected: true })).toBeVisible();
      expect((await tasmaOlc(page)).belge, `${yol}: yatay taşma`).toBeLessThanOrEqual(0);
    }
    await expect(page.getByRole('heading', { name: 'Sıfırlama' })).toBeVisible();
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('1418 eski adres ve yardım', () => {
  test('menünün kökü Bugün\'ü açar; eski görünüm parçası yeni adrese gider; yardım ? ile açılır', async ({ page, ag, ac }) => {
    await ac('/denetim-hazirlik');
    await expect(page.getByRole('tablist', { name: 'Bölümler' }).getByRole('tab', { name: 'Bugün', selected: true })).toBeVisible();
    await expect(page).toHaveURL(/\/denetim-hazirlik$/);
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Yardım: Bugün' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await ac('/denetim-hazirlik#kalib');
    await expect(page).toHaveURL(/\/denetim-hazirlik\/yeni\/kalibrasyon$/);
    expect(ag.hatalar).toEqual([]);
  });
});

// Eski çerçevenin girişiyle aynı roller (sayfa, okuma ya da yazma): kalite yazar, planlama okur.
test.describe('1418 yönetici dışı rol: kalite', () => {
  test.use({ hesap: 'ornek.kalite' });
  test('ekran açılır, yeni ekran kapısı yok; yıkıcı ayarlar görünmez', async ({ page, ag, ac }) => {
    await ac('/denetim-hazirlik');
    await expect(page.getByRole('tablist', { name: 'Bölümler' })).toBeVisible();
    await ac('/denetim-hazirlik/yeni/ayarlar');
    await expect(page.getByRole('heading', { name: 'Firma ve denetim bilgileri' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sıfırlama' })).toHaveCount(0);
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('1418 yönetici dışı rol: planlama', () => {
  test.use({ hesap: 'ornek.planlama' });
  test('okuyan ekranı açar, yazma düğmeleri görünmez', async ({ page, ag, ac }) => {
    await ac('/denetim-hazirlik');
    await expect(page.getByRole('tablist', { name: 'Bölümler' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Hızlı tur/ })).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
  });
});
