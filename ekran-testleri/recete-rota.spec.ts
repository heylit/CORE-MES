import { ADRES, cerceve, expect, test } from './ortak.ts';

// Kaynak: kayit/recete-rota/akislar.md R0 (açılış ve plan şeridi), R1 adım 1 (ürün seçimi), durum ekranları.
// Bilinen yanlış davranış (açılışta yazma) burada sınanmaz: degisecek.spec.ts. Reçete ve Rota bölümlerinin çerçevesi eski adrestedir
// (541: menü adresi yeni ekranı açar, recete-rota-yeni.spec.ts). Planlama plan modülünün sayfasıdır (658 b); eski planlama çerçevesi
// /plan/eski altında yalnız yöneticidedir (659 a).
test.use({ hesap: 'ornek.yonetici' });

test('Ürün ve rotalar: plan şeridi, ürün seçimi ve görünüm düğmeleri', async ({ page, ag, ac }) => {
  await ac('/recete-rota/eski/schema');
  const f = await cerceve(page);
  const serit = f.getByRole('status').filter({ hasText: /CANLIYA ALINMADI|ONAY BEKLİYOR|PLAN CANLI/ }).first();
  await expect(serit).toBeVisible();
  await expect(f.getByRole('button', { name: 'Onaya gönder' })).toBeVisible();

  await f.getByRole('combobox', { name: 'Şemadaki ürün' }).selectOption({ label: 'MM-ORN-00002 ORNEK Flanş' });
  await expect(f.getByText('MM-ORN-00002 rotası', { exact: true })).toBeVisible();
  await expect(f.getByRole('group', { name: 'Revizyonlar' }).getByRole('button', { name: /Rev A\s*Yürürlükte/ })).toBeVisible();
  await expect(f.getByRole('button', { name: /^10 Torna \(CNC\) ORN-TORNA-2/ })).toBeVisible();

  const gorunum = f.getByRole('group', { name: 'Görünüm' });
  // Prototip arka planda bütün sayfayı yeniden çizebilir (plan sürümü yoklaması: başka bir test planı canlıya alınca). Çizim basma
  // ile bırakma arasına düşerse tıklama düğmeye ulaşmaz; düğme aynı durumu yeniden seçtiği için durum gelene kadar yeniden basılır.
  for (const ad of ['Akış tablosu', 'Akış şeması']) {
    await expect(async () => {
      await gorunum.getByRole('button', { name: ad }).click();
      await expect(gorunum.getByRole('button', { name: ad })).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  }
  expect(ag.hatalar).toEqual([]);
});

test('R1.1: ürün seçicide yalnız mamul ve yarımamul kartı vardır', async ({ page, ac }) => {
  await ac('/recete-rota/eski/schema');
  const f = await cerceve(page);
  const secenekler = await f.getByRole('combobox', { name: 'Şemadaki ürün' }).locator('option').allInnerTexts();
  expect(secenekler.length).toBeGreaterThan(1);
  expect(secenekler.filter((s) => /^(HZ|SF)-/.test(s))).toEqual([]);
});

test('ikinci menüden bölümler arasında geçilir; Reçete ve Rota maddesi yeni ekranı açar', async ({ page, ag, ac }) => {
  await ac('/recete-rota/eski/schema');
  await cerceve(page);
  const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
  // Planlama ayrı sayfadır (658 b): Reçete ve Rota menüsünde planlama maddesi yoktur.
  await expect(menu.locator('a[href="/recete-rota/plan"]')).toHaveCount(0);
  await menu.locator('a[href="/recete-rota/schema"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL((u) => u.pathname === '/recete-rota/schema');
  await expect(page.getByRole('region', { name: 'Ürün ve rotalar' }).locator('[data-parca="R1"]')).toBeVisible({ timeout: 30_000 });
  expect(ag.hatalar).toEqual([]);
});

// Çerçeve açılışta Reçete ve Rota kaydı çalışmanınkinden yeniyse (savedAt, çalışmada rrSavedAt) onu çalışmaya alır ve iki kaydı yazar; bu
// eşitlemedir, sınanan değildir. Aynı veritabanında koşan öteki testler (öteki genişlikler dahil) iki kaydı her an değiştirebilir, bu yüzden
// çerçeveye okunan kayıtların eşitlenmiş hâli verilir: çalışmanın rrSavedAt'i Reçete ve Rota kaydının savedAt'idir.
const RR_ANAHTARI = 'recete-rota-motoru-v1';
const PLANLAMA_KAYDI = `${RR_ANAHTARI}:planlama`;
type Kayit = { anahtar: string; deger: unknown };
type Kayitlar = { kayitlar: Kayit[] };
const kayitDegeri = (k: Kayitlar, anahtar: string): Record<string, unknown> | null =>
  (k.kayitlar.find((x) => x.anahtar === anahtar)?.deger ?? null) as Record<string, unknown> | null;

test('eski planlama çerçevesini açmak ortak kayda yazmaz (aynı anda açan ikinci kişi çakışma uyarısı almaz)', async ({ page, ag, ac }) => {
  const oku = async (yol: string): Promise<Kayitlar> => (await page.request.get(`${ADRES}/api/${yol}`)).json() as Promise<Kayitlar>;
  // Çalışma yoksa Planlama sayfası kurar (657 a); kurmak kayıt varsa dokunmaz, öteki testlerle yarışmaz.
  let plan = await oku('plan/planlama-kayitlari');
  if (kayitDegeri(plan, PLANLAMA_KAYDI) === null) {
    await ac('/plan');
    await expect.poll(async () => { plan = await oku('plan/planlama-kayitlari'); return kayitDegeri(plan, PLANLAMA_KAYDI) !== null; }).toBe(true);
  }
  const rr = await oku('recete-rota/kayitlar');
  const savedAt = kayitDegeri(rr, RR_ANAHTARI)?.['savedAt'];
  expect(typeof savedAt).toBe('number');
  const eslenmis: Kayitlar = { ...plan, kayitlar: plan.kayitlar.map((k): Kayit => (k.anahtar === PLANLAMA_KAYDI
    ? { ...k, deger: { ...(k.deger as Record<string, unknown>), rrSavedAt: savedAt } } : k)) };
  await page.route('**/api/recete-rota/kayitlar', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: rr }) : r.fallback()));
  await page.route('**/api/plan/planlama-kayitlari', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: eslenmis }) : r.fallback()));
  // Çerçeve kayıtları kabuğa mesajla yazdırır; yazma isteği kabuğa vardığı anda sayılır, ağ zamanlamasından bağımsızdır.
  await page.addInitScript(() => {
    const w = window as unknown as { yazmaIstekleri: string[] };
    w.yazmaIstekleri = [];
    window.addEventListener('message', (o: MessageEvent) => {
      const m = o.data as { yon?: unknown; tip?: unknown; veri?: { anahtar?: unknown } } | null;
      if (m?.yon === 'istek' && (m.tip === 'kayit-yaz' || m.tip === 'kayit-sil')) w.yazmaIstekleri.push(`${String(m.tip)} ${String(m.veri?.anahtar)}`);
    }, true);
  });
  ag.sifirla();
  await ac('/plan/eski');
  const f = await cerceve(page);
  await expect(f.locator('main').first()).toBeVisible();
  // Çerçeve kaydı 2 sn bekletip yazar, kapanırken (pagehide) bekleyeni hemen gönderir. Kapanış çerçevede tetiklenir; ardından gönderilen
  // işaret kabuğa varınca (aynı kaynağın mesajları sırayla gelir) çerçevenin bütün yazma istekleri sayılmıştır. Sayfa kapanırken kabuk
  // mesajı işleyemez, bu yüzden başka adrese gidilerek sınanmaz.
  await page.evaluate(() => {
    const w = window as unknown as { isaret: Promise<string[]>; yazmaIstekleri: string[] };
    w.isaret = new Promise((coz) => {
      window.addEventListener('message', (o: MessageEvent) => { if ((o.data as { isaret?: unknown } | null)?.isaret === true) coz(w.yazmaIstekleri); });
    });
  });
  await f.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide')); window.parent.postMessage({ isaret: true }, '*'); });
  expect(await page.evaluate(() => (window as unknown as { isaret: Promise<string[]> }).isaret)).toEqual([]);
  expect(ag.hatalar).toEqual([]);
});

