import { expect, test } from './ortak.ts';

// Tam ekran pencere (borç 119, atölye isteği 7.1) her genişlikte bütün görüntüyü kaplar, köşesizdir, uygulama çerçevesinin
// ve üst çubuğun üstündedir; gövde üst satırın altında kalan yüksekliği alır.
test('tam ekran pencere bütün görüntüyü kaplar, gövde kalan yüksekliği alır', async ({ page, ac }) => {
  await ac('/');
  await page.evaluate(() => {
    const perde = document.createElement('div');
    perde.className = 'tc-perde';
    perde.innerHTML = `<div class="tc-pencere tc-pencere-tam" role="dialog" aria-label="Deneme">
      <div id="deneme-ust" style="height:40px">araçlar</div><div class="tc-pencere-govde" id="deneme-govde"></div></div>`;
    document.body.append(perde);
  });
  const boyut = page.viewportSize()!;
  const olc = await page.evaluate(() => {
    const p = document.querySelector('.tc-pencere-tam')!;
    const g = document.querySelector('#deneme-govde')!;
    const s = getComputedStyle(p);
    const k = p.getBoundingClientRect();
    const gk = g.getBoundingClientRect();
    return {
      x: k.x, y: k.y, en: k.width, boy: k.height, kose: s.borderTopLeftRadius, kenar: s.borderTopWidth,
      govdeUst: gk.top, govdeBoy: gk.height, z: getComputedStyle(p.parentElement!).zIndex,
    };
  });
  expect(olc).toEqual({
    x: 0, y: 0, en: boyut.width, boy: boyut.height, kose: '0px', kenar: '0px', govdeUst: 40, govdeBoy: boyut.height - 40, z: '40',
  });
});
