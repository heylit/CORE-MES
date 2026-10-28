import type { Page } from '@playwright/test';
import { HESAPLAR, type Hesap } from './hesaplar.ts';
import { ADRES, cerceve, expect, test } from './ortak.ts';

// Üretim Hazırlık TS ekranı (Soru 271 c). Ölçüt bugünkü çerçevedir: her sayfanın testi parçasıyla gelir ve eski ekranda bugün
// çalışan davranışı yeni yolda sınar. İskelet yalnız kabuğu sınar; bölümlerin içine bakmaz.
test.use({ hesap: 'ornek.yonetici' });

// Tek maddelik şerit genişte durur; telefonda çizilmez, sayfa kendi başlığını taşır (618c).
async function tekSerit(page: Page, ad: string): Promise<void> {
  const menu = page.locator(`nav[aria-label="${ad} menüsü"]`);
  if ((page.viewportSize()?.width ?? 0) < 768) await expect(menu).toBeHidden();
  else await expect(menu).toBeVisible();
}

test.describe('A0 iskelet', () => {
  test('kök adres Pano\'yu açar; kabuğun şeridinden sayfa değişir; çerçeve yok, başka kökene istek yok, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    const disari: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(ADRES) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) disari.push(r.url()); });
    await ac('/arkon');
    await expect(page).toHaveURL(/\/arkon\/pano$/);
    // Sayfalar kabuğun ikinci menü şeridindedir, ekran kendi sekmesini çizmez (553 1 a). Üretim Terminali ve Kuyruk eskisi gibi ayrı
    // sayfa (497/5 a): şeritte yok. Her sayfada eski üst bant (497/4 a).
    const serit = page.getByRole('navigation', { name: 'Üretim Hazırlık menüsü' });
    await expect(page.getByRole('tablist', { name: 'Üretim Hazırlık' })).toHaveCount(0);
    await expect(serit.getByRole('link').first()).toHaveText(/^Pano/);
    await expect(serit.getByRole('link', { name: /^Pano/ })).toHaveAttribute('aria-current', 'page');
    await expect(serit.getByRole('link', { name: 'Operatör' })).toHaveCount(0);
    await expect(serit.getByRole('link', { name: 'Kuyruk', exact: true })).toHaveCount(0);
    await expect(page.locator('.tc-ay-bant').getByRole('heading', { name: 'Fabrika panosu' })).toBeVisible();
    // Dar ekranda tema bandın "Diğer" menüsündedir.
    const diger = page.locator('.tc-ay-bant').getByRole('button', { name: 'Diğer' });
    if (await diger.isVisible()) await diger.click();
    await expect(page.getByRole('button', { name: 'Tema değiştir' })).toBeVisible();
    if (await diger.isVisible()) await diger.click();
    await expect(page.getByRole('region', { name: 'Pano' })).toBeVisible();
    await serit.getByRole('link', { name: /^Kalite/ }).click();
    await expect(page).toHaveURL(/\/arkon\/kalite$/);
    await expect(page.getByRole('region', { name: 'Kalite' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(disari).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('A2 Hazırlık', () => {
  const tasma = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // Örnek veride iş paketi yoktur: boş liste ve yöneticinin "Yeni paket" yolu sınanır.
  test('Hazırlık: liste açılır, açılışta yazma yok, süzgeç açıkken sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/arkon/hazirlik');
    const liste = page.getByRole('complementary', { name: 'İş paketleri' });
    await expect(liste.getByRole('textbox', { name: 'İş paketlerinde ara' })).toBeVisible();
    await expect(liste.getByRole('button', { name: 'Yeni paket' })).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await liste.getByRole('button', { name: 'Süzgeç ve gruplama' }).click();
    await expect(liste.getByRole('group', { name: 'Süzgeç' })).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler'))).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  // Ekran testleri yazmaz: paket tarayıcıda uydurulur (sentetik), sunucuya hiçbir yazma gitmez; her sekme açılıp taşma ölçülür.
  test('Hazırlık: paket düzenleyicisinde her sekme açılır, yazma gitmez, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    const paket = {
      id: 'ekran-deneme-1', no: 'IE-EKRAN-1', opType: 'cnc', st: {}, partNo: 'EK-1', part: 'Ekran deneme parçası', rev: 'A', op: 'Op 10', machine: '',
      target: 10, cycle: 30, due: '', priority: 'normal', material: '', note: '', files: [], primary: null,
      plan: [{ id: 1, nom: '20', tol: '0.1', min: 19.9, max: 20.1, tool: 'Kumpas', freq: 'İlk parça' }], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
      status: 'draft', version: 0, dirty: true, createdAt: 1, updatedAt: 2, by: 'Ekran',
    };
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: paket.id, surum: 1, govde: paket }] } }));
    await page.route('**/api/arkon/belgeler/pkgs/*/yaz', (r) => r.fulfill({ json: { sonuc: 'yazildi', surum: 2 } }));
    await ac('/arkon/hazirlik');
    // Dar ekranda liste ile düzenleyici yer değiştirir: paket kartına basınca düzenleyici açılır.
    await page.getByRole('complementary', { name: 'İş paketleri' }).getByRole('button', { name: /IE-EKRAN-1/, pressed: true }).click();
    const duzen = page.getByRole('region', { name: 'İş paketi' });
    await expect(duzen.getByRole('heading', { name: /IE-EKRAN-1/ })).toBeVisible();
    const adimlar = duzen.getByRole('list', { name: 'Hazırlık adımları' });
    for (const sekme of ['Bilgiler', 'Dokümanlar', 'Kontrol planı', 'Numune', 'Adımlar', 'Kurallar', 'Yayınla']) {
      await adimlar.getByRole('button', { name: sekme }).click();
      await expect(adimlar.getByRole('button', { name: sekme })).toHaveAttribute('aria-current', 'step');
      expect(await tasma(page), sekme).toBeLessThanOrEqual(0);
    }
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler'))).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('A1 Operatör', () => {
  const tasma = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const yazmalar = (y: string[]) => y.filter((x) => !x.startsWith('POST /api/arkon/iletiler'));

  test('Operatör: terminal açılır, açılışta yazma yok, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/uretim-terminali');
    await expect(page.getByRole('region', { name: 'Aktif iş emri' }).or(page.getByRole('navigation', { name: 'Terminal görünümleri' })).first()).toBeVisible();
    // 793 b: üst çubuk yalnız istasyon adını gösterir; istasyon çarkın İstasyonlar şeridinden değişir.
    await expect(page.getByTitle('İstasyon · çarkın İstasyonlar şeridinden değişir').first()).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(yazmalar(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  // Ekran testleri yazmaz: paket tarayıcıda uydurulur (sentetik); önizleme hiçbir yazma göndermez, yazma düğmesi göstermez.
  test('Önizleme: paket kimliğiyle açılır, yazma düğmesi yok, görünümler açılır, yazma gitmez, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    const paket = {
      id: 'ekran-deneme-1', no: 'IE-EKRAN-1', opType: 'cnc', st: {}, partNo: 'EK-1', part: 'Ekran deneme parçası', rev: 'A', op: 'Op 10', machine: '',
      target: 10, cycle: 30, due: '', priority: 'normal', material: '', note: '', files: [], primary: null,
      plan: [{ id: 1, nom: '20', tol: '0.1', min: 19.9, max: 20.1, tool: 'Kumpas', freq: 'İlk parça' }], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
      status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
    };
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: paket.id, surum: 1, govde: paket }] } }));
    await ac(`/arkon/onizle/${paket.id}`);
    await expect(page.getByText('IE-EKRAN-1').first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'İş durumu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Çağrı' })).toHaveCount(0);
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    const alt = page.getByRole('navigation', { name: 'Terminal görünümleri' });
    if (await alt.isVisible()) {
      for (const b of await alt.getByRole('button').all()) {
        await b.click();
        await expect(b).toHaveAttribute('aria-current', 'page');
        expect(await tasma(page), await b.innerText()).toBeLessThanOrEqual(0);
      }
    } else {
      const sekmeler = page.getByRole('tablist', { name: 'İş ayrıntısı' });
      for (const s of await sekmeler.getByRole('tab').all()) {
        await s.click();
        await expect(s).toHaveAttribute('aria-selected', 'true');
        expect(await tasma(page), await s.innerText()).toBeLessThanOrEqual(0);
      }
    }
    expect(yazmalar(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  // 888: iş çarkı tek işte dönmez gibi görünmez, kısa pencerede (900 px) üretim bölümü iş kartının üstüne binmez, fareyle sürükleme
  // çark alanının dışında bırakılsa da sayılır. Paketler tarayıcıda uydurulur (sentetik); hiçbir yazma gitmez.
  test.describe('888 iş çarkı', () => {
    test.use({ hesap: 'ornek.operator1' });
    const paket = (i: number) => ({
      id: `ekran-cark-${String(i)}`, no: `IE-CARK-${String(i)}`, opType: 'cnc', st: {}, partNo: `EK-${String(i)}`, part: `Çark deneme ${String(i)}`, rev: 'A', op: 'Op 10',
      machine: 'ORN-TORNA-1', target: 25, cycle: 30, due: '2026-10-28', priority: 'urgent', material: '', note: '', files: [], primary: null,
      // Ölçü planı numune şeridini (Şimdi) getirir; binme o şeritte görünüyordu.
      plan: [{ id: 1, nom: '20', tol: '0.1', min: 19.9, max: 20.1, tool: 'Kumpas', freq: 'Her 100 parça' }], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
      status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
    });
    const ac900 = async (page: Page, ac: (yol: string) => Promise<void>, n: number, boy = { width: page.viewportSize()?.width ?? 1280, height: 900 }) => {
      await page.setViewportSize(boy);
      await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: Array.from({ length: n }, (_, i) => ({ kimlik: paket(i).id, surum: 1, govde: paket(i) })) } }));
      await ac('/uretim-terminali');
      const cark = page.getByRole('region', { name: 'İş ve makine çarkı' });
      await expect(cark).toBeVisible();
      return cark;
    };

    // Görünen bölümler sayfa sırasıyla alt alta durur; biri öncekinin üstüne çıkmaz.
    const altAlta = async (page: Page) => {
      const kutular = await page.evaluate(() => ['.tc-ay1-tcark', '.tc-ay1-aktif', ':is(.tc-ay1-sahne > :first-child, .tc-ay1-simdi)', '.tc-ay1-sayac']
        .map((s) => document.querySelector(s)?.getBoundingClientRect())
        .filter((b): b is DOMRect => !!b && b.height > 0)
        .map((b) => [Math.round(b.top), Math.round(b.bottom)] as const));
      expect(kutular.length, JSON.stringify(kutular)).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < kutular.length; i++) expect(kutular[i]![0], JSON.stringify(kutular)).toBeGreaterThanOrEqual(kutular[i - 1]![1]);
    };

    // Kullanıcının bildirdiği geniş pencereler: binme 900 px'ten yüksek pencerede de oluyordu (1600x1000'de 14 px).
    for (const boy of [{ width: 1440, height: 960 }, { width: 1600, height: 1000 }]) {
      test(`${String(boy.width)}x${String(boy.height)} pencerede çark, iş kartı, Şimdi şeridi ve sayaç üst üste binmez`, async ({ page, ag, ac }, bilgi) => {
        test.skip(bilgi.project.name !== 'g1280', 'pencere boyu testin kendisinde');
        await ac900(page, ac, 3, boy);
        await altAlta(page);
        expect(await tasma(page)).toBeLessThanOrEqual(0);
        expect(yazmalar(ag.yazmalar)).toEqual([]);
        expect(ag.hatalar).toEqual([]);
      });
    }

    test('tek işte ok, sıra ve ipucu yok; 900 px yükseklikte çark, iş kartı, Şimdi şeridi ve sayaç üst üste binmez', async ({ page, ag, ac }) => {
      const cark = await ac900(page, ac, 1);
      await expect(cark.getByRole('button', { name: /İşler · 1/ })).toBeVisible();
      await expect(cark.getByRole('button', { name: 'Sonraki: işler' })).toHaveCount(0);
      await expect(cark.getByText('1 / 1')).toHaveCount(0);
      await altAlta(page);
      expect(await tasma(page)).toBeLessThanOrEqual(0);
      expect(yazmalar(ag.yazmalar)).toEqual([]);
      expect(ag.hatalar).toEqual([]);
    });

    test('fareyle sürükleme çark alanının dışında bırakılsa da bir adım çevirir; ekrandaki iş değişmez', async ({ page, ag, ac }) => {
      const cark = await ac900(page, ac, 4);
      await expect(cark.getByText('1 / 4')).toBeVisible();
      const sahne = cark.getByRole('group', { name: 'İşler' });
      const b = (await sahne.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 - 30, b.y + b.height / 2, { steps: 3 });
      await page.mouse.move(Math.max(1, b.x - 10), b.y + b.height + 120, { steps: 5 });
      await page.mouse.up();
      await expect(cark.getByText('2 / 4')).toBeVisible();
      await expect(cark.getByText(/Önizleme · ekrandaki iş değişmez/)).toBeVisible();
      expect(yazmalar(ag.yazmalar)).toEqual([]);
      expect(ag.hatalar).toEqual([]);
    });

    // Düzeltme yetkisi olan kişide sayaçta beş tuş durur: üstte İyi +1 ve Hurda +1, altında düzeltme (−1) tuşları tek kısa sırada
    // (1046 a), en altta Toplu giriş. Tuşlar sayacın içinde, Şimdi şeridinin altında kalır, kadran küçülüp yazıları üst üste gelmez.
    test.describe('düzeltme tuşlarıyla', () => {
      test.use({ hesap: 'ornek.yonetici' });
      for (const boy of [{ width: 1280, height: 900 }, { width: 1600, height: 1000 }, { width: 1920, height: 1080 }]) {
        test(`${String(boy.width)}x${String(boy.height)}: sayaç tuşları sayaçtan taşmaz, Şimdi şeridine binmez`, async ({ page, ag, ac }, bilgi) => {
          test.skip(bilgi.project.name !== 'g1280', 'pencere boyu testin kendisinde');
          await page.addInitScript(() => { localStorage.setItem('arkon:station', JSON.stringify('ORN-TORNA-1')); });
          await ac900(page, ac, 2, boy);
          const sayac = page.locator('.tc-ay1-sahne > .tc-ay1-sayac');
          await expect(sayac.locator('.tc-ay1-tus')).toHaveCount(5);
          const sira = await sayac.locator('.tc-ay1-tus').evaluateAll((ts) => ts.map((t) => {
            const b = t.getBoundingClientRect();
            return { ad: t.textContent, ust: Math.round(b.top), boy: Math.round(b.height) };
          }));
          const s = JSON.stringify(sira);
          expect(sira.map((t) => t.ad), s).toEqual(['İyi +1', 'Hurda +1', 'İyi −1', 'Hurda −1', 'Toplu giriş']);
          expect(sira[0]!.ust, s).toBe(sira[1]!.ust);
          expect(sira[2]!.ust, s).toBe(sira[3]!.ust);
          expect(sira[2]!.ust, s).toBeGreaterThan(sira[0]!.ust);
          expect(sira[4]!.ust, s).toBeGreaterThan(sira[2]!.ust);
          // Düzeltme sırası büyük sayım tuşlarından kısadır; iki tam sıra Durdur, Duraklat ve Bitir'i aşağı itiyordu.
          expect(sira[2]!.boy, s).toBeLessThan(sira[0]!.boy);
          expect(sira[3]!.boy, s).toBe(sira[2]!.boy);
          const o = await page.evaluate(() => {
            const k = (s: string) => { const b = document.querySelector(s)!.getBoundingClientRect(); return { ust: Math.round(b.top), alt: Math.round(b.bottom), boy: Math.round(b.height) }; };
            return { simdi: k('.tc-ay1-sahne > :first-child'), sayac: k('.tc-ay1-sahne > .tc-ay1-sayac'), tuslar: k('.tc-ay1-sahne > .tc-ay1-sayac .tc-ay1-tuslar'), kadran: k('.tc-ay1-sahne > .tc-ay1-sayac .tc-ay1-kadran') };
          });
          const m = JSON.stringify(o);
          expect(o.tuslar.ust, m).toBeGreaterThanOrEqual(o.sayac.ust);
          expect(o.tuslar.alt, m).toBeLessThanOrEqual(o.sayac.alt);
          expect(o.tuslar.ust, m).toBeGreaterThanOrEqual(o.simdi.alt);
          // Kadran en az iki tuş sırası boyundadır; daha küçükte etiket, sayı ve hurda satırı üst üste biniyordu.
          expect(o.kadran.boy, m).toBeGreaterThanOrEqual(150);
          expect(await tasma(page)).toBeLessThanOrEqual(0);
          expect(yazmalar(ag.yazmalar)).toEqual([]);
          expect(ag.hatalar).toEqual([]);
        });
      }
    });
  });
});

