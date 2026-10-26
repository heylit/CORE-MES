import type { Frame, Page, Response } from '@playwright/test';
import { ADRES, cerceve, expect, test } from './ortak.ts';

// Arkon'un UYUM-BORCU.md'de "tarayıcıda görülünce kapanır" diye bekleyen davranışları; yalnız okuyan akışlar (örnek veri değişmez).

// Her çerçevede CSP ihlali sayılır; ilke zorlayıcı kipteyken ihlal, engellenen bir yükleme demektir.
async function ihlalSay(page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    const w = window as unknown as { __ihlaller?: string[] };
    w.__ihlaller = [];
    document.addEventListener('securitypolicyviolation', (e) => { w.__ihlaller?.push(`${e.violatedDirective} ${e.blockedURI}`); });
  });
}
const ihlaller = (f: Frame) => f.evaluate(() => (window as unknown as { __ihlaller?: string[] }).__ihlaller ?? null);

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  // Sayfa başına ayrı test: sekiz çerçeve yüklemesi tek testte CI'nin dar genişlik koşusunda test süre sınırını aşıyordu.
  for (const s of ['pano', 'planlama', 'hazirlik', 'anomali', 'kalite', 'bakim', 'raporlar', 'ayarlar']) {
    test(`Arkon ${s} sayfası zorlayıcı CSP ile açılır, ihlal yok`, async ({ page, ag, ac }) => {
      await ihlalSay(page);
      const basliklar: { zorlayici: string | undefined; rapor: string | undefined }[] = [];
      page.on('response', (c) => {
        if (c.url().includes('/arkon-mes/') && c.request().resourceType() === 'document') {
          const b = c.headers();
          basliklar.push({ zorlayici: b['content-security-policy'], rapor: b['content-security-policy-report-only'] });
        }
      });
      await ac(`/arkon/eski/${s}`);
      const f = await cerceve(page);
      await expect(f.locator('body')).toContainText(/\S/);
      expect(await ihlaller(f), s).toEqual([]);
      expect(basliklar.length).toBeGreaterThan(0);
      for (const b of basliklar) {
        expect(b.zorlayici).toContain("default-src 'self'");
        expect(b.zorlayici).toContain("connect-src 'self'");
        expect(b.zorlayici).not.toContain("'unsafe-eval'");
        expect(b.rapor).toBeUndefined();
      }
      expect(ag.hatalar).toEqual([]);
    });
  }

  test('gömülü Arkon başka kökene istek göndermez; Bağlantı kartı görünmez', async ({ page, ag, ac }) => {
    const disari: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(ADRES) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) disari.push(r.url()); });
    await ac('/arkon/eski/ayarlar');
    const f = await cerceve(page);
    await expect(f.getByRole('button', { name: 'Genel', exact: true })).toBeVisible();
    await expect(f.getByText('Hesap', { exact: true }).or(f.getByText('HESAP', { exact: true })).first()).toBeVisible();
    await expect(f.getByRole('button', { name: 'Bağlantıyı dene' })).toHaveCount(0);
    await expect(f.getByText('Kaydet ve bağlan')).toHaveCount(0);
    const durum = await f.evaluate(async () => {
      const c = await fetch('http://192.0.2.1:9/api/log/events');
      return { durum: c.status, govde: await c.text() };
    });
    expect(durum.durum).toBe(403);
    expect(disari).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Üretim Anomalisi panosu ve dönem görünümü açılır', async ({ page, ag, ac }) => {
    // "Bugün" sunucunun tesis gününe göre hesaplanır; beklenti sayfanın aldığı cevabın kendisinden çıkar. Testin kendi saatiyle
    // karşılaştırmak tesis gece yarısında (örnek veri bir gün önce yüklenmişken) kırılıyordu.
    const bugunCevabi = () => page.waitForResponse((c) => c.request().method() === 'GET' && new URL(c.url()).pathname.endsWith('/arkon/anomaliler'));
    const bugunPanosu = async (f: Frame, cevap: Response): Promise<void> => {
      expect(cevap.ok()).toBe(true);
      const { istasyonlar } = (await cevap.json()) as { istasyonlar: { kod: string }[] };
      const bolge = f.getByRole('region', { name: 'İstasyon' });
      if (istasyonlar.length === 0) await expect(bolge).toContainText('Canlı planda yerleşmiş iş yok');
      else await expect(bolge).toContainText(istasyonlar.some((i) => i.kod === 'ORN-TORNA-1') ? 'ORN-TORNA-1' : istasyonlar[0]?.kod ?? '');
    };
    const ilk = bugunCevabi();
    await ac('/arkon/eski/anomali');
    const f = await cerceve(page);
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
    expect(ag.yazmalar, 'pano okumakla yazmaz').toEqual([]);
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

    // Eski görünüm yalnız yöneticidedir (681 a): planlamacı Ayarlar'ı yeni ekranda görür, eski adres ona kapalıdır.
    await ac('/arkon/eski/ayarlar');
    await expect(page.getByRole('heading', { name: 'Yetkiniz yok' })).toBeVisible();
    await expect(page.locator('main iframe')).toHaveCount(0);
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
