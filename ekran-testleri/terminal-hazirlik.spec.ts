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
    { madde: 'makine', durum: 'eksik', muafTutulur: false, isEmriDuzeyi: true },
  ],
  muafiyetler: [],
  isEmirleri: [{ isEmriId: 99010, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc', durum: 'eksik' }, { madde: 'makine', durum: 'eksik' }] }],
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
    await expect(liste.getByRole('listitem')).toHaveCount(3);
    await expect(liste.getByRole('listitem').first()).toHaveAttribute('data-hal', 'eksik');
    await expect(liste.getByRole('button', { name: /Sorumluya haber ver/ }).first()).toBeVisible();
    await expect(liste.getByText('Uyarı', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    if (klasor) await page.screenshot({ path: `${klasor}/terminal-${bilgi.project.name}-liste.png`, fullPage: true });
    expect(ag.yazmalar.filter((y) => !y.includes('/arkon/iletiler'))).toEqual([]);
  });
});

// Uzun hazırlık listesi (bütün maddeler) genişte sağ sütunun sekme şeridini ezmez: öteki sekmeler görünür ve tıklanır kalır.
test.describe('terminal hazırlık sekmesi uzun listede', () => {
  test.use({ hesap: 'ornek.operator1' });
  const maddeler = ['rota', 'cizim', 'yayin', 'malzeme', 'makine', 'cnc', 'takim-omru', 'talimat', 'aparat', 'olcu-aleti', 'ek-madde'];
  const uzun = {
    maddeler: maddeler.map((madde, i) => ({ madde, durum: i === 0 ? 'eksik' : i < 5 ? 'tamam' : 'gerekmez', muafTutulur: false, isEmriDuzeyi: false })),
    muafiyetler: [],
    isEmirleri: [{ isEmriId: 99010, opNo: 10, ad: 'Torna', bitti: false, maddeler: [] }],
  };
  test('Hazırlık açıkken öteki sekmeler görünür; sekmeler arası geçilir; listenin sonu kaydırılarak okunur', async ({ page, ag, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'darda liste pencerede açılır; sağ sütun yalnız genişte');
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: paket.id, surum: 1, govde: paket }] } }));
    await page.route('**/api/adimli-emirler/9901/hazirlik', (r) => r.fulfill({ json: uzun }));
    await ac('/uretim-terminali');
    await page.getByRole('button', { name: /^Hazırlık listesi:/ }).click({ timeout: 15_000 });
    const sekmeler = page.getByRole('tablist', { name: 'İş ayrıntısı' });
    const hz = sekmeler.getByRole('tab', { name: /^Hazırlık/ });
    await expect(hz).toHaveAttribute('aria-selected', 'true');
    const liste = page.getByRole('region', { name: 'Hazırlık' });
    await expect(liste.getByRole('listitem')).toHaveCount(maddeler.length);
    const adimlar = sekmeler.getByRole('tab', { name: /^Adımlar/ });
    for (const s of [hz, adimlar, sekmeler.getByRole('tab', { name: 'Analiz' })]) await expect(s).toBeInViewport({ ratio: 1 });
    const serit = await sekmeler.boundingBox();
    const sekme = await adimlar.boundingBox();
    expect(serit!.height).toBeGreaterThanOrEqual(sekme!.height);
    await liste.getByRole('listitem').last().scrollIntoViewIfNeeded();
    await expect(liste.getByRole('listitem').last()).toBeInViewport();
    await adimlar.click();
    await expect(adimlar).toHaveAttribute('aria-selected', 'true');
    await expect(liste).toHaveCount(0);
    await hz.click();
    await expect(page.getByRole('region', { name: 'Hazırlık' })).toBeVisible();
    expect(ag.yazmalar.filter((y) => !y.includes('/arkon/iletiler'))).toEqual([]);
  });
});