// A3 ve A4: her sayfa üç genişlikte açılır, bölümü görünür, yatay taşmaz, açılışta belge yazmaz (eski ekran açılışta numuneyi "Ölçülüyor"
// yapıyordu; yeni ekran seçilince yapar). Örnek veritabanının içeriğine bağlı değildir.
const GENISLIKLER = [360, 768, 1280] as const;
const belgeYazmalari = (l: readonly string[]) => l.filter((y) => /^POST \/api\/arkon\/belgeler\/.+\/(yaz|sil)$/.test(y));

for (const [parca, sayfalar] of [
  ['A3 Pano ve kuyruk', [['pano', 'Pano'], ['planlama', 'Plan Kuyruğu'], ['kuyruk', 'Kuyruk'], ['anomali', 'Üretim Anomalisi']]],
  ['A4 Kalite, bakım, raporlar', [['kalite', 'Kalite'], ['bakim', 'Bakım'], ['raporlar', 'Raporlar']]],
] as const) {
  test.describe(parca, () => {
    for (const [anahtar, ad] of sayfalar) {
      for (const genislik of GENISLIKLER) {
        test(`${ad} ${String(genislik)} genişlikte açılır, taşmaz, açılışta yazmaz`, async ({ page, ag, ac }) => {
          await page.setViewportSize({ width: genislik, height: 900 });
          await ac(`/arkon/${anahtar}`);
          const bolum = page.getByRole('region', { name: ad });
          await expect(bolum).toBeVisible();
          await expect(bolum.getByRole('heading').first()).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
          expect(belgeYazmalari(ag.yazmalar)).toEqual([]);
          expect(ag.hatalar).toEqual([]);
        });
      }
    }
  });
}

