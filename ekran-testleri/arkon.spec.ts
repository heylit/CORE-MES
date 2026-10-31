import type { Locator, Response } from '@playwright/test';
import { ADRES, expect, test } from './ortak.ts';

// Arkon'un UYUM-BORCU.md'de "tarayıcıda görülünce kapanır" diye bekleyen davranışları; yalnız okuyan akışlar (örnek veri değişmez).

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  // Yeni ekranda Arkon'un sunucu adresi ayarı yoktur; başka kökene giden istek taşıyıcıda durur (yeni/veri/tasiyici.test.ts).
  test('Arkon Ayarlar başka kökene istek göndermez; Bağlantı kartı görünmez', async ({ page, ag, ac }) => {
    const disari: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(ADRES) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) disari.push(r.url()); });
    await ac('/arkon/ayarlar');
    const f = page.getByRole('region', { name: 'Ayarlar' });
    await expect(f.getByRole('tab', { name: 'Genel', exact: true })).toBeVisible();
    await expect(f.getByRole('button', { name: 'Bağlantıyı dene' })).toHaveCount(0);
    await expect(f.getByText('Kaydet ve bağlan')).toHaveCount(0);
    expect(disari).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Üretim Anomalisi panosu ve dönem görünümü açılır', async ({ page, ag, ac }) => {
    // "Bugün" sunucunun tesis gününe göre hesaplanır; beklenti sayfanın aldığı cevabın kendisinden çıkar. Testin kendi saatiyle
    // karşılaştırmak tesis gece yarısında (örnek veri bir gün önce yüklenmişken) kırılıyordu.
    const bugunCevabi = () => page.waitForResponse((c) => c.request().method() === 'GET' && new URL(c.url()).pathname.endsWith('/arkon/anomaliler'));
    const bugunPanosu = async (f: Locator, cevap: Response): Promise<void> => {
      expect(cevap.ok()).toBe(true);
      const { istasyonlar } = (await cevap.json()) as { istasyonlar: { kod: string }[] };
      const bolge = f.getByRole('region', { name: 'İstasyon' });
      if (istasyonlar.length === 0) await expect(bolge).toContainText('Canlı planda yerleşmiş iş yok');
      else await expect(bolge).toContainText(istasyonlar.some((i) => i.kod === 'ORN-TORNA-1') ? 'ORN-TORNA-1' : istasyonlar[0]?.kod ?? '');
    };
    const ilk = bugunCevabi();
    await ac('/arkon/anomali');
    const f = page.getByRole('region', { name: 'Üretim Anomalisi' });
    await expect(f.getByText('İstasyon', { exact: true }).first()).toBeVisible();
    await bugunPanosu(f, await ilk);
    for (const d of ['Gün', 'Hafta', 'Ay']) {
      await f.getByRole('button', { name: d, exact: true }).click();
      await expect(f.getByRole('button', { name: d, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(f.getByText('Plan uyumu')).toBeVisible();
      await expect(f.getByText('Kayıtlı gün')).toBeVisible();
      await expect(f.locator('input[type="date"]')).toBeVisible();
    }
    const yeniden = bugunCevabi();
    await f.getByRole('button', { name: 'Bugün', exact: true }).click();
    await bugunPanosu(f, await yeniden);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar.filter((y) => !y.startsWith('POST /api/arkon/iletiler')), 'pano okumakla yazmaz').toEqual([]);
  });
});

test.describe('planlama', () => {
  test.use({ hesap: 'ornek.planlama' });

  test('TMI nedenleri ve tesis Ayarlar\'da salt okunur, yalnız TMI listesinden', async ({ page, ag, ac }) => {
    const tmi = await page.request.get(`${ADRES}/api/durus-nedenleri?yalnizAktif=true`);
    expect(tmi.ok()).toBe(true);
    const govde = await tmi.json() as unknown;
    const liste = (Array.isArray(govde) ? govde : (govde as { kayitlar?: unknown[]; nedenler?: unknown[] }).kayitlar ?? (govde as { nedenler?: unknown[] }).nedenler ?? []) as { kod: string; ad: string }[];
    expect(liste.length).toBeGreaterThan(0);

    await ac('/arkon/ayarlar');
    const f = page.locator('main .tc-ay6');
    await f.getByRole('tab', { name: 'Üretim', exact: true }).click();
    await expect(f.getByText('Duruş nedenleri TMI\'de Duruş ve Hurda Nedenleri sayfasından değiştirilir.')).toBeVisible();
    await expect(f.getByText('Hurda nedenleri TMI\'de Duruş ve Hurda Nedenleri sayfasından değiştirilir.')).toBeVisible();
    const satirlar = await f.locator('.tc-ay6-neden').evaluateAll((ss) => ss.map((s) => [s.querySelector('b')?.textContent?.trim(), s.querySelector('span')?.textContent?.trim()]));
    for (const n of liste) expect(satirlar, n.kod).toContainEqual([n.kod, n.ad]);
    await expect(f.getByRole('button', { name: 'Varsayılanlar' })).toHaveCount(0);
    await expect(f.locator('.tc-ay6-neden input')).toHaveCount(0);

    await f.getByRole('tab', { name: 'Tesis', exact: true }).click();
    await expect(f.getByText('Tesis TMI\'de İstasyonlar sayfasından değiştirilir.')).toBeVisible();
    await expect(f.getByText('ORN-TORNA-1').first()).toBeVisible();
    await expect(f.getByRole('button', { name: 'Kaydet' })).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
    expect(ag.yazmalar).toEqual([]);
  });
});
