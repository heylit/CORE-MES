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
  test('yıllık plan eski sade düzende açılır; Veri gir sihirbazı açılıp vazgeçilir, bölümler arasında geçilir, sayfa taşmaz, yazma olmaz', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/yillik');
    const gorunum = page.locator('[data-gorunum="yillik"]');
    await expect(gorunum).toBeVisible();
    const bolumler = gorunum.getByRole('tablist', { name: 'Görünüm', exact: true });
    const yok = gorunum.getByText(/Planlama çalışması yok|başlangıç günü okunamadı/);
    await expect(bolumler.or(yok).first()).toBeVisible();
    if (await bolumler.isVisible()) {
      await expect(gorunum.getByRole('heading', { name: 'Şimdi ne yapmalı' })).toBeVisible();
      await bolumler.getByRole('tab', { name: 'Veri gir' }).click();
      await expect(gorunum.getByRole('heading', { name: 'Ne girmek istiyorsunuz?' })).toBeVisible();
      await gorunum.getByRole('button', { name: /^Talep ve kapasite varsayımları/ }).click();
      await expect(gorunum.getByRole('button', { name: 'İleri' })).toBeVisible();
      expect(await tasma(page)).toBeLessThanOrEqual(0);
      await gorunum.getByRole('button', { name: 'Vazgeç' }).click();
      await bolumler.getByRole('tab', { name: 'Tüm ayrıntılar' }).click();
      await expect(gorunum.getByRole('heading', { name: 'Varsayımlar' })).toBeVisible();
      await expect(gorunum.getByRole('group', { name: 'Talep tahmini' })).toBeVisible();
    }
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  // Örnek veride çalışma yoksa sade düzen hiç çizilmez; bu test çalışmayı sentetik veriyle verir (kod, ad ve tutarlar uydurmadır) ve düzeni ölçer.
  test('yıllık plan sade düzeni çalışmayla: Özet, Veri gir sihirbazı ve Tüm ayrıntılar taşmaz, yazma olmaz', async ({ page, ac, ag }) => {
    await page.route('**/api/recete-rota/planlama-calismasi', (r) => r.fulfill({ json: { calisma: SENTETIK, surum: 1 } }));
    await ac('/recete-rota/planlama-yeni/yillik');
    const gorunum = page.locator('[data-gorunum="yillik"]');
    const bolumler = gorunum.getByRole('tablist', { name: 'Görünüm', exact: true });
    await expect(bolumler).toBeVisible();
    await expect(gorunum.getByRole('heading', { name: 'Şimdi ne yapmalı' })).toBeVisible();
    await expect(gorunum.getByText('Bu sayfa nasıl çalışır?')).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await gorunum.getByRole('button', { name: /^Aylık talep tahmini gir/ }).click();
    await gorunum.getByLabel(/Ürün ailesi/).selectOption('A');
    await gorunum.getByRole('button', { name: 'İleri' }).click();
    await expect(gorunum.getByRole('checkbox', { name: 'Yıllık planda elle tahmini kullan' })).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await gorunum.getByRole('button', { name: 'İleri' }).click();
    await expect(gorunum.getByText(/^Kontrol edin\. Kaydet dediğinizde/)).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await gorunum.getByRole('button', { name: 'Vazgeç' }).click();
    await bolumler.getByRole('tab', { name: 'Tüm ayrıntılar' }).click();
    await expect(gorunum.getByRole('heading', { name: 'Varsayımlar' })).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('ufuk açılır; plan varsa yük ızgarası ve malzeme görünümü, yoksa "önce plan" der; sayfa taşmaz', async ({ page, ac, ag }) => {
    await ac('/recete-rota/planlama-yeni/ufuk');
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
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
