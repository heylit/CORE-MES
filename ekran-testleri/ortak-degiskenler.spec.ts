import { expect, test } from './ortak.ts';

// Ortak tasarım değişkenleri ve yardımcı sınıflar (borç 119, atölye isteği 7.2 ve 7.3): her değişken modüldeki bugünkü
// değeri birebir verir, modül değeri kendisi yazmadan ortaktan okur. Değer tarayıcının hesapladığı biçimde ölçülür.
const OLCULER: [degisken: string, ozellik: string, beklenen: string][] = [
  ['--ekran-boy-70', 'height', '70vh'], ['--ekran-boy-62', 'height', '62vh'], ['--ekran-boy-60', 'height', '60vh'],
  ['--ekran-boy-52', 'height', '52vh'], ['--ekran-boy-50', 'height', '50vh'], ['--ekran-boy-40', 'height', '40vh'],
  ['--oran-46', 'width', '46%'], ['--oran-55', 'width', '55%'], ['--oran-62', 'width', '62%'], ['--oran-70', 'width', '70%'],
  ['--cizgi-ince', 'width', '1px'], ['--cizgi-orta', 'width', '1.5px'], ['--cizgi', 'width', '2px'], ['--cizgi-kalin', 'width', '2.5px'],
  ['--dokunma-x14', 'width', 'calc(44px*1.4)'], ['--dokunma-x16', 'width', 'calc(44px*1.6)'], ['--dokunma-x18', 'width', 'calc(44px*1.8)'],
  ['--dokunma-x20', 'width', 'calc(44px*2)'], ['--dokunma-x24', 'width', 'calc(44px*2.4)'],
  ['--harita-kucuk-en', 'width', 'calc(112px*2)'], ['--harita-kucuk-boy', 'width', 'calc(112px*1.5)'], ['--harita-kucuk-en-dar', 'width', 'calc(112px*1.25)'],
  ['--harf-aralik-02', 'letter-spacing', '.02em'], ['--harf-aralik-06', 'letter-spacing', '.06em'],
  ['--harf-aralik-10', 'letter-spacing', '.1em'], ['--harf-aralik-14', 'letter-spacing', '.14em'],
  ...['08', '10', '14', '18', '20', '28', '45', '50', '55', '70', '75', '85', '92'].map((d): [string, string, string] => [`--saydam-${d}`, 'opacity', `.${d}`]),
  ['--z-sahne', 'z-index', '3'], ['--z-sahne-ust', 'z-index', '25'],
  ['--sure-kisa', 'transition-duration', '120ms'],
];
const KESIKLER: [string, string][] = [['--kesik-uzun', '6 4'], ['--kesik-orta', '5 3'], ['--kesik-kisa', '4 3'], ['--kesik-nokta', '2 1']];

test('ortak değişkenler atölyedeki bugünkü değerleri verir', async ({ page, ac }, bilgi) => {
  test.skip(bilgi.project.name !== 'g1280', 'değerler genişliğe bağlı değil');
  await ac('/');
  const farklar = await page.evaluate(([olculer, kesikler]) => {
    const kap = document.createElement('div');
    kap.style.position = 'relative';
    document.body.append(kap);
    const hesapla = (ozellik: string, deger: string) => {
      const o = document.createElement('div');
      o.style.setProperty('position', 'relative');
      o.style.setProperty(ozellik, deger);
      kap.append(o);
      const sonuc = getComputedStyle(o).getPropertyValue(ozellik);
      o.remove();
      return sonuc;
    };
    const fark: string[] = [];
    for (const [degisken, ozellik, beklenen] of olculer) {
      const gelen = hesapla(ozellik, `var(${degisken})`);
      const istenen = hesapla(ozellik, beklenen);
      if (gelen !== istenen) fark.push(`${degisken}: ${gelen} != ${istenen}`);
    }
    const kok = getComputedStyle(document.documentElement);
    for (const [degisken, beklenen] of kesikler) {
      const gelen = kok.getPropertyValue(degisken).trim();
      if (gelen !== beklenen) fark.push(`${degisken}: ${gelen} != ${beklenen}`);
    }
    kap.remove();
    return fark;
  }, [OLCULER, KESIKLER] as const);
  expect(farklar).toEqual([]);
});

test('gizli etiket ekranda yer tutmaz, erişilebilir adı kalır; sahne etiketi --x, --y ve --g ile yerleşir', async ({ page, ac }, bilgi) => {
  test.skip(bilgi.project.name !== 'g1280', 'yerleşim genişliğe bağlı değil');
  await ac('/');
  await page.evaluate(() => {
    const kap = document.createElement('section');
    kap.id = 'deneme-kap';
    kap.style.cssText = 'position:fixed;left:100px;top:100px;width:400px;height:300px';
    kap.innerHTML = `
      <label><span class="tc-gizli-etiket">Gizli ad</span><input id="deneme-girdi"></label>
      <div class="tc-sahne-etiketler" id="deneme-katman">
        <button type="button" class="tc-sahne-etiket" id="deneme-etiket" style="--x:40px;--y:30px;--g:60px">Uzun bir etiket metni burada</button>
        <button type="button" class="tc-sahne-etiket tc-sahne-etiket-ustte" id="deneme-ustte" style="--x:200px;--y:150px">Üst</button>
      </div>`;
    document.body.append(kap);
  });
  const gizli = await page.locator('.tc-gizli-etiket').boundingBox();
  expect(gizli?.width).toBeLessThanOrEqual(1);
  expect(gizli?.height).toBeLessThanOrEqual(1);
  await expect(page.getByRole('textbox', { name: 'Gizli ad' })).toBeAttached();

  const katman = await page.locator('#deneme-katman').evaluate((e) => {
    const s = getComputedStyle(e);
    const k = e.getBoundingClientRect();
    return { olay: s.pointerEvents, tasma: s.overflow, konum: s.position, x: k.x, y: k.y, en: k.width, boy: k.height };
  });
  expect(katman).toEqual({ olay: 'none', tasma: 'hidden', konum: 'absolute', x: 100, y: 100, en: 400, boy: 300 });

  const etiket = await page.locator('#deneme-etiket').evaluate((e) => {
    const k = e.getBoundingClientRect();
    return { x: k.x, y: k.y, en: k.width, olay: getComputedStyle(e).pointerEvents };
  });
  expect(etiket).toEqual({ x: 140, y: 130, en: 60, olay: 'auto' });

  const ustte = await page.locator('#deneme-ustte').boundingBox();
  expect(ustte).not.toBeNull();
  // Üstte etiket noktanın tam üstünde ortalanır: alt kenarı noktada, ortası noktada.
  expect(Math.round(ustte!.x + ustte!.width / 2)).toBe(300);
  expect(Math.round(ustte!.y + ustte!.height)).toBe(250);
});
