import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Yeni ekran eski çerçeveyle aynı kökte açılır; kabuk o kökte içerik alanını çerçeveye bırakır. Kendi kaydırmasını kurmayan yeni ekranın
// içeriği alanın altına taşıyor, tekerlek ve dokunma onu kaydırmıyordu (Malzemeler, Arkon, Kalite Merkezi, İK, Portal).
test.use({ hesap: 'ornek.yonetici' });

const YENI_EKRANLAR = [
  '/arkon/pano', '/arkon/raporlar', '/recete-rota', '/plan', '/malzemeler', '/kalite-merkezi',
  '/kalite-merkezi/muayeneler', '/finans/yeni', '/ik/yeni/personel', '/mesaj/yeni', '/portal/yeni', '/denetim-hazirlik/yeni', '/cnc-kurulum/yeni',
];

// İçerik alanında alanın altına taşan ve kaydırılabilen hiçbir atasının içinde olmayan görünür öğeler: bunlara ulaşılamaz.
async function ulasilamayanlar(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const alan = document.querySelector('main.tc-kabuk-icerik');
    if (!(alan instanceof HTMLElement)) return ['içerik alanı yok'];
    const alt = alan.getBoundingClientRect().bottom;
    const kayar = (e: Element) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight;
    const sonuc: string[] = [];
    for (const e of alan.querySelectorAll('*')) {
      const k = e.getBoundingClientRect();
      if (k.height === 0 || k.width === 0 || k.top < alt + 1 || getComputedStyle(e).position === 'fixed') continue;
      let ata = e.parentElement;
      let ulasilir = false;
      while (ata !== null && !ulasilir) { ulasilir = kayar(ata); if (ata === alan) break; ata = ata.parentElement; }
      if (!ulasilir) sonuc.push(`${e.tagName.toLowerCase()}.${String(e.getAttribute('class') ?? '').split(' ')[0]}`);
      if (sonuc.length >= 5) break;
    }
    return sonuc;
  });
}

async function yuklenmeyiBekle(page: Page): Promise<void> {
  await expect(page.locator('main.tc-kabuk-icerik .tc-durum-yukleniyor')).toHaveCount(0, { timeout: 15_000 });
}

test('yeni ekranın alanın altına taşan içeriği kaydırılarak ulaşılır', async ({ page, ac }) => {
  for (const yol of YENI_EKRANLAR) {
    await ac(yol);
    await yuklenmeyiBekle(page);
    expect(await ulasilamayanlar(page), yol).toEqual([]);
  }
});

test('uzun katalogda tekerlek yeni ekranı kaydırır', async ({ page, ac }) => {
  await ac('/malzemeler');
  await yuklenmeyiBekle(page);
  const alan = page.locator('main.tc-kabuk-icerik');
  await expect(alan.getByRole('table').first()).toBeVisible();
  const kutu = await alan.boundingBox();
  if (kutu === null) throw new Error('içerik alanı görünmüyor');
  await page.mouse.move(kutu.x + kutu.width / 2, kutu.y + kutu.height / 2);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => alan.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
});

test('eski çerçeveli sayfada içerik alanı taşmaz, kaydırma çerçevededir', async ({ page, ac }) => {
  for (const yol of ['/malzemeler/eski', '/ik']) {
    await ac(yol);
    await expect(page.locator('main.tc-kabuk-icerik iframe').first()).toBeVisible();
    const fark = await page.locator('main.tc-kabuk-icerik').evaluate((e) => e.scrollHeight - e.clientHeight);
    expect(fark, yol).toBeLessThanOrEqual(0);
  }
});
