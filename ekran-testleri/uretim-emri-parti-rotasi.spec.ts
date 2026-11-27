import { randomUUID } from 'node:crypto';
import { request } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';
import { oturumDosyasi } from './yollar.ts';

// 3578: emir ayrıntısında Böl paneli, partiye rota seçimi ve sonuç tablosu 360, 768 ve 1280 genişlikte yatay taşmadan çizilir.
// Emir proje istemeyen Stoğa üretim türündedir (projesiz açılır); FAI partisi ayrı emir olarak sonuç tablosunda görünür.
// Örnek veride iki rotalı ürün ve emir yoktur; test kendi FAI rotasını ve emrini API'den açar (ekran kaydı yazmaz, bölmeyi göndermez).
// FAI rotası ornek.yonetici'nin, onayı ornek.mudur'un.
interface Rotalar { rotalar: { id: number; standart: boolean; emirTurleri: string[]; surum: number }[]; revizyonlar: { id: number; rotaId: number; durum: string }[] }
const tarih = (gun: number): string => new Date(Date.now() + gun * 86_400_000).toISOString().slice(0, 10);

async function yaz<T>(istek: APIRequestContext, yol: string, govde: unknown): Promise<T> {
  const c = await istek.post(`${ADRES}/api${yol}`, { headers: { 'istek-kimligi': randomUUID() }, data: govde });
  expect(c.status(), `${yol}: ${await c.text()}`).toBe(200);
  return await c.json() as T;
}

async function ikiRotaliEmir(page: Page): Promise<number> {
  const adaylar = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number }[] }).satirlar;
  const onayci = await request.newContext({ baseURL: ADRES, storageState: oturumDosyasi('ornek.mudur') });
  try {
    for (const { no } of adaylar) {
      let r = await (await page.request.get(`${ADRES}/api/rota/urunler/${String(no)}`)).json() as Rotalar;
      const standart = r.rotalar.find((x) => x.standart);
      const standartRev = r.revizyonlar.find((x) => x.rotaId === standart?.id && x.durum === 'yururlukte');
      if (standart === undefined || standartRev === undefined) continue;
      let fai = r.rotalar.find((x) => !x.standart && x.emirTurleri.includes('fai'));
      if (fai === undefined) {
        r = await yaz<Rotalar>(page.request, `/rota/urunler/${String(no)}/rotalar`, { emirTuru: 'fai' });
        fai = r.rotalar.find((x) => !x.standart && x.emirTurleri.includes('fai'));
      }
      if (fai === undefined) continue;
      const faiId = fai.id;
      if (!r.revizyonlar.some((x) => x.rotaId === faiId && x.durum === 'yururlukte')) {
        const taslak = await yaz<{ id: number; surum: number }>(page.request, `/rota/urunler/${String(no)}/taslak-ac`, { kaynak: { tur: 'revizyon', revizyonId: standartRev.id }, rotaId: faiId });
        const gonder = await yaz<{ surum: number }>(page.request, `/rota/revizyonlar/${String(taslak.id)}/onaya-gonder`, { surum: taslak.surum });
        await yaz(onayci, `/rota/revizyonlar/${String(taslak.id)}/onayla`, { surum: gonder.surum, yururlugeAl: true });
      }
      const emir = await yaz<{ uretimEmriId: number }>(page.request, `/rota/revizyonlar/${String(standartRev.id)}/emre-kopyala`, { adet: 100, teslim: tarih(20), emirTuru: 'stok' });
      return emir.uretimEmriId;
    }
  } finally { await onayci.dispose(); }
  test.skip(true, 'örnek veride yürürlükte rotası olan satılabilir kart yok');
  return 0;
}

// Genişlik Playwright projesinden gelir (g360, g768, g1280).
{
  test('parti rotası: Böl paneli ve sonuç yatay taşmaz', async ({ page, ag, ac }) => {
    const id = await ikiRotaliEmir(page);
    await ac(`/uretim-emirleri/${String(id)}`);
    const ayrinti = page.getByRole('main');
    await ayrinti.getByRole('button', { name: /işlemleri$/ }).first().click();
    await page.getByRole('menuitem', { name: 'Böl (parti ya da kol)' }).click();
    await ayrinti.getByRole('button', { name: 'Partilere böl' }).click();
    const p1 = ayrinti.getByRole('group', { name: 'Parti 1 adet, tür ve rota' });
    await p1.getByLabel('Parti 1', { exact: true }).fill('30');
    const rota = p1.getByRole('combobox', { name: 'Parti rotası' });
    await expect(rota).toBeEnabled({ timeout: 15_000 });
    await expect(rota.locator('option').first()).toHaveText(/^Ana emirle aynı \(.+ · Rota .+\)$/);
    await rota.selectOption({ index: 1 });
    const sonuc = ayrinti.getByRole('table', { name: 'Bölme sonucu' });
    await expect(sonuc).toBeVisible();
    await expect(sonuc.getByText('Ayrı emir; ana emre birleşmez')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    // Sonuç tablosu kendi kutusunda kesilmez (360'ta satır kartı olur).
    expect(await sonuc.evaluate((t) => t.scrollWidth - (t.parentElement?.clientWidth ?? t.clientWidth))).toBeLessThanOrEqual(0);
    await expect(ayrinti.getByRole('button', { name: 'Partilere böl ve onaya gönder' })).toBeVisible();
    expect(ag.hatalar).toEqual([]);
  });
}
