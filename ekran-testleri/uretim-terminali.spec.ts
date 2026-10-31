import { expect, test } from './ortak.ts';

// Kaynak: kayit/uretim-terminali/akislar.md A0 (operatör açar), A2 adım 1 (yönetici istasyon seçer).
// Bilinen yanlış davranışlar (360 taşması) burada sınanmaz: degisecek.spec.ts.

// Eski çerçeve kalktı (1418, karar 1392 a): davranış yeni ekranda sınanır; kişi menüsünde görünüm geçişi yoktur.
test.describe('operatör', () => {
  test.use({ hesap: 'ornek.operator1' });

  test('kendi istasyonunda açılır; iş yokken sayaç kapalı; Özetim açılır', async ({ page, ag, ac }, bilgi) => {
    await ac('/uretim-terminali');
    const terminal = page.getByRole('region', { name: 'Üretim Terminali' });
    // Makine ataması istasyon yetkisi sayılır (#1433): operatör 1 ORN-TORNA-1 ile açılır.
    await expect(terminal.getByText('ORN-TORNA-1').first()).toBeVisible();
    if (bilgi.project.name === 'g1280') {
      await expect(terminal.getByRole('button', { name: 'İyi +1' })).toBeDisabled();
      await expect(terminal.getByRole('button', { name: 'Hurda +1' })).toBeDisabled();
      await terminal.getByRole('button', { name: 'Özetim' }).click();
    } else {
      await terminal.getByRole('navigation', { name: 'Terminal görünümleri' }).getByRole('button', { name: 'Özetim' }).click();
    }
    await expect(page.getByText('Kendi özetin').first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: 'Bugün' })).toHaveAttribute('aria-pressed', 'true');
    expect(ag.hatalar).toEqual([]);
  });

  // A0.3, T5 (uçtan uca test raporu 2026-10-25): iş yokken hedef uydurulmaz ve iş düğmeleri kapalıdır.
  test('A0.3: istasyonda iş yokken "İşi Başlat" kapalı, sayaç hedef ve kalan göstermez', async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'düğme geniş ekranda ilk görünümde');
    await ac('/uretim-terminali');
    const terminal = page.getByRole('region', { name: 'Üretim Terminali' });
    await expect(terminal.getByText('Bu istasyonda iş yok').first()).toBeVisible();
    await expect(terminal.getByRole('button', { name: /İşi Başlat/ })).toBeDisabled();
    await expect(terminal.locator('.tc-ay1-kadran-hedef')).toHaveText('/ — adet');
    await expect(terminal.locator('.tc-ay1-kadran')).not.toContainText('kaldı');
  });

  test('eski terminal adresi çerçeve açmaz; kişi menüsünde görünüm geçişi yoktur', async ({ page, ac }) => {
    await ac('/uretim-terminali/eski');
    await expect(page.getByRole('heading', { name: 'Yetkiniz yok' }).or(page.getByRole('region', { name: 'Üretim Terminali' })).first()).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
    await ac('/uretim-terminali');
    await page.getByRole('button', { name: 'Hesap' }).click();
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /görünüm$/ })).toHaveCount(0);
  });
});

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('cihazda istasyon yokken seçici kendiliğinden açılır ve bütün istasyonları listeler', async ({ page, ag, ac }) => {
    await ac('/uretim-terminali');
    const secici = page.getByRole('dialog', { name: 'Hangi istasyonda?' });
    await expect(secici).toBeVisible();
    for (const istasyon of ['ORN-TORNA-1', 'ORN-TORNA-2', 'ORN-FREZE-1', 'ORN-FREZE-2', 'ORN-KONTROL']) await expect(secici).toContainText(istasyon);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler')), 'seçici açmak yazmaz').toEqual([]);
  });
});
