import { expect, tasmaOlc, test } from './ortak.ts';

// Yeni finans ekranı (TS geçişi). Alıma kadar yalnız yöneticiye açıktır; parça yazarları (F1-F4) kendi describe bloğunu ekler.
test.describe('F0 iskelet', () => {
  test('yönetici açar: başlık, sekmeler ve Kayıt gir; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/finans/yeni');
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
    await ac('/finans/yeni');
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

  test.describe('kapı', () => {
    test.use({ hesap: 'ornek.muhasebe' });
    test('yönetici olmayana yeni ekran açılmaz', async ({ page, ag, ac }) => {
      await ac('/finans/yeni');
      await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
      expect(ag.hatalar).toEqual([]);
    });
  });
});

test.describe('F4 ana sayfa ve ayarlar', () => {
  // Açılışta günlük skor kendiliğinden yazılabilir (F0); ekranın kendi işlemleri yazma göndermez.
  const yazmalar = (y: readonly string[]) => y.filter((x) => x !== 'POST /api/finans/skorlar/kaydet');

  test('ana sayfa: dört sayı, yapılacaklar, nakit ve finansal durum; yatay taşma yok, yazma gitmez', async ({ page, ag, ac }) => {
    await ac('/finans/yeni');
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
    await ac('/finans/yeni');
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
    await ac('/finans/yeni/ayarlar');
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
    await ac('/finans/yeni/ayarlar?sekme=hesaplar');
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
