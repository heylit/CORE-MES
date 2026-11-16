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
const HAM = { revizyonId: 8, payMm: 0, payKaynagi: 'yok', enAz: { a: 45, b: 20, c: 10 }, oneriler: [], kaliteler: [], neden: 'stok-listesi-yok', kesmeMm: 3, donel: null, formlar: [] };
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
// Süre kartının okuduğu cevap (3278 D): sentetik kalibresiz aralık, kutu hamı, rotada iki talaşlı adım (biri ölçümsüz).
const SURE = {
  revizyonId: 8, oneri: true, kalibre: false, iso: 'P', isoKaynagi: 'istek', payMm: 0, payKaynagi: 'yok', hamKaynagi: 'kutu', hamKodu: null,
  hamHacimMm3: 9000 * 1.5, parcaHacimMm3: 9000, talasMm3: 4500,
  kalemler: [{ kalem: 'kaba', altDk: 0.03, ustDk: 0.09, adet: null }, { kalem: 'finis', altDk: 0.39, ustDk: 1.55, adet: null }, { kalem: 'delik', altDk: 0.12, ustDk: 0.25, adet: 1 }],
  altDk: 0.54, ortaDk: 1.07, ustDk: 1.89, ozellikOkundu: true, neden: null,
  rota: {
    durum: 'bagli', islemToplamDk: 2.5, olcumToplamDk: 3.1, eksik: false,
    adimlar: [
      { opNo: 10, ad: 'Örnek tornalama adımı uzun adlı', islemDk: 1.5, olcumOrtancaDk: 3.1, olcumAdedi: 5 },
      { opNo: 20, ad: 'Örnek frezeleme', islemDk: 1, olcumOrtancaDk: null, olcumAdedi: 0 },
    ],
  },
};
const BULUNAMADI = { kod: 'BULUNAMADI', mesaj: 'Bu revizyon bir malzeme kartına bağlı, yayındaki STEP ya da IGES modeli değil.' };

// 3321-1: Ø100 x 10 örnek flanş için ham cevabı (hesabın kendisi sunucu testinde, kurallar.test.ts G-K9c): dönel kısa eksen, bir çubuk
// kartı, kartı olmayan disk ve en yakın disk kartı, plaka işi olmayan levha.
const olmayan = { kesimEnMm: null, enYakinKart: null };
const HAM_FLANS = {
  revizyonId: 8, payMm: 2, payKaynagi: 'ayar', kesmeMm: 3, enAz: { a: 104, b: 104, c: 14 }, kaliteler: ['C45'], neden: null,
  donel: { kenar: 'c', capMm: 100, boyMm: 10, icCapMm: null },
  oneriler: [
    { malzemeNo: 12, kod: 'ORN-HM-0012', ad: 'Örnek çubuk Ø105', kalite: 'C45', form: 'cubuk', olcu: { d: 105, l: 3000 }, aile: 'metal', kaliteKodu: 'C45', yogunluk: 7.85,
      kesimBoyuMm: 17, kesimEnMm: null, hamHacimMm3: 147200, eksen: 'c' },
    { malzemeNo: 31, kod: 'ORN-HM-0031', ad: 'Örnek blok', kalite: 'C45', form: 'blok', olcu: { a: 105, b: 105, h: 15 }, aile: 'metal', kaliteKodu: 'C45', yogunluk: 7.85,
      kesimBoyuMm: null, kesimEnMm: null, hamHacimMm3: 165375, eksen: 'a' },
  ],
  formlar: [
    { form: 'cubuk', neden: null, olcu: { d: 104 }, kesimBoyuMm: 17, hamHacimMm3: 144400, ...olmayan },
    { form: 'altigen', neden: null, olcu: { s: 104 }, kesimBoyuMm: 17, hamHacimMm3: 159200, ...olmayan },
    { form: 'lama', neden: null, olcu: { a: 104, b: 104 }, kesimBoyuMm: 17, hamHacimMm3: 183900, ...olmayan },
    { form: 'levha', neden: 'plaka-degil', olcu: null, kesimBoyuMm: null, hamHacimMm3: null, ...olmayan },
    { form: 'blok', neden: null, olcu: { a: 104, b: 104, h: 14 }, kesimBoyuMm: null, hamHacimMm3: 151400, ...olmayan },
    { form: 'boru', neden: 'delik-yok', olcu: null, kesimBoyuMm: null, hamHacimMm3: null, ...olmayan },
    { form: 'disk', neden: null, olcu: { d: 104, t: 14 }, kesimBoyuMm: null, hamHacimMm3: 118900, kesimEnMm: null,
      enYakinKart: { malzemeNo: 40, kod: 'ORN-DSK-80', olcu: { d: 80, t: 20 }, eksik: ['d'] } },
  ],
};

