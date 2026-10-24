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
  test('özet, iş listesi ve bitiş akışı çizilir; seçimler çalışır; yatay taşma yok, yazma gitmez', async ({ page, ag, ac }) => {
    await page.route('**/api/recete-rota/planlama-calismasi', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ calisma: CALISMA, surum: 1 }),
    }));
    await ac('/recete-rota/planlama-yeni/sevkiyat');
    const kap = page.locator('[data-gorunum="sevkiyat"]');
    await expect(kap.getByRole('heading', { name: 'Plana göre bitmesi gereken işler' })).toBeVisible({ timeout: 15_000 });
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
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('çözülmüş plan yoksa yalnız uyarı çıkar', async ({ page, ag, ac }) => {
    await page.route('**/api/recete-rota/planlama-calismasi', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ calisma: { ...CALISMA, plan: null }, surum: 1 }),
    }));
    await ac('/recete-rota/planlama-yeni/sevkiyat');
    await expect(page.getByText('Önce plan kurulmalı.')).toBeVisible({ timeout: 15_000 });
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
