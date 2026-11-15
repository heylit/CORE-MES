import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';
import type { Hesap } from './ortak.ts';
import { oturumDosyasi } from './yollar.ts';

// 3269 a: proje görevleri 360, 768 ve 1280 genişlikte yatay taşmadan çizilir. Örnek veride proje yoktur; her test kendi siparişini,
// projesini ve görevini API'den açar (ekran kaydı yazmaz). Görev ornek.planlama'nın, kontrolü ornek.kalite'nindir.
const kisiId = (hesap: Hesap): number => (JSON.parse(readFileSync(oturumDosyasi(hesap), 'utf8')) as { kisiId: number }).kisiId;
const tarih = (gun: number): string => new Date(Date.now() + gun * 86_400_000).toISOString().slice(0, 10);

async function yaz<T>(istek: APIRequestContext, yol: string, govde: unknown): Promise<T> {
  const c = await istek.post(`${ADRES}/api${yol}`, { headers: { 'istek-kimligi': randomUUID() }, data: govde });
  expect(c.status(), `${yol}: ${await c.text()}`).toBe(200);
  return await c.json() as T;
}

// Yönetici onaylı sipariş ve ona bağlı proje açar, içine kontrollü bir görev ekler; kontrolde: görev planlamacıca bitirilip kontrole düşer.
async function projeVeGorev(page: Page, ad: string, kontrolde: boolean): Promise<{ projeId: number; gorevId: number }> {
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  const kart = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number }[] }).satirlar[0];
  test.skip(firma === undefined || kart === undefined, 'örnek veride müşteri firması ya da satılan kart yok');
  const siparis = await yaz<{ id: number; surum: number }>(page.request, '/siparisler/ekle', {
    firmaId: firma?.id, siparisTarihi: tarih(0), termin: tarih(30), kdvOrani: '20', satirlar: [{ malzemeNo: kart?.no, miktar: '10', birimFiyat: '100.00' }],
  });
  await yaz(page.request, `/siparisler/${String(siparis.id)}/onayla`, { surum: siparis.surum });
  const kod = `ORN_EK.${randomUUID().slice(0, 8).toUpperCase()}`;
  const proje = await yaz<{ id: number }>(page.request, '/projeler', {
    kod, ad: 'ORN ekran projesi', siparisId: siparis.id, baslangic: tarih(-10), bitis: tarih(30), sablonId: null,
  });
  const yonetim = await yaz<{ gorevler: { id: number }[] }>(page.request, `/projeler/${String(proje.id)}/gorevler`, {
    ad, asama: 'Mühendislik', planBaslangic: tarih(-5), planBitis: tarih(5), sorumluKisiId: kisiId('ornek.planlama'),
    kontrolKisiId: kisiId('ornek.kalite'),
  });
  const gorevId = yonetim.gorevler.at(-1)?.id ?? 0;
  if (kontrolde) {
    const istek = await request.newContext({ baseURL: ADRES, storageState: oturumDosyasi('ornek.planlama') });
    for (const komut of ['basla', 'bitir']) {
      const g = await (await istek.get(`${ADRES}/api/projeler/gorevler/${String(gorevId)}/ayrinti`)).json() as { gorev: { surum: number } };
      await yaz(istek, `/projeler/gorevler/${String(gorevId)}/${komut}`, { surum: g.gorev.surum });
    }
    await istek.dispose();
  }
  return { projeId: proje.id, gorevId };
}

test.describe('yönetici', () => {
  test.use({ hesap: 'ornek.yonetici' });

  test('proje Görevler sekmesi, yan panel ve görev formu taşmaz; kapatmak yazmaz', async ({ page, ac, ag }) => {
    const ad = `ORN görev ${randomUUID().slice(0, 6)}`;
    const { projeId } = await projeVeGorev(page, ad, false);
    await ac(`/projeler/${String(projeId)}`);
    await page.getByRole('tab', { name: /Görevler/ }).click();
    await expect(page.getByText(ad).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Şablondan ekle/ })).toBeVisible();
    expect(await tasmaOlc(page)).toMatchObject({ belge: 0 });
    ag.sifirla();
    await page.getByText(ad).first().click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByText('Örnek Kaliteci')).toBeVisible();
    await panel.getByRole('button', { name: 'Düzenle' }).click();
    const form = page.getByRole('dialog');
    await expect(form.getByLabel(/^Kontrol eden/)).toBeEnabled();
    expect(await tasmaOlc(page)).toMatchObject({ belge: 0 });
    await form.getByRole('button', { name: 'Vazgeç' }).click();
    expect(ag.yazmalar, 'açmak ve Vazgeç yazmaz').toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });

  test('Görev şablonları listesi ve şablon formu taşmaz; Vazgeç yazmaz', async ({ page, ac, ag }) => {
    await ac('/projeler/sablonlar');
    await page.getByRole('button', { name: /Şablon ekle/ }).click();
    const pencere = page.getByRole('dialog');
    await pencere.getByRole('button', { name: /Görev ekle/ }).click();
    await expect(pencere.getByLabel(/Görev adı/)).toBeVisible();
    expect(await tasmaOlc(page)).toMatchObject({ belge: 0 });
    await pencere.getByRole('button', { name: 'Vazgeç' }).click();
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});

test.describe('kalite', () => {
  test.use({ hesap: 'ornek.kalite' });

  test('Proje görevlerim: kontrolündeki görev panelde onaylanabilir, geri gönderme gerekçe ister; taşmaz', async ({ page, ac, ag, browser }) => {
    const ad = `ORN kontrol ${randomUUID().slice(0, 6)}`;
    const yonetici = await browser.newContext({ storageState: oturumDosyasi('ornek.yonetici') });
    await projeVeGorev(await yonetici.newPage(), ad, true);
    await yonetici.close();
    await ac('/proje-gorevlerim');
    const tablo = page.getByRole('table', { name: 'Proje görevlerim' });
    await page.getByRole('tab', { name: /Kontrolümde/ }).click();
    await expect(tablo.getByText(ad).first()).toBeVisible();
    expect(await tasmaOlc(page)).toMatchObject({ belge: 0 });
    await tablo.getByText(ad).first().click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByRole('button', { name: 'Onayla' })).toBeVisible();
    await expect(panel.getByText(/bitirdi/)).toBeVisible();
    await panel.getByRole('button', { name: 'Geri gönder' }).click();
    await expect(panel.getByLabel(/Geri gönderme gerekçesi/)).toBeVisible();
    expect(await tasmaOlc(page)).toMatchObject({ belge: 0 });
    await panel.getByRole('button', { name: 'Vazgeç' }).click();
    expect(ag.yazmalar, 'açmak ve Vazgeç yazmaz').toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
});
