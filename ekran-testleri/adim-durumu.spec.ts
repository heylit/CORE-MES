import { expect, test } from './ortak.ts';

// Adım Durumu (2893, düzen 2955): açık emir listeden seçilir, adımlar rota sırasıyla görünür, adım ayrıntısı yan pencerede açılır.
// Dar ekranda (1024 altı) emir seçilince liste gizlenir, "Emirler" düğmesi listeye döner.
test.use({ hesap: 'ornek.planlama' });

test('emir seçilir, adımlar ve sayaç görünür, adım ayrıntısı yan pencerede açılır', async ({ page, ag, ac }) => {
  await ac('/adim-durumu');
  const liste = page.getByRole('list', { name: 'Açık emirler' });
  const ilk = liste.getByRole('button').first();
  await expect(ilk).toBeVisible();
  await ilk.click();
  await expect(page).toHaveURL(/emir=\d+/);

  const adimlar = page.getByRole('list', { name: 'Adımlar' });
  await expect(adimlar.getByRole('listitem').first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Adım özeti' })).toBeVisible();
  const dar = (page.viewportSize()?.width ?? 0) < 1024;
  if (dar) await expect(liste).toBeHidden();
  else await expect(ilk).toHaveAttribute('aria-current', 'true');

  await adimlar.getByRole('button').first().click();
  const pencere = page.getByRole('dialog');
  await expect(pencere.getByText('Neden bekliyor')).toBeVisible();
  await expect(pencere.getByText('Hazırlık', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pencere).toBeHidden();

  await page.getByRole('button', { name: 'Matris' }).click();
  await expect(page.getByRole('table', { name: 'Hazırlık matrisi' })).toBeVisible();

  if (dar) {
    await page.getByRole('button', { name: 'Emirler' }).click();
    await expect(liste).toBeVisible();
    await expect(page).not.toHaveURL(/emir=/);
  }
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'okuma ve seçim yazmaz').toEqual([]);
});
