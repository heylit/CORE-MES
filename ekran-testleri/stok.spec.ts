import { expect, test } from './ortak.ts';
import type { Locator, Page } from '@playwright/test';

// Kaynak: kayit/stok/ozellikler.md:128 (depocu çubuğu sayfalamayı örtmez) ve :71 (Durum ve teslim paneli sekmeleri kesilmez).
test.use({ hesap: 'ornek.depo' });

type Kutu = { x: number; y: number; width: number; height: number };
const kesisir = (a: Kutu, b: Kutu): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;

// Şeritteki her sekme görünür alanın içindedir: şerit gizli kaydırmayla kesmez, sekme ekrandan taşmaz.
async function sekmelerTam(page: Page, serit: Locator): Promise<void> {
  await expect(serit).toBeVisible();
  const genislik = page.viewportSize()?.width ?? 0;
  expect(await serit.evaluate((e) => e.scrollWidth - e.clientWidth), 'sekme şeridinde gizli kaydırma').toBeLessThanOrEqual(0);
  const sekmeler = serit.getByRole('tab');
  expect(await sekmeler.count()).toBeGreaterThan(1);
  for (const s of await sekmeler.all()) {
    const k = await s.boundingBox();
    expect(k, `${await s.innerText()} sekmesi çizilmedi`).not.toBeNull();
    if (k === null) continue;
    expect(k.x, `${await s.innerText()} sekmesi solda kesik`).toBeGreaterThanOrEqual(0);
    expect(k.x + k.width, `${await s.innerText()} sekmesi sağda kesik`).toBeLessThanOrEqual(genislik);
  }
}

test('Hareketler: kayarken depocu çubuğu sayfalamayı örtmez', async ({ page, ag, ac }) => {
  // Sayfalama yalnız satır varken çizilir; stok modülünün örnek verisi yok (sunucu/moduller/stok/ornek-veri.ts).
  test.fixme(true, 'stok örnek verisi gelince açılır');
  await ac('/stok/hareketler');
  const sayfalama = page.locator('.tc-stok nav.tc-sayfalama');
  const cubuk = page.getByRole('navigation', { name: 'Depocu kısayolları' });
  await expect(sayfalama).toBeVisible();
  await expect(cubuk).toBeVisible();
  const yukseklik = page.viewportSize()?.height ?? 0;
  const toplam = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= toplam; y += Math.max(1, Math.floor(yukseklik / 3))) {
    await page.evaluate((konum) => { window.scrollTo(0, konum); }, y);
    const [s, c] = [await sayfalama.boundingBox(), await cubuk.boundingBox()];
    if (s !== null && c !== null) expect(kesisir(s, c), `kaydırma ${String(y)} px'te çubuk sayfalamanın üstünde`).toBe(false);
  }
  expect(ag.hatalar).toEqual([]);
});

test('Malzemeler: Durum sekmelerinin hepsi görünür', async ({ page, ag, ac }) => {
  await ac('/stok/malzemeler');
  await sekmelerTam(page, page.getByRole('tablist', { name: 'Durum' }));
  expect(ag.hatalar).toEqual([]);
});

test('Malzeme ve teslim paneli: sekmelerin hepsi görünür ve açılır', async ({ page, ag, ac }) => {
  await ac('/stok');
  await page.getByRole('button', { name: /^Malzeme ve teslim/ }).filter({ visible: true }).first().click();
  const panel = page.getByRole('dialog', { name: 'Malzeme · Teslim' });
  await expect(panel).toBeVisible();
  const serit = panel.getByRole('tablist', { name: 'Malzeme ve teslim' });
  await sekmelerTam(page, serit);
  for (const ad of ['Teslim et', 'Malzeme iste']) {
    await serit.getByRole('tab', { name: ad }).click();
    await expect(serit.getByRole('tab', { name: ad })).toHaveAttribute('aria-selected', 'true');
  }
  // Depocunun recete-rota statü okuması 403 alıyor; degisecek.spec.ts'te ayrıca izlenir.
  expect(ag.hatalar.filter((h) => !h.includes('/api/recete-rota/statuler') && !h.includes('status of 403'))).toEqual([]);
  expect(ag.yazmalar, 'paneli açmak ve sekme değiştirmek yazmaz').toEqual([]);
});
