import { expect, test } from './ortak.ts';

// 2079-1 b: terminalde sistemin hazırlık listesi. Paket ve hazırlık cevabı tarayıcıda uydurulur (sentetik); hiçbir yazma gitmez.
// Genişte liste sağ sütunun Hazırlık sekmesidir, darda pencere. Başlat açık kalır. Görüntü TMIV2_EKRAN_GORUNTU klasörüne yazılır.
const paket = {
  id: 'ekran-hz-1', no: 'UE-EKRAN-1', opType: 'cnc', st: {}, partNo: 'EK-1', part: 'Hazırlık deneme', rev: 'A', op: 'Op 10 · Torna',
  machine: 'ORN-TORNA-1', target: 25, cycle: 30, due: '2026-10-28', priority: 'normal', material: '', note: '', files: [], primary: null,
  plan: [], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }], tmi: { emirId: 9901, isEmriId: 99010 },
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
};
const hazirlik = {
  maddeler: [
    { madde: 'cnc', durum: 'eksik', muafTutulur: true, isEmriDuzeyi: true }, { madde: 'cizim', durum: 'tamam', muafTutulur: false, isEmriDuzeyi: false },
    { madde: 'kalibrasyon', durum: 'gerekmez', muafTutulur: false, isEmriDuzeyi: false }, { madde: 'ozel-proses', durum: 'muaf', muafTutulur: true, isEmriDuzeyi: false },
  ],
  muafiyetler: [{ madde: 'ozel-proses', isEmriId: null, kisiId: 1, kisiAdi: 'Örnek Müdür', gerekce: 'Deneme gerekçesi.', zaman: '2026-11-04T08:40:00.000Z' }],
  isEmirleri: [{ isEmriId: 99010, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc', durum: 'eksik' }] }],
};

test.describe('2079-1 b terminal hazırlık listesi', () => {
  test.use({ hesap: 'ornek.operator1' });
  test('çip listeyi açar; liste bu iş emrinin satırıdır; Başlat açık; sayfa yatay taşmaz', async ({ page, ag, ac }, bilgi) => {
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: paket.id, surum: 1, govde: paket }] } }));
    await page.route('**/api/adimli-emirler/9901/hazirlik', (r) => r.fulfill({ json: hazirlik }));
    await ac('/uretim-terminali');
    const cip = page.getByRole('button', { name: 'Hazırlık listesi: Hazırlık · 1 eksik' });
    await expect(cip).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Başlat/ }).first()).toBeEnabled();
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    if (klasor) await page.screenshot({ path: `${klasor}/terminal-${bilgi.project.name}-cip.png`, fullPage: true });
    await cip.click();
    const liste = page.getByRole('region', { name: 'Hazırlık' });
    await expect(liste).toBeVisible();
    await expect(liste.getByRole('listitem')).toHaveCount(4);
    await expect(liste.getByRole('listitem').first()).toHaveAttribute('data-hal', 'eksik');
    await expect(liste.getByRole('button', { name: /Sorumluya haber ver/ })).toBeVisible();
    await expect(liste.getByText(/Müdür muaf tuttu · Örnek Müdür/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    if (klasor) await page.screenshot({ path: `${klasor}/terminal-${bilgi.project.name}-liste.png`, fullPage: true });
    expect(ag.yazmalar.filter((y) => !y.includes('/arkon/iletiler'))).toEqual([]);
  });
});
