import { cerceve, expect, test } from './ortak.ts';

// Kaynak: kayit/uretim-terminali/akislar.md A0 (operatör açar), A2 adım 1 (yönetici istasyon seçer).
// Bilinen yanlış davranışlar (360 taşması) burada sınanmaz: degisecek.spec.ts.

test.describe('operatör', () => {
  test.use({ hesap: 'ornek.operator1' });

  test('kendi istasyonunda açılır; iş yokken sayaç kapalı; Özetim açılır', async ({ page, ag, ac }, bilgi) => {
    await ac('/uretim-terminali/eski');
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

  // A0.3, T5 (uçtan uca test raporu 2026-10-25): iş yokken hedef uydurulmaz ve iş düğmeleri kapalıdır.
  test('A0.3: istasyonda iş yokken "İşi Başlat" kapalı, sayaç hedef ve kalan göstermez', async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'düğme geniş ekranda ilk görünümde');
    await ac('/uretim-terminali/eski');
    const f = await cerceve(page);
    await expect(f.getByText('Bu istasyonda iş yok').first()).toBeVisible();
    await expect(f.getByRole('button', { name: 'İşi Başlat' })).toBeDisabled();
    await expect(f.locator('.dial .of')).toHaveText('/ — adet');
    await expect(f.locator('.dial')).not.toContainText('kaldı');
  });
});

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('cihazda istasyon yokken seçici kendiliğinden açılır ve bütün istasyonları listeler', async ({ page, ag, ac }) => {
    await ac('/uretim-terminali/eski');
    const f = await cerceve(page);
    const secici = f.locator('.ov').filter({ hasText: 'Hangi istasyonda?' });
    await expect(secici).toBeVisible();
    for (const istasyon of ['ORN-TORNA-1', 'ORN-TORNA-2', 'ORN-FREZE-1', 'ORN-FREZE-2', 'ORN-KONTROL']) await expect(secici).toContainText(istasyon);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar, 'seçici açmak yazmaz').toEqual([]);
  });
});
