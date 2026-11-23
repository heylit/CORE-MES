import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// 3606: Hazırlık sayfasında Kartlar | Liste | Matris. Paket ve hazırlık cevabı tarayıcıda uydurulur (sentetik); hiçbir yazma gitmez.
// Görüntü TMIV2_EKRAN_GORUNTU klasörüne yazılır.
const MADDELER = ['cnc', 'cizim', 'yayin', 'rota', 'malzeme', 'takim-omru', 'takim-hazirla', 'makine', 'talimat', 'ek-madde', 'aparat', 'olcu-aleti'] as const;
const ISLER = [
  { op: 'Op 10 · Torna', ist: 'ORN-TORNA-1', st: 'published', eksik: ['cizim', 'malzeme', 'takim-hazirla'], muaf: [] as string[] },
  { op: 'Op 20 · Frezeleme', ist: 'ORN-FREZE-2', st: 'draft', eksik: [] as string[], muaf: ['cizim'] },
  { op: 'Op 10 · Torna', ist: 'ORN-TORNA-2', st: 'production', eksik: [] as string[], muaf: [] as string[] },
  // Yalnız uyaran madde eksik (Uyarılı) ve emrin paketsiz bir adımı var: dar iş sütununa "Uyarılı · Paket yok" sığmalı.
  { op: 'Op 10 · Freze', ist: 'ORN-FREZE-3', st: 'published', eksik: ['makine'], muaf: [] as string[] },
];
const paket = (i: number) => ({
  id: `matris-${String(i)}`, no: `ORN-UE-05${String(i)}`, opType: 'cnc', st: {}, partNo: 'ORN-P', part: `ORN-Parça ${String(i)}`, rev: 'A', op: ISLER[i]!.op, machine: ISLER[i]!.ist,
  target: 40, cycle: 30, due: '2026-11-27', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
  tmi: { emirId: 9800 + i, isEmriId: 98000 + i }, status: ISLER[i]!.st, version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
});
const hazirlik = (i: number) => ({
  maddeler: MADDELER.map((m) => ({ madde: m, isEmriDuzeyi: false, muafTutulur: m === 'cizim', durum: ISLER[i]!.eksik.includes(m) ? 'eksik' : ISLER[i]!.muaf.includes(m) ? 'muaf' : 'tamam' })),
  muafiyetler: ISLER[i]!.muaf.map((m) => ({ madde: m, isEmriId: null, kisiAdi: 'ORN-Müdür', zaman: '2026-11-22T09:00:00Z', gerekce: 'ORN-gerekçe' })),
  isEmirleri: i === 0 ? [{ isEmriId: 98000, opNo: 10, ad: 'Torna', bitti: false, maddeler: [] }, { isEmriId: 98900, opNo: 30, ad: 'Taşlama', bitti: false, maddeler: [] }]
    : i === 3 ? [{ isEmriId: 98003, opNo: 10, ad: 'Freze', bitti: false, maddeler: [] }, { isEmriId: 98903, opNo: 40, ad: 'Paketleme', bitti: false, maddeler: [] }] : [],
});
const tasma = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('3606 Hazırlık matris görünümü', () => {
  test.use({ hesap: 'ornek.yonetici' });
  test('Liste ve Matris açılır; paketsiz iş satırı salt okunur; hücre ayrıntıyı açar; sayfa yatay taşmaz; yazma gitmez', async ({ page, ag, ac }, bilgi) => {
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: ISLER.map((_, i) => ({ kimlik: paket(i).id, surum: 1, govde: paket(i) })) } }));
    await page.route('**/api/adimli-emirler/hazirlik-ozeti*', (r) => r.fulfill({ json: { emirler: ISLER.map((_, i) => ({ emirId: 9800 + i, hazirlik: hazirlik(i) })) } }));
    await page.route('**/api/adimli-emirler/98*/hazirlik', (r) => { const i = Number(/adimli-emirler\/(\d+)\//.exec(r.request().url())?.[1]) - 9800; return r.fulfill({ json: hazirlik(i) }); });
    await ac('/arkon/hazirlik');
    const gorunum = page.getByRole('group', { name: 'Görünüm' });
    await gorunum.getByRole('button', { name: 'Liste' }).click({ timeout: 20_000 });
    await expect(page.getByRole('table', { name: 'Hazırlık takip tablosu' })).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await gorunum.getByRole('button', { name: 'Matris' }).click();
    const matris = page.getByRole('region', { name: 'Hazırlık matrisi tablosu' });
    await expect(matris).toBeVisible();
    await expect(matris.getByText('Durur · Paket yok')).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    const resim = async (ad: string, tam = false) => { if (klasor) await page.screenshot({ path: `${klasor}/${ad}-${bilgi.project.name}.png`, fullPage: tam }); };
    await resim('matris-ilk');
    // 132 px iş sütununda "Uyarılı · Paket yok" kesilmeden sığar.
    const durum = matris.getByText('Uyarılı · Paket yok');
    await durum.scrollIntoViewIfNeeded();
    const kutu = await durum.evaluate((e) => { const th = e.closest('th')!.getBoundingClientRect(); const r = e.getBoundingClientRect(); return { tasan: e.scrollWidth - e.clientWidth, sag: Math.round(th.right - r.right) }; });
    expect(kutu.tasan, 'durum yazısı kesilmez').toBeLessThanOrEqual(0);
    expect(kutu.sag, 'durum yazısı iş sütunundan taşmaz').toBeGreaterThanOrEqual(0);
    // Emir numarası hiçbir genişlikte kırpılmaz ("ORN-U…" olmaz).
    const kirpik = await matris.locator('tbody th b').evaluateAll((l) => l.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(kirpik, 'emir numarası kırpılmaz').toEqual([]);
    await resim('matris-paketsiz');
    if (bilgi.project.name === 'g360') {
      const suzgec = page.getByRole('button', { name: /^Süzgeç($| ·)/ });
      await expect(suzgec).toBeVisible();
      await suzgec.click();
      await expect(page.getByRole('group', { name: 'Hazırlık', exact: true })).toBeVisible();
      await resim('matris-suzgec-acik');
      await suzgec.click();
      await expect(page.getByRole('group', { name: 'Hazırlık', exact: true })).toBeHidden();
    }
    await matris.getByRole('button', { name: /ORN-UE-050 Op 10 · Torna Çizim revizyonu: Eksik/ }).click();
    const duzen = page.getByRole('region', { name: 'İş paketi' });
    await expect(duzen.getByRole('heading', { name: /ORN-UE-050/ }).first()).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await resim('matris-ayrinti');
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler'))).toEqual([]);
  });
});
