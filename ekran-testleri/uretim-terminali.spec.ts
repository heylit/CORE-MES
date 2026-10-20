import { cerceve, expect, test } from './ortak.ts';

// Kaynak: kayit/uretim-terminali/akislar.md A0 (operatör açar), A2 adım 1 (yönetici istasyon seçer).
// Bilinen yanlış davranışlar (iş yokken "İşi Başlat" açık, 360 taşması) burada sınanmaz: degisecek.spec.ts.

test.describe('operatör', () => {
  test.use({ hesap: 'ornek.operator1' });

  test('kendi istasyonunda açılır; iş yokken sayaç kapalı; Özetim açılır', async ({ page, ag, ac }, bilgi) => {
    await ac('/uretim-terminali');
    const f = await cerceve(page);
    // Makine ataması istasyon yetkisi sayılır (#1433): operatör 1 ORN-TORNA-1 ile açılır.
    await expect(f.getByRole('banner')).toContainText('ORN-TORNA-1');
    if (bilgi.project.name === 'g1280') {
      await expect(f.getByRole('button', { name: 'İyi +1' })).toBeDisabled();
      await expect(f.getByRole('button', { name: 'Hurda +1' })).toBeDisabled();
      await f.getByRole('banner').getByRole('button', { name: 'Özetim' }).click();
    } else {
      await f.getByRole('navigation').getByRole('button', { name: 'Özetim' }).click();
    }
    await expect(f.getByText('Kendi özetin').first()).toBeVisible();
    await expect(f.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: 'Bugün' })).toHaveAttribute('aria-pressed', 'true');
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('cihazda istasyon yokken seçici kendiliğinden açılır ve bütün istasyonları listeler', async ({ page, ag, ac }) => {
    await ac('/uretim-terminali');
    const f = await cerceve(page);
    const secici = f.locator('.ov').filter({ hasText: 'Hangi istasyonda?' });
    await expect(secici).toBeVisible();
    for (const istasyon of ['ORN-TORNA-1', 'ORN-TORNA-2', 'ORN-FREZE-1', 'ORN-FREZE-2', 'ORN-KONTROL']) await expect(secici).toContainText(istasyon);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar, 'seçici açmak yazmaz').toEqual([]);
  });
});
