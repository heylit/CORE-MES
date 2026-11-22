import { expect, tasmaOlc, test } from './ortak.ts';

// Planlama TS ekranı, P6 Sevk takvimi (eski adıyla Sevkiyat). Çalışma okuması sentetik çalışmayla karşılanır (örnek veride çözülmüş plan yoktur); öteki uçlar gerçektir.
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

test.describe('P6 Sevk takvimi', () => {
  test('Liste açılır: çipler, arama, satır açılımı; Takvim ısı haritası, Grafik özet ve akış; seçimler çalışır; yatay taşma yok, yazma gitmez', async ({ page, ag, ac }) => {
    await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ calisma: CALISMA, surum: 1 }),
    }));
    await ac('/plan/sevkiyat');
    const kap = page.locator('[data-gorunum="sevkiyat"]');
    // Asıl görünüm Liste: geç satır üstte, sevk edilen altta; "Tüm satırlar" katı yok.
    const tablo = kap.getByRole('table', { name: 'Siparişler' });
    await expect(tablo).toBeVisible({ timeout: 15_000 });
    await expect(kap.getByRole('heading', { name: 'Sevk takvimi', level: 2 })).toBeVisible();
    await expect(kap.getByText('Tüm satırlar', { exact: true })).toHaveCount(0);
    await expect(kap.getByText('+6 sa')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    const cipler = kap.getByRole('group', { name: 'Durum süzgeci' });
    await cipler.getByRole('button', { name: /Geç/ }).click();
    await expect(tablo.getByRole('button', { name: /ayrıntısı/ })).toHaveCount(1);
    await cipler.getByRole('button', { name: /Geç/ }).click();
    await kap.getByRole('searchbox', { name: 'Ara' }).fill('ORN-S3');
    await expect(tablo.getByRole('button', { name: /ayrıntısı/ })).toHaveCount(1);
    await kap.getByRole('searchbox', { name: 'Ara' }).fill('');
    await tablo.getByRole('button', { name: /^ORN-S1 ayrıntısı$/ }).click();
    const acilim = kap.getByRole('region', { name: /^ORN-S1 · / });
    await expect(acilim.getByText('Ertelenmiş plan 1')).toBeVisible();
    await expect(acilim.getByText('Sevk kaydı', { exact: false }).first()).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

    // Takvim (768 ve üstü): bugünkü ısı haritası, hücre açılımı, Esc kapatır.
    const takvim = kap.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Takvim', exact: true });
    if (await takvim.count()) {
      await takvim.click();
      const izgara = kap.getByRole('group', { name: 'Sipariş × gün, termine kalan süre' });
      await expect(izgara).toBeVisible();
      await expect(kap.locator('.tc-pyv-nabiz')).toContainText('En sıcak satır ORN-S2');
      await izgara.getByRole('button', { name: /^ORN-S2, 03\.03 Sal: / }).click();
      const hucre = kap.getByRole('region', { name: /^ORN-S2 · / });
      await expect(hucre.getByText('ORN-S2 termini 02.03 Pzt, plan 03.03 Sal sevke hazır diyor: 6 sa geç.')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(hucre).toBeHidden();
      expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    }

    // Grafik: dönem özeti ve bitiş akışı.
    await kap.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Grafik', exact: true }).click();
    await expect(kap.getByRole('heading', { name: 'Sevkiyat özeti' })).toBeVisible();
    await expect(kap.getByRole('heading', { name: 'Bitiş tarihi akışı' })).toBeVisible();
    await expect(kap.getByRole('img', { name: 'Dönem başına sevkiyat' })).toBeVisible();
    await kap.getByRole('group', { name: 'Ölçü' }).getByRole('button', { name: 'Adet', exact: true }).click();
    await kap.getByRole('group', { name: 'Gösterim' }).getByRole('button', { name: 'Tablo', exact: true }).click();
    await expect(kap.getByRole('img', { name: 'Dönem başına sevkiyat' })).toBeHidden();
    await kap.getByRole('group', { name: 'Dönem' }).getByRole('button', { name: 'Hafta', exact: true }).click();
    await expect(kap.getByText(/\. hafta · 02\.03/).first()).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await expect(kap.locator('input[type="date"]')).toHaveCount(0);

    // "Kokpit'te gör" siparişi seçip Kokpit'i açar (3537 a): Liste'ye dönüp satır eylemini (ya da telefonda açılımdakini) kullanır.
    await kap.getByRole('group', { name: 'Görünüm' }).getByRole('button', { name: 'Liste', exact: true }).click();
    const doganEylem = kap.getByRole('button', { name: "ORN-S2 Kokpit'te gör" });
    if (await doganEylem.count()) await doganEylem.click();
    else {
      await kap.getByRole('button', { name: /^ORN-S2 ayrıntısı$/ }).click();
      await kap.getByRole('region', { name: /^ORN-S2 · / }).getByRole('button', { name: "Kokpit'te gör" }).click();
    }
    await expect(page).toHaveURL(/\/plan$/);
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('çözülmüş plan yoksa yalnız uyarı çıkar; çip, arama ve görünüm seçici yok', async ({ page, ag, ac }) => {
    await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ calisma: { ...CALISMA, plan: null }, surum: 1 }),
    }));
    await ac('/plan/sevkiyat');
    await expect(page.getByText('Önce plan kurulmalı.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('group', { name: 'Durum süzgeci' })).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Ara' })).toHaveCount(0);
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
