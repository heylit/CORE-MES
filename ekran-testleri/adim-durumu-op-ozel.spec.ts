import type { Page } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// Hücre panelinde "Bu OP'ye özel" (3741): şablon dışı madde ekle/kaldır adim-durumu-yaz ister, şablon maddesini bu OP'de değiştirmek ayrıca
// projeler.sablon-yaz ister; salt okuyan yalnız listeyi görür. Hücre etiketi "şablondan N fark" sayar. Akış yazdığını geri alır.
const HUCRE = /^\S+, OP \d+ .*: hazırlık/;
const bolumAc = async (page: Page, ac: (yol: string) => Promise<void>) => {
  await ac('/adim-durumu?mercek=hazirlik');
  await page.getByRole('table').getByRole('button', { name: HUCRE }).first().click();
  const bolum = page.getByRole('complementary', { name: 'Adım ayrıntısı' }).getByRole('region', { name: "Bu OP'ye özel" });
  await expect(bolum).toBeVisible({ timeout: 15_000 });
  await expect(bolum.getByText('Yükleniyor…')).toHaveCount(0);
  return bolum;
};

test.describe('salt okuyan', () => {
  test.use({ hesap: 'ornek.kalite' });
  test('kalite yalnız listeyi görür, ekleme ve fark formu yok; taşmaz', async ({ page, ac, ag }) => {
    const bolum = await bolumAc(page, ac);
    await expect(bolum.getByText('Bu OP şablonu aynen izliyor; özel madde yok.')).toBeVisible();
    await expect(bolum.getByRole('group', { name: 'Şablon dışı madde ekle' })).toHaveCount(0);
    await expect(bolum.getByRole('group', { name: "Şablon maddesini bu OP'de değiştir" })).toHaveCount(0);
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.yazmalar).toEqual([]);
  });
});

test.describe('planlama', () => {
  test.use({ hesap: 'ornek.planlama' });
  test('madde eklenir ve kaldırılır, şablon maddesi bu OP\'de gerekmez yapılır ve şablona dönülür; hücre farkı sayar; taşmaz', async ({ page, ac, ag }, bilgi) => {
    const bolum = await bolumAc(page, ac);
    const hucre = page.getByRole('table').getByRole('button', { name: HUCRE }).first();
    const isim = `ORN-Deneme madde ${bilgi.project.name}`;
    const ekle = bolum.getByRole('group', { name: 'Şablon dışı madde ekle' });
    await ekle.getByLabel('Madde adı').fill(isim);
    await ekle.getByRole('button', { name: 'Ekle' }).click();
    await expect(bolum.getByText(isim)).toBeVisible();
    await expect(hucre).toHaveAttribute('aria-label', /şablondan 1 fark/);

    const fark = bolum.getByRole('group', { name: "Şablon maddesini bu OP'de değiştir" });
    await fark.getByLabel('Şablon maddesi').selectOption({ index: 1 });
    const maddeAdi = (await fark.getByLabel('Şablon maddesi').locator('option:checked').textContent()) ?? '';
    await expect(fark.getByRole('button', { name: "Bu OP'de uygula" })).toBeDisabled();
    await fark.getByLabel('Gerekçe').fill('ORN deneme gerekçe');
    await fark.getByRole('button', { name: "Bu OP'de uygula" }).click();
    const farklar = bolum.getByRole('list', { name: 'Şablondan farklar' });
    await expect(farklar.getByText("Bu OP'de gerekmez")).toBeVisible();
    await expect(hucre).toHaveAttribute('aria-label', /şablondan 2 fark/);
    // K1: OP'de gerekmez yazılan madde panelde "Bu OP'de gerekmiyor" olur ve hücredeki hazırlık sayısından düşer; seçim listesi etkisiz maddeyi sunmaz.
    await expect(page.getByRole('region', { name: 'Hazırlık maddeleri' }).getByText("Bu OP'de gerekmiyor").first()).toBeVisible();
    await expect(fark.getByLabel('Şablon maddesi').locator('option', { hasText: maddeAdi })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Hazırlık kareleri' })).toContainText('şablondan N fark');
    await farklar.scrollIntoViewIfNeeded();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

    await farklar.getByRole('button', { name: 'Şablona dön' }).click();
    await expect(farklar).toHaveCount(0);
    await bolum.getByRole('button', { name: `Kaldır: ${isim}` }).click();
    await bolum.getByRole('group', { name: `${isim} kaldırılsın mı?` }).getByRole('button', { name: 'Kaldır' }).click();
    await expect(bolum.getByText(isim)).toHaveCount(0);
    await expect(hucre).not.toHaveAttribute('aria-label', /şablondan/);
    expect(ag.hatalar).toEqual([]);
  });
});
