import type { Page } from '@playwright/test';
import { HESAPLAR, type Hesap } from './hesaplar.ts';
import { expect, tasmaOlc, test } from './ortak.ts';

// Kalite Merkezi'nin TS ekranı (199 b). Eski adresine geçti (582, 527 1 a): menü adresleri yeni ekranı açar, eski çerçeve bir süre
// /kalite-merkezi/eski altındadır; Resim ve modeller yeni stüdyodadır (597 a), parça seçilmeden liste açar (799). Bölüm testleri K1-K4 parçalarıyla kendi describe
// bloklarına eklenir; örnek veri değiştiren akış burada yazılmaz.
// Ayarlar sekmesi "Ayarlar ve yedek" adını taşır ama bugünkü gibi "Ayarlar ve veri" penceresini açar; başlık pencereden aranır.

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  const gecis = async (page: Page, ad: 'Eski görünüm' | 'Yeni görünüm') => {
    await page.getByRole('button', { name: 'Hesap' }).click();
    await page.getByRole('menuitem', { name: ad }).click();
  };

  test('menü adresi yeni ekrandır, kabuğun şeridi durur; eski görünüme gidip aynı görünüme döner', async ({ page, ag, ac }) => {
    await ac('/kalite-merkezi/dof');
    const serit = page.getByRole('navigation', { name: 'Kalite Merkezi menüsü' });
    await expect(serit).toBeVisible();
    await expect(page.locator('.tc-km-govde')).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Kaynaklar/ })).toHaveCount(0);
    await gecis(page, 'Eski görünüm');
    await expect(page).toHaveURL(/\/kalite-merkezi\/eski\/dof$/);
    await expect(page.locator('main iframe')).toHaveCount(1);
    await expect(serit.getByRole('link', { name: /DÖF/ })).toHaveAttribute('aria-current', 'page');
    await gecis(page, 'Yeni görünüm');
    await expect(page).toHaveURL(/\/kalite-merkezi\/dof$/);
    await expect(page.locator('.tc-km-govde')).toBeVisible();
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

// Her rolde görünürlük eşitliği (553 2): bir görünümü eski sayfada gören yeni ekranda da görür, görmeyen görmez. Eskide görmek çerçevenin
// adres değişmeden açılmasıdır; yenide ekranın gövdesinin açılmasıdır. Stüdyo görünümleri (217 b) iki görünümde de çerçevedir, denenmez.
// Ölçü tek genişlikte alınır: görünürlük genişliğe bağlı değildir. "Ayarlar" eski sayfada görünüm değil penceredir: yetkisizde pencere
// açılmaz ama adres yerinde kalabilir, eskide ölçülemez; yetkisizde açılmadığı birim testindedir (KaliteMerkeziYeni.test.tsx).
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

// Eski görünüm yalnız yöneticidedir (681 a): eşitlik yöneticide ölçülür. Başka hesapta eski adres kapalıdır ve yeni ekranda açılan
// görünümler 681 öncesi eşitlik ölçümünün listesidir (o gün eskide görülenle aynıydı); liste değişirse görünürlük değişmiştir.
const YENIDE_ACILAN: Readonly<Record<Exclude<Hesap, 'ornek.yonetici'>, readonly string[]>> = {
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
  test.describe(`582 görünürlük eşitliği · ${hesap}`, () => {
    test.use({ hesap });
    test('eski ve yeni görünümde aynı görünümler açılır', async ({ page, ac }, bilgi) => {
      test.skip(bilgi.project.name !== 'g1280', 'görünürlük genişliğe bağlı değil');
      test.setTimeout(240_000);
      const yeni: string[] = [];
      if (hesap !== 'ornek.yonetici') {
        for (const g of GORUNUMLER) {
          const y = adresi(g, '/kalite-merkezi');
          await ac(y);
          if (await acilir(page, page.locator('.tc-km-govde'), y)) yeni.push(g);
        }
        await ac('/kalite-merkezi/eski');
        await expect(page.getByRole('heading', { name: 'Yetkiniz yok' })).toBeVisible();
        await expect(page.locator('main iframe')).toHaveCount(0);
        expect(yeni, `${hesap}: yeni ekranda açılan görünümler`).toEqual(YENIDE_ACILAN[hesap]);
        return;
      }
      const eski: string[] = [];
      for (const g of GORUNUMLER) {
        const e = adresi(g, '/kalite-merkezi/eski');
        await ac(e);
        if (await acilir(page, page.locator('main iframe'), e)) eski.push(g);
        const y = adresi(g, '/kalite-merkezi');
        await ac(y);
        if (await acilir(page, page.locator('.tc-km-govde'), y)) yeni.push(g);
      }
      bilgi.annotations.push({ type: 'eskide görülen', description: eski.join(', ') });
      expect(yeni, `${hesap}: eskide görülen görünümler`).toEqual(eski);
    });
  });
}
