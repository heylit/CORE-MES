import { cerceve, expect, test } from './ortak.ts';

// Kaynak: kayit/recete-rota/akislar.md R0 (açılış ve plan şeridi), R1 adım 1 (ürün seçimi), durum ekranları.
// Bilinen yanlış davranış (açılışta yazma) burada sınanmaz: degisecek.spec.ts.
test.use({ hesap: 'ornek.yonetici' });

test('Ürün ve rotalar: plan şeridi, ürün seçimi ve görünüm düğmeleri', async ({ page, ag, ac }) => {
  await ac('/recete-rota/schema');
  const f = await cerceve(page);
  const serit = f.getByRole('status').filter({ hasText: /CANLIYA ALINMADI|PLAN CANLI/ }).first();
  await expect(serit).toBeVisible();
  await expect(f.getByRole('button', { name: 'Canlıya al' })).toBeVisible();

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
  await ac('/recete-rota/schema');
  const f = await cerceve(page);
  const secenekler = await f.getByRole('combobox', { name: 'Şemadaki ürün' }).locator('option').allInnerTexts();
  expect(secenekler.length).toBeGreaterThan(1);
  expect(secenekler.filter((s) => /^(HZ|SF)-/.test(s))).toEqual([]);
});

test('ikinci menüden bölümler arasında geçilir', async ({ page, ag, ac }) => {
  await ac('/recete-rota/schema');
  await cerceve(page);
  const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
  // Bağlantı adı bekleyen iş sayısını da taşır ("Plan 2"); bağlantı adresinden bulunur.
  for (const [yol, baslik] of [['/recete-rota/plan', 'Planlama'], ['/recete-rota/studio', 'Planlama'], ['/recete-rota/schema', 'Reçete ve Rota']] as const) {
    await menu.locator(`a[href="${yol}"]`).filter({ visible: true }).first().click();
    await expect(page).toHaveURL((u) => u.pathname === yol);
    // Plan ve atölye planlama çerçevesindedir (kanban yalnız eski adrestir, menüde yoktur): geçişte eski çerçeve bekleyen
    // yazması bitene kadar gizli durur, sonra yenisi kurulur. Adres değiştikten hemen sonra eski çerçeve bir an daha görünür
    // olabilir; ilk görünen çerçeve alınırsa gizlenen eski çerçeve yakalanır. Bu yüzden istenen türün çerçevesi başlığıyla beklenir.
    const ogesi = page.locator(`main iframe[title="${baslik}"]`);
    await expect(ogesi).toBeVisible({ timeout: 30_000 });
    const f = await (await ogesi.elementHandle())?.contentFrame();
    if (!f) throw new Error(`${baslik} çerçevesi yüklenmedi`);
    await expect(f.locator('main').first()).toBeVisible();
  }
  expect(ag.hatalar).toEqual([]);
});

test('planlama sayfasını açmak ortak kayda yazmaz (aynı anda açan ikinci kişi çakışma uyarısı almaz)', async ({ page, ag, ac }) => {
  await ac('/recete-rota/plan');
  const f = await cerceve(page);
  await expect(f.locator('main').first()).toBeVisible();
  // Çerçeve kaydı 2 sn bekletip yazar; yokluk ancak bekleyerek görülür.
  await page.waitForTimeout(4_000);
  expect(ag.yazmalar.filter((y) => y.includes('/recete-rota/kayitlar/'))).toEqual([]);
  expect(ag.hatalar).toEqual([]);
});

test.describe('planlama işlemi olmayan', () => {
  test.use({ hesap: 'ornek.planlama' });

  test('planlama sayfası açılmaz, menüde görünmez (353 a)', async ({ page, ac }) => {
    await ac('/recete-rota/plan');
    await expect(page.getByText('Bu bölümü görme yetkiniz yok.')).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
    await ac('/recete-rota/schema');
    await cerceve(page);
    const menu = page.getByRole('navigation', { name: 'Reçete ve Rota menüsü' });
    await expect(menu.locator('a[href="/recete-rota/schema"]').first()).toBeAttached();
    await expect(menu.locator('a[href="/recete-rota/plan"]')).toHaveCount(0);
  });
});
