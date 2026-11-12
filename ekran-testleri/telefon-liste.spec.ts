import { expect, test } from './ortak.ts';

// Telefonda ortak tablo araç çubuğu: süzgeç çipleri tek satırda yana kayar, sağ kenar solar; yazı alanı iOS'u büyütmez.
test.use({ hesap: 'ornek.depo' });

test('Telefon: süzgeç çipleri tek satır, yana kayar; arama yazısı 16 px altına inmez', async ({ page, ag, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon genişliği');
  await ac('/stok/malzemeler');
  const grup = page.getByRole('group', { name: 'Durum' });
  await expect(grup).toBeVisible();
  const satir = await grup.evaluate((e) => {
    const kutu = e.closest('.tc-tablo-cipler') ?? e;
    const s = getComputedStyle(kutu);
    const ustler = new Set([...kutu.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top)));
    return { sarma: s.flexWrap, tasma: s.overflowX, maske: s.maskImage, satirSayisi: ustler.size };
  });
  expect(satir.sarma).toBe('nowrap');
  expect(satir.tasma).toBe('auto');
  expect(satir.maske, 'sağ kenar solmuyor').toContain('linear-gradient');
  expect(satir.satirSayisi, 'çipler alt satıra indi').toBe(1);
  const arama = page.getByRole('searchbox').first();
  await expect(arama).toBeVisible();
  expect(await arama.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});

// Yana kayan tablonun yapışık kimlik sütunu telefonda sınırlıdır; uzun kod yandaki hücrelerin üstüne taşmaz, "…" ile de
// kesilmez (aynı emrin kartları yalnız sonda ayrılır): sütun içinde alt satıra kırılır, tamamı görünür.
test('Telefon: yapışık kimlik sütunundaki uzun kod komşu hücreye taşmaz, tamamı görünür', async ({ page, ag, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon genişliği');
  const kart = (id: number, sira: number) => ({
    id, qr: `RP:${String(id)}`, etiket: `ORN-04411_2026-ORN-MM-00077-12-P${String(sira)}`, uretimEmriId: 1, emirNo: 'ORN-04411_2026-ORN-MM-00077-12', sira,
    malzemeId: 1, malzemeKod: 'ORN-HM-01', malzemeAd: 'ORNEK Yuvarlak çubuk', birim: 'kg', partiId: null, lotNo: null, tedarikciPartiNo: null, dokumNo: null,
    sertifikaNo: null, lotaBaglanmaZamani: null, verilen: '0', durum: 'acik', surum: 1, kayitZamani: '2026-11-12T06:00:00.000Z',
  });
  await page.route('**/api/stok/lot-bekleyen-kartlar', (r) => r.fulfill({ json: { kartlar: [{ refakat: kart(1, 1), bekleyen: '12.5' }, { refakat: kart(2, 2), bekleyen: '3' }] } }));
  await ac('/stok/hazirlik');
  const tablo = page.getByRole('table', { name: 'Lot bekleyen kartlar' });
  await expect(tablo).toBeVisible();
  const hucreler = await tablo.locator('tbody td.tc-tablo-sabit-sol').evaluateAll((l) => l.map((td) => {
    const r = document.createRange(); r.selectNodeContents(td);
    const yazi = r.getBoundingClientRect(); const kutu = td.getBoundingClientRect();
    return { metin: td.textContent, tasma: td.scrollWidth - td.clientWidth, sagdan: yazi.right - kutu.right, kesik: getComputedStyle(td).textOverflow };
  }));
  expect(hucreler.map((h) => h.metin)).toEqual(['ORN-04411_2026-ORN-MM-00077-12-P1', 'ORN-04411_2026-ORN-MM-00077-12-P2']);
  for (const h of hucreler) {
    expect(h.tasma, 'kod hücreden taşıyor').toBeLessThanOrEqual(0);
    expect(h.sagdan, 'kod yandaki hücrenin üstüne biniyor').toBeLessThanOrEqual(0);
    expect(h.kesik).not.toBe('ellipsis');
  }
  expect(ag.hatalar).toEqual([]);
});

// Raf matrisi telefonda kendi kabında yana kayar; ızgara içeriğe göre büyüyüp başlığı ve matrisi kartın dışına itmez.
test('Telefon: raf matrisi kartın içinde kalır, kendi kabında yana kayar', async ({ page, ag, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon genişliği');
  await ac('/stok/raflar');
  const kutu = page.locator('.tc-stok-matris-kutu').first();
  await expect(kutu).toBeVisible();
  const olcu = await kutu.evaluate((e) => {
    const k = e.getBoundingClientRect();
    const tasan = [...e.children].map((c) => c.getBoundingClientRect().right - k.right).filter((f) => f > 1);
    const kap = e.querySelector('.tc-stok-kaydir');
    return { tasan, kapKayar: kap !== null && kap.scrollWidth > kap.clientWidth, sayfa: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(olcu.tasan, 'matris kutusunun çocukları kartın dışına taşıyor').toEqual([]);
  expect(olcu.kapKayar, 'matris kendi kabında kaymıyor').toBe(true);
  expect(olcu.sayfa).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});

// 3090 a: Stok tablolarında kesilen malzeme adı telefonda iki satıra kadar kırılır (tek satırda birkaç harf görünüyordu), sonra "…".
test('Telefon: Stok tablosunda malzeme adı iki satıra kadar görünür, ikiden fazla satıra inmez', async ({ page, ag, ac }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon genişliği');
  await ac('/stok/hareketler');
  const ad = page.locator('.tc-tablo-kes > strong:only-child').first();
  await expect(ad).toBeVisible();
  const o = await ad.evaluate((e) => {
    const s = getComputedStyle(e); const satir = parseFloat(s.lineHeight);
    const td = e.closest('td')!; const r = document.createRange(); r.selectNodeContents(e);
    return { clamp: s.webkitLineClamp, satir, yukseklik: e.getBoundingClientRect().height, tasma: r.getBoundingClientRect().right - td.getBoundingClientRect().right };
  });
  expect(o.clamp).toBe('2');
  expect(o.yukseklik, 'ad ikiden fazla satıra iniyor').toBeLessThanOrEqual(o.satir * 2 + 1);
  expect(o.tasma, 'ad yandaki hücreye biniyor').toBeLessThanOrEqual(1);
  expect(ag.hatalar).toEqual([]);
});

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });
  // 3090 a: telefonda Stok değeri kutusu satırın tamamını alır; yöntem seçimi kesilmez.
  test('Telefon: Stok değeri kutusu tam satır, yöntem seçimi kesilmez', async ({ page, ag, ac }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'yalnız telefon genişliği');
    await ac('/stok');
    const kutu = page.locator('.tc-stok-kpi-deger');
    await expect(kutu).toBeVisible();
    const o = await kutu.evaluate((e) => {
      const ust = e.parentElement!.getBoundingClientRect(); const k = e.getBoundingClientRect();
      const secim = e.querySelector('select')!;
      return { bosluk: Math.abs(ust.width - k.width), secim: secim.getBoundingClientRect().width, kutu: k.width };
    });
    expect(o.bosluk, 'kutu satırın tamamını almıyor').toBeLessThanOrEqual(2);
    expect(o.secim, 'yöntem seçimi dar kalıyor').toBeGreaterThan(o.kutu / 2);
    // Tam satır kutunun boşluğuna Raf doluluğu çıkar: ızgara boş hücre bırakmaz, Malzeme çeşidiyle aynı sıradadır.
    const ust = (ad: string) => page.locator('.tc-stok-kpi').filter({ hasText: ad }).first().evaluate((e) => Math.round(e.getBoundingClientRect().top));
    expect(await ust('Raf doluluğu'), 'Raf doluluğu Malzeme çeşidinin yanına çıkmıyor').toBe(await ust('Malzeme çeşidi'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
  });

  // 3090 a: değer yoksa "Veri yok" her genişlikte sayı boyunda yazılmaz; yandaki kutunun sayısından küçüktür.
  test('Stok değeri yoksa "Veri yok" yandaki kutunun sayısından küçük yazılır', async ({ page, ag, ac }) => {
    await page.route('**/api/stok/deger**', async (r) => {
      const c = await r.fetch(); const g = await c.json() as Record<string, unknown>;
      await r.fulfill({ response: c, json: { ...g, stokDegeri: null } });
    });
    await ac('/stok');
    const bos = page.locator('.tc-stok-kpi-deger strong[data-bos]');
    await expect(bos).toHaveText('Veri yok');
    const boy = (l: ReturnType<typeof page.locator>) => l.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    const yan = page.locator('.tc-stok-kpi').filter({ hasText: 'Malzeme çeşidi' }).locator('strong').first();
    expect(await boy(bos), '"Veri yok" sayı boyunda').toBeLessThan(await boy(yan));
    expect(ag.hatalar).toEqual([]);
  });
});
