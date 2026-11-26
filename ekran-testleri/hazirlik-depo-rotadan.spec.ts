import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// 3702: depo paketinin modu ve listesi rotadan dolar; kaynak satırı üç genişlikte taşmaz. Paket tarayıcıda uydurulur (sentetik, ORN-);
// yalnız doldurma yazısı gider. Görüntü TMIV2_EKRAN_GORUNTU klasörüne yazılır.
const ONERI = { kaynak: 'giren', mode: 'pick', etiket: 'Rotadan: girenler (toplama)', items: [
  { id: 'rota-1', code: 'ORN-HAM-01', name: 'ORN Çubuk Ø40', qty: 3.5, unit: 'kg', loc: '' },
  { id: 'rota-2', code: 'ORN-CIV-02', name: 'ORN Cıvata M8x25', qty: 12, unit: 'adet', loc: '' },
] };
const paket = (id: string, ek: Record<string, unknown> = {}) => ({
  id, no: `ORN-${id}`, opType: 'depo', st: {}, partNo: 'ORN-P', part: 'ORN-Parça', rev: 'A', op: 'Op 30 · Depo', machine: 'ORN-DEPO-1',
  target: 40, cycle: 0, due: '2026-11-27', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [],
  tmi: { emirId: 9900, isEmriId: 99000, opNo: 30, depoOnerisi: ONERI }, status: 'draft', version: 0, dirty: true, createdAt: 1, updatedAt: 2, by: 'Ekran', ...ek,
});
const tasma = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('3702 Depo paketi rotadan', () => {
  test.use({ hesap: 'ornek.yonetici' });
  test('boş depo paketi açılınca dolar; kaynak satırı, elle değişiklik ve eksik kalem işareti sayfayı taşırmaz', async ({ page, ac }, bilgi) => {
    const yazilanlar: unknown[] = [];
    await page.route('**/api/arkon/belgeler/pkgs', (r) => r.fulfill({ json: { belgeler: [{ kimlik: 'depo-1', surum: 1, govde: paket('depo-1') }] } }));
    await page.route('**/api/arkon/belgeler/pkgs/depo-1/yaz', (r) => { yazilanlar.push(r.request().postDataJSON()); return r.fulfill({ json: { sonuc: 'yazildi', surum: 2 } }); });
    await ac('/arkon/hazirlik');
    const duzen = page.getByRole('region', { name: 'İş paketi' });
    // Hazırlık tek listedir: pakete dokunulunca düzenleyici açılır (her genişlikte).
    await page.getByRole('button', { name: /Op 30 · Depo/ }).first().click({ timeout: 20_000 });
    await duzen.getByRole('button', { name: /Toplama listesi/ }).click({ timeout: 20_000 });
    await expect(duzen.getByText('Rotadan: girenler (toplama)')).toBeVisible();
    await expect(duzen.getByLabel('Kod').first()).toHaveValue('ORN-HAM-01');
    expect(yazilanlar.length).toBeGreaterThan(0);
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
    const resim = async (ad: string) => { if (klasor) await page.screenshot({ path: `${klasor}/${ad}-${bilgi.project.name}.png`, fullPage: true }); };
    await resim('depo-rotadan');
    await duzen.getByLabel('Kod').nth(1).fill('');
    await expect(duzen.getByText(/Yayın durur: 1 kalemde kod ya da miktar boş/)).toBeVisible();
    await expect(duzen.getByText('Elle değiştirildi')).toBeVisible();
    await expect(duzen.getByRole('button', { name: 'Rotaya göre yeniden uygula' })).toBeVisible();
    expect(await tasma(page)).toBeLessThanOrEqual(0);
    await resim('depo-elle-eksik');
  });
});
