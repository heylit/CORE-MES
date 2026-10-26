import type { Page } from '@playwright/test';
import { HESAPLAR } from './hesaplar.ts';
import { expect, kesilenBasliklar, tasmaOlc, test } from './ortak.ts';

// Malzemeler'in doğal ekranı menünün adresindedir (572, 527 1 a); eski çerçeve kişi menüsündeki "Eski görünüm" ile /malzemeler/eski altında.
// Her parça kendi `test.describe('M<n> ...')` bloğunu ekler (PARCA-SOZLESMESI.md); M0 yalnız iskeleti sınar.
test.describe('M0 iskelet', () => {
  test('menü adresi yeni ekranı açar; bölümler kabuğun şeridindedir, ekran kendi sekmesini çizmez, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/malzemeler');
    const serit = page.getByRole('navigation', { name: 'Malzemeler ve Hizmetler menüsü' });
    await expect(serit).toBeVisible();
    await expect(serit.locator('[aria-current="page"]')).toHaveText(/^Katalog/);
    await expect(page.getByRole('tablist', { name: 'Malzemeler ve Hizmetler' })).toHaveCount(0);
    await expect(page.locator('main iframe')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('eski görünüme gidip döner: aynı bölüm çerçevede açılır, şeritte seçili kalır', async ({ page, ag, ac }) => {
    const gecis = async (ad: 'Eski görünüm' | 'Yeni görünüm') => {
      await page.getByRole('button', { name: 'Hesap' }).click();
      await page.getByRole('menuitem', { name: ad }).click();
    };
    await ac('/malzemeler/sablonlar');
    await expect(page.getByRole('region', { name: 'Hazır şablonlar' })).toBeVisible();
    await gecis('Eski görünüm');
    await expect(page).toHaveURL(/\/malzemeler\/eski\/sablonlar$/);
    await expect(page.locator('main iframe')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Malzemeler ve Hizmetler menüsü' }).locator('[aria-current="page"]')).toHaveText(/^Şablonlar/);
    await gecis('Yeni görünüm');
    await expect(page).toHaveURL(/\/malzemeler\/sablonlar$/);
    await expect(page.getByRole('region', { name: 'Hazır şablonlar' })).toBeVisible();
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('M1 yeni kart sihirbazı', () => {
  // Yalnız gezinir; kayıt düğmesine basılmaz (örnek veri değişmez).
  // Eski düzen (TASARIM KORUMA): üst baş, adımlar, adım ve föy; dar alanda adımlar yatay kayar, föy 780 altında gizlenir.
  test('sihirbaz taşmadan açılır; üst baş, adımlar, gövde ve alt çubuk görünür, katalogda ara kutusu ilk adımda', async ({ page, ag, ac }) => {
    await ac('/malzemeler/yeni');
    await expect(page.getByText(/Her kayıt kodlu bir katalog kalemine dönüşür/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tür ve aile' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Adımlar' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sihirbaz' })).toBeVisible();
    await expect(page.getByText('Seçerek süz ve kart bul')).toBeVisible();
    await expect(page.locator('[aria-label="Canlı föy önizlemesi"]')).toBeAttached();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    expect(await kesilenBasliklar(page)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });

  test('türle açılış (sarf): İleri düğmesi ekranın içinde, yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/malzemeler/yeni?tur=sarf');
    await expect(page.getByRole('navigation', { name: 'Adımlar' })).toBeVisible();
    const ileri = page.getByRole('navigation', { name: 'Sihirbaz' }).getByRole('button', { name: 'İleri' });
    await expect(ileri).toBeVisible();
    const k = await ileri.boundingBox();
    const g = page.viewportSize();
    expect(k && g && k.x + k.width <= g.width, 'İleri düğmesi ekranda').toBeTruthy();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
  // 306 a: seçim yalnız taslakta kalır; kayıt düğmesine basılmaz, yazma gitmez.
  test('yarı mamulde reçete ve rota var olan üründen seçilir; uyarı çıkar, yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/malzemeler/yeni?tur=yarimamul');
    await page.getByRole('textbox', { name: 'Parça adı *' }).fill('Deneme mil');
    await page.getByRole('radio', { name: 'Talaşlı işlenmiş parça' }).click();
    await page.getByRole('navigation', { name: 'Adımlar' }).getByRole('button', { name: /Operasyon/ }).click();
    const secim = page.getByRole('combobox', { name: 'Reçete ve rotası alınacak ürün' });
    await expect(secim).toBeVisible();
    await page.getByRole('button', { name: 'Reçete ve rotayı bu üründen al' }).click();
    await expect(page.getByText(/ürününden alınacak\./)).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});

test.describe('M3 malzeme ayarları', () => {
  // Genişlikler projeden gelir (360, 768, 1280).
  test('bölümler gezilir, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/malzemeler/ayarlar');
    const menu = page.getByRole('navigation', { name: 'Malzeme ayarları bölümleri' });
    await expect(menu.getByRole('button', { name: 'Genel bakış' })).toHaveAttribute('aria-current', 'page');
    for (const bolum of ['Aileler ve sınıflar', 'Kaliteler', 'Ad, açıklama ve zorunlu alanlar', 'Sertifikalar', 'Roller ve yetkiler']) {
      await menu.getByRole('button', { name: bolum, exact: true }).click();
      await expect(page.getByRole('heading', { name: bolum, exact: true, level: 3 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });

  test('üst baştaki Ayarlar penceresi açılır, taşmaz ve kapanır (prototipin "Ayarlar" penceresi)', async ({ page, ac, ag }) => {
    await ac('/malzemeler/ayarlar');
    await page.getByRole('button', { name: 'Ayarlar', exact: true }).click();
    const pencere = page.getByRole('dialog', { name: 'Ayarlar' });
    await expect(pencere.getByText('Mükerrer tarama')).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await pencere.getByRole('button', { name: 'Kapat' }).last().click();
    await expect(pencere).toBeHidden();
    expect(ag.yazmalar).toEqual([]);
  });

  test('Genel bakış özet kartları otomatik ızgarada: 1280\'de 4 + 2 (prototip)', async ({ page, ac }) => {
    await ac('/malzemeler/ayarlar');
    const kartlar = page.locator('.tc-ma-kartlar');
    await expect(kartlar).toBeVisible();
    const satirlar = await kartlar.evaluate((el) => {
      const ustler = [...el.children].map((c) => Math.round(c.getBoundingClientRect().top));
      return [...new Set(ustler)].map((u) => ustler.filter((x) => x === u).length);
    });
    if ((page.viewportSize()?.width ?? 0) >= 1280) expect(satirlar).toEqual([4, 2]);
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  });

  test('bilinmeyen bölüm Genel bakış\'a düşer', async ({ page, ac }) => {
    await ac('/malzemeler/ayarlar?bolum=yok');
    await expect(page.getByRole('navigation', { name: 'Malzeme ayarları bölümleri' }).getByRole('button', { name: 'Genel bakış' }))
      .toHaveAttribute('aria-current', 'page');
  });
});

// Katalog parçası: örnek verideki ORNEK kartlarıyla yalnız okuyan akışlar (yazma testleri birim testlerinde; koşular paralel).
test.describe('M2 katalog', () => {
  const tasmaz = async (page: Parameters<typeof tasmaOlc>[0]) => expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);

  test('liste ve arama: örnek kart bulunur, sayfa yatay taşmaz', async ({ page, ac }) => {
    await ac('/malzemeler');
    await expect(page.getByText(/Her kayıt kodlu bir katalog kalemine dönüşür/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Excel: şablon, dışa ve içe aktar' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Katalogda ara' }).fill('ORNEK Yuvarlak');
    await expect(page.getByText('ORNEK Yuvarlak çubuk Ø50').first()).toBeVisible();
    await tasmaz(page);
  });

  test('satırlar ayrık kart, sol kenarda tür rengi şerit; seçim sütununun başlığı yok (prototip)', async ({ page, ac }) => {
    await ac('/malzemeler');
    const tablo = page.locator('.tc-mk-ana .tc-tablo');
    await expect(tablo.locator('tbody tr').first()).toBeVisible();
    const olcu = await tablo.evaluate((el) => {
      const malzeme = el.querySelector('tbody .tc-mk-malzeme');
      const serit = malzeme ? getComputedStyle(malzeme, '::before') : null;
      return {
        secBaslik: el.querySelector('thead th')?.textContent?.trim() ?? null,
        seritGenislik: serit ? parseFloat(serit.width) : 0,
        seritRenk: serit?.backgroundColor ?? '',
      };
    });
    expect(olcu.secBaslik).toBe('');
    expect(olcu.seritGenislik).toBeGreaterThan(0);
    expect(olcu.seritRenk).not.toBe('rgba(0, 0, 0, 0)');
    await tasmaz(page);
  });

  // Eski yoğunluk (kullanıcı, 25.10.2026): fareyle satır 64 px'i, süzgeç satırı 30 px'i geçmez; ad kalın, kod küçük ve soluk.
  test('fareyle eski yoğunluk: satır <= 64 px, süzgeç satırı <= 30 px, ad kalın, kod soluk', async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g1280', 'fare ölçüsü masaüstünde sınanır');
    await ac('/malzemeler');
    const satir = page.locator('.tc-mk-ana .tc-tablo tbody tr').first();
    await expect(satir).toBeVisible();
    const olcu = await page.evaluate(() => {
      const tr = document.querySelector('.tc-mk-ana .tc-tablo tbody tr');
      const isaret = document.querySelector('.tc-mk-yan .tc-isaret');
      const ad = document.querySelector('.tc-mk-ad');
      const kod = document.querySelector('.tc-mk-kod');
      const rozet = document.querySelector('.tc-mk-malzeme .tc-rozet');
      return {
        satir: tr?.getBoundingClientRect().height ?? 0,
        isaret: isaret?.getBoundingClientRect().height ?? 0,
        adKalinlik: ad ? Number(getComputedStyle(ad).fontWeight) : 0,
        kodBoyut: kod ? parseFloat(getComputedStyle(kod).fontSize) : 0,
        rozetBuyukHarf: rozet ? getComputedStyle(rozet).textTransform : '',
      };
    });
    expect(olcu.satir).toBeGreaterThan(0);
    expect(olcu.satir).toBeLessThanOrEqual(64);
    expect(olcu.isaret).toBeGreaterThan(0);
    expect(olcu.isaret).toBeLessThanOrEqual(30);
    expect(olcu.adKalinlik).toBeGreaterThanOrEqual(600);
    expect(olcu.kodBoyut).toBeLessThanOrEqual(12);
    expect(olcu.rozetBuyukHarf).toBe('none');
  });

  test('kart penceresi satırdan açılır, adres ?kart= taşır, pencere taşmaz ve kapanır', async ({ page, ac }) => {
    await ac('/malzemeler');
    await page.getByRole('searchbox', { name: 'Katalogda ara' }).fill('ORNEK Yuvarlak');
    await page.getByText('ORNEK Yuvarlak çubuk Ø50').first().click();
    const pencere = page.getByRole('dialog');
    await expect(pencere).toBeVisible();
    await expect(page).toHaveURL(/[?&]kart=/);
    await expect(pencere.getByRole('button', { name: 'Etiket', exact: true })).toBeVisible();
    await tasmaz(page);
    await pencere.getByRole('button', { name: 'Kapat' }).last().click();
    await expect(pencere).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]kart=/);
  });

  test('süzgeç seçilince liste daralır ve aktif süzgeç çipi çıkar', async ({ page, ac }) => {
    await ac('/malzemeler');
    const kutu = page.locator('details', { has: page.locator('summary', { hasText: /^Süzgeçler/ }) });
    if (!(await kutu.evaluate((d) => (d as HTMLDetailsElement).open))) await kutu.locator('summary').click();
    const tur = page.getByRole('group', { name: /Tür/ });
    await tur.getByRole('checkbox', { name: /Hizmet/ }).check();
    await expect(page.getByRole('button', { name: /Hizmet.*kaldır/ })).toBeVisible();
    await expect(page.getByText('ORNEK Yuvarlak çubuk Ø50')).toHaveCount(0);
    await tasmaz(page);
  });

  test('iki kart seçilince karşılaştırma açılır', async ({ page, ac }) => {
    await ac('/malzemeler');
    await page.getByRole('searchbox', { name: 'Katalogda ara' }).fill('ORNEK');
    const kutular = page.getByRole('checkbox', { name: / seç$/ });
    await kutular.nth(0).check();
    await kutular.nth(1).check();
    await page.getByRole('button', { name: /Karşılaştır/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await tasmaz(page);
  });

  test('üst satırdaki düğmeyle CSV indirilir', async ({ page, ac }) => {
    await ac('/malzemeler');
    const [indirme] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV dışa aktar' }).click()]);
    expect(indirme.suggestedFilename()).toBe('malzeme-katalogu.csv');
  });
});

test.describe('M4 şablonlar ve kılavuz', () => {
  test('Şablonlar: hazır şablonlar görünür, sayfa yatay taşmaz; karta basınca sihirbaz şablonla açılır', async ({ page, ac, ag }) => {
    await ac('/malzemeler/sablonlar');
    const hazir = page.getByRole('region', { name: 'Hazır şablonlar' });
    await expect(hazir.getByRole('listitem').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const ilk = hazir.getByRole('listitem').first().getByRole('button').first();
    const ad = (await ilk.locator('b').innerText()).trim();
    await ilk.click();
    // Sihirbaz şablonu uygulayınca sorguyu adresten siler (M1); şablonun uygulandığı bildirimden görülür.
    await expect(page).toHaveURL(/\/malzemeler\/yeni/);
    await expect(page.getByRole('navigation', { name: 'Adımlar' })).toBeVisible();
    await expect(page.getByText(`"${ad}" uygulandı`, { exact: false }).first()).toBeVisible();
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Logo gönderimi maddesi: kabuğun Logo sayfası yeni ekranda açılır, yazma yok, sayfa yatay taşmaz (497/6 a)', async ({ page, ac, ag }) => {
    await ac('/malzemeler');
    const serit = page.getByRole('navigation', { name: 'Malzemeler ve Hizmetler menüsü' });
    await serit.getByRole('link', { name: /^Logo gönderimi/ }).click();
    await expect(page).toHaveURL(/\/malzemeler\/logo$/);
    await expect(serit.locator('[aria-current="page"]')).toHaveText(/^Logo gönderimi/);
    await expect(page.getByRole('table', { name: 'Logo gönderim durumu' })).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    expect(ag.yazmalar).toEqual([]);
  });

  test('Kılavuz: bölümler ve tablolar çizilir, sayfa yatay taşmaz', async ({ page, ac, ag }) => {
    await ac('/malzemeler/kilavuz');
    await expect(page.getByRole('heading', { name: 'Kart nasıl açılır?' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Arama örnekleri' })).toBeAttached();
    await expect(page.getByRole('table', { name: 'Roller ve yetkiler' })).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
  });
});

// Her rolde görünürlük eşitliği (572, 553 2 ile aynı ölçüt): eski görünümde şeritte görülen bölümü yeni ekran da açar, görülmeyeni açmaz.
// Eskide görmek şeritteki maddedir (işlem); yenide görmek, adres değişmeden bölümün yetki engeli olmadan açılmasıdır. Sayfa işlemi
// olmayan iki görünümde de "Yetkiniz yok" görür. Ölçü tek genişlikte: görünürlük genişliğe bağlı değildir.
const BOLUMLER = [['/malzemeler/yeni', 'Yeni kart'], ['/malzemeler', 'Katalog'], ['/malzemeler/sablonlar', 'Şablonlar'],
  ['/malzemeler/ayarlar', 'Malzeme ayarları'], ['/malzemeler/logo', 'Logo gönderimi'], ['/malzemeler/kilavuz', 'Kılavuz']] as const;

async function seritMaddeleri(page: Page): Promise<string[]> {
  const serit = page.getByRole('navigation', { name: 'Malzemeler ve Hizmetler menüsü' });
  await expect(serit.or(page.getByRole('heading', { name: 'Yetkiniz yok' })).first()).toBeVisible({ timeout: 15_000 });
  if (await serit.count() === 0) return [];
  return serit.getByRole('link').evaluateAll((l) => l.map((a) => a.getAttribute('href') ?? ''));
}

for (const hesap of HESAPLAR) {
  test.describe(`572 görünürlük eşitliği · ${hesap}`, () => {
    test.use({ hesap });
    test('eski ve yeni görünümde aynı bölümler açılır', async ({ page, ac }, bilgi) => {
      test.skip(bilgi.project.name !== 'g1280', 'görünürlük genişliğe bağlı değil');
      test.setTimeout(120_000);
      await ac('/malzemeler/eski');
      // Eski çerçeve yalnız yöneticidedir (681 a): başkası eski adreste yetki iletisini görür; şerit kabuğundur, ölçü ondan alınır.
      if (hesap !== 'ornek.yonetici') {
        await expect(page.getByRole('heading', { name: 'Yetkiniz yok' })).toBeVisible();
        await expect(page.locator('main iframe')).toHaveCount(0);
      }
      const eskiSerit = new Set(await seritMaddeleri(page));
      const eski = BOLUMLER.filter(([yol]) => eskiSerit.has(yol)).map(([, ad]) => ad);
      const yeni: string[] = [];
      for (const [yol, ad] of BOLUMLER) {
        await ac(yol);
        const govde = page.locator('main .tc-myeni-govde');
        await expect(govde.or(page.getByRole('heading', { name: 'Yetkiniz yok' })).first()).toBeVisible({ timeout: 15_000 });
        if (await govde.count() === 0 || new URL(page.url()).pathname !== yol) continue;
        await expect(govde.locator(':scope > *').first()).toBeVisible();
        const engel = await govde.getByText('Bu bölümü görme yetkin yok.').count();
        if (engel === 0 && (await seritMaddeleri(page)).includes(yol)) yeni.push(ad);
      }
      bilgi.annotations.push({ type: 'eskide görülen', description: eski.join(', ') });
      expect(yeni, `${hesap}: eskide görülen bölümler`).toEqual(eski);
    });
  });
}
