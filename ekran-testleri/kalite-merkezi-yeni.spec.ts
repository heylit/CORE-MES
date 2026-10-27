import type { Page } from '@playwright/test';
import { HESAPLAR, type Hesap } from './hesaplar.ts';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kalite Merkezi'nin TS ekranı (199 b). Menü adresleri yeni ekranı açar (582, 527 1 a), eski görünümü yoktur (979 a); Resim ve
// modeller yeni stüdyodadır (597 a), parça seçilmeden liste açar (799). Bölüm testleri K1-K4 parçalarıyla kendi describe
// bloklarına eklenir; örnek veri değiştiren akış burada yazılmaz.
// Ayarlar sekmesi "Ayarlar ve yedek" adını taşır ama bugünkü gibi "Ayarlar ve veri" penceresini açar; başlık pencereden aranır.

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('menü adresi yeni ekrandır, kabuğun şeridi durur; eski görünüm yoktur', async ({ page, ag, ac }) => {
    await ac('/kalite-merkezi/dof');
    const serit = page.getByRole('navigation', { name: 'Kalite Merkezi menüsü' });
    await expect(serit).toBeVisible();
    await expect(page.locator('.tc-km-govde')).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Kaynaklar/ })).toHaveCount(0);
    await expect(serit.getByRole('link', { name: /DÖF/ })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Hesap' }).click();
    await expect(page.getByRole('menuitem', { name: 'Eski görünüm' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await ac('/kalite-merkezi/eski/dof');
    await expect(page.locator('main iframe')).toHaveCount(0);
    await ac('/kalite-merkezi/eski');
    await expect(page.getByText('Böyle bir görünüm yok.')).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
  });

  test('şeritteki Resim ve modeller parça listesini açar (597 a, 799), hata vermez, taşmaz', async ({ page, ag, ac }) => {
    await ac('/kalite-merkezi');
    await page.getByRole('navigation', { name: 'Kalite Merkezi menüsü' }).getByRole('link', { name: 'Resim ve modeller' }).click();
    await expect(page).toHaveURL(/\/kalite-merkezi\/resimler$/);
    await expect(page.locator('main iframe')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Resim ve modeller' }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Teknik resim' })).toHaveCount(0);
    expect(ag.hatalar, 'konsol ve API hataları').toEqual([]);
    expect((await tasmaOlc(page)).belge, 'sayfa yatay taşması').toBe(0);
  });

  // Eski çerçevenin tam boy kuralı yeni köke uyunca üst şerit ile başlık arasında ekran boyu boşluk açılıyordu.
  test('üst şerit ve gövde boşluğa gerilmez', async ({ page, ac }) => {
    await ac('/kalite-merkezi/resimler');
    await expect(page.getByRole('heading', { level: 2, name: 'Resim ve modeller' }).filter({ visible: true }).first()).toBeVisible();
    const [ust, govde] = await Promise.all(['.tc-km-ust', '.tc-km-govde'].map((s) => page.locator(s).first().boundingBox()));
    if (!ust || !govde) throw new Error('kabuk bulunamadı');
    expect(govde.y - (ust.y + ust.height), 'üst şerit ile gövde arası').toBeLessThan(40);
  });

  test.describe('K1 Bugün, Parçalar, Teknik kütüphane, Terimler', () => {
    // Rol ayrımı (muayeneci, mühendis, okuyan) birim testlerindedir; rol başına görünürlük aşağıdaki eşitlik testindedir.
    const K1 = [
      ['/kalite-merkezi', /^(Merhaba .+|Bugün)$/],
      ['/kalite-merkezi/parcalar', 'Parçalar'],
      ['/kalite-merkezi/kutuphane', 'Teknik kütüphane'],
      ['/kalite-merkezi/terimler', 'Terimler'],
    ] as const;
    for (const [yol, baslik] of K1) {
      test(`${yol} açılır, başlığı görünür, hata vermez, taşmaz`, async ({ page, ag, ac }) => {
        await ac(yol);
        await expect(page.getByRole('heading', { level: 2, name: baslik }).filter({ visible: true }).first()).toBeVisible();
        expect(ag.hatalar, 'konsol ve API hataları').toEqual([]);
        expect((await tasmaOlc(page)).belge, 'sayfa yatay taşması').toBe(0);
      });
    }

    test('Terimler araması süzer; kütüphanede sabit bölümler görünür', async ({ page, ac }) => {
      await ac('/kalite-merkezi/terimler');
      await page.getByLabel('Terim ara').fill('Cpk');
      // Arama açıklamada da arar: Cp'nin açıklaması Cpk geçtiği için o da kalır; terim adı tam eşleşmeyle bakılır.
      await expect(page.getByText('Cpk', { exact: true })).toBeVisible();
      await expect(page.getByText('Cp', { exact: true })).toBeVisible();
      await expect(page.getByText('Kabul edilebilir kalite seviyesi', { exact: false })).toHaveCount(0);
      await ac('/kalite-merkezi/kutuphane');
      await expect(page.getByRole('heading', { name: 'Geometrik toleranslar (ASME Y14.5 / ISO 1101)' })).toBeVisible();
    });

    test('Bugün ölçüm kısayolu Resim ve modeller listesine gider, yazma isteği atmaz', async ({ page, ag, ac }) => {
      await ac('/kalite-merkezi');
      ag.sifirla();
      await page.getByRole('button', { name: /^Ölçüm yap/ }).click();
      await expect(page).toHaveURL(/\/kalite-merkezi\/resimler$/);
      expect(ag.yazmalar).toEqual([]);
    });
  });
  test.describe('K2 Muayene, Lot kabul, Ölçüm analizi, İş emirleri', () => {
    test('muayeneler açılır, yeni muayene formu kaydetmeden kapanır', async ({ page, ac }) => {
      await ac('/kalite-merkezi/muayeneler');
      await expect(page.getByRole('heading', { name: 'Muayene ve FAI' })).toBeVisible();
      await page.getByRole('button', { name: 'Muayene kaydet' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // Dar ekranda Vazgeç gizlidir (bugünkü gibi); pencerenin kapatma düğmesi her genişlikte vardır.
      await page.getByRole('dialog').getByRole('button', { name: 'Kapat' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
    });

    test('lot kabul sihirbazı plan çıkarır', async ({ page, ac }) => {
      await ac('/kalite-merkezi/lot-kabul');
      await page.getByLabel('Parti büyüklüğü').fill('500');
      await expect(page.getByText(/Kod harfi/).first()).toBeVisible();
    });

    test('ölçüm analizi ve iş emirleri açılır', async ({ page, ac }) => {
      await ac('/kalite-merkezi/olcum-analizi');
      await expect(page.getByRole('heading', { name: 'Ölçüm analizi (SPC)' })).toBeVisible();
      await ac('/kalite-merkezi/is-emirleri');
      await expect(page.getByRole('heading', { name: 'İş emirleri ve siparişler' })).toBeVisible();
      // 592 B1 c: liste Üretim emirleri'nden gelir (örnek veride açık iş emirleri var); burada eklenmez, aktarılmaz.
      const liste = page.getByRole('table', { name: 'İş emirleri ve siparişler' });
      await expect(liste).toBeVisible();
      await expect(liste.getByText('İş emri').first()).toBeVisible();
      await expect(page.getByRole('button', { name: /^Ekle$/ })).toHaveCount(0);
    });
  });
  test.describe('K3 Uygunsuzluk, DÖF, Formlar', () => {
    const GORUNUMLER = [
      ['uygunsuzluklar', /Uygunsuzluklar \(NCR\)/],
      ['dof', /DÖF \/ 8D/],
      ['formlar', /Formlar ve kontrol listeleri/],
    ] as const;

    for (const [yol, baslik] of GORUNUMLER) {
      for (const genislik of [360, 768, 1280]) {
        test(`${yol} ${genislik} genişlikte açılır, yatay taşmaz`, async ({ page, ac }) => {
          await page.setViewportSize({ width: genislik, height: 800 });
          await ac(`/kalite-merkezi/${yol}`);
          await expect(page.getByRole('heading', { name: baslik })).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        });
      }
    }
  });
  test.describe('K4 Kaynaklar ve Raporlar', () => {
    for (const [yol, baslik] of [
      ['cihazlar', 'Ölçüm cihazları'], ['tedarikciler', 'Tedarikçi kalitesi'], ['belgeler', 'Belgeler ve sertifikalar'],
      ['kullanicilar', 'Kullanıcılar'], ['gostergeler', 'Kalite göstergeleri'], ['degisiklik-izi', 'Değişiklik izi'],
      ['arsiv', 'Arşiv'], ['ayarlar', 'Ayarlar ve veri'],
    ] as const) {
      test(`${baslik} açılır`, async ({ page, ac }) => {
        await ac(`/kalite-merkezi/${yol}`);
        await expect(page.getByRole('heading', { name: baslik, exact: true })).toBeVisible();
      });
    }

    test('ölçüm cihazları Kalibrasyon sayfasına götürür', async ({ page, ac }) => {
      await ac('/kalite-merkezi/cihazlar');
      await page.getByRole('button', { name: 'Kalibrasyon sayfasına git' }).click();
      await expect(page).toHaveURL(/\/kalibrasyon$/);
    });
  });
});

// Her rolde görünürlük (553 2): açmak, adres değişmeden ekranın gövdesinin açılmasıdır. Stüdyo görünümleri (217 b) çerçevedir, denenmez.
// Ölçü tek genişlikte alınır: görünürlük genişliğe bağlı değildir. "Ayarlar" yetkisizde açılmaz ama adres yerinde kalabilir; yetkisizde
// açılmadığı birim testindedir (KaliteMerkeziYeni.test.tsx).
const GORUNUMLER = ['', 'parcalar', 'kutuphane', 'muayeneler', 'lot-kabul', 'is-emirleri', 'olcum-analizi', 'uygunsuzluklar', 'dof', 'cihazlar',
  'tedarikciler', 'belgeler', 'formlar', 'kullanicilar', 'terimler', 'gostergeler', 'degisiklik-izi', 'arsiv'] as const;
const kapali = (page: Page) => page.getByRole('heading', { name: 'Yetkiniz yok' })
  .or(page.getByText('Bu sayfa bulunamadı ya da size açık değil.'))
  .or(page.getByText("Kalite Merkezi'ni görme yetkiniz yok."));
const adresi = (g: string, kok: string) => (g === '' ? kok : `${kok}/${g}`);

async function acilir(page: Page, isaret: ReturnType<Page['locator']>, adres: string): Promise<boolean> {
  await expect(isaret.or(kapali(page)).first()).toBeAttached({ timeout: 20_000 });
  return await isaret.count() > 0 && new URL(page.url()).pathname === adres;
}

// Liste eski görünümle yapılan eşitlik ölçümünün (582, 681) sonucudur; eski görünüm kalktı (979 a), liste değişirse görünürlük değişmiştir.
const ACILAN: Readonly<Record<Hesap, readonly string[]>> = {
  'ornek.yonetici': GORUNUMLER,
  'ornek.mudur': GORUNUMLER,
  'ornek.planlama': [],
  'ornek.operator1': [],
  'ornek.operator2': [],
  'ornek.kalite': GORUNUMLER,
  'ornek.depo': [],
  'ornek.satis': [],
  'ornek.satinalma': [],
  'ornek.muhasebe': [],
};

for (const hesap of HESAPLAR) {
  test.describe(`582 görünürlük · ${hesap}`, () => {
    test.use({ hesap });
    test('rolün görünümleri açılır, başkaları açılmaz', async ({ page, ac }, bilgi) => {
      test.skip(bilgi.project.name !== 'g1280', 'görünürlük genişliğe bağlı değil');
      test.setTimeout(240_000);
      const acilan: string[] = [];
      for (const g of GORUNUMLER) {
        const y = adresi(g, '/kalite-merkezi');
        await ac(y);
        if (await acilir(page, page.locator('.tc-km-govde'), y)) acilan.push(g);
      }
      expect(acilan, `${hesap}: açılan görünümler`).toEqual(ACILAN[hesap]);
    });
  });
}
