import { expect, test } from './ortak.ts';

// Her sayfada en çok bir birincil (sarı) düğme (kullanıcı kararı 2155-9 a, 06.11.2026): ikincisi çizgili olur, izleme sayfası
// birincil taşımaz. Menüdeki bütün sayfalar gezilir; içerikteki görünür birincil düğmeler sayılır (kabuk sayılmaz).
// BORC bugün kuralı aşan dış modül sayfalarıdır: ekranları teslim olduğu gibidir, bulgu modülün UYUM-BORCU.md dosyasında
// "bağlamada kapanacak" başlığındadır. Sayı yalnız düşebilir; yeni sayfa ya da artan sayı testi düşürür.
test.use({ hesap: 'ornek.yonetici' });

const BORC: Readonly<Record<string, number>> = {
  '/ayarlar': 15,
  '/cnc-kurulum': 3,
  '/plan': 3,
  '/recete-rota/plan': 3,
  '/ik': 3,
  '/degisiklik-yonetimi': 2,
  '/recete-rota': 2,
  '/recete-rota/schema': 2,
  '/finans': 2,
  '/finans/firmalar': 2,
  '/stok/mal-kabul': 2,
  '/stok/malzemeler': 2,
};

test('her sayfada en çok bir birincil düğme; bugünkü aşımlar borç listesindedir ve artmaz', async ({ page, ac }, bilgi) => {
  test.skip(bilgi.project.name !== 'g1280', 'düğme sayısı genişliğe bağlı değil; bir genişlikte sınanır');
  test.setTimeout(600_000);
  await ac('/');
  const tumu = page.getByTitle('Tüm sayfalar');
  if (await tumu.count()) await tumu.first().click();
  const yollar = await page.evaluate(() => [...new Set(
    [...document.querySelectorAll('a[href^="/"]')].map((a) => (a.getAttribute('href') ?? '').split(/[?#]/)[0] ?? ''),
  )].filter((y) => y !== '' && !/cikis|oturum/.test(y)));
  expect(yollar.length).toBeGreaterThan(20);

  const asan: string[] = [];
  for (const yol of ['/', ...yollar.filter((y) => y !== '/')]) {
    await ac(yol);
    const sayi = await page.evaluate(() => {
      const kok = document.querySelector('main.tc-kabuk-icerik') ?? document.body;
      return [...kok.querySelectorAll<HTMLElement>('.tc-dugme-birincil')].filter((d) => {
        const k = d.getBoundingClientRect();
        return k.width > 0 && k.height > 0 && getComputedStyle(d).visibility !== 'hidden';
      }).length;
    });
    const sinir = BORC[yol] ?? 1;
    if (sayi > sinir) asan.push(`${yol}: ${String(sayi)} birincil (sınır ${String(sinir)})`);
  }
  expect(asan).toEqual([]);
});
