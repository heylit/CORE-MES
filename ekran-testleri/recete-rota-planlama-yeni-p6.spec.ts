import { expect, tasmaOlc, test } from './ortak.ts';

// Planlama TS ekranı, P6 Sevkiyat. Çalışma okuması sentetik çalışmayla karşılanır (örnek veride çözülmüş plan yoktur); öteki uçlar gerçektir.
// Projeler her testi 360, 768 ve 1280 genişlikte koşar. Görünüm yalnız okur (soru 355): yazma gitmez.
test.use({ hesap: 'ornek.yonetici' });

const CALISMA = {
  surum: 2, dataVer: 3,
  D: {
    meta: { baslangic: '2099-03-02' },
    musteriler: [{ id: 'm1', ad: 'Deneme Musteri' }],
    urunler: [{ id: 'u1', ad: 'Deneme Urun', rota: [{ k: 'a', ad: 'Torna' }, { k: 'b', ad: 'Son olcum' }] }],
    tezgahlar: [{ id: 't1' }],
    siparisler: [
      { id: 'ORN-S1', urun: 'u1', adet: 10, termin: '2099-03-03 12:00', musteri: 'm1' },
      { id: 'ORN-S2', urun: 'u1', adet: 5, termin: '2099-03-02 20:00' },
      { id: 'ORN-S3', urun: 'u1', adet: 7, termin: '2099-03-20' },
    ],
  },
  plan: {
    dataVer: 3,
    J: { 'ORN-S1': { C: 20, T: 0 }, 'ORN-S2': { C: 26, T: 6 }, 'ORN-S3': { C: 200, T: 0 } },
    ops: { 'ORN-S1.b': { job: 'ORN-S1', C: 20, m: 't1' }, 'ORN-S2.a': { job: 'ORN-S2', C: 26, fas: 1 }, 'ORN-S3.b': { job: 'ORN-S3', C: 200, m: 't1' } },
  },
  sevkEdildi: { 'ORN-S1': { t: '2099-03-04', kim: 'Deneme' } },
  sevkIz: { 'ORN-S1': [{ C: 18, t: 1, kaynak: 'plan', kim: 'Deneme' }, { C: 20, t: 5, kaynak: 'plan', kim: 'Deneme' }] },
};

test.describe('P6 Sevkiyat', () => {
  test('ısı haritası ve açılım; Tüm satırlar altında özet, iş listesi ve bitiş akışı; seçimler çalışır; yatay taşma yok, yazma gitmez', async ({ page, ag, ac }) => {
    await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ calisma: CALISMA, surum: 1 }),
    }));
    await ac('/plan/sevkiyat');
    const kap = page.locator('[data-gorunum="sevkiyat"]');
    // Üstte ısı haritası; asıl içerik "Tüm satırlar" altında kapalı gelir.
    const izgara = kap.getByRole('group', { name: 'Sipariş × gün, termine kalan süre' });
    await expect(izgara).toBeVisible({ timeout: 15_000 });
    await expect(kap.locator('.tc-isi-durum')).toContainText('En sıcak satır ORN-S2');
    await expect(kap.getByRole('heading', { name: 'Plana göre bitmesi gereken işler' })).toBeHidden();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await izgara.getByRole('button', { name: /^ORN-S2, 03\.03 Sal: / }).click();
    const acilim = kap.getByRole('region', { name: /^ORN-S2 · / });
    await expect(acilim.getByText('ORN-S2 termini 02.03 Pzt, plan 03.03 Sal sevke hazır diyor: 6 sa geç.')).toBeVisible();
    await expect(acilim.getByRole('button', { name: /ORN-S2 çizelgede/ })).toBeDisabled();
    await expect(acilim.getByText('Bunu değiştirme yetkiniz yok.')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(acilim).toBeHidden();
    await kap.getByText('Tüm satırlar', { exact: true }).click();
    await expect(kap.getByRole('heading', { name: 'Plana göre bitmesi gereken işler' })).toBeVisible();
    await expect(kap.getByRole('heading', { name: 'Sevkiyat özeti' })).toBeVisible();
    await expect(kap.getByRole('heading', { name: 'Bitiş tarihi akışı' })).toBeVisible();
    await expect(kap.getByRole('img', { name: 'Dönem başına sevkiyat' })).toBeVisible();
    await expect(kap.getByText('6 sa geç')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

    await kap.getByRole('group', { name: 'Ölçü' }).getByRole('button', { name: 'Adet', exact: true }).click();
    await kap.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Tablo', exact: true }).click();
    await expect(kap.getByRole('img', { name: 'Dönem başına sevkiyat' })).toBeHidden();
    await kap.getByRole('group', { name: 'Dönem' }).first().getByRole('button', { name: 'Hafta', exact: true }).click();
    await expect(kap.getByText(/\. hafta · 02\.03/).first()).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await expect(kap.locator('input[type="date"]')).toHaveCount(0);
    expect(ag.yazmalar.filter((y) => y !== 'POST /api/plan/planlama-calismasi/olustur')).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('çözülmüş plan yoksa harita boş, Tüm satırlar uyarı verir', async ({ page, ag, ac }) => {
    await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ calisma: { ...CALISMA, plan: null }, surum: 1 }),
    }));
    await ac('/plan/sevkiyat');
    await expect(page.getByText('Plan kurulunca siparişlerin sevk günleri burada görünür.')).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-gorunum="sevkiyat"]').getByText('Tüm satırlar', { exact: true }).click();
    await expect(page.getByText('Önce plan kurulmalı.')).toBeVisible();
    expect(ag.yazmalar.filter((y) => y !== 'POST /api/plan/planlama-calismasi/olustur')).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
