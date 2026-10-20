import { expect, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// Kaynak: kayit/plan/akislar.md P2 (Plan Çizelgesi ve Plan Matrisi, salt okunur).
test.use({ hesap: 'ornek.planlama' });

async function ortakUstBolum(page: Page): Promise<void> {
  await expect(page.getByText('Canlı plan', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Salt okunur; planı değiştirmek için/).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Yerleşmemiş iş emirleri' })).toBeVisible();
  const aralik = page.getByRole('group', { name: 'Aralık' });
  await expect(aralik.getByRole('button', { name: '2 hafta' })).toHaveAttribute('aria-pressed', 'true');
  const gezinti = page.getByRole('group', { name: 'Aralık gezintisi' }).getByRole('status');
  const ikiHafta = await gezinti.innerText();
  await aralik.getByRole('button', { name: '1 hafta' }).click();
  await expect(aralik.getByRole('button', { name: '1 hafta' })).toHaveAttribute('aria-pressed', 'true');
  await expect(gezinti).not.toHaveText(ikiHafta);
  await page.getByRole('combobox', { name: 'İstasyon' }).selectOption({ index: 1 });
  await page.getByRole('searchbox', { name: 'Emir ve ürün ara' }).fill('ORN');
}

test('Plan Çizelgesi: salt okunur üst bölüm ve süzgeçler', async ({ page, ag, ac }) => {
  await ac('/cizelge');
  await ortakUstBolum(page);
  await expect(page.getByRole('heading', { name: 'Emir zaman çizelgesi' })).toBeVisible();
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'salt okunur ekran yazmaz').toEqual([]);
});

test('Plan Matrisi: salt okunur üst bölüm, süzgeçler ve doluluk efsanesi', async ({ page, ag, ac }) => {
  await ac('/matris');
  await ortakUstBolum(page);
  await expect(page.getByRole('list', { name: 'Doluluk efsanesi' })).toBeVisible();
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'salt okunur ekran yazmaz').toEqual([]);
});
