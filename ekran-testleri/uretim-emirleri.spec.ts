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
  // Telefonda durum çipleri tek satırdadır, sığmayan yana kayar (3051 b); geniş ekranda alt satıra geçebilir.
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    const ustler = await page.getByRole('group', { name: 'Duruma göre süz' }).getByRole('button').evaluateAll((l) => l.map((d) => Math.round(d.getBoundingClientRect().top)));
    expect(new Set(ustler).size, 'çipler tek satırda').toBe(1);
  }

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

// 3050 a: bekletme durum değil işarettir. Sunucu cevabı yolda işaretlenir (ortak veritabanı değişmez): liste, emir sayfası ve pencere
// üç genişlikte çalışır; telefonda "Beklemede" süzgeci öbür çiplerle tek satırda kalır.
const BEKLETME = { neden: 'musteri', not: 'Deneme notu', kisi: { id: 1, ad: 'Deneme Planlamaci' }, zaman: '2026-11-12T08:30:00.000Z' };
test.describe('bekletme (3050 a)', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('liste: "Beklemede" ayrı süzgeç, rozet yanında işaret, "Şu an"da neden; telefonda çipler tek satırda', async ({ page, ag, ac }) => {
    let isaretli = '';
    await page.route(/\/api\/uretim-emirleri\?/, async (r) => {
      const c = await r.fetch();
      const g = await c.json() as { emirler: { emirNo: string; durum: string; bekletme?: unknown }[] };
      const e = g.emirler.find((x) => x.durum === 'planli' || x.durum === 'basladi');
      if (e) { e.bekletme = BEKLETME; isaretli = e.emirNo; }
      await r.fulfill({ response: c, json: g });
    });
    await ac('/uretim-emirleri');
    const cipler = page.getByRole('group', { name: 'Duruma göre süz' });
    const beklemede = cipler.getByRole('button', { name: 'Beklemede 1' });
    await expect(beklemede).toBeVisible();
    if ((page.viewportSize()?.width ?? 1280) < 768) {
      const ustler = await cipler.getByRole('button').evaluateAll((l) => l.map((d) => Math.round(d.getBoundingClientRect().top)));
      expect(new Set(ustler).size, 'çipler tek satırda').toBe(1);
    }
    await beklemede.click();
    const tablo = page.getByRole('table', { name: 'Üretim emirleri' });
    const satir = tablo.getByRole('row').filter({ has: page.getByRole('link', { name: isaretli }) });
    await expect(tablo.getByRole('row').filter({ has: page.getByRole('link', { name: /^MM-ORN-/ }) })).toHaveCount(1);
    await expect(satir).toContainText('Beklemede: Müşteri onayı bekleniyor');
    await expect(satir.locator('td[data-baslik="Durum"]')).toContainText('Beklemede');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });

  test('emir sayfası: "İşlemler > Beklet" neden ister; bekleyen emirde şerit ve "Devam ettir"', async ({ page, ag, ac }) => {
    let beklet: unknown = null;
    await page.route(/\/api\/uretim-emirleri\/\d+$/, async (r) => {
      const c = await r.fetch();
      const g = await c.json() as { emir: { bekletme?: unknown } };
      if (beklet !== null) g.emir.bekletme = BEKLETME;
      await r.fulfill({ response: c, json: g });
    });
    await page.route(/\/api\/uretim-emirleri\/\d+\/(beklet|bekletme-kaldir)$/, async (r) => {
      const yol = new URL(r.request().url()).pathname;
      beklet = yol.endsWith('/beklet') ? r.request().postDataJSON() : null;
      const c = await r.fetch({ method: 'GET', url: r.request().url().replace(/\/(beklet|bekletme-kaldir)$/, ''), postData: undefined });
      const g = await c.json() as { emir: { bekletme?: unknown } };
      g.emir.bekletme = beklet === null ? null : BEKLETME;
      await r.fulfill({ status: 200, json: g });
    });
    await ac('/uretim-emirleri');
    await page.getByRole('group', { name: 'Duruma göre süz' }).getByRole('button', { name: /^Planlı \d+$/ }).click();
    await page.getByRole('table', { name: 'Üretim emirleri' }).getByRole('link', { name: /^MM-ORN-/ }).first().click();
    await expect(page.getByRole('group', { name: 'Emrin özeti' })).toBeVisible();
    await page.locator('.tc-emir-ust-sag').first().getByRole('button', { name: /işlemleri$/ }).click();
    await page.getByRole('menuitem', { name: 'Beklet' }).click();
    const pencere = page.getByRole('dialog', { name: /bekletilsin mi\?$/ });
    await pencere.getByRole('button', { name: 'Beklet' }).click();
    await expect(pencere.getByText('Neden seçin.')).toBeVisible();
    await pencere.getByLabel('Neden').selectOption('musteri');
    await pencere.getByRole('button', { name: 'Beklet' }).click();
    const serit = page.getByRole('status', { name: 'Emir beklemede' });
    await expect(serit).toContainText('Beklemede: Müşteri onayı bekleniyor');
    expect(beklet).toEqual({ neden: 'musteri' });
    await expect(page.getByRole('group', { name: 'Emrin özeti' })).toContainText('Beklemede');
    // Şerit telefonda da taşmaz.
    const [sk, gk] = await Promise.all([serit.boundingBox(), page.locator('body').boundingBox()]);
    expect(sk!.x + sk!.width).toBeLessThanOrEqual(gk!.x + gk!.width + 1);
    const yenilendi = page.waitForResponse((c) => /\/api\/uretim-emirleri\/\d+$/.test(new URL(c.url()).pathname) && c.request().method() === 'GET');
    await serit.getByRole('button', { name: 'Devam ettir' }).click();
    await expect(serit).toHaveCount(0);
    // "Devam ettir" sonrası yeniden çekme yoldaki işaretleyiciden geçer; test o bitmeden kapanırsa route.fetch kapalı sayfaya düşer.
    await yenilendi;
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    expect(ag.hatalar).toEqual([]);
  });
});
