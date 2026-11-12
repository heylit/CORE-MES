import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Kaynak: kayit/uretim-emirleri/akislar.md A1 (izleme), A6 (refakat kartları, Soru 586). Emir sayfası 3039: yaşam şeridi, dört özet,
// durumuna göre tek ana düğme, sekmeler (Adımlar, Malzeme, Hazırlık, Stok ve kapanış, Kayıtlar); emir Üretim Emirleri'nde yönetilir.
test.use({ hesap: 'ornek.planlama' });

const sayac = (page: Page) => page.getByRole('status').filter({ hasText: /\d+ açık emir/ });

test('liste: açık emirler, sayılı durum çipleri, "Şu an" sütunu ve Bitenler sekmesi', async ({ page, ag, ac }) => {
  await ac('/uretim-emirleri');
  const tablo = page.getByRole('table', { name: 'Üretim emirleri' });
  await expect(page.getByRole('tab', { name: 'Açık emirler' })).toHaveAttribute('aria-selected', 'true');
  await expect(sayac(page)).toBeVisible();
  await expect(tablo.getByRole('link', { name: /^MM-ORN-/ }).first()).toBeVisible();
  await expect(tablo.getByRole('columnheader', { name: 'Şu an' })).toBeVisible();
  // Emir no hücresinden taşıp yandaki sütunun üstüne binmez (telefonda sabit ilk sütun dardır).
  const no = tablo.getByRole('link', { name: /^MM-ORN-/ }).first();
  const [nk, hk] = await Promise.all([no.boundingBox(), no.locator('xpath=ancestor::td[1]').boundingBox()]);
  expect(nk!.x + nk!.width).toBeLessThanOrEqual(hk!.x + hk!.width + 1);

  // Çip sayısı süzülen satır sayısıdır; süzgeç istemcidedir, sunucuya yeni okuma gitmez.
  const cipler = page.getByRole('group', { name: 'Duruma göre süz' });
  await expect(cipler.getByRole('button', { name: /^Tümü \d+$/ })).toHaveAttribute('aria-pressed', 'true');
  const uretimde = cipler.getByRole('button', { name: /^Üretimde \d+$/ });
  const n = Number(/(\d+)$/.exec((await uretimde.innerText()).trim())?.[1]);
  await uretimde.click();
  await expect(uretimde).toHaveAttribute('aria-pressed', 'true');
  await expect(sayac(page)).toHaveText(new RegExp(`^${String(n)} `));
  const satirlar = tablo.getByRole('row').filter({ has: page.getByRole('link', { name: /^MM-ORN-/ }) });
  await expect(satirlar).toHaveCount(n);
  if (n > 0) {
    await expect(satirlar.first()).toContainText('Başladı');
    await expect(satirlar.first()).not.toContainText('basladi');
  }

  await page.getByRole('tab', { name: 'Bitenler' }).click();
  await expect(page).toHaveURL(/gorunum=bitenler/);
  await expect(page.getByRole('tab', { name: 'Bitenler' })).toHaveAttribute('aria-selected', 'true');
  await expect(cipler.getByRole('button')).toHaveText([/^Tümü/, /^Bitti/, /^İptal/]);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'liste yazmaz').toEqual([]);
});

test('emir sayfası: satırdan açılır; yaşam şeridi, özet ve sekmeler; geri bağlantı listeye döner', async ({ page, ag, ac }) => {
  await ac('/uretim-emirleri');
  const bag = page.getByRole('table', { name: 'Üretim emirleri' }).getByRole('link', { name: /^MM-ORN-/ }).first();
  const emirNo = (await bag.innerText()).trim();
  await bag.click();
  await expect(page).toHaveURL(/\/uretim-emirleri\/\d+$/);
  await expect(page.getByRole('heading', { name: emirNo }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'Emrin özeti' })).toBeVisible();
  for (const ad of ['Adımlar', 'Malzeme', 'Hazırlık', 'Stok ve kapanış', 'Kayıtlar']) await expect(page.getByRole('tab', { name: ad })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Adımlar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Adımlar' })).toContainText(/OP ?\d+|\b\d{2}\b/);
  await page.getByRole('tab', { name: 'Kayıtlar' }).click();
  await expect(page).toHaveURL(/sekme=kayitlar/);
  // Kayıt defteri boşsa tablo yerine boş iletisi çizilir.
  await expect(page.getByRole('table', { name: 'Kayıt defteri' }).or(page.getByText('Henüz kayıt yok').last())).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parçayı izle' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Emrin bağlantıları' }).getByRole('button', { name: 'Üretim emirleri' }).click();
  await expect(page).toHaveURL(/\/uretim-emirleri(\?.*)?$/);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('başlıkta en çok bir birincil düğme ve "İşlemler"; adımların arasına ekleme yalnız başlamamış adımın üstünde', async ({ page, ag, ac }) => {
    await ac('/uretim-emirleri/2');
    const baslik = page.locator('.tc-emir-ust-sag').first();
    await expect(baslik.getByRole('button', { name: /işlemleri$/ })).toBeVisible();
    expect(await page.locator('.tc-dugme-birincil').filter({ visible: true }).count()).toBeLessThanOrEqual(1);
    const panel = page.getByRole('tabpanel', { name: 'Adımlar' });
    const ekle = panel.getByRole('button', { name: 'Buraya adım ekle' });
    if (await ekle.count() > 0) {
      await ekle.first().click();
      await expect(panel.getByRole('group', { name: 'Ek operasyon' })).toBeVisible();
      await panel.getByRole('group', { name: 'Ek operasyon' }).getByRole('button', { name: /Vazgeç|Kapat/ }).first().click();
    }
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar, 'açıp kapatmak yazmaz').toEqual([]);
  });

  // Kart depoda lotla açılır (Soru 586); bölüm stok okumasıdır, emir sayfası kart açmaz ve eski emir kartını basmaz. 3039: "Malzeme" sekmesinde.
  test('Malzeme sekmesinde refakat kartları bölümü görünür, eski kart düğmesi yok', async ({ page, ag, ac }) => {
    await ac('/uretim-emirleri/2?sekme=malzeme');
    const bolum = page.getByRole('region', { name: 'Refakat kartları' });
    // Örnek veride depo bu emre lot ayırmamıştır: bölüm tek satırdır, kartın nerede açıldığını söyler; başlık ve tablo yok (2907).
    await expect(bolum.getByText('Refakat kartı yok · lot emre ayrılınca depoda açılır.')).toBeVisible();
    await expect(bolum.getByRole('heading')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refakat kartı bas' })).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar, 'kart listesi yazmaz').toEqual([]);
  });
});