async function sunucu(page: Page, ham: unknown = HAM, analiz: unknown = ANALIZ): Promise<void> {
  await page.route('**/api/geometri/**', async (r: Route) => {
    const yol = new URL(r.request().url()).pathname.replace('/api', '');
    const json = (status: number, govde: unknown) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(govde) });
    if (yol === '/geometri/modeller') return json(200, LISTE);
    if (yol === '/geometri/analizler/8') return json(200, analiz);
    if (yol.startsWith('/geometri/ham-onerisi/8')) return json(200, ham);
    if (yol === '/geometri/ozellikler/8') return json(200, OZELLIK);
    if (yol === '/geometri/montaj/8') return json(200, MONTAJ);
    if (yol === '/geometri/sure-tahmini/8') return json(200, SURE);
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

  test('ham kartı (3321-1): dönel flanşta dönme ekseni, rozetler, kartınız yok ve Neden bu sıra her genişlikte taşmadan görünür', async ({ page, ac, ag }, bilgi) => {
    await sunucu(page, HAM_FLANS, { ...ANALIZ, analiz: { ...ANALIZ.analiz, kutu: { x: 100, y: 100, z: 10 }, obb: { a: 100, b: 100, c: 10, cap: 100.5, yon: ANALIZ.analiz.obb.yon }, hacimMm3: 67700 } });
    await ac('/geometri/ham?rev=8');
    await expect(page.getByText('Dönel parça', { exact: true })).toBeVisible();
    await expect(page.getByText('kartlarınızda en az talaş')).toBeVisible();
    await expect(page.getByText('dönel parça, çubuktan')).toBeVisible();
    const yok = page.getByRole('list', { name: 'Kartınız olmayan formlar' });
    await expect(yok.getByRole('link', { name: "Malzemeler'de kart aç" })).toHaveCount(1);
    const sira = page.getByRole('region', { name: 'Neden bu sıra' });
    await expect(sira.getByRole('row')).toHaveCount(8);
    await expect(page.getByText('Levha önerilmedi: dönel parça; plaka işi değil.')).toBeVisible();
    await expect(yok.getByText('SW 104 x 17 mm · kartınız yok', { exact: false })).toBeVisible();
    const tablo = await sira.locator('table').evaluate((t) => t.scrollWidth - t.clientWidth);
    expect(tablo, 'tablo yatay taşmaz').toBeLessThanOrEqual(0);
    expect((await tasmaOlc(page)).belge).toBe(0);
    const genislik = page.viewportSize()?.width ?? 0;
    await page.setViewportSize({ width: genislik, height: 2600 });
    await page.locator('.tc-kart', { has: page.getByRole('heading', { name: 'Ham önerisi' }) }).screenshot({ path: bilgi.outputPath(`3321-1-ham-${String(genislik)}.png`) });
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });

  test('süre kartı (3278 D): aralık, kalemler, ham ve rotadaki talaşlı adımlar her genişlikte taşmadan görünür; ISO düğmesi seçilir', async ({ page, ac, ag }) => {
    await sunucu(page);
    await ac('/geometri/sure?rev=8');
    await expect(page.getByRole('heading', { name: 'Kaba süre (öneri)' })).toBeVisible();
    await expect(page.getByText('0,5 – 1,9 dk', { exact: true })).toBeVisible();
    const rota = page.getByRole('region', { name: 'Rotadaki talaşlı adımlar' });
    await expect(rota.getByText('OP10 Örnek tornalama adımı uzun adlı')).toBeVisible();
    await expect(rota.getByText('ölçüm yok')).toBeVisible();
    await page.getByRole('button', { name: 'S · Süper alaşım' }).click();
    await expect(page.getByRole('button', { name: 'S · Süper alaşım' })).toHaveAttribute('aria-pressed', 'true');
    expect((await tasmaOlc(page)).belge).toBe(0);
    expect(beklenmeyen(ag.hatalar)).toEqual([]);
  });
});
