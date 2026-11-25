import { mkdirSync } from 'node:fs';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3708: rota adımının "Kontrol" seçimi (fason adımı). Düzenleme panelinde adım fasona çevrilir; üç seçenek, kapalı seçeneğin nedeni ve
// muayene süresi alanı 360, 768 ve 1280 genişlikte görünür; yatay taşma yok, rota içeriği kaydedilmez (değişiklik taslakta kalır).
// Görüntü klasörü TMIV2_EKRAN_GORUNTU ile verilirse üç genişliğin çekimi oraya yazılır.
const GORUNTU = process.env['TMIV2_EKRAN_GORUNTU']?.trim();

test.describe('3708 fason kontrol türü', () => {
  test('fason adımında Kontrol seçimi görünür: kontrolsüz kapalı nedenli, kaynağında muayene süre alanı açar', async ({ page, ag, ac }, bilgi) => {
    // Kontrol seçimi taslakta kalır: rota içeriğini kaydeden istek yoktur.
    const kayitlar: string[] = [];
    page.on('request', (r) => { if (r.method() !== 'GET' && /\/api\/rota\/.*(icerik|kaydet|onaya)/.test(r.url())) kayitlar.push(r.url()); });
    await ac('/recete-rota/schema');
    const sema = page.getByRole('region', { name: 'Ürün ve rotalar' });
    await expect(sema.locator('[data-parca="R1"]')).toBeVisible({ timeout: 15_000 });
    await sema.getByRole('button', { name: 'Akış şeması' }).click();
    const kutu = sema.locator('.tc-rr1-opbox').first();
    await expect(kutu).toBeVisible({ timeout: 15_000 });
    // Yürürlükteki revizyon salt okunurdur; Düzenle taslak açar (bu testte değişiklik kaydedilmez).
    const duzenle = sema.getByRole('button', { name: 'Düzenle', exact: true });
    if (await duzenle.count()) await duzenle.click();
    await kutu.click();
    await sema.getByRole('button', { name: 'Düzenleme paneli', exact: true }).click();
    const panel = sema.getByRole('complementary', { name: 'Düzenleme paneli' });
    await expect(panel).toBeVisible();
    const fasonDugmesi = panel.getByRole('button', { name: /Dış üretim \(fason\)/ });
    await expect(fasonDugmesi).toBeEnabled();
    await fasonDugmesi.click();
    const grup = panel.getByRole('radiogroup', { name: 'Kontrol' });
    await expect(grup).toBeVisible();
    // Varsayılan GKK'dır; taslak başka genişlikteki koşudan kalmış olabilir, bu yüzden seçim açıkça GKK'ya alınır.
    await grup.getByRole('radio', { name: /GKK/ }).click();
    await expect(grup.getByRole('radio', { name: /GKK/ })).toHaveAttribute('aria-checked', 'true');
    // Sonraki adım fason değilse kontrolsüz kapalıdır ve nedenini söyler.
    const kontrolsuz = grup.getByRole('radio', { name: /Kontrolsüz/ });
    await expect(kontrolsuz).toHaveAttribute('aria-disabled', 'true');
    await expect(kontrolsuz).toContainText('Kontrolsüz geçiş yalnız sonraki adım da fason ise seçilebilir.');
    await grup.getByRole('radio', { name: /Kaynağında muayene/ }).click();
    await expect(grup.getByRole('radio', { name: /Kaynağında muayene/ })).toHaveAttribute('aria-checked', 'true');
    await expect(panel.getByLabel('Muayene süresi (saat)')).toBeVisible();
    await expect(panel.getByText(/muayene süresi yok/)).toBeVisible();
    await panel.getByLabel('Muayene süresi (saat)').fill('2');
    await page.keyboard.press('Tab');
    await expect(panel.getByText(/muayene süresi yok/)).toHaveCount(0);
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    if (GORUNTU) {
      mkdirSync(GORUNTU, { recursive: true });
      await grup.evaluate((el) => { el.scrollIntoView({ block: 'center' }); });
      await page.screenshot({ path: `${GORUNTU}/fason-kontrol-${bilgi.project.name.replace('g', '')}.png` });
    }
    expect(kayitlar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
