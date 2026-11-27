import { expect, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// 3742 A: sayacın iki yanında ikişer tüp (solda Elde ve Gelen, sağda Üretilen ve Teslim), altlarında Teslim al ve Teslim et.
// Tüpler ve düğmeler kadranın üstüne binmez, sayfa yatay taşmaz; telefonda ileti İyi +1 ve Hatalı düğmelerini örtmez.
// Paket, adım durumu ve sepet sayıları tarayıcıda uydurulur (ORN- sentetik); yazma gitmez.
const paket = (isEmriId: number, op: string) => ({
  id: `ekran-tup-${String(isEmriId)}`, no: 'UE-ORN-TUP', opType: 'cnc', st: {}, partNo: 'ORN-PRC-1', part: 'ORN gövde', rev: 'A', op,
  machine: 'ORN-TORNA-1', mc: 'ORN-CNC-02', target: 15, cycle: 30, due: '2026-12-31', priority: 'normal', material: '', note: '', files: [],
  primary: null, plan: [], steps: [], tmi: { emirId: 9903, isEmriId, opNo: 10 },
  status: 'published', version: 1, dirty: false, createdAt: 1, updatedAt: 2, publishedAt: 2, by: 'Ekran',
});

async function kur(page: Page, malzemeli: boolean): Promise<void> {
  await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [
    { kimlik: 'ekran-tup-99200', surum: 1, govde: paket(99200, 'Op 10 · Tornalama') },
  ] } }));
  await page.route('**/api/adimli-emirler/9903/adim-durumu/terminal', (r) => r.fulfill({ json: { emirId: 9903, adimlar: [
    { isEmriId: 99200, opNo: 10, ad: 'Tornalama', statu: 'baslayabilir', elle: false, yuzde: 0, nedenler: [], tedarik: [] },
  ] } }));
  await page.route('**/api/adimli-emirler/9903/hazirlik', (r) => r.fulfill({ json: { maddeler: [], muafiyetler: [], isEmirleri: [] } }));
  await page.route('**/api/uretim-emirleri/9903', (r) => r.fulfill({ json: { adimlar: [] } }));
  await page.route('**/api/arkon/is-emirleri/*/sahne', (r) => r.fulfill({ json: { sahne: null } }));
  await page.route('**/api/stok/teslim-kutusu/is-malzemeleri*', (r) => r.fulfill({ json: { isler: malzemeli ? [{
    uretimEmriId: 9903, emirNo: 'UE-ORN-TUP', opNo: 10, adimAd: 'Tornalama', calisiyor: true, kalanAdet: 15,
    malzemeler: [{ malzemeId: 7, kod: 'ORN-CUBUK-40', ad: null, birim: 'm', birAdet: '0.400', gereken: '6.000', istasyonda: '4.000', eksik: false, yerler: [], istek: null, tasinan: false }],
  }] : [] } }));
  // Parça (ürün kodu ORN-PRC-1) adet sayılır; metre birimli çubuk satırı tüpe katılmaz (3742-2).
  await page.route('**/api/stok/teslim-kutusu/istasyon-sepetleri*', (r) => r.fulfill({ json: {
    gelen: { bekleyen: [
      { istasyonId: 1, kaynakIstasyonId: 2, malzemeId: 8, kod: 'ORN-PRC-1', partiId: null, statuId: null, miktar: '6' },
      { istasyonId: 1, kaynakIstasyonId: 2, malzemeId: 7, kod: 'ORN-CUBUK-40', partiId: null, statuId: null, miktar: '2.5' },
    ], yolda: [] },
    cikan: [{ malzemeId: 8, kod: 'ORN-PRC-1', partiId: null, statuId: null, miktar: '4' }, { malzemeId: 7, kod: 'ORN-CUBUK-40', partiId: null, statuId: null, miktar: '1.2' }],
  } }));
}

type Kutu = { x: number; y: number; width: number; height: number };
const kesisir = (a: Kutu, b: Kutu) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

