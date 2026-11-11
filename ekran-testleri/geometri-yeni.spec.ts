import type { Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3D Atölyesi: örnek veride 3B model yoktur ve analiz 30 sn'lik turda hesaplanır; ekranın düzeni ve akışı bu yüzden sabit
// cevaplarla denenir (sunucu uçları modülün kendi testlerinde, geometri.test.ts). Görüntüleyici çizilmez: dosya boş döner.
test.use({ hesap: 'ornek.yonetici' });

const satir = (malzemeNo: number, kod: string, ad: string | null, belgeId: number, belgeAdi: string, revizyonId: number, harf: string, revKodu: string | null, durum: string) => ({
  malzemeNo, malzemeKodu: kod, malzemeAdi: ad, belgeId, belgeAdi, revizyonId, harf, revKodu, dosyaTuru: 'step', durum, hataMetni: durum === 'hata' ? 'Model okunamadı.' : null,
});
const LISTE = {
  satirlar: [
    satir(1, 'MM-ORN-00001', 'Örnek mil', 1, 'Model kutu', 8, 'B', '02', 'bitti'),
    satir(1, 'MM-ORN-00001', 'Örnek mil', 2, 'Model ikinci', 9, 'A', null, 'bitti'),
    satir(3, 'MM-ORN-00003', 'Örnek burç', 3, 'Model açık', 3, 'A', '00', 'hata'),
  ],
  toplam: 3, sayfa: 1, sayfaBoyu: 50,
};
const ANALIZ = {
  revizyonId: 8, belgeId: 1, dosyaTuru: 'step', durum: 'bitti',
  is: { durum: 'bitti', denemeSayisi: 1, hataMetni: null, olusturma: '2026-11-01T20:00:00+03:00', baslama: '2026-11-01T20:00:01+03:00', bitis: '2026-11-01T20:00:02+03:00', surum: 3 },
  analiz: {
    motor: 'occt-import-js@0.0.23', kutu: { x: 45, y: 20, z: 10 }, obb: { a: 45, b: 20, c: 10, cap: 22.3607, yon: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    hacimMm3: 9000, alanMm2: 3100, govdeSayisi: 1, kapali: true, ucgenSayisi: 12, hesapSuresiMs: 20, hesapZamani: '2026-11-01T20:00:02+03:00',
  },
};
const HAM = { revizyonId: 8, payMm: 0, payKaynagi: 'yok', enAz: { a: 45, b: 20, c: 10 }, oneriler: [], kaliteler: [], neden: 'stok-listesi-yok' };
// Özellikler kartının okuduğu cevap (2044-2): yayındaki rev 8 için gerçek uç 200 döner; sentetik tek geçiş deliği.
const OZELLIK = {
  revizyonId: 8, motor: 'ornek-motor',
  ozellikler: [{
    sira: 1, tur: 'delik', ust: null, capMm: 6, yaricapMm: null, derinlikMm: 10, aciDerece: null, genislikMm: null, boyMm: null,
    gecis: true, dip: null, ic: null, eksen: [0, 0, -1], konum: [10, 10, 10], yuzler: [1],
  }],
};
// Montaj kartının okuduğu cevap (2113; uç 2109): sentetik iki seviyeli montaj, iki aynı pim.
const dugum = (sira: number, ust: number | null, tur: string, ad: string, en: number[], ustK: number[], obb: number[] | null, hacim: number | null) => ({
  sira, ust, tur, ad, kutuEn: en, kutuUst: ustK, obb: obb === null ? null : { a: obb[0], b: obb[1], c: obb[2] }, hacimMm3: hacim,
  alanMm2: tur === 'parca' ? 100 : null, kapali: tur === 'parca' ? true : null,
});
const MONTAJ = {
  revizyonId: 8, oneri: true, motor: 'ornek-motor', montaj: true, neden: null,
  dugumler: [
    dugum(1, null, 'montaj', 'ornek-govde', [0, 0, 0], [45, 20, 40], null, null),
    dugum(2, 1, 'parca', 'ornek-taban', [0, 0, 0], [45, 20, 10], [45, 20, 10], 9000),
    dugum(3, 1, 'montaj', 'ornek-tutucu-montaji-uzun-adli-alt-montaj', [5, 5, 10], [40, 15, 40], null, null),
    dugum(4, 3, 'parca', 'ornek-pim', [5, 5, 10], [15, 15, 40], [30, 10, 10], 3000),
    dugum(5, 3, 'parca', 'ornek-pim', [30, 5, 10], [40, 15, 40], [30, 10, 10], 3000),
  ],
  bilesenler: [
    { sira: 1, ad: 'ornek-taban', adet: 1, obb: { a: 45, b: 20, c: 10 }, hacimMm3: 9000, alanMm2: 100, kapali: true, dugumler: [2] },
    { sira: 2, ad: 'ornek-pim', adet: 2, obb: { a: 30, b: 10, c: 10 }, hacimMm3: 3000, alanMm2: 100, kapali: true, dugumler: [4, 5] },
  ],
};
const BULUNAMADI = { kod: 'BULUNAMADI', mesaj: 'Bu revizyon bir malzeme kartına bağlı, yayındaki STEP ya da IGES modeli değil.' };

async function sunucu(page: Page): Promise<void> {
  await page.route('**/api/geometri/**', async (r: Route) => {
    const yol = new URL(r.request().url()).pathname.replace('/api', '');
    const json = (status: number, govde: unknown) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(govde) });
    if (yol === '/geometri/modeller') return json(200, LISTE);
    if (yol === '/geometri/analizler/8') return json(200, ANALIZ);
    if (yol.startsWith('/geometri/ham-onerisi/8')) return json(200, HAM);
    if (yol === '/geometri/ozellikler/8') return json(200, OZELLIK);
    if (yol === '/geometri/montaj/8') return json(200, MONTAJ);
    // Boya ve maske kartı (2144) bu testlerin konusu değil; analiz yok cevabıyla boş durur.
    if (yol === '/geometri/yuzey/8') {
      return json(200, {
        revizyonId: 8, oneri: true, neden: 'analiz-yok', yuzler: [], rota: { durum: 'bagli', adimlar: [] }, isaretler: [], alanlar: [],
        isaretsizMm2: 0, toplamMm2: 0, surum: null, guncelleyen: null, guncelleme: null, tasima: null,
      });
    }
    if (yol === '/geometri/modeller/8/dosya') return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.alloc(0) });
    if (yol === '/geometri/modeller/1/guncel') return json(200, { revizyonId: 8 });
    if (yol === '/geometri/modeller/2/guncel') return json(200, { revizyonId: null });
    return json(404, BULUNAMADI);
  });
}

