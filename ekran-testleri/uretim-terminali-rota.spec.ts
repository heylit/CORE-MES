import { expect, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// Rota şeridi elle kayar: çok adımlı rotada kartlar sabit genişlikte, yazı kesilmez, bu adım ortada açılır; sayfa yatay taşmaz.
// İş kartlarında işin yeri (istasyon ve makine) yazar. Paket ve adım durumu tarayıcıda uydurulur (ORN- sentetik); yazma gitmez.
const paket = (no: string, isEmriId: number, op: string, mc: string) => ({
  id: `ekran-rota-${String(isEmriId)}`, no, opType: 'cnc', st: {}, partNo: 'ORN-PRC-1', part: 'ORN gövde', rev: 'A', op,
  machine: 'ORN-TORNA-1', mc, target: 10, cycle: 30, due: '2026-12-01', priority: 'normal', material: '', note: '', files: [], primary: null,
  plan: [], steps: [], tmi: { emirId: 9902, isEmriId, opNo: 50 },
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
});
const ADLAR = ['Testere kesim', 'Tornalama', 'Tornalama 2. bağlama', 'Çapak alma ve ara kontrol', 'Freze (CNC) 5 eksen', 'Delik delme ve kılavuz çekme',
  'Isıl işlem (fason)', 'Koordinat ölçüm (CMM)', 'Yıkama, paketleme ve sevk hazırlık'];
const adimlar = ADLAR.map((ad, i) => ({
  isEmriId: 99100 + i, opNo: (i + 1) * 10, ad, statu: i < 4 ? 'bitti' : i === 4 ? 'baslayabilir' : i === 6 ? 'malzeme' : 'onceki',
  elle: false, yuzde: i < 4 ? 100 : 0, nedenler: [], tedarik: [],
}));

// Talimatlar (3338-4 a): üç aşama, zorunlu ve ölçüm maddesi; emir ayrıntısının yalnız adımları okunur.
const talimat = (id: number, ad: string, asama: string, ek: Record<string, unknown> = {}) => ({
  id, sira: id, ad, aciklama: null, asama, zorunlu: false, kontrol: null, tamam: false, tamamlayan: null, tamamlanma: null, kanit: null,
  gecenNot: null, buNot: null, talimat: null, ...ek,
});
const TALIMATLAR = [
  talimat(1, 'Bağlama aparatını ORN-APR-12 ile değiştir', 'on_hazirlik', { zorunlu: true }),
  talimat(2, 'Sıfır noktasını probla', 'hazirlik', { zorunlu: true, kontrol: { tur: 'olcum', ad: 'Z', alt: -0.02, ust: 0.02, birim: 'mm' } }),
  talimat(3, 'T05 takım boyunu kontrol et', 'hazirlik', { tamam: true }),
  talimat(4, 'İlk parçayı kaliteye bildir', 'uretim', { zorunlu: true }),
  talimat(5, 'Her 5 parçada deliği tampon mastarla kontrol et', 'uretim'),
  talimat(6, 'Aparatı söküp rafa koy', 'bitis', { zorunlu: true }),
];

async function kur(page: Page): Promise<void> {
  await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [
    { kimlik: 'ekran-rota-99104', surum: 1, govde: paket('UE-ORN-50', 99104, 'Op 50 · Freze (CNC) 5 eksen', '') },
    { kimlik: 'ekran-rota-99105', surum: 1, govde: paket('UE-ORN-60', 99105, 'Op 60 · Delik delme', 'ORN-CNC-02') },
  ] } }));
  await page.route('**/api/adimli-emirler/9902/adim-durumu/terminal', (r) => r.fulfill({ json: { emirId: 9902, adimlar } }));
  await page.route('**/api/adimli-emirler/9902/hazirlik', (r) => r.fulfill({ json: { maddeler: [], muafiyetler: [], isEmirleri: [] } }));
  // Malzeme göstergesi: istasyonda 3,6 m, bir adet 0,4 m (9 adetlik), kalan 10 adet.
  await page.route('**/api/stok/teslim-kutusu/is-malzemeleri*', (r) => r.fulfill({ json: { isler: [{
    uretimEmriId: 9902, emirNo: 'UE-ORN', opNo: 60, adimAd: 'Delik delme', calisiyor: false, kalanAdet: 10,
    malzemeler: [{ malzemeId: 1, kod: 'ORN-CUBUK-40', ad: null, birim: 'm', birAdet: '0.400', gereken: '4.000', istasyonda: '3.600', eksik: false, yerler: [], istek: null, tasinan: false }],
  }] } }));
  await page.route('**/api/uretim-emirleri/9902', (r) => r.fulfill({ json: { adimlar: TALIMATLAR } }));
  await page.route('**/api/arkon/is-emirleri/*/sahne', (r) => r.fulfill({ json: { sahne: null } }));
}

