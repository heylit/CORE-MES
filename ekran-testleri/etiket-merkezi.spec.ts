import { expect, tasmaOlc, test } from './ortak.ts';

// 3011 a: standart dışı rulo. Etiket bas ekranında girilen ölçüye tasarım orantılı ölçeklenir; okunmayan ölçü basılmaz.
// Yalnız önizleme istenir; baskı düğmesine basılmaz (örnek veri değişmez).
test.describe('Standart dışı ölçü (3011)', () => {
  test('ölçü girilince önizleme o ölçüde çizilir, oran yazılır; ölçü bu cihazda kalır; sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/etiket-merkezi?tur=lot');
    const kutu = page.getByLabel('Standart dışı etikete bas');
    await expect(kutu).not.toBeChecked();
    await kutu.check();
    await page.getByLabel('Etiket eni (mm)').fill('60');
    await page.getByLabel('Etiket boyu (mm)').fill('40');
    await expect(page.getByText(/tasarım 60x40 mm etikete orantılı küçültülür ve ortalanır/)).toBeVisible();
    await expect(page.locator('svg[viewBox="0 0 60 40"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Standart ölçüye dön (100x50 mm)' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.reload();
    await expect(page.getByLabel('Standart dışı etikete bas')).toBeChecked();
    await expect(page.getByLabel('Etiket eni (mm)')).toHaveValue('60');
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });

  test('okunmayan ölçüde sunucu iletisi görünür, yeniden deneme sunulmaz', async ({ page, ag, ac }) => {
    await ac('/etiket-merkezi?tur=lot');
    await page.getByLabel('Standart dışı etikete bas').check();
    await page.getByLabel('Etiket eni (mm)').fill('20');
    await page.getByLabel('Etiket boyu (mm)').fill('10');
    await expect(page.getByText(/Bu ölçüde (QR|yazı) okunmaz .* Bu etiket için en küçük ölçü \d+x\d+ mm\./)).toBeVisible();
    await expect(page.getByRole('button', { name: /Yeniden dene/ })).toHaveCount(0);
    // Yazarken geçen ara ölçüler de (20x50) reddedilir; beklenen yalnız bu ölçü isteklerinin 400'üdür.
    const beklenen = (h: string) => /^400 GET \/api\/etiket-merkezi\/sablonlar\/lot-100x50\/cikti\?.*&en=20&boy=(10|50)$/.test(h)
      || h === 'konsol: Failed to load resource: the server responded with a status of 400 (Bad Request)';
    expect(ag.hatalar.some((h) => h.endsWith('&en=20&boy=10'))).toBe(true);
    expect(ag.hatalar.filter((h) => !beklenen(h))).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
