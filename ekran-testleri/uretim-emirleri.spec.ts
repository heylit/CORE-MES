import { expect, test } from './ortak.ts';

// Kaynak: kayit/uretim-emirleri/akislar.md A1 (izleme), A5 (Fasona al Reçete ve Rota'ya taşındı, 1391 a), A6 (refakat kartları, Soru 586).
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

test('ayrıntı salt okumadır (1391 a): adımlar görünür, Fasona al düğmesi yok, yazma yok', async ({ page, ag, ac }) => {
  await ac('/uretim-emirleri/2');
  await expect(page.getByRole('table', { name: 'Operasyon adımları' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Fasona al|Stoka tamamla)$/ })).toHaveCount(0);
  await expect(page.getByText("Üretim yeri Reçete ve Rota'daki emirde değiştirilir.")).toBeVisible();
  expect(ag.yazmalar).toEqual([]);
  expect(ag.hatalar).toEqual([]);
});

test.describe('refakat kartları', () => {
  // Kart depoda lotla açılır (Soru 586); bölüm stok okumasıdır, emir ekranı kart açmaz ve eski emir kartını basmaz.
  test.use({ hesap: 'ornek.yonetici' });
  test('ayrıntıda emrin refakat kartları bölümü görünür, eski kart düğmesi yok', async ({ page, ag, ac }) => {
    await ac('/uretim-emirleri/2');
    const bolum = page.getByRole('region', { name: 'Refakat kartları' });
    await expect(bolum.getByRole('heading', { name: 'Refakat kartları' })).toBeVisible();
    // Örnek veride depo bu emre lot ayırmamıştır: bölüm kartın nerede açıldığını söyler.
    await expect(bolum.getByText('Kart depoda, lot emre ayrılınca açılır.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refakat kartı bas' })).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar, 'kart listesi yazmaz').toEqual([]);
  });
});
