import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Planlama P1a-P1c (kart #536): Planlama motoru kabuğu, plan çubuğu ve nabız, görünüm ve dönem çubuğu, Başka menüsü, Özet'in altı bölümü ve
// Yapılacaklar. Örnek veride çözülmüş plan olabilir de olmayabilir de; test iki hali de kabul eder, yazma göndermez (genişlikler aynı
// veritabanında paralel koşar). Motor gerektiren düğmeler yerinde ve pasiftir (357 b); Planı kur sunucudaki motorla açıktır (576).
test.use({ hesap: 'ornek.yonetici' });

const tasmaz = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => { const g = document.querySelector('.tc-py-gorunum'); return g ? g.scrollWidth - g.clientWidth : 0; })).toBeLessThanOrEqual(0);
};
// Çalışma yoksa ya da plan kurulmamışsa görünüm çubuğu yoktur; test o hali kabul eder.
const BOS = /^(Planlama çalışması yok\.|Plan henüz kurulmadı)$/;
const BOLUMLER = ['Plan nasıl gidiyor?', 'Siparişler nerede bekliyor?', 'Ne yapmalıyım?', 'Hangi gün hangi tezgâh dolu?', 'Siparişler zamanında bitiyor mu?', 'Süre nereye gidiyor?'];

test.describe('P1a Planlama motoru', () => {
  test('Özet: altı bölüm ve tezgâh haritası ya da boş durum; çubuklar ve Başka menüsü; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan');
    await expect(page.locator('[data-gorunum="plan"]')).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Görünüm' }).or(page.getByText(BOS)).first()).toBeVisible();
    const ozet = page.getByRole('region', { name: 'Plan nasıl gidiyor?' });
    if (await page.getByText(BOS).first().isVisible()) {
      // Planı kur sunucudaki motorla açıktır (576): çalışma varken yazabilene açık, çalışma yoksa pasif. Basılmaz (yazma göndermez).
      // Yazma yetkisiz pasif hali birim testlerinde (Motor, Atölye): örnek veride sayfayı görüp plan yazamayan rol yok.
      const calismaYok = await page.getByText('Planlama çalışması yok.').isVisible();
      for (const b of await page.getByRole('button', { name: 'Planı kur' }).all()) {
        if (calismaYok) await expect(b).toHaveAttribute('aria-disabled', 'true'); else await expect(b).toBeEnabled();
      }
      await tasmaz(page); return;
    }
    await expect(ozet).toBeVisible();
    if (await ozet.isVisible()) {
      for (const ad of BOLUMLER) await expect(page.getByRole('region', { name: ad })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Tezgâh haritası' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Planı iyileştir' })).toHaveAttribute('aria-disabled', 'true');
      await ozet.getByRole('button', { name: 'Nasıl okunur' }).click();
      await expect(ozet.getByText('Her kart bir ölçü.', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: /Yapılacaklar/ }).click();
      await expect(page.getByRole('dialog', { name: 'Yapılacaklar' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Yapılacaklar' })).toHaveCount(0);
    }
    await tasmaz(page);
    await page.getByRole('button', { name: /Başka/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await tasmaz(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ay', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ay', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Keşfet' }).click();
    await expect(page.getByRole('tablist', { name: 'Keşfet görünümleri' })).toBeVisible();
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

// P1b: Harita görünümü (tezgâh haritası, kılavuz, yakınlık, oynatıcı ve zaman imleci). Sürükleme kapalıdır (459/4 a); test yazma göndermez.
test.describe('P1b Tezgâh haritası', () => {
  test('Harita: tuval, yakınlık ve oynatıcı; kılavuz açılıp kapanır; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan');
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
    // Kılavuz kendiliğinden açılmaz (eski sayfa da açmıyor); Başka menüsünden açılır, kapatılır.
    const kilavuz = page.getByRole('complementary', { name: 'Kılavuz' });
    await page.waitForTimeout(2000);
    await expect(kilavuz).toHaveCount(0);
    await page.getByRole('button', { name: /Başka/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /Nasıl okunur/ }).click();
    await expect(kilavuz).toBeVisible();
    await tasmaz(page);
    // 598 a: dar ekranda Yapılacaklar düğmesi kartın X'inin üstüne biner (eski sayfada da böyle); orada kılavuz Anladım ile kapanır.
    const dar = (page.viewportSize()?.width ?? 0) < 600;
    await kilavuz.getByRole('button', { name: dar ? 'Anladım' : 'Kılavuzu kapat' }).click();
    await expect(kilavuz).toHaveCount(0);
    await page.getByRole('button', { name: /Başka/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /Nasıl okunur/ }).click();
    await expect(kilavuz).toBeVisible();
    await kilavuz.getByRole('button', { name: 'Anladım' }).click();
    await expect(kilavuz).toHaveCount(0);
    // Özet'te de açılır, görünüm değişmez (eski atKilavuz).
    await page.getByRole('button', { name: 'Özet', exact: true }).click();
    await page.getByRole('button', { name: /Başka/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /Nasıl okunur/ }).click();
    await expect(kilavuz).toBeVisible();
    await expect(page.getByRole('region', { name: 'Plan nasıl gidiyor?' })).toBeVisible();
    await tasmaz(page);
    await kilavuz.getByRole('button', { name: 'Kılavuzu kapat' }).click();
    await expect(kilavuz).toHaveCount(0);
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

test.describe('P1c Çizelge', () => {
  test('Çizelge: araç satırı, hafta ızgarası, saatlik gün, Siparişler merceği, tam ekran, yan paneller; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan');
    await expect(page.getByRole('toolbar', { name: 'Görünüm' }).or(page.getByText(BOS)).first()).toBeVisible();
    if (await page.getByText(BOS).first().isVisible()) { await tasmaz(page); return; }
    await page.getByRole('button', { name: 'Çizelge', exact: true }).click();
    const arac = page.getByRole('toolbar', { name: 'Plan araçları' });
    await expect(arac).toBeVisible();
    await expect(arac.getByRole('button', { name: /Başka/ })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Çizelge, hafta' })).toBeVisible();
    await tasmaz(page);
    await arac.getByRole('button', { name: 'Gün', exact: true }).click();
    await expect(page.getByRole('region', { name: /^Gün katmanı: / })).toBeVisible();
    // İş bloğu ipucu (492/4 a): o gün iş varsa odakla açılır, neden ve durum yazar.
    const blok = page.locator('.tc-pym-gy-blok').first();
    if (await blok.count()) {
      await blok.focus();
      await expect(page.getByRole('tooltip')).toContainText('Neden burada:');
      await blok.blur();
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    }
    await tasmaz(page);
    await arac.getByRole('button', { name: 'Ay', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Çizelge, ay' })).toBeVisible();
    await arac.getByRole('tab', { name: 'Siparişler' }).click();
    await expect(page.getByRole('region', { name: 'Plan çizelgesi' })).toBeVisible();
    await page.getByRole('button', { name: 'Şimdiye git' }).click();
    await tasmaz(page);
    await arac.getByRole('tab', { name: 'Kuyruk' }).click();
    await expect(page.getByRole('region', { name: 'Tezgâh kuyrukları' })).toBeVisible();
    await tasmaz(page);
    await arac.getByRole('tab', { name: 'Matris' }).click();
    await expect(page.getByRole('tablist', { name: 'Matris' })).toBeVisible();
    await page.getByRole('tab', { name: 'Personel' }).click();
    await expect(page.getByRole('columnheader', { name: 'Personel' })).toBeVisible();
    await tasmaz(page);
    await arac.getByRole('tab', { name: 'Tezgâhlar' }).click();
    const cizelge = page.getByRole('region', { name: 'Çizelge', exact: true });
    await arac.getByRole('button', { name: 'Tam ekran', exact: true }).click();
    await expect(cizelge).toHaveAttribute('data-tam', '');
    await page.keyboard.press('Escape');
    await expect(cizelge).not.toHaveAttribute('data-tam', '');
    await tasmaz(page);
    await arac.getByRole('button', { name: 'Yardımcı', exact: true }).click();
    const yan = page.getByRole('complementary', { name: 'Plan yardımcısı' });
    await expect(yan.getByText('Teknik ayrıntılar (uzman)')).toBeVisible();
    await tasmaz(page);
    await yan.getByRole('tab', { name: 'Ayrıntı' }).click();
    await expect(page.getByRole('region', { name: 'Karar paneli' })).toBeVisible();
    await arac.getByRole('button', { name: 'Sepet', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Sepet' })).toBeVisible();
    await page.getByRole('complementary', { name: 'Sepet' }).getByRole('tab', { name: 'Havuz' }).click();
    await expect(page.getByRole('complementary', { name: 'Havuz' })).toBeVisible();
    await tasmaz(page);
    await arac.getByRole('button', { name: 'Havuz', exact: true }).click();
    await arac.getByRole('tab', { name: 'Siparişler' }).click();
    const is = page.getByRole('region', { name: 'Plan çizelgesi' }).locator('.tc-pym-g-is').first();
    if (await is.count()) {
      await is.click();
      const neden = page.getByText('Neden bu saatte:');
      if (!(await neden.isVisible())) await arac.getByRole('button', { name: 'Ayrıntı', exact: true }).click();
      await expect(neden).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Siparişin adımları' })).toBeVisible();
      await tasmaz(page);
      await page.keyboard.press('e');
      await expect(page.getByRole('dialog', { name: 'Düzenle' })).toBeVisible();
      await tasmaz(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Düzenle' })).toHaveCount(0);
    }
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

// P1d-1: Keşfet (pay şeridi, sipariş hatları, hazırlık, planı anlat). Seçim yazma göndermez.
test.describe('P1d Keşfet', () => {
  test('Keşfet: dört gösterim, sipariş seçimi, planı anlat adımları; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan');
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

// P1d-2: seçim yan paneli (sipariş, iş adımı ve tezgâh kartı). Motor hamleleri pasif; seçim ve sekme yazma göndermez.
test.describe('P1d Yan panel', () => {
  test('Yan panel: seçim kartı açılır, sekmeler (Rota, Takvim), yolculuktan iş kartı, Kapat; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan');
    await expect(page.getByRole('toolbar', { name: 'Görünüm' }).or(page.getByText(BOS)).first()).toBeVisible();
    if (await page.getByText(BOS).first().isVisible()) { await tasmaz(page); return; }
    await page.getByRole('button', { name: 'Keşfet', exact: true }).click();
    const nokta = page.locator('.tc-pym-ks-nokta').first();
    if (!(await nokta.count())) { await tasmaz(page); return; }
    await nokta.click();
    const dk = page.getByRole('complementary', { name: 'Yan panel' });
    await expect(dk).toBeVisible();
    await expect(dk.getByRole('tab', { name: 'Yön ver' })).toHaveAttribute('aria-selected', 'true');
    await expect(dk.getByText('SİPARİŞ')).toBeVisible();
    await expect(dk.getByRole('button', { name: 'Öne al' })).toHaveAttribute('aria-disabled', 'true');
    await tasmaz(page);
    await dk.getByRole('tab', { name: 'Rota' }).click();
    await expect(dk.getByRole('list', { name: /rotası$/ })).toBeVisible();
    await expect(dk.getByRole('button', { name: 'Rotalar' })).toHaveAttribute('aria-disabled', 'true');
    await tasmaz(page);
    await dk.getByRole('tab', { name: 'Yön ver' }).click();
    await dk.locator('.tc-pym-at-yol .tc-pym-link').first().click();
    await expect(dk.getByText('İŞ ADIMI')).toBeVisible();
    await tasmaz(page);
    await dk.getByRole('button', { name: 'Kapat (Esc)' }).click();
    await expect(dk).toBeHidden();
    await page.getByRole('button', { name: 'Özet', exact: true }).click();
    await page.getByRole('region', { name: 'Hangi gün hangi tezgâh dolu?' }).locator('th.tc-pym-mono button').first().click();
    await dk.getByRole('tab', { name: 'Takvim' }).click();
    await expect(dk.getByText(/takvimi$/)).toBeVisible();
    await expect(dk.getByRole('button', { name: 'Bakımı dene' })).toHaveAttribute('aria-disabled', 'true');
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

// P1e: Planlama atölyesi (eski stüdyonun Plan sekmesi, tezgâh panosu). Motor isteyen düğmeler pasif (357 b); Onay ve canlı ile Plan ve
// gerçekleşen sonraki teslimdedir. Eskisi gibi açılışta gün başı çalışmaya sessiz yazılır; test başka yazma göndermez (kilit, donuk bölge seçilmez).
// Genişlikler aynı kayda paralel yazabildiği için o tek yazmanın sonucu (çatışma dahil) sınanmaz.
test.describe('P1e Planlama atölyesi', () => {
  test('Atölye: kimlik ve sekmeler; pano, ray ve kartlar ya da boş durum; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/studio');
    await expect(page.getByRole('tablist', { name: 'Stüdyo sekmeleri' })).toBeVisible();
    await expect(page.getByText(/^Canlı sürüm /)).toBeVisible();
    await expect(page.locator('.tc-pym-tp-ust').or(page.getByText(BOS)).first()).toBeVisible();
    if (await page.getByText(BOS).first().isVisible()) { await tasmaz(page); return; }
    const ust = page.locator('.tc-pym-tp-ust');
    await expect(ust.getByRole('button', { name: 'Diğer' })).toBeVisible();
    await expect(ust.getByRole('button', { name: 'İyileştir' })).toHaveAttribute('aria-disabled', 'true');
    await tasmaz(page);
    // Sabah brifingi panonun üstünde kalabilir; kapatmak yazma gönderir, çubuk olayla seçilir.
    const cubuk = page.locator('.tc-pym-tp-cubuk').first();
    if (await cubuk.count()) {
      await cubuk.dispatchEvent('click');
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('dialog').getByText('Neden bu saatte')).toBeVisible();
      await tasmaz(page);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await ust.getByRole('button', { name: 'Diğer' }).click();
    await expect(page.getByRole('dialog', { name: 'Diğer' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Diğer' }).getByRole('button', { name: 'Hafta' }).click();
    await page.keyboard.press('Escape');
    await page.locator('.tc-pym-tp-bugun-bas').click();
    await expect(page.getByText('Çözülecekler')).toBeVisible();
    await tasmaz(page);
    await page.getByRole('tab', { name: /Onay ve canlı/ }).click();
    for (const ad of ['İncelenecek planlar', 'Karşılaştırma', 'Canlıdan sonra yapılanlar', 'Geçmiş planlar', 'Planlama sayfaları']) {
      await expect(page.getByRole('heading', { name: ad })).toBeVisible();
    }
    await tasmaz(page);
    await page.getByRole('tab', { name: /Plan ve gerçekleşen/ }).click();
    // Taban ve canlı sunucudan okunur (505 a): boş veritabanında canlı plan yoktur; sekme yazmaz.
    await expect(page.locator('.tc-pym-tp-pg').getByText(/Henüz canlıya alınmış plan yok|Plana uyum/)).toBeVisible();
    await tasmaz(page);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum') && y !== 'POST /api/recete-rota/kayitlar/yaz')).toEqual([]);
  });
});

// 577b: Veri ve kısıtlar motor sayfasının ekranıdır (adres sorgusu `?ekran=veri&bolum=`). Plan çubuğunun Veri düğmesiyle açılır; on bölüm
// gezilir, sayfa taşmaz, yazma gitmez. Örnek veride çalışma olmayabilir; o halde boş ekran görünür.
const VERI_BOLUMLERI = ['Siparişler', 'Kısıtlar', 'Tezgâhlar', 'Ürün ve rota', 'Takvim', 'Personel', 'Malzeme', 'Fason ve aparat', 'Ayar matrisi', 'Veri denetimi'];
test.describe('577b Veri ve kısıtlar', () => {
  test('Veri: plan çubuğundan açılır, on bölüm gezilir, Plan tahtaya döner; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/sevkiyat');
    const cubuk = page.getByRole('toolbar', { name: 'Plan çubuğu' });
    await cubuk.getByRole('button', { name: /^Veri/ }).click();
    await expect(page).toHaveURL(/\/recete-rota\/planlama-yeni\/plan\?ekran=veri$/);
    await expect(page.locator('[data-parca="veri"]')).toBeVisible();
    await expect(cubuk.getByRole('button', { name: /^Veri/ })).toHaveAttribute('aria-current', 'page');
    const menu = page.getByRole('navigation', { name: 'Veri ve kısıtlar' });
    await expect(menu.getByRole('button')).toHaveText(VERI_BOLUMLERI.map((b) => new RegExp(`^${b}`)));
    for (const b of VERI_BOLUMLERI) {
      await menu.getByRole('button', { name: new RegExp(`^${b}`) }).click();
      await expect(menu.getByRole('button', { name: new RegExp(`^${b}`) })).toHaveAttribute('aria-current', 'page');
      await tasmaz(page);
    }
    await expect(page).toHaveURL(/ekran=veri&bolum=denetim$/);
    await cubuk.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.locator('[data-parca="veri"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/recete-rota\/planlama-yeni\/plan$/);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

// 577a: Nasıl hesaplandı Plan ekranının sayfasıdır (`?ekran=hesap`); örnek veride son ekip kaydı olmayabilir, o halde boş sonuç ve bekleyen adımlar.
test.describe('577a Nasıl hesaplandı', () => {
  test('Nasıl hesaplandı: adresle açılır, karar masası ve ekip adımları, iki sekme; Plan tahtaya döner; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan?ekran=hesap');
    const kok = page.locator('[data-parca="hesap"]');
    await expect(kok).toBeVisible();
    await expect(kok.getByRole('list', { name: 'Ekip adımları' }).or(kok.getByText('Planlama çalışması yok'))).toBeVisible();
    if (await kok.getByRole('tab', { name: /Akış ağı/ }).isVisible()) {
      await tasmaz(page);
      await kok.getByRole('tab', { name: /Akış ağı/ }).click();
      await tasmaz(page);
    }
    await page.getByRole('toolbar', { name: 'Plan çubuğu' }).getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(kok).toHaveCount(0);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

test.describe('577a Bugünün kararları', () => {
  test('Bugünün kararları: adresle açılır, dört adım gezilir; Plan tahtaya döner; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan?ekran=bugun');
    const kok = page.locator('[data-parca="bugun"]');
    await expect(kok).toBeVisible();
    const adimlar = kok.getByRole('tablist', { name: 'Günlük plan adımları' });
    if (await adimlar.isVisible()) {
      for (const ad of [/^Gelenler/, /^Kararlar/, /^Gözden geçir/, /^Yayınla/]) {
        await adimlar.getByRole('tab', { name: ad }).click();
        await expect(adimlar.getByRole('tab', { name: ad })).toHaveAttribute('aria-selected', 'true');
        await tasmaz(page);
      }
      await expect(kok.getByRole('region', { name: /^Gün katmanı/ })).toBeVisible();
    }
    await page.getByRole('toolbar', { name: 'Plan çubuğu' }).getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(kok).toHaveCount(0);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});

test.describe('577a Odak tahtası', () => {
  test('Odak: O tuşu bir bölümü açar, tezgâha inilir, Esc seviye seviye çıkar; sayfa taşmaz, yazma gitmez', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/plan');
    await expect(page.getByRole('toolbar', { name: 'Plan çubuğu' })).toBeVisible();
    await page.locator('body').press('o');
    const odak = page.locator('section.tc-pyo');
    if (await odak.isVisible()) {
      await expect(odak).toHaveAttribute('data-sev', 'grup');
      await tasmaz(page);
      const tez = odak.locator('button.tc-pyo-tez').first();
      if (await tez.isVisible()) {
        await tez.click();
        await expect(odak).toHaveAttribute('data-sev', 'tez');
        await tasmaz(page);
        await page.locator('body').press('Escape');
        await expect(odak).toHaveAttribute('data-sev', 'grup');
      }
      await page.locator('body').press('Escape');
      await expect(odak).toHaveCount(0);
    }
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
  });
});