test.describe('planlama işlemi olmayan', () => {
  test.use({ hesap: 'ornek.kalite' });

  test('planlama sayfası açılmaz, menüde görünmez (353 a, 195 a)', async ({ page, ac }) => {
    await ac('/plan/eski');
    await expect(page.locator('main iframe')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Ana menü' }).locator('a[href="/plan"]')).toHaveCount(0);
    // Eski görünüm yalnız yöneticidedir (681 a): şerit yeni ekranda denenir, eski adres kapalıdır.
    await ac('/recete-rota/eski/schema');
    await expect(page.getByRole('heading', { name: 'Yetkiniz yok' })).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
    await ac('/recete-rota/schema');
    const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
    await expect(menu.locator('a[href="/recete-rota/schema"]').first()).toBeAttached();
    await expect(menu.locator('a[href="/recete-rota/plan"]')).toHaveCount(0);
  });
});

// 195 a: planlama rolü planlama sayfalarını görür; maliyet ve kâr sayfaları birim maliyet okumasını ister (200 a).
test.describe('planlama rolü', () => {
  test.use({ hesap: 'ornek.planlama' });

  test('planlama sayfası açılır; maliyet sayfası açılmaz, menüde görünmez; eski çerçeve yalnız yöneticide (659 a)', async ({ page, ac }) => {
    await ac('/plan/maliyet');
    await expect(page.getByText('Bu bölümü görme yetkiniz yok.')).toBeVisible();
    await ac('/plan');
    await expect(page.locator('[data-gorunum="plan"]')).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Planlama menüsü' });
    await expect(menu.locator('a[href="/plan"]').first()).toBeAttached();
    await expect(menu.locator('a[href="/plan/maliyet"]')).toHaveCount(0);
    await ac('/plan/eski');
    await expect(page.getByRole('heading', { name: 'Yetkiniz yok' })).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
  });
});
