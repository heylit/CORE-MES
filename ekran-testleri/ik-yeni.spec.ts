import { expect, tasmaOlc, test } from './ortak.ts';

// İK'nın TS ekranı (199 b, 209 a): alıma kadar /ik/yeni ve /ik-islemlerim/yeni adresinde, yalnız yöneticide. Her parça (P1-P6)
// kendi ana akışını aşağıda kendi `test.describe` bloğuna ekler; bloklar birbirine dokunmaz.

test.describe('Y0 iskelet', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('İK yeni ekranı açılır, sekmeler ikinci menünün maddeleridir, ağ hatası yok', async ({ page, ag, ac }) => {
    await ac('/ik/yeni');
    await expect(page.getByRole('tab', { name: 'Pano', selected: true })).toBeVisible();
    await page.getByRole('tab', { name: 'İzinler' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/izinler$/);
    await ac('/ik-islemlerim/yeni');
    await expect(page.getByRole('tab', { name: 'Benim sayfam', selected: true })).toBeVisible();
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});

test.describe('Y0 iskelet: kapı', () => {
  test.use({ hesap: 'ornek.mudur' });

  test('yönetici olmayan hesapta "Bu ekran hazırlanıyor" der', async ({ page, ac }) => {
    await ac('/ik-islemlerim/yeni');
    await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
  });
});

// P1 personel
test.describe('P1 personel', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('Personel listesi ve Organizasyon açılır; yeni personel formu yazmadan kapanır; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/ik/yeni/personel');
    await expect(page.getByRole('heading', { name: 'Personel', exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Personel listesi' }).or(page.getByText(/Henüz personel yok|Sonuç bulunamadı/)).first()).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'personel listesi yatay taşması').toBe(0);
    await page.getByRole('button', { name: 'Personel ekle' }).click();
    const pencere = page.getByRole('dialog', { name: 'Yeni personel' });
    await expect(pencere).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yeni personel formu yatay taşması').toBe(0);
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(pencere).toBeHidden();
    await page.getByRole('tab', { name: 'Organizasyon' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/organizasyon$/);
    await expect(page.getByRole('heading', { name: 'Organizasyon', exact: true })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'organizasyon yatay taşması').toBe(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
// P2 izin-devam
test.describe('P2 izin ve devam', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('İzinler, Devam ve mesai ve Puantaj açılır; okumada yazma ve ağ hatası yok', async ({ page, ag, ac }) => {
    await ac('/ik/yeni/izinler');
    await expect(page.getByRole('heading', { name: 'İzinler' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Talepler', selected: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Takvim' }).click();
    await expect(page.getByRole('group', { name: 'Ay' })).toBeVisible();
    await ac('/ik/yeni/devam');
    await expect(page.getByRole('heading', { name: 'Devam ve mesai' })).toBeVisible();
    await page.getByRole('tab', { name: 'Puantaj' }).click();
    await expect(page.getByRole('tab', { name: 'Puantaj', selected: true })).toBeVisible();
    await expect(page.getByText('Puantaj yükleniyor')).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
// P3 bordro
test.describe('P3 bordro', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('Bordro, Hesaplamalar, Maliyet planı ve Ayarlar açılır; okurken yazma ve ağ hatası yok; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/ik/yeni/bordro');
    await expect(page.getByRole('heading', { name: 'Bordro', level: 2, exact: true })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'bordro yatay taşması').toBe(0);
    await page.getByRole('tab', { name: 'Hesaplamalar' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/hesaplamalar$/);
    await expect(page.getByRole('heading', { name: 'Hesaplamalar', level: 2, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Net → brüt' }).click();
    await expect(page.getByRole('button', { name: 'Net → brüt', pressed: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Maliyet planı' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/maliyet-plani$/);
    await expect(page.getByRole('heading', { name: 'Maliyet planı', level: 2, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Ayarlar' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/ayarlar$/);
    await expect(page.getByRole('heading', { name: 'Ayarlar', level: 2, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ücret, vergi ve SGK' }).click();
    await expect(page.getByRole('button', { name: 'Ücret, vergi ve SGK', pressed: true })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'ayarlar yatay taşması').toBe(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
// P4 isealim
test.describe('P4 ise alim, performans ve egitim', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('Performans, Eğitim ve İşe alım sekmeleri açılır; okurken yazma ve ağ hatası yok; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/ik/yeni/performans');
    await expect(page.getByRole('heading', { name: 'Performans', level: 2, exact: true })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'performans yatay taşması').toBe(0);
    await page.getByRole('tab', { name: 'Eğitim' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/egitim$/);
    await expect(page.getByRole('heading', { name: 'Eğitim', level: 2, exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'İşe alım' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/ise-alim$/);
    await expect(page.getByRole('heading', { name: 'İşe alım', level: 2, exact: true })).toBeVisible();
    for (const sekme of ['Görüşmeler', 'Aday karşılaştırma', 'Pozisyonlar', 'Soru bankası', 'Aday süreci']) {
      await page.getByRole('tab', { name: new RegExp(`^${sekme}`) }).click();
      await expect(page.getByRole('tab', { name: new RegExp(`^${sekme}`), selected: true })).toBeVisible();
    }
    expect((await tasmaOlc(page)).belge, 'işe alım yatay taşması').toBe(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
// P5 analiz
test.describe('P5 analiz', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('Pano, Yapılacaklar, Raporlar ve Değişiklik günlüğü açılır; okurken yazma ve ağ hatası yok', async ({ page, ag, ac }) => {
    await ac('/ik/yeni');
    await expect(page.getByRole('heading', { name: 'Pano' })).toBeVisible();
    await page.getByRole('tab', { name: 'Yapılacaklar' }).click();
    await expect(page.getByRole('heading', { name: 'Yapılacaklar' })).toBeVisible();
    await page.getByRole('tab', { name: 'Raporlar' }).click();
    await expect(page.getByRole('heading', { name: 'Raporlar' })).toBeVisible();
    await page.getByRole('tab', { name: 'Değişiklik günlüğü' }).click();
    await expect(page).toHaveURL(/\/ik\/yeni\/gunluk$/);
    await page.getByRole('searchbox', { name: 'Günlükte ara' }).fill('bu metin hiçbir kayıtta yok');
    await expect(page.getByText(/Bu ölçütlerde değişiklik yok/)).toBeVisible();
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
// P6 islemlerim
test.describe('P6 islemlerim', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('yedi görünüm sekmeden açılır, yazma ve ağ hatası yok', async ({ page, ag, ac }) => {
    await ac('/ik-islemlerim/yeni');
    await expect(page.getByRole('tab', { name: 'Benim sayfam', selected: true })).toBeVisible();
    for (const [sekme, adres, baslik] of [
      ['İzinlerim', 'izinlerim', 'İzinlerim'], ['Bordrolarım', 'bordrolarim', 'Bordrolarım'], ['Mesailerim', 'mesailerim', 'Mesailerim'],
      ['Onaylar', 'onaylar', 'Onaylar'], ['Ekip', 'ekip', 'Ekip'], ['İzin takvimi', 'ekip-takvimi', 'İzin takvimi'],
    ] as const) {
      await page.getByRole('tab', { name: sekme }).click();
      await expect(page).toHaveURL(new RegExp(`/ik-islemlerim/yeni/${adres}$`));
      await expect(page.getByRole('heading', { name: baslik, level: 2, exact: true })).toBeVisible();
    }
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
