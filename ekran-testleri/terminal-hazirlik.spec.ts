import { expect, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// 2079-1 b ve 3338-4 a: terminalde planlama hazırlık matrisi liste olarak durmaz; işi durduran eksik maddeler tek uyarı satırıdır,
// uyaran maddeler (makine gibi) terminalde yazmaz. Operatörün listesi Talimatlar sekmesidir. Paket, hazırlık ve talimat cevabı
// tarayıcıda uydurulur (sentetik); hiçbir yazma gitmez. Görüntü TMIV2_EKRAN_GORUNTU klasörüne yazılır.
const paket = {
  id: 'ekran-hz-1', no: 'UE-EKRAN-1', opType: 'cnc', st: {}, partNo: 'EK-1', part: 'Hazırlık deneme', rev: 'A', op: 'Op 10 · Torna',
  machine: 'ORN-TORNA-1', target: 25, cycle: 30, due: '2026-10-28', priority: 'normal', material: '', note: '', files: [], primary: null,
  plan: [], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }], tmi: { emirId: 9901, isEmriId: 99010 },
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
};
const hazirlik = {
  maddeler: [
    { madde: 'cnc', durum: 'eksik', muafTutulur: true, isEmriDuzeyi: true }, { madde: 'cizim', durum: 'tamam', muafTutulur: false, isEmriDuzeyi: false },
    { madde: 'makine', durum: 'eksik', muafTutulur: false, isEmriDuzeyi: true },
  ],
  muafiyetler: [],
  isEmirleri: [{ isEmriId: 99010, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc', durum: 'eksik' }, { madde: 'makine', durum: 'eksik' }] }],
};
const talimat = (id: number, ad: string, asama: string) => ({
  id, sira: id, ad, aciklama: null, asama, zorunlu: false, kontrol: null, tamam: false, tamamlayan: null, tamamlanma: null, kanit: null,
  gecenNot: null, buNot: null, talimat: null,
});
const tasma = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('2079-1 b terminal hazırlık uyarısı', () => {
  test.use({ hesap: 'ornek.operator1' });
  test('durduran eksik tek satırda yazar, uyaran madde yazmaz; hazırlık listesi ve sekmesi yok; Başlat açık; sayfa yatay taşmaz', async ({ page, ag, ac }, bilgi) => {
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: paket.id, surum: 1, govde: paket }] } }));
    await page.route('**/api/adimli-emirler/9901/hazirlik', (r) => r.fulfill({ json: hazirlik }));
    await page.route('**/api/uretim-emirleri/9901', (r) => r.fulfill({ json: { adimlar: [talimat(1, 'Bağlama aparatını hazırla', 'on_hazirlik')] } }));
    await ac('/uretim-terminali');
    await expect(page.getByText('Başlatılamaz · eksik: CNC kurulumu', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Makine durumu/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hazırlık' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Hazırlık listesi:/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Hazırlık/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Başlat/ }).first()).toBeEnabled();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    if (klasor) await page.screenshot({ path: `${klasor}/terminal-${bilgi.project.name}-hazirlik-uyari.png`, fullPage: true });
    expect(ag.yazmalar.filter((y) => !y.includes('/arkon/iletiler'))).toEqual([]);
  });
});

// Uzun talimat listesi genişte sağ sütunun sekme şeridini ezmez: öteki sekmeler görünür ve tıklanır kalır.
test.describe('terminal talimat sekmesi uzun listede', () => {
  test.use({ hesap: 'ornek.operator1' });
  const uzun = Array.from({ length: 14 }, (_, i) => talimat(i + 1, `Hazırlık maddesi ${String(i + 1)}`, i < 12 ? 'hazirlik' : 'uretim'));
  test('Talimatlar açıkken öteki sekmeler görünür; sekmeler arası geçilir; listenin sonu kaydırılarak okunur', async ({ page, ag, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'darda liste alt gezinmeden açılır; sağ sütun yalnız genişte');
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: paket.id, surum: 1, govde: paket }] } }));
    await page.route('**/api/adimli-emirler/9901/hazirlik', (r) => r.fulfill({ json: { maddeler: [], muafiyetler: [], isEmirleri: [] } }));
    await page.route('**/api/uretim-emirleri/9901', (r) => r.fulfill({ json: { adimlar: uzun } }));
    await ac('/uretim-terminali');
    const sekmeler = page.getByRole('tablist', { name: 'İş ayrıntısı' });
    const tl = sekmeler.getByRole('tab', { name: /^Talimatlar/ });
    await tl.click({ timeout: 15_000 });
    await expect(tl).toHaveAttribute('aria-selected', 'true');
    const liste = page.locator('.tc-ay1-talimatlar');
    await expect(liste.locator('.tc-ay1-tl-grup[data-acik] li')).toHaveCount(12);
    const adimlar = sekmeler.getByRole('tab', { name: /^Adımlar/ });
    for (const s of [tl, adimlar, sekmeler.getByRole('tab', { name: 'Analiz' })]) await expect(s).toBeInViewport({ ratio: 1 });
    const serit = await sekmeler.boundingBox();
    const sekme = await adimlar.boundingBox();
    expect(serit!.height).toBeGreaterThanOrEqual(sekme!.height);
    const son = liste.locator('.tc-ay1-tl-grup[data-acik] li').last();
    await son.scrollIntoViewIfNeeded();
    await expect(son).toBeInViewport();
    await adimlar.click();
    await expect(adimlar).toHaveAttribute('aria-selected', 'true');
    await expect(liste).toHaveCount(0);
    await tl.click();
    await expect(page.locator('.tc-ay1-talimatlar')).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => !y.includes('/arkon/iletiler'))).toEqual([]);
  });
});
