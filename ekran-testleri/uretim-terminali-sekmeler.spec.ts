import { expect, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// 3759 a: geniş düzende sağ bölmenin sekmeleri sütunu eşit paylaşır, simgeli ve kesilmez; teknik resim çubuğu beş araçtır (Balon ekle,
// Ölçümler, Yakınlaştır, Sığdır, Diğer), her biri en az 44 px, yazısı kesilmez ve hepsi kaydırmasız görünür. Seyrek araçlar Diğer'dedir.
// Paket ve adım durumu tarayıcıda uydurulur (ORN- sentetik); yazma gitmez.
const paket = {
  id: 'ekran-sekme-99310', no: 'ORN-010102_2026-26-11-041', opType: 'cnc', st: {},
  partNo: 'ORN-MM-00008', part: 'ORN MEKANİK ÜRETİM 1002', proje: 'ORN-DENEME-PROJESI', rev: 'B', op: 'Op 10 · Tornalama',
  machine: 'ORN-TORNA-1', mc: 'ORN-CNC-02', target: 15, cycle: 30,
  due: '2026-12-31', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], tmi: { emirId: 9905, isEmriId: 99310, opNo: 10 },
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
};

async function kur(page: Page, genislik: number, yukseklik: number, buyuk: boolean, ac: (yol: string) => Promise<void>): Promise<void> {
  await page.setViewportSize({ width: genislik, height: yukseklik });
  await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: paket.id, surum: 1, govde: paket }] } }));
  await page.route('**/api/adimli-emirler/9905/adim-durumu/terminal', (r) => r.fulfill({ json: { emirId: 9905, adimlar: [
    { isEmriId: 99310, opNo: 10, ad: 'Tornalama', statu: 'baslayabilir', elle: false, yuzde: 0, nedenler: [], tedarik: [] },
  ] } }));
  await page.route('**/api/adimli-emirler/9905/hazirlik', (r) => r.fulfill({ json: { maddeler: [], muafiyetler: [], isEmirleri: [] } }));
  await page.route('**/api/uretim-emirleri/9905', (r) => r.fulfill({ json: { adimlar: [] } }));
  await page.route('**/api/arkon/is-emirleri/*/sahne', (r) => r.fulfill({ json: { sahne: null } }));
  if (buyuk) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const st = document.createElement('style');
    st.textContent = ':root { --yazi-xs: 15.6px; --yazi-s: 18.2px; --yazi-m: 20.8px; --yazi-l: 23.4px; --yazi-xl: 31.2px; }';
    document.head.appendChild(st);
  }));
  await ac('/uretim-terminali');
  await expect(page.locator('.tc-ay1-genis .tc-ay1-sag > .tc-sekmeler')).toBeVisible({ timeout: 15_000 });
}

