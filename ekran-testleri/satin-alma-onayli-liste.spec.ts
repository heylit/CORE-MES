import { expect, kesilenBasliklar, tasmaOlc, test } from './ortak.ts';

// 3279 a: Tedarikçiler > Onaylı liste 360, 768 ve 1280'de. Liste cevabı sentetiktir (ORN-); öteki uçlar gerçektir. Masaüstünde kategori
// ağacı, tablet ve telefonda kategori seçimi; firma x kategori tablosu telefonda yerine not. Yatay taşma yok, yazma gitmez.
test.use({ hesap: 'ornek.yonetici' });

const kalite = (k: Record<string, unknown>) => ({
  durum: 'Onaylı', firmaAskida: null, adIleEslendi: false, kritiklik: null, sertifikalar: [], sertifikaBitisi: null, sonDenetim: null, kategoriler: [], onaylar: [], ...k,
});
const karar = (kod: string, durum: string, aciklama: string | null = null) => ({
  kategoriTuru: 'hizmet', kategoriKodu: kod, durum, aciklama, tarih: '2026-03-12T08:00:00.000Z', kisiAd: 'ORN-Kalite Sorumlusu',
});
const yil = (siparis: number) => ({ siparis, teslim: siparis, zamanindaYuzde: siparis >= 3 ? 96 : null, yetersizVeri: siparis < 3 });
const LISTE = {
  kaliteBagli: true,
  firmalar: [
    { firmaId: 1, ad: 'ORN-Anka Isıl İşlem', satinAlmaTedarikcisi: true, sonYil: yil(23), kalite: kalite({ kritiklik: 'Kritik', sertifikalar: ['ISO 9001'], sertifikaBitisi: '2027-09-18', sonDenetim: '2026-02-05', kategoriler: [karar('isil', 'onayli'), karar('kaplama', 'onayli')] }) },
    { firmaId: 2, ad: 'ORN-Demir Kaplama Uzun Firma Adı', satinAlmaTedarikcisi: true, sonYil: yil(1), kalite: kalite({ durum: 'Şartlı onaylı', kategoriler: [karar('isil', 'sartli', 'ORN şart: her partide rapor'), karar('kaplama', 'onaysiz')] }) },
    { firmaId: 3, ad: 'ORN-Kuzey', satinAlmaTedarikcisi: false, sonYil: yil(0), kalite: kalite({ durum: 'Askıda', firmaAskida: '2026-11-01T09:00:00.000Z', kategoriler: [{ ...karar('isil', 'onaysiz'), tarih: '2026-11-01T09:00:00.000Z' }] }) },
    { firmaId: 4, ad: 'ORN-Ege', satinAlmaTedarikcisi: true, sonYil: yil(0), kalite: null },
  ],
  kategoriler: [
    { tur: 'hizmet', kod: 'isil', ad: 'Isıl işlem', ustAd: 'Hizmet', aktif: true },
    { tur: 'hizmet', kod: 'kaplama', ad: 'Yüzey kaplama', ustAd: 'Hizmet', aktif: true },
    { tur: 'sarf', kod: 'kesici', ad: 'Kesici takım', ustAd: 'Sarf', aktif: true },
  ],
  malzemeKategorileri: [],
};

test.describe('3279 Onaylı tedarikçi listesi', () => {
  test('liste ve firma x kategori: genişliğe göre ağaç ya da seçim, telefonda tablo yerine not; taşma ve kesilen başlık yok', async ({ page, ag, ac }) => {
    await page.route('**/api/satin-alma-onayli-liste', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LISTE) }));
    await ac('/satin-alma/tedarikciler?sekme=onayli');
    const genislik = page.viewportSize()?.width ?? 1280;
    const tablo = page.getByRole('table', { name: 'Onaylı liste: Hizmet · Isıl işlem' });
    await expect(tablo).toBeVisible({ timeout: 15_000 });
    await expect(tablo.getByText('12.03.2026 · ORN-Kalite Sorumlusu')).toBeVisible();
    await expect(tablo.getByText('Firma askıda: 01.11.2026')).toBeVisible();
    await expect(page.getByText('en az bir kategoride', { exact: true })).toBeVisible();
    if (genislik >= 1024) {
      await expect(page.getByRole('navigation', { name: 'Kategoriler' })).toBeVisible();
      await expect(page.getByLabel('Kategori', { exact: true })).toBeHidden();
    } else {
      await expect(page.getByRole('navigation', { name: 'Kategoriler' })).toBeHidden();
      await expect(page.getByLabel('Kategori', { exact: true })).toBeVisible();
    }
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(await kesilenBasliklar(page)).toEqual([]);
    // Taşma kaydırılan kapta saklanabilir: ekranın sağ kenarı görünür alanı aşmaz; masaüstünde tablo ağacın yanında durur.
    // Izgara izi kabından geniş olunca kap sığar ama çocukları taşar; çocukların sağ kenarı ölçülür.
    expect(Math.max(...await page.locator('.sa-ol > *').evaluateAll((l) => l.map((e) => e.getBoundingClientRect().right)))).toBeLessThanOrEqual(genislik);
    if (genislik >= 1024) {
      const agac = await page.getByRole('navigation', { name: 'Kategoriler' }).boundingBox();
      const t = await tablo.boundingBox();
      expect(t!.x).toBeGreaterThan(agac!.x + agac!.width);
    }

    await page.getByRole('tab', { name: 'Firma × kategori' }).click();
    if (genislik < 768) {
      await expect(page.getByText(/Firma × kategori tablosu telefonda gösterilmez/)).toBeVisible();
      await expect(page.getByRole('table', { name: 'Firma × kategori' })).toBeHidden();
    } else {
      const m = page.getByRole('table', { name: 'Firma × kategori' });
      await expect(m).toBeVisible();
      await expect(m.getByTitle('Kalite kaydı yok').first()).toBeVisible();
    }
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/oturum'))).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
