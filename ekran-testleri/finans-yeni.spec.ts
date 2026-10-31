import { expect, tasmaOlc, test } from './ortak.ts';

// Finans ekranı (1392 a): menünün kökünde ve her ikinci menü maddesinin adresinde açılır; yeni ekran kapısı yoktur.
test.describe('F0 iskelet', () => {
  test('yönetici açar: başlık, sekmeler ve Kayıt gir; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/finans');
    const ekran = page.locator('.tc-fy');
    await expect(ekran.getByRole('heading', { name: 'Ana sayfa', level: 2 })).toBeVisible();
    const sekmeler = page.getByRole('tablist', { name: 'Finans bölümleri' });
    await expect(sekmeler).toBeVisible();
    await expect(ekran.getByRole('button', { name: 'Kayıt gir' })).toBeEnabled({ timeout: 15_000 });
    // Kaydıran kutuda şerit büzülmez: sekmeler dokunma yüksekliğinde kalır.
    expect((await sekmeler.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
  });

  test('Kayıt gir olay seçiciyi açar; olay seçilince form gelir, yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans');
    await page.locator('.tc-fy').getByRole('button', { name: 'Kayıt gir' }).click();
    const secici = page.getByRole('dialog', { name: 'Ne oldu?' });
    await expect(secici.getByRole('group', { name: 'Ne oldu?' })).toBeVisible();
    await secici.getByRole('button', { name: /Satış yaptım/ }).click();
    const form = page.getByRole('dialog', { name: 'Satış yaptım' });
    await expect(form.getByRole('form', { name: 'Satış yaptım' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await form.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(form).toBeHidden();
    // Açılışta yalnız günlük skor yazılır (prototipteki gibi); form vazgeçilince yazma gitmez.
    expect(ag.yazmalar.filter((y) => y !== 'POST /api/finans/skorlar/kaydet')).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test.describe('kapı yok', () => {
    test.use({ hesap: 'ornek.muhasebe' });
    test('yönetici olmayan da açar; deneme adresi aynı bölüme yönlenir; çerçeve yoktur', async ({ page, ag, ac }) => {
      await ac('/finans/yeni/kayitlar');
      await expect(page).toHaveURL(/\/finans\/kayitlar$/);
      await expect(page.locator('.tc-fy').getByRole('heading', { name: 'Kayıtlar', level: 2 })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Bu ekran hazırlanıyor')).toHaveCount(0);
      await expect(page.locator('iframe')).toHaveCount(0);
      expect(ag.hatalar).toEqual([]);
    });
  });
});

test.describe('F4 ana sayfa ve ayarlar', () => {
  // Açılışta günlük skor kendiliğinden yazılabilir (F0); ekranın kendi işlemleri yazma göndermez.
  const yazmalar = (y: readonly string[]) => y.filter((x) => x !== 'POST /api/finans/skorlar/kaydet');

  test('ana sayfa: dört sayı, yapılacaklar, nakit ve finansal durum; yatay taşma yok, yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans');
    const ana = page.locator('.tc-fa');
    for (const b of ['Kasada ve bankada', 'Alacağım', 'Borcum', 'Aylık ortalama kâr']) await expect(ana.getByText(b, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(ana.getByText('Yapılacaklar', { exact: true })).toBeVisible();
    await expect(ana.getByText('Nakit görünümü', { exact: true })).toBeVisible();
    await expect(ana.getByText('Finansal durum', { exact: true })).toBeVisible();
    await expect(ana.getByRole('group', { name: 'Hızlı kayıt' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(yazmalar(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('hızlı "Tahsilat" kayıt formunu açar; vazgeçince yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans');
    await page.locator('.tc-fa').getByRole('group', { name: 'Hızlı kayıt' }).getByRole('button', { name: 'Tahsilat' }).click();
    const form = page.getByRole('dialog', { name: 'Müşteriden para geldi' });
    await expect(form).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await form.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(form).toBeHidden();
    expect(yazmalar(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('ayarlar: dokuz sekmenin her biri açılır, yatay taşma yok, yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans/ayarlar');
    const serit = page.getByRole('tablist', { name: 'Ayar bölümleri' });
    await expect(serit).toBeVisible({ timeout: 15_000 });
    const sekmeler = serit.getByRole('tab');
    await expect(sekmeler).toHaveCount(9);
    for (let i = 0; i < 9; i++) {
      await sekmeler.nth(i).click();
      await expect(sekmeler.nth(i)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.tc-fa-ayar-govde > *').first()).toBeVisible();
      expect((await tasmaOlc(page)).belge, await sekmeler.nth(i).innerText()).toBeLessThanOrEqual(0);
    }
    expect(yazmalar(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('yeni hesap formu açılır ve kapanır; yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans/ayarlar?sekme=hesaplar');
    await page.getByRole('button', { name: 'Yeni hesap' }).click();
    const form = page.getByRole('dialog', { name: 'Yeni hesap' });
    await expect(form).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await form.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(form).toBeHidden();
    expect(yazmalar(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('F3 raporlar', () => {
  test('beş rapor açılır: başlık, içerik, yatay taşma yok, hata ve yazma yok', async ({ page, ag, ac }) => {
    const ekran = page.locator('.tc-fy');
    for (const [yol, baslik, icerik] of [
      ['durum', 'Durum ve öneriler', page.getByRole('region', { name: 'Öneriler', exact: true })],
      ['gelir-tablosu', 'Gelir tablosu', page.getByRole('table', { name: 'Gelir tablosu' })],
      ['karar-araclari', 'Karar araçları', page.getByLabel('Aylık sabit gider')],
      ['ay-sonu', 'Ay sonu kapanışı', page.getByRole('checkbox').first()],
      ['tahminler', 'Tahminler ve doğruluk', page.getByRole('heading', { name: 'Teknik ayrıntılar' })],
    ] as const) {
      await ac(`/finans/${yol}`);
      await expect(ekran.getByRole('heading', { name: baslik, level: 2 })).toBeVisible();
      await expect(icerik).toBeVisible({ timeout: 15_000 });
      expect((await tasmaOlc(page)).belge, yol).toBeLessThanOrEqual(0);
    }
    expect(ag.yazmalar.filter((y) => y !== 'POST /api/finans/skorlar/kaydet')).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('ana akış: süzgeç, dönem, hesap makinesi ve "Nasıl hesaplandı?" yazmadan çalışır', async ({ page, ag, ac }) => {
    await ac('/finans/gelir-tablosu');
    const tablo = page.getByRole('table', { name: 'Gelir tablosu' });
    await expect(tablo.getByRole('columnheader')).toHaveCount(8, { timeout: 15_000 });
    await page.getByRole('button', { name: '12 ay' }).click();
    await expect(tablo.getByRole('columnheader')).toHaveCount(14);

    await ac('/finans/karar-araclari');
    const sabit = page.getByLabel('Aylık sabit gider');
    await sabit.fill('840000');
    // Sonuç prototipteki gibi değer kesinleşince yenilenir.
    await sabit.press('Enter');
    await expect(page.getByText('2.000 adet')).toBeVisible();

    await ac('/finans/durum');
    const oneriler = page.getByRole('region', { name: 'Öneriler', exact: true });
    await expect(oneriler).toBeVisible({ timeout: 15_000 });
    await oneriler.getByRole('button', { name: /^Tümü/ }).click();
    const nasil = oneriler.getByRole('button', { name: 'Nasıl hesaplandı?' }).first();
    if (await nasil.count()) {
      await nasil.click();
      await expect(page.getByRole('heading', { name: 'Teknik ayrıntılar' })).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/\/finans\/tahminler#m-/);
    }
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => y !== 'POST /api/finans/skorlar/kaydet')).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

// F1: Kayıtlar ve Firmalar. Veriden bağımsız: ekran açılır, süzgeç ve liste gelir, yatay taşma yok, yazma gitmez.
// Genişlikler (360, 768, 1280) yapılandırmadaki projelerdendir.
test.describe('F1 kayıtlar ve firmalar', () => {
  test("Kayıtlar: süzgeç, arama ve Excel'e aktar; taşma yok", async ({ page, ag, ac }) => {
    await ac('/finans/kayitlar');
    const ekran = page.locator('.tc-fy');
    const suzgec = ekran.getByRole('group', { name: 'Kayıt süzgeci' });
    await expect(suzgec).toBeVisible({ timeout: 15_000 });
    await expect(ekran.getByLabel('Kayıtlarda ara')).toBeVisible();
    await expect(ekran.getByRole('button', { name: "Excel'e aktar" })).toBeVisible();
    await suzgec.getByRole('button', { name: /^Geciken/ }).click();
    await expect(suzgec.getByRole('button', { name: /^Geciken/ })).toHaveAttribute('aria-pressed', 'true');
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Firmalar: liste, süzgeç ve firma kartı; taşma yok', async ({ page, ag, ac }) => {
    await ac('/finans/firmalar');
    const ekran = page.locator('.tc-fy');
    const tur = ekran.getByRole('group', { name: 'Firma türü' });
    await expect(tur).toBeVisible({ timeout: 15_000 });
    await tur.getByRole('button', { name: 'Tümü' }).click();
    await expect(ekran.getByRole('button', { name: /Yeni firma/ })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    const satir = ekran.getByRole('table', { name: 'Firmalar' }).getByRole('row').nth(1);
    if (await satir.isVisible()) {
      await satir.click();
      await expect(ekran.getByRole('heading', { name: 'Kimlik' })).toBeVisible();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
      await ekran.getByRole('button', { name: 'Firmalar', exact: true }).click();
      await expect(tur).toBeVisible();
    }
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Firmalar: yeni firma formu açılır, Vazgeç ile kapanır, yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans/firmalar');
    await page.locator('.tc-fy').getByRole('button', { name: /Yeni firma/ }).click();
    const form = page.getByRole('dialog', { name: 'Yeni firma' });
    await expect(form.getByLabel('Vergi no')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await form.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(form).toBeHidden();
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('F2 çek ve senet, nakit planı, bütçe, vergi', () => {
  const BOLUMLER = [
    { yol: 'cekler', baslik: 'Çek ve senet', ozet: 'Çek özeti', kart: 'Takipteki çek ve senetler' },
    { yol: 'nakit', baslik: 'Nakit planı', ozet: 'Nakit riski', kart: 'Siparişten beklenen ödemeler' },
    { yol: 'butce', baslik: 'Bütçe', ozet: 'Bütçe özeti', kart: 'Görsel karşılaştırma' },
    { yol: 'vergi', baslik: 'Vergi takvimi', ozet: 'KDV özeti', kart: 'KDV dönem tablosu' },
  ] as const;
  // Yazan kullanıcı ekranı açınca günlük skor kaydı gidebilir (F0); bölümlerin kendisi yazma göndermez.
  const bolumYazmalari = (yazmalar: readonly string[]) => yazmalar.filter((y) => y !== 'POST /api/finans/skorlar/kaydet');
  for (const b of BOLUMLER) {
    test(`${b.baslik}: özet, kartlar ve grafik açılır; yatay taşma ve yazma yok`, async ({ page, ag, ac }) => {
      await ac(`/finans/${b.yol}`);
      const ekran = page.locator('.tc-fy');
      await expect(ekran.getByRole('heading', { name: b.baslik, level: 2, exact: true })).toBeVisible();
      await expect(ekran.getByLabel(b.ozet)).toBeVisible({ timeout: 15_000 });
      await expect(ekran.getByRole('heading', { name: b.kart })).toBeVisible();
      if (b.yol !== 'nakit') await expect(ekran.locator('.tc-fc-grafik canvas').first()).toBeVisible();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
      expect(bolumYazmalari(ag.yazmalar)).toEqual([]);
      expect(ag.hatalar).toEqual([]);
    });
  }

  test('Nakit planı: hafta hafta plana geçer, varsayım değişince yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans/nakit');
    const ekran = page.locator('.tc-fy');
    await ekran.getByRole('button', { name: 'Hafta hafta plan' }).click();
    await expect(ekran.getByRole('heading', { name: 'Varsayımlar' }).or(ekran.getByText('Tahmin için kayıt gerekiyor.'))).toBeVisible();
    if (await ekran.getByRole('heading', { name: 'Varsayımlar' }).isVisible()) {
      await ekran.getByRole('slider', { name: /Tahsilat gecikmesi/ }).fill('30');
      await expect(ekran.getByText(/Tahsilat gecikmesi: 30 gün/)).toBeVisible();
    }
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(bolumYazmalari(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Çek ve senet: Durum güncelle olay çekmecesini açar, Vazgeç ile kapanır; yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans/cekler');
    const ekran = page.locator('.tc-fy');
    await ekran.getByRole('button', { name: 'Durum güncelle' }).click();
    const pencere = page.getByRole('dialog', { name: 'Çekin durumu değişti' });
    await expect(pencere).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(pencere).toBeHidden();
    const duzenle = ekran.getByRole('button', { name: /çekini düzenle/ }).first();
    if (await duzenle.isVisible()) {
      await duzenle.click();
      const form = page.getByRole('dialog', { name: 'Çek / senedi düzenle' });
      await expect(form.getByLabel('Vade')).toBeVisible();
      await form.getByRole('button', { name: 'Vazgeç' }).click();
      await expect(form).toBeHidden();
    }
    expect(bolumYazmalari(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
