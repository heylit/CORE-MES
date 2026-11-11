import { expect, test } from './ortak.ts';

// Her sayfada en çok bir birincil (sarı) düğme (kullanıcı kararı 2155-9 a, 06.11.2026): ikincisi çizgili olur, izleme sayfası
// birincil taşımaz. Menüdeki bütün sayfalar gezilir; içerikteki görünür birincil düğmeler sayılır (kabuk sayılmaz).
// BORC bugün kuralı aşan dış modül sayfalarıdır: ekranları teslim olduğu gibidir, bulgu modülün UYUM-BORCU.md dosyasında
// "bağlamada kapanacak" başlığındadır. Sayı yalnız düşebilir; yeni sayfa ya da artan sayı testi düşürür.
// Sayım veri yüklenince ve sayı art arda üç okumada aynı kalınca yapılır. Satır başına birincil taşıyan liste (sayısı günün
// verisine bağlı) HARIC'te sayılmaz; o borç da modülün UYUM-BORCU.md dosyasındadır.
test.use({ hesap: 'ornek.yonetici' });

const BORC: Readonly<Record<string, number>> = {
  '/ayarlar': 15,
  '/cnc-kurulum': 3,
  '/plan': 3,
  // Planlama'nın ikinci menü görünümleri (B-2483-48): ekranlar teslim olduğu gibidir; sayı yalnız düşebilir.
  '/plan/studio': 3,
  '/plan/ysiparis': 3,
  '/plan/terminler': 3,
  '/plan/denge': 3,
  '/plan/maliyet': 2,
  '/plan/giderler': 2,
  '/plan/mesaiplan': 2,
  '/plan/fasonplan': 2,
  '/plan/malzplan': 2,
  '/plan/yillik': 2,
  '/plan/ufuk': 2,
  '/plan/sevkiyat': 2,
  '/recete-rota/plan': 3,
  '/ik': 3,
  '/degisiklik-yonetimi': 2,
  '/recete-rota': 2,
  '/recete-rota/schema': 2,
  '/finans/firmalar': 2,
  '/stok/mal-kabul': 2,
  '/stok/malzemeler': 2,
};

const HARIC: Readonly<Record<string, string>> = {
  // Finans yapılacaklar listesi: her satırda bir birincil (Tahsilat gir, Ödeme gir, Tahsil edildi, Ödendi).
  '/finans': '.tc-fa-is-eylem',
};

test('her sayfada en çok bir birincil düğme; bugünkü aşımlar borç listesindedir ve artmaz', async ({ page, ac }, bilgi) => {
  test.skip(bilgi.project.name !== 'g1280', 'düğme sayısı genişliğe bağlı değil; bir genişlikte sınanır');
  test.setTimeout(600_000);
  await ac('/');
  const yollar: string[] = await page.evaluate(() => [...new Set(
    [...document.querySelectorAll('a[href^="/"]')].map((a) => (a.getAttribute('href') ?? '').split(/[?#]/)[0] ?? ''),
  )].filter((y) => y !== '' && !/cikis|oturum/.test(y)));
  expect(yollar.length).toBeGreaterThan(20);
  // Planlama'nın alt görünümleri yalnız ikinci menüdedir (B-2483-48): menüden toplanır, kök sayfayla birlikte ölçülür.
  await ac('/plan');
  await expect(page.locator('[data-gorunum]')).toBeVisible();
  const planlama = await page.evaluate(() => [...new Set(
    [...document.querySelectorAll('a[href^="/plan/"]')].map((a) => (a.getAttribute('href') ?? '').split(/[?#]/)[0] ?? ''),
  )]);
  expect(planlama.length).toBeGreaterThan(10);
  for (const y of planlama) if (!yollar.includes(y)) yollar.push(y);

  const asan: string[] = [];
  for (const yol of ['/', ...yollar.filter((y) => y !== '/')]) {
    await ac(yol);
    const say = () => page.evaluate((haric) => {
      const kok = document.querySelector('main.tc-kabuk-icerik') ?? document.body;
      if (kok.querySelector('[aria-busy="true"]')) return -1;
      return [...kok.querySelectorAll<HTMLElement>('.tc-dugme-birincil')].filter((d) => {
        const k = d.getBoundingClientRect();
        return k.width > 0 && k.height > 0 && getComputedStyle(d).visibility !== 'hidden' && (haric === null || d.closest(haric) === null);
      }).length;
    }, HARIC[yol] ?? null);
    // Yükleme sürerken sayı değişir: art arda üç aynı okuma (yarım saniye arayla) beklenir.
    let okumalar: number[] = [];
    await expect.poll(async () => {
      okumalar = [...okumalar, await say()].slice(-3);
      return okumalar.length === 3 && okumalar[0] !== -1 && okumalar.every((o) => o === okumalar[0]);
    }, { message: `${yol}: birincil sayısı durulmadı`, intervals: [500], timeout: 20_000 }).toBe(true);
    const sayi = okumalar[0] ?? 0;
    const sinir = BORC[yol] ?? 1;
    if (sayi > sinir) asan.push(`${yol}: ${String(sayi)} birincil (sınır ${String(sinir)})`);
  }
  expect(asan).toEqual([]);
});
