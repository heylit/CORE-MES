import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Planlama motoru (kart #536, 3308): tek satırlık plan şeridi (durum ışığı, nabız, olaylar), görünüm ve dönem çubuğu, sade Özet, Harita,
// Keşfet ve salt okunur seçim kartı. Örnek veride çözülmüş plan olabilir de olmayabilir de; test iki hali de kabul eder, yazma göndermez (genişlikler aynı
// veritabanında paralel koşar). Planı kur sunucudaki motorla açıktır (576).
test.use({ hesap: 'ornek.yonetici' });

const tasmaz = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => { const g = document.querySelector('.tc-py-gorunum'); return g ? g.scrollWidth - g.clientWidth : 0; })).toBeLessThanOrEqual(0);
};
// Çalışma yoksa ya da plan kurulmamışsa görünüm çubuğu yoktur; test o hali kabul eder.
const BOS = /^(Planlama çalışması yok\.|Plan henüz kurulmadı)$/;
const BOLUMLER = ['Plan nasıl gidiyor?', 'Tezgâh haritası', 'Siparişler zamanında bitiyor mu?', 'Hangi gün hangi tezgâh dolu?'];

test.describe('P1a Planlama motoru', () => {
  test('Özet: dört bölüm ya da boş durum; üç görünüm, şerit açılır kapanır; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/plan/plan');
    await expect(page.locator('[data-gorunum="plan"]')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Görünüm' }).or(page.getByText(BOS)).first()).toBeVisible();
    const ozet = page.getByRole('region', { name: 'Plan nasıl gidiyor?' });
    if (await page.getByText(BOS).first().isVisible()) {
      // Planı kur sunucudaki motorla açıktır (576): çalışma varken yazabilene açık, çalışma yoksa pasif. Basılmaz (yazma göndermez).
      // Yazma yetkisiz pasif hali birim testlerinde (Motor, Cubuk): örnek veride sayfayı görüp plan yazamayan rol yok.
      // 1395 a: açılış çalışma kurmaz; çalışma yoksa yazabilene "Planlama çalışmasını aç" düğmesi çıkar (basılmaz). Yazı ve düğme aynı
      // anda okunur, ikisi uyuşana kadar yeniden denenir: yazı okunduktan sonra ekran değişirse yeni düğme eski yazıyla sınanmaz.
      await expect(async () => {
        const calismaYok = await page.getByText('Planlama çalışması yok.').isVisible();
        const dugmeler = await page.getByRole('button', { name: 'Planı kur' }).all();
        expect(dugmeler.length).toBeGreaterThan(0);
        for (const b of dugmeler) {
          if (calismaYok) expect(await b.getAttribute('aria-disabled')).toBe('true'); else expect(await b.isEnabled()).toBe(true);
        }
      }).toPass();
      if (await page.getByText('Planlama çalışması yok.').isVisible()) await expect(page.getByRole('button', { name: 'Planlama çalışmasını aç' })).toBeVisible();
      await tasmaz(page); return;
    }
    await expect(ozet).toBeVisible();
    for (const ad of BOLUMLER) await expect(page.getByRole('region', { name: ad })).toBeVisible();
    for (const ad of ['Özet', 'Harita', 'Keşfet']) await expect(page.getByRole('toolbar', { name: 'Görünüm' }).getByRole('button', { name: ad, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Çizelge', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kartlar', exact: true })).toHaveCount(0);
    await tasmaz(page);
    // Şerit tek satırdır: ışığa basınca nabız ve olaylar açılır, yine basınca kapanır.
    const isik = page.getByRole('toolbar', { name: 'Plan çubuğu' }).locator('.tc-pym-sb-isik');
    await expect(isik).toHaveAttribute('data-isik', /^(iyi|dikkat|sorun)$/);
    await isik.click();
    const nabiz = page.getByRole('region', { name: 'Plan nabzı' });
    await expect(nabiz).toBeVisible();
    await expect(nabiz.getByRole('button', { name: 'Olay ekle' })).toBeVisible();
    await tasmaz(page);
    await isik.click();
    await expect(nabiz).toHaveCount(0);
    await page.getByRole('button', { name: 'Ay', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ay', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Keşfet' }).click();
    await expect(page.getByRole('tablist', { name: 'Keşfet görünümleri' })).toBeVisible();
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

// P1b: Harita görünümü (tezgâh haritası, okuma kartı, yakınlık, oynatıcı ve zaman imleci). Sürükleme kapalıdır (459/4 a); test yazma göndermez.
test.describe('P1b Tezgâh haritası', () => {
  test('Harita: tuval, yakınlık ve oynatıcı; okuma kartı açılıp kapanır; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/plan/plan');
    await expect(page.locator('[data-gorunum="plan"]')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Görünüm' }).or(page.getByText(BOS)).first()).toBeVisible();
    if (await page.getByText(BOS).first().isVisible()) { await tasmaz(page); return; }
    await page.getByRole('button', { name: 'Harita', exact: true }).click();
    const harita = page.getByRole('region', { name: 'Tezgâh haritası' });
    await expect(harita).toBeVisible();
    await expect(harita.locator('canvas')).toBeVisible();
    await harita.getByRole('button', { name: 'Yakınlaş (+)' }).click();
    await harita.getByRole('button', { name: 'Sığdır (F)' }).click();
    const imlec = harita.getByRole('slider', { name: 'Zaman imleci' });
    await expect(imlec).toBeVisible();
    await harita.getByRole('button', { name: 'Oynat' }).click();
    await expect(harita.getByRole('button', { name: 'Durdur' })).toBeVisible();
    await harita.getByRole('button', { name: 'Durdur' }).click();
    const okuma = harita.getByRole('button', { name: /Haritayı okuma/ });
    await okuma.click();
    await expect(okuma).toHaveAttribute('aria-expanded', 'true');
    await tasmaz(page);
    await okuma.click();
    await expect(okuma).toHaveAttribute('aria-expanded', 'false');
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});


// P1d-1: Keşfet (pay şeridi, sipariş hatları, hazırlık, planı anlat). Seçim yazma göndermez.
test.describe('P1d Keşfet', () => {
  test('Keşfet: dört gösterim, sipariş seçimi, planı anlat adımları; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/plan/plan');
    await expect(page.getByRole('toolbar', { name: 'Görünüm' }).or(page.getByText(BOS)).first()).toBeVisible();
    if (await page.getByText(BOS).first().isVisible()) { await tasmaz(page); return; }
    await page.getByRole('button', { name: 'Keşfet', exact: true }).click();
    const sek = page.getByRole('tablist', { name: 'Keşfet görünümleri' });
    await expect(sek).toBeVisible();
    await expect(page.getByRole('img', { name: 'Sipariş payları' }).or(page.getByText('Bu dönemde termini olan sipariş yok.')).first()).toBeVisible();
    await tasmaz(page);
    const nokta = page.locator('.tc-pym-ks-nokta').first();
    if (await nokta.count()) { await nokta.click(); await expect(nokta).toHaveAttribute('data-secili', ''); }
    await sek.getByRole('tab', { name: 'Sipariş hatları' }).click();
    await expect(page.getByRole('img', { name: 'Sipariş hatları' })).toBeVisible();
    await tasmaz(page);
    await sek.getByRole('tab', { name: 'Hazırlık' }).click();
    await expect(page.getByRole('region', { name: 'Hazırlık' }).getByText('Emir hazırlık verisi bu ekrana bağlı değil.')).toBeVisible();
    await sek.getByRole('tab', { name: 'Planı anlat' }).click();
    const adimlar = page.getByRole('tablist', { name: 'Adımlar' });
    await expect(adimlar).toBeVisible();
    await adimlar.getByRole('tab').nth(1).click();
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Oynat' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/^3 \/ \d+$/)).toBeVisible();
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

// P1d-2: seçim yan paneli (sipariş, iş adımı ve tezgâh kartı). Kart salt okunurdur; düzenleme Kokpit'tedir (3308).
test.describe('P1d Yan panel', () => {
  test('Yan panel: seçim kartı açılır, sekmesizdir, Kokpit düğmesi, yolculuktan iş kartı, Kapat; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/plan/plan');
    await expect(page.getByRole('toolbar', { name: 'Görünüm' }).or(page.getByText(BOS)).first()).toBeVisible();
    if (await page.getByText(BOS).first().isVisible()) { await tasmaz(page); return; }
    await page.getByRole('button', { name: 'Keşfet', exact: true }).click();
    const nokta = page.locator('.tc-pym-ks-nokta').first();
    if (!(await nokta.count())) { await tasmaz(page); return; }
    await nokta.click();
    const dk = page.getByRole('complementary', { name: 'Yan panel' });
    await expect(dk).toBeVisible();
    await expect(dk.getByRole('tab')).toHaveCount(0);
    await expect(dk.locator('[data-k="secim-siparis"]')).toBeVisible();
    await expect(dk.getByRole('button', { name: 'Öne al' })).toHaveCount(0);
    await expect(dk.getByRole('button', { name: "Kokpit'te düzenle" })).toBeVisible();
    await tasmaz(page);
    await dk.locator('.tc-pym-at-yol .tc-pym-link').first().click();
    await expect(dk.locator('[data-k="secim-is"]')).toBeVisible();
    await tasmaz(page);
    await dk.getByRole('button', { name: 'Kapat (Esc)' }).click();
    await expect(dk).toBeHidden();
    await page.getByRole('button', { name: 'Özet', exact: true }).click();
    await page.getByRole('region', { name: 'Hangi gün hangi tezgâh dolu?' }).locator('th.tc-pym-mono button').first().click();
    await expect(dk.locator('[data-k="secim-tezgah"]')).toBeVisible();
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

// 3308-2 a: Veri ikinci menüde ayrı sayfadır (`/plan/veri?bolum=`); geçmişin iki bölümü (değişiklik defteri, değişiklik izi) içindedir.
// Eski adresler (`/plan?ekran=veri`, `/plan?ekran=gecmis`, `/plan/studio`) yeni yerine yönlenir. Örnek veride çalışma olmayabilir.
const VERI_BOLUMLERI = ['Siparişler', 'Kısıtlar', 'Tezgâhlar', 'Ürün ve rota', 'Takvim', 'Personel', 'Malzeme', 'Fason ve aparat', 'Ayar matrisi', 'Veri denetimi'];
test.describe('3308 Veri sayfası', () => {
  test('Veri: ikinci menüden açılır, on bölüm ve geçmişin iki bölümü gezilir; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/plan/sevkiyat');
    await page.getByRole('navigation', { name: 'Planlama menüsü' }).getByRole('link', { name: /^Veri$/ }).click();
    await expect(page).toHaveURL(/\/plan\/veri$/);
    await expect(page.locator('[data-parca="veri"]')).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Veri ve kısıtlar' });
    await expect(menu.getByRole('button')).toHaveText([...VERI_BOLUMLERI, 'Değişiklik defteri', 'Değişiklik izi'].map((b) => new RegExp(`^${b}`)));
    for (const b of [...VERI_BOLUMLERI, 'Değişiklik defteri', 'Değişiklik izi']) {
      await menu.getByRole('button', { name: new RegExp(`^${b}`) }).click();
      await expect(menu.getByRole('button', { name: new RegExp(`^${b}`) })).toHaveAttribute('aria-current', 'page');
      await tasmaz(page);
    }
    await expect(page).toHaveURL(/\/plan\/veri\?bolum=iz$/);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });

  test('Eski adresler yeni yerine yönlenir', async ({ page, ac }) => {
    await ac('/plan?ekran=veri&bolum=kisitlar');
    await expect(page).toHaveURL(/\/plan\/veri\?bolum=kisitlar$/);
    await ac('/plan?ekran=gecmis&bolum=iz');
    await expect(page).toHaveURL(/\/plan\/veri\?bolum=iz$/);
    await ac('/plan/studio');
    await expect(page).toHaveURL(/\/plan$/);
  });
});



// Motorun css'i sayfada yüklü kalır; tahta kartları başka parçanın önekini kullanınca maliyet sayfaları plan çubuğunun üstüne binip tıklanmaz oldu.
test.describe('Motordan sonra öteki sayfalar', () => {
  test('Motor açıldıktan sonra maliyet sayfalarının başlığı plan çubuğunun altında kalır ve tıklanır', async ({ page, ac }) => {
    await ac('/plan');
    const serit = page.getByRole('navigation', { name: 'Planlama menüsü' });
    for (const ad of ['Maliyetler', 'Genel gider', 'Kapasite']) {
      await serit.getByRole('link', { name: new RegExp(`^${ad}`) }).click();
      // Kapasite'nin başlığı bölüm sekmeleridir; çalışma yokken Yük haritası yalnız durum iletisi çizer.
      const baslik = ad === 'Kapasite' ? page.getByRole('tablist', { name: 'Kapasite bölümleri' })
        : page.locator('.tc-py-gorunum').getByRole('heading', { level: 2 }).first();
      const cubuk = page.getByRole('toolbar', { name: 'Plan çubuğu' });
      await expect(baslik).toBeVisible({ timeout: 20_000 });
      await expect(cubuk).toBeVisible();
      // Görünüm değişirken çubuk ve başlık bir an yeniden çizilir; tek anlık ölçüm o anda boş kutu okuyabilir.
      await expect.poll(async () => {
        const c = await cubuk.boundingBox();
        const b = await baslik.boundingBox();
        return c && b ? b.y - (c.y + c.height) : null;
      }).toBeGreaterThanOrEqual(0);
      await expect(baslik).not.toHaveCSS('pointer-events', 'none');
    }
  });
});