import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// 3606-2: Hazırlık sayfası tek liste. Paket ve hazırlık cevabı tarayıcıda uydurulur (sentetik); hiçbir yazma gitmez.
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

test.describe('3606-2 Hazırlık tek liste', () => {
  test.use({ hesap: 'ornek.yonetici' });
  test('tek liste açılır; görünüm düğmesi yok; emir tek satır, eksik madde sütununda; operasyonlar açılır; hücre paketi açar; süzgeçler sayılı; sayfa yatay taşmaz; yazma gitmez', async ({ page, ag, ac }, bilgi) => {
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: ISLER.map((_, i) => ({ kimlik: paket(i).id, surum: 1, govde: paket(i) })) } }));
    await page.route('**/api/adimli-emirler/hazirlik-ozeti*', (r) => r.fulfill({ json: { emirler: ISLER.map((_, i) => ({ emirId: 9800 + i, hazirlik: hazirlik(i) })) } }));
    await page.route('**/api/adimli-emirler/98*/hazirlik', (r) => { const i = Number(/adimli-emirler\/(\d+)\//.exec(r.request().url())?.[1]) - 9800; return r.fulfill({ json: hazirlik(i) }); });
    await ac('/arkon/hazirlik');
    const liste = page.getByRole('table', { name: 'Hazırlık listesi' });
    await expect(liste).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('group', { name: 'Görünüm' })).toHaveCount(0);
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    const resim = async (ad: string, tam = false) => { if (klasor) await page.screenshot({ path: `${klasor}/${ad}-${bilgi.project.name}.png`, fullPage: tam }); };
    await resim('tek-liste');
    // 3816: emir tek satır; operasyonlar kapalı gelir. Emir satırı her sütunda operasyonların en kötüsünü yazar.
    await expect(liste.getByRole('button', { name: /^ORN-UE-050 Çizim rev: Çizim revizyonu eksik/ })).toBeVisible();
    await expect(liste.getByRole('button', { name: /^Op 10 · Torna\s*ORN-TORNA-1/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Bütün operasyonları aç' }).click();
    // İlk işte üç madde eksik: her biri kendi sütununda.
    const ilk = liste.locator('tr', { has: page.getByRole('button', { name: /^Op 10 · Torna\s*ORN-TORNA-1/ }) });
    await expect(ilk.getByRole('button', { name: /Çizim rev: Çizim revizyonu eksik/ })).toBeVisible();
    await expect(ilk.getByRole('button', { name: /Girdi stoğu: Malzeme \(girdi stoğu\) uyarılı/ })).toBeVisible();
    await expect(ilk.getByRole('button', { name: /Takım: Takım hazırla uyarılı/ })).toBeVisible();
    await resim('tek-liste-acik');
    // Paketsiz adım emrin bağlamı olarak kalır.
    await expect(liste.getByText('Op 30 · Taşlama')).toBeVisible();
    // Durum sütunu emrin hazırlığını metinle söyler (renk tek başına anlam taşımaz).
    await expect(liste.getByText(/^Eksik · 1\/2$/).first()).toBeVisible();
    const durum = page.getByRole('group', { name: 'İş durumu' });
    await expect(durum.getByRole('button', { name: /^Durur 1$/ })).toBeVisible();
    await expect(durum.getByRole('button', { name: /^Uyarılı 1$/ })).toBeVisible();
    await durum.getByRole('button', { name: /^Durur/ }).click();
    await expect(liste.getByRole('button', { name: /^Op 20 · Frezeleme/ })).toHaveCount(0);
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await durum.getByRole('button', { name: /^Açık işler/ }).click();
    // Telefonda seçim çubuğu ekranın altında sabit ve tek satır: liste başına dönünce de görünür (3606-2 Arayüz).
    const vp = page.viewportSize();
    if (vp && vp.width < 600) {
      const kaymaOlc = () => page.locator('.tc-kabuk-icerik').evaluate((e) => e.scrollWidth - e.clientWidth);
      const kaymaOnce = await kaymaOlc();
      await ilk.getByRole('checkbox').check();
      // Taslak iş de seçilince iki işlem birden uyar: biri görünür, öbürü Diğer menüsünde.
      await liste.getByRole('checkbox', { name: /^ORN-UE-051 Op.*seç$/ }).check();
      const cubuk = page.getByRole('toolbar', { name: 'Seçilenler' });
      await expect(cubuk.getByRole('button', { name: /^\d+ işi gönder$/ })).toBeVisible();
      await expect(cubuk.getByRole('button', { name: /^\d+ işi geri çek$/ })).toHaveCount(0);
      await liste.scrollIntoViewIfNeeded();
      await page.getByRole('group', { name: 'İş durumu' }).evaluate((e) => { e.scrollIntoView({ block: 'start' }); });
      const k = await cubuk.boundingBox();
      expect(k).not.toBeNull();
      expect(k!.y + k!.height).toBeLessThanOrEqual(vp.height + 1);
      await resim('tek-liste-secim');
      expect(k!.height).toBeLessThanOrEqual(64);
      expect(k!.x + k!.width).toBeLessThanOrEqual(vp.width);
      // Belge taşmasa da kabuk içeriği yana kayabilir: seçim çubuğu kabuğu genişletmemeli.
      expect(await kaymaOlc()).toBeLessThanOrEqual(kaymaOnce);
      await cubuk.getByRole('button', { name: 'Seçilenler için diğer işlemler' }).click();
      await expect(page.getByRole('menuitem', { name: '1 işi operatörden geri çek' })).toBeVisible();
      await page.getByRole('menuitem', { name: 'Seçimi kaldır' }).click();
      await expect(cubuk).toHaveCount(0);
    }
    // Eksik madde süzgeci süzgeç menüsünde; seçilince düğmede sayı görünür.
    const sz = page.getByRole('button', { name: 'Süzgeç ve gruplama' });
    await sz.click();
    await page.getByRole('combobox', { name: 'Eksik madde' }).selectOption('makine');
    await expect(liste.getByRole('button', { name: /^Op 10 · Freze\s*ORN-FREZE-3/ })).toBeVisible();
    await expect(liste.getByRole('button', { name: /^Op 10 · Torna\s*ORN-TORNA-1/ })).toHaveCount(0);
    await expect(sz).toContainText('1');
    await resim('tek-liste-suzgec');
    await page.getByRole('combobox', { name: 'Eksik madde' }).selectOption('');
    await sz.click();
    await ilk.getByRole('button', { name: /Çizim rev: Çizim revizyonu eksik/ }).click();
    const duzen = page.getByRole('region', { name: 'İş paketi' });
    await expect(duzen.getByRole('heading', { name: /ORN-UE-050/ }).first()).toBeVisible();
    await expect(duzen.getByRole('button', { name: /Terminale gönder/ }).first()).toHaveAttribute('aria-current', 'step');
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await resim('tek-liste-ayrinti');
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler'))).toEqual([]);
  });
});
