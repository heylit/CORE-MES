import { expect, test } from './ortak.ts';

// 2079-1 b, 2748-1 b: terminalde hazırlık çipi; dokununca hazırlık sayfası bu emirle açılır. Paket ve matris cevabı tarayıcıda uydurulur (sentetik);
// hiçbir yazma gitmez. Başlat açık kalır. Görüntü TMIV2_EKRAN_GORUNTU klasörüne yazılır.
const paket = {
  id: 'ekran-hz-1', no: 'UE-EKRAN-1', opType: 'cnc', st: {}, partNo: 'EK-1', part: 'Hazırlık deneme', rev: 'A', op: 'Op 10 · Torna',
  machine: 'ORN-TORNA-1', target: 25, cycle: 30, due: '2026-10-28', priority: 'normal', material: '', note: '', files: [], primary: null,
  plan: [], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }], tmi: { emirId: 9901, isEmriId: 99010 },
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
};
const ilerleme = {
  isEmriId: 99010, emirId: 9901, opNo: 10, sira: 1, ad: 'Torna', istasyonId: null, istasyon: null, durum: 'bekliyor', fason: false, hedef: 25,
  saglam: 0, hurda: 0, kararBekliyor: 0, kalan: 25, hazir: 25, fasonda: 0, devirAdedi: null,
};
const hazirlik = {
  maddeler: [
    { madde: 'cnc', durum: 'eksik', muafTutulur: true, isEmriDuzeyi: true }, { madde: 'cizim', durum: 'tamam', muafTutulur: false, isEmriDuzeyi: false },
    { madde: 'makine', durum: 'eksik', muafTutulur: false, isEmriDuzeyi: true },
  ],
  isEmirleri: [{ isEmriId: 99010, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc', durum: 'eksik' }, { madde: 'makine', durum: 'eksik' }] }],
};

const matris = {
  emirler: [{ id: 9901, emirNo: 'UE-EKRAN-1', urun: { id: 1, kod: 'EK-1', ad: 'Hazırlık deneme' }, adet: 25, teslim: null, durum: 'planli', isEmirleri: [ilerleme], hazirlik }],
};

test.describe('2079-1 b, 2748-1 b terminal hazırlık çipi', () => {
  test.use({ hesap: 'ornek.operator1' });
  test('çip hazırlık sayfasını bu emirle açar; Başlat açık; sayfa yatay taşmaz', async ({ page, ag, ac }, bilgi) => {
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: paket.id, surum: 1, govde: paket }] } }));
    await page.route('**/api/adimli-emirler/hazirlik-matrisi?emirler=9901', (r) => r.fulfill({ json: matris }));
    await ac('/uretim-terminali');
    const cip = page.getByRole('button', { name: 'Hazırlık listesi: Hazırlık · 1 eksik' });
    await expect(cip).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Başlat/ }).first()).toBeEnabled();
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    if (klasor) await page.screenshot({ path: `${klasor}/terminal-${bilgi.project.name}-cip.png`, fullPage: true });
    await cip.click();
    await expect(page).toHaveURL(/\/uretim-terminali\/hazirlik\?hazirlik-emri=9901$/);
    const tablo = page.getByRole('table', { name: 'Hazırlık matrisi' });
    await expect(tablo).toBeVisible();
    await expect(tablo.getByRole('row')).toHaveCount(2);
    await expect(page.getByText('Yalnız bir emir gösteriliyor.')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    if (klasor) await page.screenshot({ path: `${klasor}/terminal-${bilgi.project.name}-liste.png`, fullPage: true });
    expect(ag.yazmalar.filter((y) => !y.includes('/arkon/iletiler'))).toEqual([]);
  });
});