test.describe('A3 Pano ve kuyruk · yetki', () => {
  test('yönetici Plan Kuyruğu\'nda planlı duruş ekleyebilir; Kuyruk salt okunurdur', async ({ page, ac }) => {
    await ac('/arkon/planlama');
    const bolum = page.getByRole('region', { name: 'Plan Kuyruğu' });
    await bolum.getByRole('button', { name: /Planlı duruşlar/ }).click();
    await expect(bolum.getByRole('button', { name: 'Planlı duruş ekle' })).toBeVisible();
    await ac('/kuyruk');
    await expect(page.getByRole('region', { name: 'Kuyruk' }).getByRole('button', { name: /^(Yukarı|Aşağı)$/ })).toHaveCount(0);
  });
});

// Kuyruk eski adresine geçti (541, 527 1 a): /kuyruk yeni ekrandır. Eski görünüm yalnız yöneticidedir (681 a): yönetici kişi menüsündeki
// "Eski görünüm" ile /kuyruk/eski'ye gider, "Yeni görünüm" geri getirir; operatörde geçiş yoktur, eski adres kapalıdır.
test.describe('541 Kuyruk eski adreste', () => {
  test('yönetici eski görünüme gidip döner', async ({ page, ag, ac }) => {
    await ac('/kuyruk');
    await expect(page.getByRole('region', { name: 'Kuyruk' })).toBeVisible();
    await page.getByRole('button', { name: 'Hesap' }).click();
    await page.getByRole('menuitem', { name: 'Eski görünüm' }).click();
    await expect(page).toHaveURL(/\/kuyruk\/eski$/);
    await expect(page.locator('iframe')).toHaveCount(1);
    await page.getByRole('button', { name: 'Hesap' }).click();
    await page.getByRole('menuitem', { name: 'Yeni görünüm' }).click();
    await expect(page).toHaveURL(/\/kuyruk$/);
    await expect(page.getByRole('region', { name: 'Kuyruk' })).toBeVisible();
    expect(ag.hatalar).toEqual([]);
  });

  test.describe('operatör', () => {
    test.use({ hesap: 'ornek.operator1' });
    test('operatör /kuyruk\'ta yeni Kuyruk\'u görür; eski görünüm geçişi yoktur, eski adres kapalıdır', async ({ page, ag, ac }) => {
      await ac('/kuyruk');
      await expect(page.getByRole('region', { name: 'Kuyruk' })).toBeVisible();
      await expect(page.locator('iframe')).toHaveCount(0);
      // Eski sayfadaki tek maddelik şerit durur (553 1 a); telefonda çizilmez, sayfa kendi başlığını taşır (618c).
      await tekSerit(page, 'Kuyruk');
      await page.getByRole('button', { name: 'Hesap' }).click();
      await expect(page.getByRole('menuitem').first()).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /görünüm$/ })).toHaveCount(0);
      expect(ag.hatalar).toEqual([]);
      await ac('/kuyruk/eski');
      await expect(page.getByRole('heading', { name: 'Yetkiniz yok' })).toBeVisible();
      await expect(page.locator('iframe')).toHaveCount(0);
    });
  });
});

