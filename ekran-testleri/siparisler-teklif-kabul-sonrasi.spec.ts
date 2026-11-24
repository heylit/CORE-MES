import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// 3637: kabul edilmiş ve siparişe dönmüş teklife yeni sürüm: sürüm geçmişi, "kabul bekliyor" uyarısı ve "Siparişe uygula" penceresi
// 360, 768 ve 1280 genişlikte yatay taşmadan çizilir. Teklif, sürümler, kabul ve sipariş API'den açılır; sipariş onayı sipariş kaydını
// değiştirmemek için yalnız okuma cevabında "onaylı" gösterilir (onay akışı sunucu testlerindedir).
test.use({ hesap: 'ornek.yonetici' });

interface Teklif { id: number; surum: number; siparisId: number | null; satirlar: { id: number }[] }
const baslik = () => ({ 'istek-kimligi': randomUUID() });

async function post<T>(page: Page, yol: string, data: object): Promise<T> {
  const c = await page.request.post(`${ADRES}/api${yol}`, { headers: baslik(), data });
  expect(c.status(), await c.text()).toBe(200);
  return await c.json() as T;
}

async function siparisliTeklif(page: Page): Promise<Teklif> {
  const bugun = new Date().toISOString().slice(0, 10);
  const sonra = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  const kart = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number }[] }).satirlar[0];
  test.skip(firma === undefined || kart === undefined, 'örnek veride müşteri firması ya da satılan kart yok');
  let t = await post<Teklif>(page, '/siparisler/teklifler/ekle', {
    firmaId: firma?.id, baslik: 'Ekran testi kabul sonrası', satirlar: [{ malzemeNo: kart?.no, tanim: `Ekran testi ${randomUUID().slice(0, 8)}`, miktar: '40' }],
  });
  const fiyat = (b: string) => t.satirlar.map((s) => ({ satirId: s.id, birimFiyat: b }));
  t = await post<Teklif>(page, `/siparisler/teklifler/${String(t.id)}/surum-ver`, { surum: t.surum, fiyatlar: fiyat('10'), kdvOrani: '20', odemeKosulu: '30 gün' });
  t = await post<Teklif>(page, `/siparisler/teklifler/${String(t.id)}/kabul`, { surum: t.surum, surumNo: 1 });
  const d = await post<{ teklif: Teklif }>(page, `/siparisler/teklifler/${String(t.id)}/siparise-donustur`, { surum: t.surum, siparisTarihi: bugun, termin: sonra, kdvOrani: '20', musteriSiparisNo: null });
  t = d.teklif;
  t = await post<Teklif>(page, `/siparisler/teklifler/${String(t.id)}/surum-ver`, { surum: t.surum, fiyatlar: fiyat('8'), kdvOrani: '20', odemeKosulu: '45 gün' });
  return await post<Teklif>(page, `/siparisler/teklifler/${String(t.id)}/kabul`, { surum: t.surum, surumNo: 2 });
}

test('Siparişe dönmüş teklife sürüm: geçmiş rozetleri, eski sürüm uyarısı ve Siparişe uygula penceresi taşmadan çizilir', async ({ page, ag, ac }) => {
  const t = await siparisliTeklif(page);
  // Sipariş taslaktır; pencere onaylı siparişi çizsin diye yalnız okuma cevabı onaylıya çevrilir.
  await page.route(new RegExp(`/api/siparisler/${String(t.siparisId)}$`), async (r) => {
    const cevap = await r.fetch();
    const govde = await cevap.json() as Record<string, unknown>;
    await r.fulfill({ response: cevap, json: { ...govde, durum: 'onayli' } });
  });
  await ac(`/siparisler/teklifler/${String(t.id)}`);
  await expect(page.getByRole('button', { name: 'Yeni sürüm ver' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reddet' })).toHaveCount(0);
  await expect(page.getByText('Sipariş eski sürümde')).toBeVisible();
  await expect(page.getByText('Siparişte', { exact: true })).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Siparişe uygula' }).click();
  const pencere = page.getByRole('dialog', { name: 'Siparişe uygula · sürüm 2' });
  await expect(pencere).toBeVisible();
  await expect(pencere.getByText('Para değişir')).toBeVisible();
  await expect(pencere.getByLabel(/^Gerekçe/)).toBeVisible();
  await expect(pencere.getByRole('button', { name: 'Siparişe uygula' })).toBeDisabled();
  expect((await tasmaOlc(page)).belge, 'pencere açıkken yatay taşma').toBeLessThanOrEqual(0);
  await pencere.getByLabel(/^Gerekçe/).fill('Ekran testi gerekçesi');
  await expect(pencere.getByRole('button', { name: 'Siparişe uygula' })).toBeEnabled();
  expect(ag.hatalar).toEqual([]);
});