test.describe('rota şeridi elle kayar', () => {
  test.use({ hesap: 'ornek.operator1' });
  test('9 adımda bu adım ortada, kart yazısı kesilmez, sayfa taşmaz; iş kartında istasyon ve makine', async ({ page, ag, ac }, bilgi) => {
    await kur(page);
    await ac('/uretim-terminali');
    const rota = page.getByRole('region', { name: /^Rota: 4\/9 adım bitti/ });
    await expect(rota).toBeVisible({ timeout: 15_000 });
    const ol = rota.getByRole('list');
    const bu = rota.locator('li[aria-current="step"]');
    await expect(bu).toContainText(/OP (50|60)/);
    // Bu adım şeridin ortasında ve tamamen görünür.
    await expect.poll(async () => {
      const [k, s] = await Promise.all([bu.boundingBox(), ol.boundingBox()]);
      return k && s ? Math.abs(k.x + k.width / 2 - (s.x + s.width / 2)) : 999;
    }).toBeLessThan(3);
    // Adım adı kartta yazar (alçak telefon dışında).
    await expect(bu.locator('.tc-ra-ad')).toBeVisible();
    // Kartlar eşit genişlikte; adın iki satırı kesilmeden sığar (taşan yükseklik yok).
    const olcu = await rota.locator('li').evaluateAll((l) => l.map((x) => {
      const ad = x.querySelector('.tc-ra-ad') as HTMLElement;
      return { g: Math.round(x.getBoundingClientRect().width), tasma: ad.scrollHeight - ad.clientHeight, yatay: ad.scrollWidth - ad.clientWidth };
    }));
    expect(new Set(olcu.map((o) => o.g)).size).toBe(1);
    for (const o of olcu) { expect(o.tasma).toBeLessThanOrEqual(1); expect(o.yatay).toBeLessThanOrEqual(0); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // Ok düğmeleri yalnız geniş düzende; darda şerit parmakla kayar.
    const ok = rota.getByRole('button', { name: 'Sonraki adımlar' });
    if (await ok.isVisible()) {
      const k = await ok.boundingBox();
      expect(k!.width).toBeGreaterThanOrEqual(44);
      expect(k!.height).toBeGreaterThanOrEqual(44);
      const once = await ol.evaluate((x) => x.scrollLeft);
      await ok.click();
      await expect.poll(() => ol.evaluate((x) => x.scrollLeft)).toBeGreaterThan(once);
    }
    // Sayacın iki yanında malzeme (9 / 10 adetlik) ve üretilen göstergesi.
    await expect(page.getByRole('meter', { name: 'Malzeme %90' })).toBeVisible();
    await expect(page.getByRole('meter', { name: /^Üretilen %/ })).toBeVisible();
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    if (klasor) {
      await ol.evaluate((x: HTMLElement) => { const l = x.querySelector('li[aria-current="step"]') as HTMLElement; x.scrollLeft = l.offsetLeft - x.offsetLeft - (x.clientWidth - l.offsetWidth) / 2; });
      await page.screenshot({ path: `${klasor}/rota-${bilgi.project.name}.png` });
    }
    // İş kartında işin yeri: istasyon kodu ve makine; makinesi seçilmemiş işte bu açıkça yazar.
    if (bilgi.project.name === 'g1280') {
      const yerler = page.locator('.tc-ay1-is-yer');
      await expect(yerler.first()).toBeVisible();
      await expect(page.locator('.tc-ay1-is-yer').filter({ hasText: 'ORN-CNC-02' }).first()).toBeAttached();
    }
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar.filter((y) => !y.includes('/arkon/iletiler'))).toEqual([]);
  });

  test('Talimatlar: üç grup, açık olan işin durumundan; zorunlu eksik Başlat altında yazar; sayfa taşmaz', async ({ page, ag, ac }, bilgi) => {
    await kur(page);
    await ac('/uretim-terminali');
    await expect(page.getByRole('region', { name: /^Rota: 4\/9 adım bitti/ })).toBeVisible({ timeout: 15_000 });
    const sekme = page.getByRole('tab', { name: /^Talimatlar/ }).or(page.getByRole('navigation', { name: 'Terminal görünümleri' }).getByRole('button', { name: /Talimat/ })).first();
    await sekme.click();
    const once = page.getByRole('button', { name: /^Başlamadan önce/ });
    await expect(once).toBeVisible();
    await expect(page.getByRole('button', { name: /^Üretim sırasında/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Bitince/ })).toBeVisible();
    await expect(page.getByText('Sıfır noktasını probla')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const kutu = await page.getByRole('button', { name: 'Bağlama aparatını ORN-APR-12 ile değiştir · zorunlu' }).boundingBox();
    expect(kutu!.width).toBeGreaterThanOrEqual(44);
    // Dar düzende alt gezinmenin yazıları kesilmez.
    const gezinme = page.getByRole('navigation', { name: 'Terminal görünümleri' });
    if (await gezinme.isVisible()) {
      const tasan = await gezinme.getByRole('button').evaluateAll((l) => l.filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent));
      expect(tasan).toEqual([]);
    }
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    if (klasor) await page.screenshot({ path: `${klasor}/talimat-${bilgi.project.name}.png` });
    // Ölçüm maddesi açılınca değer alanı ve Tamam; sınır dışı değer uyarılır, yazma gitmez.
    await page.getByRole('button', { name: 'Sıfır noktasını probla · zorunlu' }).click();
    await page.getByRole('textbox', { name: 'Sıfır noktasını probla · Z' }).fill('0,05');
    await expect(page.getByText('Sınır dışı (-0,02–0,02 mm) · yine kaydedilir')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tamam', exact: true })).toBeEnabled();
    if (klasor) await page.screenshot({ path: `${klasor}/olcum-${bilgi.project.name}.png` });
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar.filter((y) => !y.includes('/arkon/iletiler'))).toEqual([]);
  });
});
