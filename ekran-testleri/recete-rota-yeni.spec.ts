import { expect, tasmaOlc, test } from './ortak.ts';

// Yeni Reçete ve Rota ekranı (TS geçişi). Alıma kadar yalnız yöneticiye açıktır; parça yazarları (R1-R3) kendi describe bloğunu ekler.
// Bölümler parçalarca doldurulur: iskelet testi yer tutucu metnine değil, bölgeye ve parçanın işaretine bakar.
const BOLUMLER = [
  { sekme: 'Üretim emirleri', parca: 'R3' }, { sekme: 'Stok', parca: 'R3' }, { sekme: 'Ürün ve rotalar', parca: 'R1' },
  { sekme: 'Operasyonlar', parca: 'R1' }, { sekme: 'Süreler', parca: 'R2' }, { sekme: 'Malzemeler', parca: 'R2' }, { sekme: 'Kaynaklar', parca: 'R2' },
] as const;

test.describe('R0 iskelet', () => {
  test('yönetici açar: başlık, yedi sekme ve her bölüm; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/recete-rota/yeni');
    const ekran = page.locator('.tc-rry');
    await expect(ekran.getByRole('heading', { name: 'Üretim emirleri', level: 2 })).toBeVisible();
    // Eski ekranın plan şeridi her sekmenin üstündedir; "Onaya gönder" plan yazdığından görünür ama pasiftir (357 b).
    const serit = ekran.getByRole('status', { name: 'Plan durumu' });
    await expect(serit).toBeVisible();
    const onaya = serit.getByRole('button', { name: 'Onaya gönder' });
    if (await onaya.count()) await expect(onaya).toBeDisabled();
    const sekmeler = page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' });
    // Eski ekranın sırası (497/1 a): sekmeler en üstte, altında şerit, sonra bölüm başlığı.
    const ust = async (l: typeof serit) => (await l.boundingBox())?.y ?? Number.NaN;
    expect(await ust(sekmeler)).toBeLessThan(await ust(serit));
    expect(await ust(serit)).toBeLessThan(await ust(ekran.getByRole('heading', { name: 'Üretim emirleri', level: 2 })));
    await expect(sekmeler.getByRole('tab')).toHaveCount(BOLUMLER.length);
    for (const b of BOLUMLER) {
      await sekmeler.getByRole('tab', { name: b.sekme }).click();
      const bolge = page.getByRole('region', { name: b.sekme });
      await expect(bolge.locator(`[data-parca="${b.parca}"]`)).toBeVisible({ timeout: 15_000 });
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    }
    expect(ag.hatalar).toEqual([]);
  });

  test.describe('kapı', () => {
    // Planlama rolü sayfayı görür ama kapı işlemi yoktur: kabuk değil yeni ekranın kapısı durdurur.
    test.use({ hesap: 'ornek.planlama' });
    test('yönetici olmayana yeni ekran açılmaz', async ({ page, ag, ac }) => {
      await ac('/recete-rota/yeni');
      await expect(page.getByText('Bu ekran hazırlanıyor')).toBeVisible();
      expect(ag.hatalar).toEqual([]);
    });
  });
});

