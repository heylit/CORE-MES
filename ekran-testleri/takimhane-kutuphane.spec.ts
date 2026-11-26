import type { APIRequestContext, Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// 3762: Takımhane listesi CNC kütüphanesidir; boş gözde açılış, dolu gözde kör sayım, yetkisiz kullanıcıda giriş düğmesi yok.
// Örnek veride takım kartı yoktur: örnek sarf kartları (SF-ORN-) CNC Kurulum'un bağlama ucuyla kütüphane kalemine bağlanır.
const BAGLAR = [{ kod: 'SF-ORN-00001', kimlik: 'em10' }, { kod: 'SF-ORN-00003', kimlik: 'em12' }] as const;

async function kartBagla(istek: APIRequestContext): Promise<void> {
  for (const b of BAGLAR) {
    const c = await istek.get(`${ADRES}/api/cnc-kurulum/takimlar/stok-kartlari?metin=${b.kod}`);
    expect(c.status(), await c.text()).toBe(200);
    const kart = (await c.json() as { kartlar: { malzemeId: number; kod: string }[] }).kartlar.find((k) => k.kod === b.kod);
    if (kart === undefined) throw new Error(`örnek veride ${b.kod} yok`);
    const y = await istek.post(`${ADRES}/api/cnc-kurulum/takimlar/stok-karti`, { data: { kimlik: b.kimlik, malzemeId: kart.malzemeId } });
    expect(y.status(), await y.text()).toBe(200);
  }
}

const satir = (page: Page, ad: string) => page.getByRole('row').filter({ hasText: ad }).or(page.locator('li').filter({ hasText: ad })).filter({ visible: true }).first();

test.describe('Takımhane kütüphanesi (3762)', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('liste kütüphane raflarıyla gelir; boş gözde açılış, dolu gözde kör sayım', async ({ page, ac, ag }, bilgi) => {
    const genislik = page.viewportSize()?.width ?? 0;
    const klasor = process.env['TMIV2_EKRAN_GORUNTU_KLASORU'];
    const resim = async (ad: string): Promise<void> => { if (klasor) await page.screenshot({ path: `${klasor}/${ad}-${String(genislik)}.png` }); };
    // Bağ her genişlikte kurulur: genişlikler paralel koşar ve sıraları belli değildir; aynı bağı yeniden kurmak sonucu değiştirmez.
    await kartBagla(page.request);
    await ac('/takimhane');
    await expect(page.getByRole('heading', { name: 'Kütüphane ve stok' })).toBeVisible();
    await expect(satir(page, 'Parmak Freze Ø10')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await resim('1-liste');
    await page.getByRole('heading', { name: 'Kütüphane ve stok' }).scrollIntoViewIfNeeded();
    await resim('1b-kutuphane');

    // Stok yazan adımlar (açılış, sayım) tek genişlikte koşar: üç genişlik aynı veritabanını paylaşır.
    if (bilgi.project.name !== 'g1280') {
      await satir(page, 'Parmak Freze Ø12').getByRole('button', { name: /Açılış gir|Sayım/ }).click();
      const p = page.getByRole('dialog');
      await expect(p.getByRole('list', { name: 'Raf gözleri' }).getByRole('button').first()).toBeVisible();
      await p.getByRole('list', { name: 'Raf gözleri' }).getByRole('button').first().click();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
      await resim('2-pencere');
      expect(ag.yazmalar).toEqual([]);
      return;
    }
    // Koşu aynı veritabanında yinelenirse göz dolu kalır: açılış yalnız boşken yazılır, sayım her koşuda.
    let p = page.getByRole('dialog');
    const acilis = satir(page, 'Parmak Freze Ø10').getByRole('button', { name: 'Açılış gir' });
    if (await acilis.count() > 0) {
      await acilis.click();
      await p.getByRole('list', { name: 'Raf gözleri' }).getByRole('button', { name: /OA-02-02/ }).click();
      await expect(p.getByRole('button', { name: 'Açılış olarak yaz' })).toBeVisible();
      await p.getByLabel('Adet').fill('4');
      await resim('2-acilis');
      await p.getByRole('button', { name: 'Açılış olarak yaz' }).click();
      await expect(page.getByText(/Açılış yazıldı/)).toBeVisible();
    }
    await expect(satir(page, 'Parmak Freze Ø10')).toContainText('OA-02-02');

    await satir(page, 'Parmak Freze Ø10').getByRole('button', { name: 'Sayım' }).click();
    p = page.getByRole('dialog');
    await p.getByRole('list', { name: 'Raf gözleri' }).getByRole('button', { name: /OA-02-02/ }).click();
    await expect(p.getByText(/kör sayım/)).toBeVisible();
    await expect(p.getByText(/^\d+ adet$/)).toHaveCount(0);
    await p.getByLabel('Sayılan adet').fill('3');
    await resim('3-sayim');
    await p.getByRole('button', { name: 'Sayımı gönder' }).click();
    // Önceki koşunun farkı onay bekliyorsa ikinci sayım reddedilir (sunucu kuralı); ikisi de doğru sonuçtur.
    await expect(page.getByText(/Sayım alındı|onay bekleyen sayım farkı var/)).toBeVisible();
    expect(ag.hatalar.filter((h) => !h.startsWith('409 POST /api/takimhane/giris') && !h.includes('status of 409'))).toEqual([]);
  });

  test('Açılış ve sayım sayfası şablon ve dosya seçimiyle açılır', async ({ page, ac, ag }) => {
    await ac('/takimhane/baslangic');
    await expect(page.getByRole('button', { name: 'Şablonu indir' })).toBeVisible();
    await expect(page.getByLabel(/Excel dosyası/)).toBeAttached();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
  });
});

// Örnek hesaplarda Takımhane'yi görüp stok girişi ve sayımı olmayan rol yok; yetkisiz gösterim istemci testinde (kutuphane.test.tsx).
// Yönetici olmayan depo hesabı: liste açılır, kartlı satırda giriş düğmesi görünür, yazma yapılmaz.
test.describe('Takımhane depo hesabı (3762)', () => {
  test.use({ hesap: 'ornek.depo' });

  test('depo listeyi görür; kartlı satırda açılış ya da sayım düğmesi vardır', async ({ page, ac, ag }) => {
    await ac('/takimhane');
    await expect(page.getByRole('heading', { name: 'Kütüphane ve stok' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Açılış gir|Sayım)$/ }).filter({ visible: true }).first()).toBeVisible();
    expect(ag.yazmalar).toEqual([]);
  });
});
