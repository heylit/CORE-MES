import { expect, test } from './ortak.ts';
import type { Locator, Page } from '@playwright/test';

// Geniş düzende iş şeridinde uzun değer kesilmez: yazı kendiliğinden küçülür, iki satıra iner; yine sığmazsa şerit ikinci sıraya
// geçer. Etiketler (Proje, Op, Rev...) ve kodlar (emir no, malzeme kodu) kesilmez, bölünmez. Şeride dokununca tam değer açılır.
// Paket ve adım durumu tarayıcıda uydurulur (ORN- sentetik); yazma gitmez.
type Veri = 'olagan' | 'uzun';
const paket = (veri: Veri) => ({
  id: 'ekran-serit-99300', no: veri === 'uzun' ? 'ORN-010102_2026-26-11-031-EK-02' : 'ORN-010102_2026-26-11-031', opType: 'cnc', st: {},
  partNo: 'ORN-MM-00007', part: veri === 'uzun' ? 'ORN MEKANİK ÜRETİM PARÇASI (MALZEMELİ, ISIL İŞLEMLİ) 1001' : 'ORN MEKANİK ÜRETİM (MALZEMELİ) 1001',
  proje: veri === 'uzun' ? 'ORN-DENEME-PROJESI-UZUN-ADI' : 'ORN-DENEME-PROJESI', rev: veri === 'uzun' ? 'Rev 01' : 'B',
  op: veri === 'uzun' ? 'Op 60 · Tornalama, delik delme ve kılavuz çekme' : 'Op 60 · Tornalama ve delik delme',
  machine: 'ORN-TORNA-1', mc: 'ORN-CNC-02', target: 15, cycle: 30,
  due: '2026-12-31', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], tmi: { emirId: 9904, isEmriId: 99300, opNo: 60 },
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
});

async function kur(page: Page, veri: Veri): Promise<void> {
  await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: 'ekran-serit-99300', surum: 1, govde: paket(veri) }] } }));
  await page.route('**/api/adimli-emirler/9904/adim-durumu/terminal', (r) => r.fulfill({ json: { emirId: 9904, adimlar: [
    { isEmriId: 99300, opNo: 60, ad: 'Tornalama', statu: 'baslayabilir', elle: false, yuzde: 0, nedenler: [], tedarik: [] },
  ] } }));
  await page.route('**/api/adimli-emirler/9904/hazirlik', (r) => r.fulfill({ json: { maddeler: [], muafiyetler: [], isEmirleri: [] } }));
  await page.route('**/api/uretim-emirleri/9904', (r) => r.fulfill({ json: { adimlar: [] } }));
  await page.route('**/api/arkon/is-emirleri/*/sahne', (r) => r.fulfill({ json: { sahne: null } }));
}

async function seritAc(page: Page, genislik: number, veri: Veri, buyuk: boolean, ac: (yol: string) => Promise<void>): Promise<Locator> {
  await page.setViewportSize({ width: genislik, height: 800 });
  await kur(page, veri);
  // Yazı boyu kullanıcı ayarından sayfa açılırken gelir; ölçüm ondan sonra yapılır.
  if (buyuk) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = ':root { --yazi-xs: 15.6px; --yazi-s: 18.2px; --yazi-m: 20.8px; --yazi-l: 23.4px; --yazi-xl: 31.2px; }';
    document.head.appendChild(st);
  }));
  await ac('/uretim-terminali');
  const serit = page.locator('.tc-ay1-genis > .tc-ay1-aktif .tc-ay1-is-alanlari').first();
  await expect(serit).toContainText('Tornalama', { timeout: 15_000 });
  return serit;
}

async function kesilmez(serit: Locator): Promise<void> {
  await expect(async () => {
    const { olcu, tasar } = await serit.evaluate((s) => ({
      tasar: (s as HTMLElement).dataset['tasar'] !== undefined || (s as HTMLElement).dataset['tam'] !== undefined,
      olcu: [...s.querySelectorAll(':scope > .tc-ay1-is-alan')].map((a) => {
        const e = a.querySelector(':scope > .tc-ay1-ust-yazi') as HTMLElement;
        const v = a.querySelector(':scope > :is(b, .tc-ay1-is-baslik)') as HTMLElement;
        return { ad: e.textContent, yatay: v.scrollWidth - v.clientWidth, dikey: v.scrollHeight - v.clientHeight, etiket: e.scrollWidth - e.clientWidth,
          top: Math.round(a.getBoundingClientRect().top) };
      }),
    }));
    for (const o of olcu) {
      expect(o.yatay, `${o.ad ?? ''} değeri yatayda kesiliyor`).toBeLessThanOrEqual(1);
      expect(o.dikey, `${o.ad ?? ''} değeri dikeyde kesiliyor`).toBeLessThanOrEqual(2);
      expect(o.etiket, `${o.ad ?? ''} etiketi kesiliyor`).toBeLessThanOrEqual(0);
    }
    // Tek sıra kural; ikinci sıra yalnız en küçük yazıda bile sığmayınca ya da tam değer açıkken.
    if (!tasar) expect(new Set(olcu.map((o) => o.top)).size, 'şerit tek sıra değil').toBe(1);
  }).toPass({ timeout: 10_000 });
}

test.describe('iş şeridi', () => {
  test.use({ hesap: 'ornek.operator1' });
  const durumlar: { genislik: number; veri: Veri; buyuk: boolean }[] = [
    { genislik: 1024, veri: 'olagan', buyuk: false },
    { genislik: 1180, veri: 'olagan', buyuk: false },
    { genislik: 1280, veri: 'olagan', buyuk: false },
    { genislik: 1440, veri: 'olagan', buyuk: false },
    { genislik: 1280, veri: 'olagan', buyuk: true },
    { genislik: 1280, veri: 'uzun', buyuk: false },
  ];
  for (const d of durumlar) {
    test(`${String(d.genislik)} genişlikte ${d.veri} veride${d.buyuk ? ' %130 yazıda' : ''} değer, kod ve etiket kesilmez`, async ({ page, ac }, bilgi) => {
      test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
      const serit = await seritAc(page, d.genislik, d.veri, d.buyuk, ac);
      await kesilmez(serit);
      // Kodlar tek satırdır: emir no tireden bölünmez.
      const emir = serit.locator(':scope > .tc-ay1-is-alan-emir > :is(b, .tc-ay1-is-baslik)');
      const satir = await emir.evaluate((v) => { const r = document.createRange(); r.selectNodeContents(v); return new Set([...r.getClientRects()].map((k) => Math.round(k.top))).size; });
      expect(satir, 'emir no bölünüyor').toBe(1);
      if (d.veri === 'uzun') await expect(serit).toContainText('Rev 01');
    });
  }

  test('şeride dokununca tam değer açılır, yeniden dokununca kısalır', async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
    const serit = await seritAc(page, 1280, 'olagan', false, ac);
    await expect(serit).toHaveAttribute('aria-expanded', 'false');
    await serit.click();
    await expect(serit).toHaveAttribute('aria-expanded', 'true');
    await kesilmez(serit);
    await serit.press('Enter');
    await expect(serit).toHaveAttribute('aria-expanded', 'false');
  });
});