// Bilerek istenen 404'ler (eski revizyonun analizi ve dosyası) ve boş model dosyasının çizilemeyişi hata sayılmaz.
const beklenmeyen = (hatalar: readonly string[]) => hatalar.filter((h) => !/404 GET \/api\/geometri\/(analizler|modeller)\/[12](\/|$|\?)/.test(h) && !h.includes('404 (Not Found)'));

test.describe('3D Atölyesi', () => {
  test('liste: aynı malzemenin iki modeli belge adıyla ayrılır, desteklenen biçim yazılı, rozet satırda kalır, taşma yok', async ({ page, ac, ag }) => {
    await sunucu(page);
    await ac('/geometri');
    // 2138-2: satırda merkezin yükleme harfi değil revizyon kodu yazılır; kodsuz modelde harf gösterilmez.
    await expect(page.getByText('Rev 02 · STEP · Model kutu')).toBeVisible();
    await expect(page.getByText('Kodsuz revizyon · STEP · Model ikinci')).toBeVisible();
    await expect(page.getByText(/STL, GLB ve GLTF yüzey ağıdır/)).toBeVisible();
    const disariTasan = await page.locator('.tc-g3b-satir').evaluateAll((satirlar) => satirlar.flatMap((s) => {
      const r = s.getBoundingClientRect();
      return [...s.querySelectorAll('.tc-rozet')].filter((z) => z.getBoundingClientRect().right > r.right + 0.5 || z.scrollWidth > z.clientWidth + 0.5)
        .map((z) => z.textContent ?? '');
    }));
    expect(disariTasan).toEqual([]);
    expect((await tasmaOlc(page)).belge).toBe(0);
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });

  test('eski bağlantı aynı belgenin yayındaki revizyonuna gider; yayından kalkmış model açıklanır', async ({ page, ac, ag }) => {
    await sunucu(page);
    await ac('/geometri?rev=1');
    await expect(page).toHaveURL(/rev=8/);
    // Yönlendirme bildirimi 4 sn görünür; ac() ağın durulmasını bekler, bildirim istemci testinde (Atolye3B.test.tsx) denetlenir.
    await expect(page.getByText('9.000 mm³')).toBeVisible();
    await ac('/geometri?rev=2');
    await expect(page.getByText(/Bu model artık listede değil/)).toBeVisible();
    await expect(page).toHaveURL(/rev=2/);
    expect((await tasmaOlc(page)).belge).toBe(0);
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });

  test('taslak model (3028 b): "Taslak" rozetli satır, seçilince adı ve "Yayınla"; yayın sürümle gider; "Model ekle" yan pencereyi açar', async ({ page, ac, ag }) => {
    await sunucu(page);
    const taslak = { ...satir(4, 'MM-ORN-00004', 'Örnek braket', 6, 'Model taslak', 60, 'A', null, 'yok'), yayinda: false };
    await page.route('**/api/geometri/modeller?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...LISTE, satirlar: [taslak, ...LISTE.satirlar], toplam: 4 }) }));
    const yayinlar: unknown[] = [];
    await page.route('**/api/cizimler/6**', async (r) => {
      if (r.request().method() === 'POST') yayinlar.push(r.request().postDataJSON());
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 6, surum: 2 }) });
    });
    await ac('/geometri');
    const s = page.locator('.tc-g3b-satir', { hasText: 'MM-ORN-00004' });
    await expect(s.locator('.tc-rozet', { hasText: 'Taslak' })).toBeVisible();
    await s.click();
    const ayrinti = page.getByRole('region', { name: 'Model ayrıntısı' });
    await expect(ayrinti.getByText('Kodsuz revizyon · Model taslak')).toBeVisible();
    await expect(ayrinti.getByText(/Bu model taslak/)).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBe(0);
    // Yayından sonra seçili model ölçüm sırasına girer: analiz henüz yok, dosya boş.
    await page.route('**/api/geometri/analizler/60', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...ANALIZ, revizyonId: 60, belgeId: 6, durum: 'yok', is: null, analiz: null }) }));
    await page.route('**/api/geometri/modeller/60/dosya', (r) => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.alloc(0) }));
    await ayrinti.getByRole('button', { name: 'Yayınla' }).click();
    await expect(page.getByText(/Model yayınlandı/)).toBeVisible();
    expect(yayinlar).toEqual([{ surum: 2 }]);
    await page.getByRole('button', { name: 'Model ekle' }).click();
    await expect(page.getByRole('dialog').getByText('3B model ekle')).toBeVisible();
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });

  test('süzgeç boş bırakınca listede model olmadığı değil, uyan olmadığı yazılır', async ({ page, ac }) => {
    await page.route('**/api/geometri/modeller?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
      new URL(r.request().url()).searchParams.has('durum') ? { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 } : LISTE,
    ) }));
    await ac('/geometri');
    await page.getByLabel('Durum', { exact: true }).selectOption('calisiyor');
    await expect(page.getByText('Aramaya ya da süzgece uyan model yok.')).toBeVisible();
    await expect(page.getByText(/3B modeli olan malzeme yok/)).toHaveCount(0);
  });

  test('montaj kartı (2113): ağaç ve bileşen listesi her genişlikte taşmadan çalışır; seçim özeti adedi söyler', async ({ page, ac, ag }) => {
    await sunucu(page);
    await ac('/geometri/montaj?rev=8');
    const kart = page.locator('.tc-g3b-mo');
    await expect(kart.getByText('Öneri')).toBeVisible();
    await expect(kart.getByText('1 alt montaj')).toBeVisible();
    await kart.getByRole('button', { name: /ornek-tutucu-montaji-uzun-adli-alt-montaj/ }).last().click();
    await expect(kart.getByText('ornek-tutucu-montaji-uzun-adli-alt-montaj (alt montaj, 2 parça)')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBe(0);
    await kart.getByRole('tab', { name: /Bileşen listesi/ }).click();
    await kart.getByText('ornek-pim', { exact: true }).first().click();
    await expect(kart.getByText('ornek-pim (2 adet)')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBe(0);
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });
});
