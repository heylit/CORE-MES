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