test.describe('A4 Kalite, bakım, raporlar · yetki', () => {
  test('yönetici Bakım\'da arıza açabilir ve plan ekleyebilir; Kalite görünümleri yetkiye göre gelir', async ({ page, ac }) => {
    await ac('/arkon/bakim');
    const bakim = page.getByRole('region', { name: 'Bakım' });
    await bakim.getByRole('button', { name: 'Arızalar' }).click();
    await expect(bakim.getByRole('button', { name: 'Arıza kaydı aç' })).toBeVisible();
    await bakim.getByRole('button', { name: /Periyodik bakım/ }).click();
    await expect(bakim.getByRole('button', { name: 'Bakım planı ekle' })).toBeVisible();
    await ac('/arkon/kalite');
    const kalite = page.getByRole('group', { name: 'Kalite görünümü' });
    for (const ad of ['Numuneler', 'SPC · rapor', 'Onaylar', 'Ölçü aletleri']) await expect(kalite.getByRole('button', { name: new RegExp(`^${ad}`) })).toBeVisible();
  });
});

// A5: dosyalar sentetiktir (küp STL ve tek satırlık PDF, kod içinde üretilir); paket listesi bu testte ağdan verilir, sunucuya yazılmaz.
const b64 = (s: string) => Buffer.from(s, 'latin1').toString('base64');
function kupStl(a: number): string {
  const v = [[0, 0, 0], [a, 0, 0], [a, a, 0], [0, a, 0], [0, 0, a], [a, 0, a], [a, a, a], [0, a, a]] as const;
  const y = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return 'solid deneme\n' + y.map((u) => ' facet normal 0 0 0\n  outer loop\n' + u.map((i) => `   vertex ${v[i]!.join(' ')}\n`).join('') + '  endloop\n endfacet\n').join('') + 'endsolid deneme\n';
}
function tekSatirPdf(metin: string): string {
  const akis = `BT /F1 18 Tf 120 400 Td (${metin}) Tj ET`;
  const nesneler = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${String(akis.length)} >>\nstream\n${akis}\nendstream`,
  ];
  let govde = '%PDF-1.4\n';
  const yer: number[] = [];
  nesneler.forEach((n, i) => { yer.push(govde.length); govde += `${String(i + 1)} 0 obj\n${n}\nendobj\n`; });
  const xref = govde.length;
  govde += `xref\n0 ${String(nesneler.length + 1)}\n0000000000 65535 f \n` + yer.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  return govde + `trailer\n<< /Size ${String(nesneler.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
}
const paket = (id: string, no: string, ad: string, kind: 'pdf' | 'model', icerik: string) => ({
  kimlik: id, surum: 1, govde: { id, no, part: 'Deneme parca', files: [{ kind, name: ad, bytes: { $ta: 'u8', b: b64(icerik) } }], primary: ad, plan: [], updatedAt: 1 },
});

test.describe('A5 Çizim', () => {
  test('Çizim stüdyosu: dosya, önizleme ve ayar panelleri açılır; açılışta yazma yok, dışarı istek yok, sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    const disari: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(ADRES) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) disari.push(r.url()); });
    await ac('/arkon/cizim');
    const dosyalar = page.getByRole('complementary', { name: 'Dosyalar' });
    await expect(dosyalar.getByText('PDF eklenmedi')).toBeVisible();
    await expect(dosyalar.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    const ayar = page.getByRole('complementary', { name: 'Okuma ayarları' });
    const kip = page.getByRole('group', { name: 'Görünüm' });
    // 1280'de eski ekrandaki gibi üç sütun yan yana (Soru 282); darda tek panel ve Dosya/Önizleme/Ayarlar düğmeleri.
    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      await expect(kip).toBeHidden();
      const kutular = await Promise.all([dosyalar, page.getByRole('region', { name: 'Çizim önizlemesi' }), ayar].map((k) => k.boundingBox()));
      const [d, c, a] = kutular.map((k) => { if (!k) throw new Error('panel görünmüyor'); return k; });
      expect(d!.x + d!.width).toBeLessThanOrEqual(c!.x);
      expect(c!.x + c!.width).toBeLessThanOrEqual(a!.x);
      expect(Math.abs(d!.y - a!.y)).toBeLessThan(2);
      // Eski labmain gibi ekranın kalanını doldurur (denetim E11: yarım yükseklikte kalıyordu).
      const boy = page.viewportSize()?.height ?? 0;
      expect(a!.y + a!.height, 'ayar paneli ekran boyunca').toBeGreaterThan(boy * 0.9);
    } else {
      await expect(kip).toBeVisible();
      await kip.getByRole('button', { name: 'Ayarlar' }).click();
    }
    await expect(ayar.getByRole('tab')).toHaveText(['PDF', '3B model', 'Tanı']);
    await ayar.getByRole('tab', { name: '3B model' }).click();
    await expect(ayar.getByRole('switch', { name: 'Gizli çizgiler' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler'))).toEqual([]);
    expect(disari).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Teknik resim: STL modelden resim ve ölçü önerisi, 3B görünüm; PDF dosyasından ölçü önerisi; açmak yazmaz', async ({ page, ag, ac }) => {
    test.setTimeout(90_000);
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({
      json: { belgeler: [paket('p-stl', 'IE-DENEME-STL', 'kup.stl', 'model', kupStl(40)), paket('p-pdf', 'IE-DENEME-PDF', 'deneme.pdf', 'pdf', tekSatirPdf('40 +/-0.1'))] },
    }));
    await ac('/arkon/cizim');
    const dosyalar = page.getByRole('complementary', { name: 'Dosyalar' });
    await dosyalar.getByRole('button', { name: /IE-DENEME-STL/ }).click();
    const resim = page.getByRole('region', { name: 'Teknik resim' });
    await expect(resim.getByRole('img', { name: 'Teknik resim kup' })).toBeVisible({ timeout: 30_000 });
    await expect(resim.getByRole('dialog', { name: 'Ölçü önerileri' })).toBeVisible({ timeout: 30_000 });
    await resim.getByRole('button', { name: '3B model' }).click();
    await expect(resim.locator('.tc-ay5-3b-sahne canvas')).toBeVisible({ timeout: 30_000 });
    await expect(resim.getByRole('alert')).toHaveCount(0);

    const kip = page.getByRole('group', { name: 'Görünüm' });
    if (await kip.isVisible()) await kip.getByRole('button', { name: 'Dosya' }).click();
    await dosyalar.getByRole('button', { name: /IE-DENEME-PDF/ }).click();
    await expect(resim.locator('img.tc-ay5-pdf')).toBeVisible({ timeout: 30_000 });
    const oneriler = resim.getByRole('dialog', { name: 'Ölçü önerileri' });
    await expect(oneriler.getByText(/ölçü bulundu/)).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler'))).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('A6 Ayarlar ve çağrı bandı', () => {
  test('Ayarlar: yöneticide bölümler açılır, açılışta yazma yok, salt okunur listeler kilitli; sayfa yatay taşmaz', async ({ page, ag, ac }) => {
    await ac('/arkon/ayarlar');
    const bolum = page.getByRole('region', { name: 'Ayarlar' });
    const sekmeler = bolum.getByRole('tablist', { name: 'Ayarlar bölümleri' });
    await expect(sekmeler.getByRole('tab')).toHaveText(['Genel', 'Tesis', 'Kişiler ve yetkiler', 'Üretim', 'Sistem']);
    await expect(bolum.getByRole('heading', { name: 'Ekran modülleri' })).toBeVisible();
    // Eski setmain gibi 1280'de Genel'in üç kartı tek satırda (denetim E12).
    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      const ustler = await Promise.all(['Örnek Yönetici', 'Ekran modülleri', 'PDF ve 3B okuma']
        .map(async (b) => (await bolum.getByRole('heading', { name: b, exact: true }).first().boundingBox())?.y ?? -1));
      expect(new Set(ustler.map((y) => Math.round(y))).size, ustler.join(',')).toBe(1);
    }
    for (const [sekme, metin] of [
      ['Tesis', /İstasyonlar sayfasından değiştirilir/], ['Kişiler ve yetkiler', /Roller sayfasından değiştirilir/],
      ['Üretim', /Vardiya sayfasından değiştirilir/], ['Sistem', /Yedekleme TMI sunucusunda yapılır/],
    ] as const) {
      await sekmeler.getByRole('tab', { name: sekme }).click();
      await expect(bolum.getByText(metin)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler'))).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

// Üretim Hazırlık ve Üretim Terminali eski adresine geçti (541, 553 2): menü ve eski adres yeni ekranı açar, eski çerçeve kişi menüsündeki
// "Eski görünüm" ile `/eski` altında açılır, "Yeni görünüm" geri getirir.
test.describe('541 Üretim Hazırlık ve Üretim Terminali eski adreste', () => {
  const gecis = async (page: Page, ad: 'Eski görünüm' | 'Yeni görünüm') => {
    await page.getByRole('button', { name: 'Hesap' }).click();
    await page.getByRole('menuitem', { name: ad }).click();
  };

  test('Hazırlık: /arkon/kalite yeni ekrandır; eski görünümde aynı sayfa çerçevede açılır, şeritte Kalite seçilidir', async ({ page, ag, ac }) => {
    await ac('/arkon/kalite');
    await expect(page.getByRole('region', { name: 'Kalite' })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await gecis(page, 'Eski görünüm');
    await expect(page).toHaveURL(/\/arkon\/eski\/kalite$/);
    await expect(page.locator('iframe')).toHaveCount(1);
    const serit = page.getByRole('navigation', { name: 'Üretim Hazırlık menüsü' });
    await expect(serit.locator('[aria-current="page"]')).toHaveText(/^Kalite/);
    await gecis(page, 'Yeni görünüm');
    await expect(page).toHaveURL(/\/arkon\/kalite$/);
    await expect(page.getByRole('region', { name: 'Kalite' })).toBeVisible();
    expect(ag.hatalar).toEqual([]);
  });

  test.describe('operatör', () => {
    test.use({ hesap: 'ornek.operator1' });
    // Operatör yalnız yeni terminali görür (681 a): geçiş yoktur, eski adres kapalıdır.
    test('/uretim-terminali yeni ekrandır, tek maddelik şerit durur; eski görünüm geçişi yoktur', async ({ page, ag, ac }) => {
      await ac('/uretim-terminali');
      await expect(page.getByRole('region', { name: 'Üretim Terminali' })).toBeVisible();
      await expect(page.locator('iframe')).toHaveCount(0);
      await tekSerit(page, 'Üretim Terminali');
      await page.getByRole('button', { name: 'Hesap' }).click();
      await expect(page.getByRole('menuitem').first()).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /görünüm$/ })).toHaveCount(0);
      expect(ag.hatalar).toEqual([]);
    });
  });
});

// Her rolde görünürlük eşitliği (553 2): bir sayfayı eski görünümde gören yeni ekranda da görür, görmeyen görmez. Eskide görmek, şeritte
// maddenin olması (TMI işlemi) ve çerçevenin sayfada kalmasıdır (Arkon rolü; göremediği sayfadan ilk sayfasına geçer). Yenide görmek,
// adresin değişmeden o sayfanın bölümünü açmasıdır. Üretim Terminali ve Kuyruk ayrı sayfadır: menü satırı yerine kendi adresi denenir.
// Ölçü tek genişlikte alınır: görünürlük genişliğe bağlı değildir.
const HAZIRLIK_SAYFALARI = ['pano', 'planlama', 'hazirlik', 'anomali', 'kalite', 'bakim', 'raporlar', 'cizim', 'ayarlar'] as const;
const AYRI_SAYFALAR = [['operator', '/uretim-terminali', ''], ['kuyruk', '/kuyruk', 'kuyruk']] as const;

// Eski çerçevenin açtığı sayfa: çerçeve göremediği sayfada hiçbir şey çizmeden ilk sayfasına geçer; ilk çizimde adres işareti son hâlidir.
// Kabuğun kapalı sayfa yanıtları: sayfa işlemi yok (Yetkiniz yok) ya da ekran sayfayı tanımıyor ya da açmıyor.
const kapali = (page: Page) => page.getByRole('heading', { name: 'Yetkiniz yok' }).or(page.getByText('Bu sayfa bulunamadı ya da size açık değil.'));

async function eskiAcilan(page: Page): Promise<string | null> {
  const iframe = page.locator('main iframe');
  await expect(iframe.or(kapali(page)).first()).toBeAttached({ timeout: 15_000 });
  if (await iframe.count() === 0) return null;
  const f = await cerceve(page);
  await expect(f.locator('#root > *').first()).toBeAttached({ timeout: 15_000 });
  return f.evaluate(() => decodeURIComponent(location.hash.replace(/^#/, '')));
}

async function yeniAcilan(page: Page, adres: string): Promise<string | null> {
  const bolum = page.locator('main [data-sayfa]');
  await expect(bolum.or(kapali(page)).first()).toBeAttached({ timeout: 15_000 });
  if (await bolum.count() === 0 || new URL(page.url()).pathname !== adres) return null;
  return bolum.first().getAttribute('data-sayfa');
}

// Eski görünüm yalnız yöneticidedir (681 a): eşitlik yöneticide ölçülür. Başka hesapta eski adresler kapalıdır ve yeni ekranda açılan
// sayfalar 681 öncesi eşitlik ölçümünün listesidir (o gün eskide görülenle aynıydı); liste değişirse görünürlük değişmiştir.
const YENIDE_ACILAN: Readonly<Record<Exclude<Hesap, 'ornek.yonetici'>, readonly string[]>> = {
  'ornek.mudur': ['pano', 'planlama', 'kalite', 'bakim', 'raporlar', 'ayarlar', 'operator', 'kuyruk'],
  'ornek.planlama': ['pano', 'planlama', 'hazirlik', 'anomali', 'kalite', 'raporlar', 'cizim', 'ayarlar', 'kuyruk'],
  'ornek.operator1': ['operator', 'kuyruk'],
  'ornek.operator2': ['operator', 'kuyruk'],
  'ornek.kalite': ['pano', 'kalite', 'raporlar', 'ayarlar'],
  'ornek.depo': [],
  'ornek.satis': [],
  'ornek.satinalma': [],
  'ornek.muhasebe': [],
};

for (const hesap of HESAPLAR) {
  test.describe(`553 2 görünürlük eşitliği · ${hesap}`, () => {
    test.use({ hesap });
    test('eski ve yeni görünümde aynı sayfalar açılır', async ({ page, ac }, bilgi) => {
      test.skip(bilgi.project.name !== 'g1280', 'görünürlük genişliğe bağlı değil');
      test.setTimeout(240_000);
      const yeni: string[] = [];
      if (hesap !== 'ornek.yonetici') {
        for (const s of HAZIRLIK_SAYFALARI) {
          await ac(`/arkon/${s}`);
          if (await yeniAcilan(page, `/arkon/${s}`) === s) yeni.push(s);
        }
        for (const [s, yol] of AYRI_SAYFALAR) {
          await ac(yol);
          if (await yeniAcilan(page, yol) === s) yeni.push(s);
        }
        for (const yol of ['/arkon/eski/pano', '/kuyruk/eski', '/uretim-terminali/eski']) {
          await ac(yol);
          await expect(page.getByRole('heading', { name: 'Yetkiniz yok' }), yol).toBeVisible();
          await expect(page.locator('main iframe'), yol).toHaveCount(0);
        }
        expect(yeni, `${hesap}: yeni ekranda açılan sayfalar`).toEqual(YENIDE_ACILAN[hesap]);
        return;
      }
      const eski: string[] = [];
      await ac('/arkon/eski/pano');
      const serit = page.getByRole('navigation', { name: 'Üretim Hazırlık menüsü' });
      const seritte = new Set<string>();
      if (await serit.count() > 0) {
        for (const h of await serit.getByRole('link').evaluateAll((l) => l.map((a) => a.getAttribute('href') ?? ''))) seritte.add(h);
      }
      for (const s of HAZIRLIK_SAYFALARI) {
        await ac(`/arkon/eski/${s}`);
        if (seritte.has(`/arkon/${s}`) && await eskiAcilan(page) === s) eski.push(s);
        await ac(`/arkon/${s}`);
        if (await yeniAcilan(page, `/arkon/${s}`) === s) yeni.push(s);
      }
      for (const [s, yol, isaret] of AYRI_SAYFALAR) {
        await ac(`${yol}/eski`);
        if (await eskiAcilan(page) === isaret) eski.push(s);
        await ac(yol);
        if (await yeniAcilan(page, yol) === s) yeni.push(s);
      }
      bilgi.annotations.push({ type: 'eskide görülen', description: eski.join(', ') });
      expect(yeni, `${hesap}: eskide görülen sayfalar`).toEqual(eski);
    });
  });
}