test.describe('terminal sekmeleri ve teknik resim çubuğu', () => {
  test.use({ hesap: 'ornek.operator1' });
  const durumlar = [
    { genislik: 1280, yukseklik: 800, buyuk: false },
    { genislik: 1366, yukseklik: 768, buyuk: false },
    { genislik: 1024, yukseklik: 768, buyuk: false },
    { genislik: 1920, yukseklik: 1080, buyuk: false },
    { genislik: 1280, yukseklik: 800, buyuk: true },
  ];
  for (const d of durumlar) {
    test(`${String(d.genislik)}x${String(d.yukseklik)}${d.buyuk ? ' %130 yazıda' : ''} sekmeler ve araçlar kesilmez, kaydırmasız sığar`, async ({ page, ac }, bilgi) => {
      test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
      await kur(page, d.genislik, d.yukseklik, d.buyuk, ac);
      const serit = page.locator('.tc-ay1-genis .tc-ay1-sag > .tc-sekmeler');
      await expect(async () => {
        const o = await serit.evaluate((s) => ({
          kayar: s.scrollWidth - s.clientWidth,
          sekmeler: [...s.querySelectorAll<HTMLElement>(':scope > .tc-sekme')].map((t) => {
            const r = t.getBoundingClientRect();
            return { ad: t.textContent, boy: r.height, en: r.width, tasma: t.scrollWidth - t.clientWidth, simge: t.querySelector('.tc-simge') !== null };
          }),
        }));
        expect(o.kayar, 'sekme şeridi kayıyor').toBeLessThanOrEqual(1);
        const enler = o.sekmeler.map((t) => t.en);
        expect(Math.max(...enler) - Math.min(...enler), 'sekmeler eşit değil').toBeLessThanOrEqual(2);
        for (const t of o.sekmeler) {
          expect(t.boy, `${t.ad ?? ''} sekmesi 44 pikselden alçak`).toBeGreaterThanOrEqual(44);
          expect(t.tasma, `${t.ad ?? ''} sekmesi kesiliyor`).toBeLessThanOrEqual(0);
          expect(t.simge, `${t.ad ?? ''} sekmesinde simge yok`).toBe(true);
        }
      }).toPass({ timeout: 10_000 });

      await page.getByRole('tab', { name: /Teknik Resim/ }).click();
      const cubuk = page.getByRole('toolbar', { name: 'Teknik resim araçları' });
      await expect(cubuk).toHaveClass(/tc-ay5-besli/);
      await expect(cubuk.getByRole('button', { name: 'Diğer araçlar' })).toBeVisible();
      // Örnek pakette resim yok: yakınlaştırma işe yaramaz, düğmeler pasif.
      await expect(cubuk.getByRole('button', { name: 'Yakınlaştır' })).toBeDisabled();
      await expect(cubuk.getByRole('button', { name: 'Sığdır' })).toBeDisabled();
      await expect(async () => {
        const o = await cubuk.evaluate((c) => {
          const kutu = c.getBoundingClientRect();
          return {
            kayar: c.scrollHeight - c.clientHeight,
            araclar: [...c.querySelectorAll<HTMLElement>(':scope > button')].map((b) => {
              const r = b.getBoundingClientRect(), y = b.querySelector('span') ?? b;
              return { ad: b.getAttribute('aria-label'), boy: r.height, en: r.width, icinde: r.top >= kutu.top - 1 && r.bottom <= kutu.bottom + 1,
                tasma: Math.max(y.scrollWidth - y.clientWidth, b.scrollWidth - b.clientWidth) };
            }),
          };
        });
        expect(o.kayar, 'araç çubuğu kendi içinde kayıyor').toBeLessThanOrEqual(1);
        expect(o.araclar.length, 'araç sayısı').toBeLessThanOrEqual(5);
        for (const a of o.araclar) {
          expect(a.boy, `${a.ad ?? ''} 44 pikselden alçak`).toBeGreaterThanOrEqual(44);
          expect(a.en, `${a.ad ?? ''} 44 pikselden dar`).toBeGreaterThanOrEqual(44);
          expect(a.icinde, `${a.ad ?? ''} çubuğun dışında kalıyor`).toBe(true);
          expect(a.tasma, `${a.ad ?? ''} yazısı kesiliyor`).toBeLessThanOrEqual(0);
        }
      }).toPass({ timeout: 10_000 });
    });
  }

  test('Diğer menüsünde Görünüm, Dokümanlar, Uzaklaştır ve Odak modu durur', async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'genişliği test kurar');
    await kur(page, 1280, 800, false, ac);
    await page.getByRole('tab', { name: /Teknik Resim/ }).click();
    await page.getByRole('toolbar', { name: 'Teknik resim araçları' }).getByRole('button', { name: 'Diğer araçlar' }).click();
    const menu = page.getByRole('menu', { name: 'Diğer araçlar' });
    for (const ad of [/Balonları göster/, /Izgara/, /Dokümanlar/, /Uzaklaştır/, /Odak modu/]) await expect(menu.getByRole('menuitem', { name: ad })).toBeVisible();
  });
});
