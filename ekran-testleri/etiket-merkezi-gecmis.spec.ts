import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// Kart 3598: Baskı geçmişinde "Yeniden bas" ve "Çıkmadı". Satırları test kendisi üretir (Çıkmadı bir baskıda yalnız bir kez işaretlenir; genişlik
// projeleri paylaşılan veritabanında art arda koşar). Tarayıcıdan yazdırma ucu yazıcı istemez: sunucu yalnız defteri yazar.

interface Uretilen { baskiId: number }

async function konumIdleri(page: Page): Promise<number[]> {
  const cevap = await page.request.get(`${ADRES}/api/stok/konumlar?sayfa=1&sayfaBoyu=2`);
  const { satirlar } = await cevap.json() as { satirlar: { id: number }[] };
  return satirlar.map((s) => s.id);
}

async function yazdir(page: Page, sablon: string, govde: object): Promise<Uretilen> {
  const c = await page.request.post(`${ADRES}/api/etiket-merkezi/sablonlar/${sablon}/yazdir`, { headers: { 'istek-kimligi': randomUUID() }, data: govde });
  expect(c.ok(), await c.text()).toBe(true);
  return { baskiId: ((await c.json()) as { baskiId: number }).baskiId };
}

const hataliSayisi = async (page: Page): Promise<number> => {
  const ad = (await page.getByRole('tab', { name: /^Hatalı \(\d+\)$/ }).textContent()) ?? '';
  return Number(/\((\d+)\)/.exec(ad)?.[1]);
};

test('Baskı geçmişi: Yeniden bas adetle açılır; Çıkmadı rozet, odak ve Hatalı sayısını işler; deneme etiketinde düğme pasif; yatay taşma yok', async ({ page, ag, ac }) => {
  const idler = await konumIdleri(page);
  test.skip(idler.length === 0, 'örnek veride konum yok');
  const kayitli = await yazdir(page, 'konum-50x25', { adet: 2, kayit: { tur: 'konum', idler } });
  const deneme = await yazdir(page, 'deneme-50x25', { adet: 1 });

  await ac('/etiket-merkezi/baskilar');
  const yenidenBas = page.locator(`[data-baski-yb="${String(kayitli.baskiId)}"]:visible`);
  await expect(yenidenBas).toBeVisible();
  const oncekiHatali = await hataliSayisi(page);
  expect((await tasmaOlc(page)).belge, 'yatay taşma (önce)').toBeLessThanOrEqual(0);

  // Deneme etiketi: pasif düğme ve nedeni görünür metin; dokunmatik ve ekran okuyucu için describedby ile bağlı.
  const neden = page.locator(`#yb-neden-${String(deneme.baskiId)}:visible`);
  await expect(neden).toHaveText('Deneme etiketi: yeniden basılamaz');
  const pasif = page.locator(`[aria-describedby="yb-neden-${String(deneme.baskiId)}"]:visible`);
  await expect(pasif).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator(`[data-baski-yb="${String(deneme.baskiId)}"]`)).toHaveCount(0);

  // Çıkmadı: kırmızı rozet, odak aynı satırın Yeniden bas bağlantısında, Hatalı sekmesi bir artar.
  const satir = page.locator('.tc-etk-satir-islem:visible', { has: yenidenBas });
  await satir.getByRole('button', { name: /Çıkmadı: \d+ kayıt/ }).click();
  await expect(yenidenBas).toBeFocused();
  await expect(page.getByText('Siz işaretlediniz; Basılacaklar\'a döndü.').first()).toBeVisible();
  await expect(satir.getByRole('button', { name: /Çıkmadı: / })).toHaveCount(0);
  // Genişlikler aynı veritabanında paralel koşar; sayı en az bir artmalı, tam değer beklenmez.
  await expect.poll(() => hataliSayisi(page)).toBeGreaterThanOrEqual(oncekiHatali + 1);
  expect((await tasmaOlc(page)).belge, 'yatay taşma (sonra)').toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('gecmis-cikmadi.png') });

  // Hatalı sekmesi işaretli satırı da gösterir.
  await page.getByRole('tab', { name: /^Hatalı \(/ }).click();
  await expect(page.locator(`[data-baski-yb="${String(kayitli.baskiId)}"]:visible`)).toBeVisible();

  // Yeniden bas: Etiket bas aynı kayıtlarla ve önceki adetle (2) açılır.
  await page.locator(`[data-baski-yb="${String(kayitli.baskiId)}"]:visible`).click();
  await expect(page).toHaveURL(new RegExp(`/etiket-merkezi/bas\\?tur=konum&id=${idler.join('%2C')}&adet=2$`));
  await expect(page.getByRole('textbox', { name: 'Adet' })).toHaveValue('2');
  expect((await tasmaOlc(page)).belge, 'yatay taşma (Etiket bas)').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([`POST /api/etiket-merkezi/baskilar/${String(kayitli.baskiId)}/cikmadi`]);
});