test.describe('R1 Ürün ve rotalar, Operasyonlar', () => {
  // Açılışta yazma yok: bölümleri gezmek rota modülüne ve operasyon kataloğuna istek yollamaz.
  const yazma = (u: string, yontem: string) => yontem === 'POST' && /\/api\/(rota\/(urunler|revizyonlar)|operasyon-tipleri)/.test(u);
  // Genişlikler (360, 768, 1280) yapılandırmanın projeleridir.
  test('şema, düzenleme paneli, ürün listesi ve operasyonlar açılır; yatay taşma yok', async ({ page, ag, ac }) => {
    const yazmalar: string[] = [];
    page.on('request', (r) => { if (yazma(r.url(), r.method())) yazmalar.push(r.url()); });
    await ac('/recete-rota/yeni/schema');
    const sema = page.getByRole('region', { name: 'Ürün ve rotalar' });
    await expect(sema.locator('[data-parca="R1"]')).toBeVisible({ timeout: 15_000 });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    const kutu = sema.locator('.tc-rr1-opbox').first();
    if (await kutu.count() > 0) {
      await kutu.click();
      await expect(sema.getByRole('complementary', { name: 'Düzenleme paneli' })).toBeVisible();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    }
    await sema.getByRole('button', { name: 'Ürün listesi' }).click();
    await expect(sema.getByRole('table', { name: 'Ürünler ve rotaları' }).or(sema.getByText('Henüz ürün yok', { exact: false }))).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' }).getByRole('tab', { name: 'Operasyonlar' }).click();
    const ops = page.getByRole('region', { name: 'Operasyonlar' });
    await expect(ops.locator('[data-parca="R1"]')).toBeVisible({ timeout: 15_000 });
    await expect(ops.getByRole('table', { name: 'Rota revizyonları' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('R3 Üretim emirleri ve Stok', () => {
  // Veri tabanı boş da olabilir: test bölgeye ve parçanın işaretine bakar, varsa ilk emri açar. GET dışı istek ag.hatalar'a düşer.
  test('iki bölüm açılır, emir ayrıntısı açılır; yatay taşma yok', async ({ page, ag, ac }) => {
    await ac('/recete-rota/yeni');
    const emirler = page.getByRole('region', { name: 'Üretim emirleri' });
    await expect(emirler.locator('[data-parca="R3"]')).toBeVisible({ timeout: 15_000 });
    // Eski süzgeç çubuğu (497/2 a): geniş ekranda her grup tek satırlık bölümlü çubuk; emir no hiçbir genişlikte kırılmaz.
    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      for (const ad of ['Tür', 'Durum']) {
        const ustler = await emirler.getByRole('group', { name: ad }).locator('button').evaluateAll((l) => l.map((d) => Math.round(d.getBoundingClientRect().top)));
        expect(new Set(ustler).size).toBeLessThanOrEqual(1);
      }
    }
    const satirSayilari = await emirler.locator('.tc-rr3-emirno').evaluateAll((l) => l.map((b) => {
      const r = document.createRange(); r.selectNodeContents(b); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    }));
    expect(satirSayilari.filter((n) => n > 1)).toEqual([]);
    const ilk = emirler.locator('.tc-rr3-emir').first();
    if (await ilk.count()) {
      await ilk.click();
      await expect(ilk).toHaveAttribute('aria-expanded', 'true');
    }
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' }).getByRole('tab', { name: 'Stok' }).click();
    const stok = page.getByRole('region', { name: 'Stok' });
    await expect(stok.locator('[data-parca="R3"]')).toBeVisible({ timeout: 15_000 });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('R2 kaynaklar', () => {
  // Açılış yazmaz: rota yazabilen yöneticide yalnız kart taslaklarının açılışı gider (iskeletin işi).
  const yazmalar = (y: readonly string[]) => y.filter((x) => x !== 'POST /api/rota/karttan-taslaklar');

  test('Süreler, Malzemeler ve Kaynaklar açılır; Kaynaklar alt sekmeleri gezilir; yatay taşma ve yazma yok', async ({ page, ag, ac }) => {
    await ac('/recete-rota/yeni/sureler');
    const sureler = page.getByRole('region', { name: 'Süreler' });
    await expect(sureler.locator('[data-parca="R2"]')).toBeVisible({ timeout: 15_000 });
    await expect(sureler.getByRole('searchbox', { name: 'Ürün ara' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

    const sekmeler = page.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' });
    await sekmeler.getByRole('tab', { name: 'Malzemeler' }).click();
    const malzemeler = page.getByRole('region', { name: 'Malzemeler' });
    await expect(malzemeler.getByRole('searchbox', { name: 'Malzeme ara' })).toBeVisible({ timeout: 15_000 });
    await expect(malzemeler.getByRole('group', { name: 'Tür' })).toBeVisible();
    await expect(malzemeler.getByRole('region', { name: 'Statüler' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

    await sekmeler.getByRole('tab', { name: 'Kaynaklar' }).click();
    const kaynaklar = page.getByRole('region', { name: 'Kaynaklar' });
    const alt = kaynaklar.getByRole('tablist', { name: 'Kaynak türü' });
    await expect(alt.getByRole('tab')).toHaveCount(6, { timeout: 15_000 });
    for (const ad of ['Genel bakış', 'Vardiyalar', 'İş merkezleri ve istasyonlar', /^Makineler/, /^Personel/, 'Fason ve aparat']) {
      await alt.getByRole('tab', { name: ad }).click();
      await expect(alt.getByRole('tab', { name: ad, selected: true })).toBeVisible();
      await expect(kaynaklar.locator('.tc-rr2-govde')).toBeVisible();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    }
    expect(yazmalar(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Kaynaklar: ekleme penceresi vazgeçilince istek gitmez; vardiya düzenleme Vardiya sayfasını açar', async ({ page, ag, ac }) => {
    await ac('/recete-rota/yeni/res');
    const kaynaklar = page.getByRole('region', { name: 'Kaynaklar' });
    const alt = kaynaklar.getByRole('tablist', { name: 'Kaynak türü' });
    await alt.getByRole('tab', { name: 'İş merkezleri ve istasyonlar' }).click({ timeout: 15_000 });
    await kaynaklar.getByRole('button', { name: 'İş merkezi', exact: true }).click();
    const pencere = page.getByRole('dialog', { name: 'Yeni iş merkezi' });
    await expect(pencere.getByLabel('Kod')).not.toHaveValue('');
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(pencere).toBeHidden();
    await alt.getByRole('tab', { name: 'Vardiyalar' }).click();
    await kaynaklar.getByRole('button', { name: "Vardiya'da düzenle" }).click();
    await expect(page).toHaveURL(/\/vardiya$/);
    expect(yazmalar(ag.yazmalar)).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
