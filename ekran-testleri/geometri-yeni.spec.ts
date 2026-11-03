import type { Page, Route } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3D Atölyesi: örnek veride 3B model yoktur ve analiz 30 sn'lik turda hesaplanır; ekranın düzeni ve akışı bu yüzden sabit
// cevaplarla denenir (sunucu uçları modülün kendi testlerinde, geometri.test.ts). Görüntüleyici çizilmez: dosya boş döner.
test.use({ hesap: 'ornek.yonetici' });

const satir = (malzemeNo: number, kod: string, ad: string | null, belgeId: number, belgeAdi: string, revizyonId: number, harf: string, durum: string) => ({
  malzemeNo, malzemeKodu: kod, malzemeAdi: ad, belgeId, belgeAdi, revizyonId, harf, dosyaTuru: 'step', durum, hataMetni: durum === 'hata' ? 'Model okunamadı.' : null,
});
const LISTE = {
  satirlar: [
    satir(1, 'MM-ORN-00001', 'Örnek mil', 1, 'Model kutu', 8, 'B', 'bitti'),
    satir(1, 'MM-ORN-00001', 'Örnek mil', 2, 'Model ikinci', 9, 'A', 'bitti'),
    satir(3, 'MM-ORN-00003', 'Örnek burç', 3, 'Model açık', 3, 'A', 'hata'),
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
const BULUNAMADI = { kod: 'BULUNAMADI', mesaj: 'Bu revizyon bir malzeme kartına bağlı, yayındaki STEP ya da IGES modeli değil.' };

async function sunucu(page: Page): Promise<void> {
  await page.route('**/api/geometri/**', async (r: Route) => {
    const yol = new URL(r.request().url()).pathname.replace('/api', '');
    const json = (status: number, govde: unknown) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(govde) });
    if (yol === '/geometri/modeller') return json(200, LISTE);
    if (yol === '/geometri/analizler/8') return json(200, ANALIZ);
    if (yol.startsWith('/geometri/ham-onerisi/8')) return json(200, HAM);
    if (yol === '/geometri/ozellikler/8') return json(200, OZELLIK);
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
    await expect(page.getByText('Rev B · STEP · Model kutu')).toBeVisible();
    await expect(page.getByText('Rev A · STEP · Model ikinci')).toBeVisible();
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

  test('süzgeç boş bırakınca listede model olmadığı değil, uyan olmadığı yazılır', async ({ page, ac }) => {
    await page.route('**/api/geometri/modeller?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
      new URL(r.request().url()).searchParams.has('durum') ? { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 } : LISTE,
    ) }));
    await ac('/geometri');
    await page.getByLabel('Durum', { exact: true }).selectOption('calisiyor');
    await expect(page.getByText('Aramaya ya da süzgece uyan model yok.')).toBeVisible();
    await expect(page.getByText(/3B modeli olan malzeme yok/)).toHaveCount(0);
  });
});