async function olc(page: Page): Promise<void> {
  const terminal = page.getByRole('region', { name: 'Üretim Terminali' });
  const al = terminal.getByRole('button', { name: /^Teslim al: gelen 6 adet$/ });
  const et = terminal.getByRole('button', { name: /^Teslim et: 4 adet$/ });
  await expect(al).toBeVisible({ timeout: 15_000 });
  await expect(et).toBeVisible();
  await expect(terminal.getByRole('meter', { name: 'Gelen 6 adet' })).toBeVisible();
  await expect(terminal.getByRole('meter', { name: 'Teslim 4 adet' })).toBeVisible();
  const kadran = await terminal.locator('.tc-ay1-kadran').first().boundingBox();
  expect(kadran).not.toBeNull();
  const parcalar = await terminal.locator('.tc-ay1-kanat-cift > .tc-ay1-gosterge:not([data-bos]), .tc-ay1-kanat-cift > .tc-ay1-tup-dugme').evaluateAll(
    (l) => l.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }),
  );
  expect(parcalar.length).toBeGreaterThanOrEqual(5);
  for (const p of parcalar) expect(kadran !== null && kesisir(p, kadran), 'tüp ya da düğme kadranın üstüne biniyor').toBe(false);
  for (const d of [al, et]) expect((await d.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // Tüp adları birbirine bitişmez, kesilmez.
  const adlar = await terminal.locator('.tc-ay1-kanat-cift .tc-ay1-gosterge-ad:visible').evaluateAll(
    (l) => l.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, tasma: e.scrollWidth - e.clientWidth }; }),
  );
  for (const [i, a] of adlar.entries()) {
    expect(a.tasma, 'tüp adı kesiliyor').toBeLessThanOrEqual(0);
    for (const b of adlar.slice(i + 1)) expect(kesisir(a, b), 'tüp adları bitişiyor').toBe(false);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test.describe('sayaç tüpleri ve teslim düğmeleri', () => {
  test.use({ hesap: 'ornek.operator1' });

  for (const malzemeli of [true, false]) {
    test(`ikişer tüp, Teslim al ve Teslim et kadrana binmez (${malzemeli ? 'malzemeli' : 'malzemesiz'})`, async ({ page, ag, ac }) => {
      await kur(page, malzemeli);
      await ac('/uretim-terminali');
      await olc(page);
      if (malzemeli) await expect(page.getByRole('region', { name: 'Üretim Terminali' }).getByRole('meter', { name: /^Elde %/ })).toBeVisible();
      // Hatalı etiketi kadranın altındadır; telefonda tüplerin üstüne binmez.
      const terminal = page.getByRole('region', { name: 'Üretim Terminali' });
      const hatali = await terminal.locator('.tc-ay1-kadran-sol').first().boundingBox();
      const tupler = await terminal.locator('.tc-ay1-kanat-cift > .tc-ay1-gosterge:not([data-bos])').evaluateAll(
        (l) => l.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }),
      );
      if (hatali !== null) for (const t of tupler) expect(kesisir(hatali, t), 'Hatalı etiketi tüpe biniyor').toBe(false);
      expect(ag.hatalar).toEqual([]);
    });
  }

  test('%130 yazıda tüp adları ve düğmeler okunur, ekrandan taşmaz', async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g360', 'telefon düzeni');
    await kur(page, true);
    await ac('/uretim-terminali');
    await page.addStyleTag({ content: ':root { --yazi-xs: 15.6px; --yazi-s: 18.2px; --yazi-m: 20.8px; --yazi-l: 23.4px; --yazi-xl: 31.2px; }' });
    await olc(page);
  });

  test('telefonda ileti İyi +1 ve Hatalı düğmelerini örtmez', async ({ page, ac }, bilgi) => {
    test.skip(bilgi.project.name !== 'g360', 'telefon düzeni');
    await kur(page, true);
    await ac('/uretim-terminali');
    const iyi = page.getByRole('button', { name: /İyi \+1/ }).first();
    await expect(iyi).toBeVisible({ timeout: 15_000 });
    // Bildirim kutusunun yerini ortak bildirim stili verir; içerik uzun bir iletiyle doldurulur.
    await page.evaluate(() => {
      let k = document.querySelector('.tc-bildirimler');
      if (k === null) { k = document.createElement('div'); k.className = 'tc-bildirimler'; document.body.appendChild(k); }
      k.innerHTML = '<div class="tc-bildirim tc-bildirim-tamam" role="status"><span class="tc-bildirim-mesaj">Sayım kartı P1 → P2 · UE-ORN-TUP zaten başlamıştı; ileti uzun olursa üç satırda kesilir ve alttaki düğmeleri örtmez</span></div>';
    });
    const ileti = await page.locator('.tc-bildirim').first().boundingBox();
    expect(ileti).not.toBeNull();
    for (const ad of [/İyi \+1/, /^Hatalı/]) {
      const d = await page.getByRole('button', { name: ad }).first().boundingBox();
      expect(ileti !== null && d !== null && kesisir(ileti, d), 'ileti sayım düğmesini örtüyor').toBe(false);
    }
  });
});
