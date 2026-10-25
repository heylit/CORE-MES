import { expect, tasmaOlc, test } from './ortak.ts';

// İkinci menü her sayfada ve her genişlikte başlığın altında yatay şerittir (soru 514 1a): kabuk sayfası da çerçeveli sayfa gibi
// menüyü üstte açar, ana menünün yanında ikinci bir sütun açılmaz.
test.use({ hesap: 'ornek.yonetici' });

const SAYFALAR = ['/stok', '/vardiya', '/siparisler', '/ayarlar', '/ik'];

test('ikinci menü içeriğin üstünde, içerik genişliğinde şerittir', async ({ page, ag, ac }) => {
  for (const yol of SAYFALAR) {
    await ac(yol);
    const kap = page.locator('.tc-ikinci-kap');
    await expect(kap, yol).toBeVisible();
    const kutu = async (s: string) => {
      const k = await page.locator(s).boundingBox();
      if (k === null) throw new Error(`${yol}: ${s} görünmüyor`);
      return k;
    };
    const menu = await kutu('.tc-ikinci-kap');
    const icerik = await kutu('main.tc-kabuk-icerik');
    const ust = await kutu('.tc-kabuk-ust');
    expect(Math.round(menu.y), `${yol}: menü üst çubuğun altında`).toBe(Math.round(ust.y + ust.height));
    expect(menu.y + menu.height, `${yol}: menü içeriğin üstünde`).toBeLessThanOrEqual(icerik.y + 1);
    expect(Math.round(menu.x), `${yol}: menü içerikle aynı yerden başlar`).toBe(Math.round(icerik.x));
    expect(Math.round(menu.width), `${yol}: menü içerik genişliğinde`).toBe(Math.round(icerik.width));
    expect((await tasmaOlc(page)).belge, `${yol}: yatay taşma`).toBeLessThanOrEqual(0);
  }
  expect(ag.hatalar).toEqual([]);
});
