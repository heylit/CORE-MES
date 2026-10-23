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
