import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Planlama TS ekranı, P5 (Yıllık plan, Ufuk). Örnek veride planlama çalışması ya da çözülmüş plan olmayabilir; ekran o durumda "yok" der.
// Ölçüt: görünüm açılır, sayfa yatay taşmaz, açılış yazma yapmaz ve hata vermez (her genişlikte: 360, 768, 1280).
test.use({ hesap: 'ornek.yonetici' });

const tasma = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const SENTETIK = {
  surum: 2, dataVer: 3, simdi: 7,
  D: {
    meta: { baslangic: '2026-10-05' },
    vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
    calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'] },
    tezgahlar: [{ id: 'T1', grup: 'torna', verim: 1 }, { id: 'T2', grup: 'freze', verim: 1 }],
    urunler: [{ id: 'U1', ad: 'Deneme mil', rota: [{ k: '10', aile: 'A', tezgahlar: [{ id: 'T1', ayar: 30, cevrim: 6 }] }] }],
    siparisler: [{ id: 'S1', urun: 'U1', adet: 100, termin: '2026-10-20', siparisTarihi: '2026-10-01', malzeme: [] }],
    malzemeler: [],
  },
};

test.describe('P5 yıllık plan ve ufuk', () => {
  test('yıllık plan bugünkü ısı haritası düzeninde açılır; sayfa taşmaz, açılış yazmaz', async ({ page, ac, ag }) => {
    await ac('/plan/yillik');
    const gorunum = page.locator('[data-gorunum="yillik"]');
    await expect(gorunum).toBeVisible();
    const harita = gorunum.getByRole('region', { name: 'Isı haritası' });
    const yok = gorunum.getByText(/Planlama çalışması yok|başlangıç günü okunamadı/);
    await expect(harita.or(yok).first()).toBeVisible();
    if (await harita.isVisible()) await expect(gorunum.getByText('Tüm satırlar')).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => y !== 'POST /api/plan/planlama-calismasi/olustur')).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  // Örnek veride çalışma yoksa harita hiç çizilmez; bu test çalışmayı sentetik veriyle verir (kod, ad ve tutarlar uydurmadır), planı sunucudaki
  // çözücüyle çözer ve düzeni ölçer. Tek yazma çözüm isteğidir; kayıt yapılmaz.
  test('yıllık plan ısı haritası çalışmayla: çöz, hücre açılımı ve sihirbaz, Esc, Tüm satırlar taşmaz', async ({ page, ac, ag }) => {
    await page.route('**/api/plan/planlama-calismasi', (r) => r.fulfill({ json: { calisma: SENTETIK, surum: 1 } }));
    await ac('/plan/yillik');
    const gorunum = page.locator('[data-gorunum="yillik"]');
    const harita = gorunum.getByRole('region', { name: 'Isı haritası' });
    await expect(harita.getByText(/^Yıllık plan henüz hesaplanmadı/)).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await harita.getByRole('button', { name: 'Yıllık planı çöz' }).click();
    const izgara = harita.getByRole('group', { name: 'Tezgâh grubu × dönem, kapasite kullanımı' });
    await expect(izgara).toBeVisible({ timeout: 60000 });
    await expect(gorunum.locator('.tc-isi-durum')).toContainText('En sıcak blok');
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    const hucre = izgara.locator('button.tc-isi-h').first();
    await hucre.click();
    const acilim = gorunum.locator('.tc-isi-ac');
    await expect(acilim.getByLabel(/Ek mesai sınırı/)).toBeFocused();
    await expect(acilim.getByRole('button', { name: 'Geri' })).toHaveCount(0);
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(acilim).toHaveCount(0);
    await expect(hucre).toBeFocused();
    await gorunum.getByText('Tüm satırlar').click();
    await expect(gorunum.getByRole('heading', { name: 'Varsayımlar' })).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.every((y) => y === 'POST /api/plan/yillik-plan/coz' || y === 'POST /api/plan/planlama-calismasi/olustur')).toBe(true);
    expect(ag.hatalar).toEqual([]);
  });

  test('ufuk açılır; plan varsa yük ızgarası ve malzeme görünümü, yoksa "önce plan" der; sayfa taşmaz', async ({ page, ac, ag }) => {
    await ac('/plan/ufuk');
    const gorunum = page.locator('[data-gorunum="ufuk"]');
    await expect(gorunum).toBeVisible();
    const secim = gorunum.getByRole('group', { name: 'Görünüm' });
    const yok = gorunum.getByText(/Önce plan kurulmalı|Planlama çalışması yok|başlangıç günü okunamadı/);
    await expect(secim.or(yok).first()).toBeVisible();
    if (await secim.isVisible()) {
      await secim.getByRole('button', { name: 'Malzeme' }).click();
      await expect(secim.getByRole('button', { name: 'Malzeme' })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar.filter((y) => y !== 'POST /api/plan/planlama-calismasi/olustur')).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
