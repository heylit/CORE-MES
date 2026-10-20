import { expect, test } from './ortak.ts';

// Kaynak: kayit/uretim-emirleri/akislar.md A1 (izleme), A5 (Fasona al penceresi), A6 (refakat kartı).
test.use({ hesap: 'ornek.planlama' });

test('liste: açık emirler, süzgeç ve Bitenler sekmesi', async ({ page, ag, ac }) => {
  await ac('/uretim-emirleri');
  const tablo = page.getByRole('table', { name: 'Üretim emirleri' });
  await expect(page.getByRole('tab', { name: 'Açık emirler' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('status').filter({ hasText: /\d+ açık emir/ })).toBeVisible();
  await expect(tablo.getByRole('link', { name: /^MM-ORN-/ }).first()).toBeVisible();

  await page.getByRole('combobox', { name: 'Durum' }).selectOption({ label: 'Başladı' });
  await expect(page.getByRole('status').filter({ hasText: /\d+ açık emir/ })).toHaveText(/^1 /);
  // Süzgeç yalnız başlamış emirleri bırakır; ham durum kodu değil Türkçe ad görünür.
  const satirlar = tablo.getByRole('row').filter({ has: page.getByRole('link', { name: /^MM-ORN-/ }) });
  await expect(satirlar).toHaveCount(1);
  await expect(satirlar.first()).toContainText('Çalışıyor');
  await expect(satirlar.first()).not.toContainText('basladi');

  await page.getByRole('tab', { name: 'Bitenler' }).click();
  await expect(page).toHaveURL(/gorunum=bitenler/);
  await expect(page.getByRole('tab', { name: 'Bitenler' })).toHaveAttribute('aria-selected', 'true');
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'izleme sayfası yazmaz').toEqual([]);
});

test('ayrıntı: satırdan emre gidilir, adımlar görünür, listeye dönülür', async ({ page, ag, ac }) => {
  await ac('/uretim-emirleri');
  const bag = page.getByRole('table', { name: 'Üretim emirleri' }).getByRole('link', { name: /^MM-ORN-/ }).first();
  const emirNo = (await bag.innerText()).trim();
  await bag.click();
  await expect(page).toHaveURL(/\/uretim-emirleri\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Üretim emri' }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: emirNo }).first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Operasyon adımları' })).toBeVisible();
  await page.getByRole('button', { name: 'Listeye dön' }).click();
  await expect(page).toHaveURL(/\/uretim-emirleri(\?.*)?$/);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('Fasona al penceresi açılır ve vazgeçince kayıt değişmez', async ({ page, ag, ac }) => {
  await ac('/uretim-emirleri/2');
  const satir = page.getByRole('table', { name: 'Operasyon adımları' }).getByRole('row').filter({ has: page.getByRole('button', { name: 'Fasona al' }) }).first();
  await satir.getByRole('button', { name: 'Fasona al' }).click();
  const pencere = page.getByRole('dialog');
  await expect(pencere).toBeVisible();
  await expect(pencere).toContainText('nerede yapılsın');
  await pencere.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(pencere).toBeHidden();
  expect(ag.yazmalar, 'vazgeçilen pencere yazmaz').toEqual([]);
  expect(ag.hatalar).toEqual([]);
});

test('refakat kartı sayfası açılır', async ({ page, ag, ac }) => {
  await ac('/uretim-emirleri/2');
  await page.getByRole('button', { name: 'Refakat kartı bas' }).click();
  await expect(page).toHaveURL(/\/uretim-emirleri\/2\/refakat-karti$/);
  await expect(page.getByText('MM-ORN-00002-26-10-002').first()).toBeVisible();
  expect(ag.hatalar).toEqual([]);
});
