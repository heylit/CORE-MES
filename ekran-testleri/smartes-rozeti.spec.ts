import type { Page } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3346: üretim emrinde SmartES rozeti. Listede "SmartES" sütunu (emrin toplamı), ayrıntıda başlık rozeti ve adım satırında rozet.
// SmartES durumu sahte cevapla gelir (örnek veride SmartES izi yok); dört durum ve gönderilmez sırayla dağıtılır. Veriler uydurmadır.
test.use({ hesap: 'ornek.planlama' });

const DURUMLAR = ['durdu', 'yeniden-denenecek', 'sirada', 'gonderildi', null] as const;
const NEDEN = { durdu: 'SmartES reddetti: Operasyon kodu tanımsız (ORN-OP)', 'yeniden-denenecek': 'SmartES yanıt vermedi', sirada: null, gonderildi: null } as const;

function sahteDurumlar(page: Page) {
  return page.route(/\/api\/smartes\/emir-durumlari\?/, (r) => {
    const idler = (new URL(r.request().url()).searchParams.get('emir') ?? '').split(',').map(Number);
    const tek = idler.length === 1;
    void r.fulfill({ json: { emirler: idler.map((emirId, i) => {
      const durum = tek ? 'durdu' : DURUMLAR[i % DURUMLAR.length]!;
      // Ayrıntıda adımlar OP 10..60: ilki gitti, ikincisi durdu, üçüncüsü yeniden denenecek, sonrakiler eşlemesiz.
      const adimlar = [10, 20, 30, 40, 50, 60].map((opNo, k) => {
        const d = tek ? (['gonderildi', 'durdu', 'yeniden-denenecek'] as const)[k] ?? null : null;
        return { isEmriId: emirId * 100 + k, opNo, ad: 'Frezeleme', durum: d, gonderilmez: d === null ? 'esleme-yok' : null,
          smartesNo: d === null ? null : `ORN-${String(emirId)}-${String(opNo)}`, neden: d === null || d === 'gonderildi' ? null : NEDEN[d] };
      });
      return {
        emirId,
        toplam: durum === null
          ? { durum: null, gonderilmez: 'esleme-yok', gonderilen: 0, toplam: 0, opNo: null, neden: null }
          : { durum, gonderilmez: null, gonderilen: durum === 'gonderildi' ? 2 : 1, toplam: 2, opNo: durum === 'gonderildi' ? null : 20, neden: NEDEN[durum] },
        adimlar,
      };
    }) } });
  });
}

test('liste: SmartES sütunu dört durumu ve gönderilmezi gösterir; OP kırılmaz, sayfa yana taşmaz', async ({ page, ag, ac }) => {
  await sahteDurumlar(page);
  await ac('/uretim-emirleri');
  const tablo = page.getByRole('table', { name: 'Üretim emirleri' });
  if ((page.viewportSize()?.width ?? 1280) >= 768) await expect(tablo.getByRole('columnheader', { name: 'SmartES' })).toBeVisible();
  const hucre = tablo.locator('td[data-baslik="SmartES"]');
  // İstek sıralı kimliklerle gider; durumlar listedeki sıraya değil kimliğe göre dağılır.
  const duran = hucre.filter({ hasText: 'Durdu' }).first();
  await expect(duran).toContainText('OP 20 Frezeleme');
  expect(await duran.locator('.tc-smartes-op').evaluate((e) => new Set([...e.getClientRects()].map((r) => Math.round(r.top))).size), 'OP ve adım adı tek satırda').toBe(1);
  if (await hucre.count() >= 5) {
    await expect(hucre.filter({ hasText: "SmartES'te" }).first()).toContainText('2/2 adım');
    await expect(hucre.getByLabel(/eşlemesi yok/).first()).toBeVisible();
    await expect(hucre.filter({ hasText: 'Yeniden denenecek' }).first()).toBeVisible();
    await expect(hucre.filter({ hasText: 'Sırada' }).first()).toBeVisible();
  }
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  // Tablo yana kayar; resimde sütun görünsün.
  await duran.evaluate((e) => {
    const kap = e.closest('[data-kaydir]');
    const sabit = e.closest('tr')?.querySelector('td');
    if (kap && sabit) kap.scrollLeft = (e as HTMLElement).offsetLeft - sabit.getBoundingClientRect().width;
  });
  await page.screenshot({ path: test.info().outputPath('smartes-liste.png'), fullPage: true });
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('ayrıntı: başlıkta "SmartES: Durdu" ve "Yöneticiye bildirin"; adım satırında rozet ve neden; sayfa yana taşmaz', async ({ page, ag, ac }) => {
  await sahteDurumlar(page);
  await ac('/uretim-emirleri');
  await page.getByRole('table', { name: 'Üretim emirleri' }).getByRole('link', { name: /^MM-ORN-/ }).first().click();
  await expect(page).toHaveURL(/\/uretim-emirleri\/\d+$/);
  await expect(page.getByText('SmartES: Durdu').first()).toBeVisible();
  await expect(page.getByText('Yöneticiye bildirin')).toBeVisible();
  const panel = page.getByRole('tabpanel', { name: 'Adımlar' });
  await expect(panel.getByText('Yükleniyor')).toHaveCount(0);
  await expect(panel.getByRole('row', { name: /^10\b/ }).first()).toBeVisible();
  // Dar kapta (tablet, telefon) SmartES sütunu gizlenir; durum rozeti durum hücresinde görünür (3581).
  if (await panel.locator('th.tc-at-smartes').isVisible()) await expect(panel.getByText("SmartES'te").first()).toBeVisible();
  if (await panel.locator('th.tc-at-smartes').isVisible() && await panel.getByText('SmartES: Durdu').count() > 0) await expect(panel.getByText(NEDEN.durdu).first()).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('smartes-ayrinti.png'), fullPage: true });
  // Satırın sağına rozet eklenince adım adı daralıp harf harf kırılmaz.
  const ad = panel.locator('td.tc-at-adim').first();
  expect(await ad.evaluate((e) => e.getBoundingClientRect().width), 'adım adı sütunu daralmaz').toBeGreaterThan(80);
  await panel.getByRole('row', { name: /^10\b/ }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('smartes-adimlar.png') });
  expect(ag.hatalar).toEqual([]);
});
