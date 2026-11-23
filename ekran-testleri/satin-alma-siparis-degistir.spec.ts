import type { Page } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';
import { ONERI, R1 } from './satin-alma-siparis-degistir.veri.ts';

// 3574-2a: "Siparişi değiştir" penceresi, değişiklik geçmişi (R1, bekleyen R2?) ve onaylayanın önce/sonra görünümü 360, 768 ve 1280'de.
// Talep sentetiktir (ORN-) ve açılış cevabına eklenir; yazma uçları yakalanır, sunucuya gitmez.
test.use({ hesap: 'ornek.yonetici' });
const ID = R1['id'] as string;

async function talepleAc(page: Page, ac: (yol: string) => Promise<void>, talep: Record<string, unknown>): Promise<void> {
  await page.route('**/api/satin-alma-acilis', async (r) => {
    const cevap = await r.fetch();
    const j = await cevap.json() as { talepler: unknown[] };
    j.talepler.push(talep);
    await r.fulfill({ response: cevap, body: JSON.stringify(j) });
  });
  // Sentetik talep veritabanında yok: takip okuması boş cevaplanır (404 bildirimi telefonda pencere alanlarının üstüne düşer).
  await page.route(`**/api/satin-alma-talepleri/${ID}/siparis-takibi`, (r) => r.fulfill({ json: { siparisler: [] } }));
  await ac(`/satin-alma/talepler?talep=${ID}`);
  await page.getByRole('tab', { name: 'Sipariş' }).click();
}

// Alanın ortasında başka öğe yoksa kullanıcı onu görür ve tıklar (Test bakışı: satırlar alanların arkasında kalıyordu).
const ustteMi = (page: Page, sec: string) => page.locator(sec).evaluate((e) => {
  e.scrollIntoView({ block: 'center' });
  const b = e.getBoundingClientRect();
  return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === e && b.height > 20;
});

test.describe('3574-2a Siparişi değiştir', () => {
  test('pencerede bütün satırlar görünür ve düzenlenir; artış onaya gider diye yazılır; kayıt öneri olarak döner', async ({ page, ac, ag }) => {
    await talepleAc(page, ac, R1);
    const genislik = page.viewportSize()!.width;
    await page.getByRole('button', { name: 'Siparişi değiştir' }).click();
    const pencere = page.getByRole('dialog', { name: /Siparişi değiştir/ });
    await expect(pencere).toBeVisible();
    // Masaüstü ve tablette başlıklı tablo; telefonda satır kartı, başlık her hücrede (merkezin duyarlı tablo kuralı).
    const baslik = pencere.locator('[data-sa-siparis-degistir] thead th', { hasText: 'Miktar' });
    if (genislik >= 768) await expect(baslik).toBeVisible();
    else await expect(baslik).toBeHidden();
    // Satır tablosunun kabı tabloyu kesmez (pencere gövdesinde büzülünce birkaç piksele iniyordu).
    expect(await pencere.locator('[data-sa-siparis-degistir] > .tw').evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
    for (const i of [0, 1]) {
      for (const alan of ['m', 'p', 't', 'n']) expect(await ustteMi(page, `#sd-${alan}-${i}`), `#sd-${alan}-${i}`).toBe(true);
    }
    await expect(pencere.getByLabel('ORN-PUL-8 miktar')).toHaveValue('4');
    await expect(pencere.getByText('şu an R1')).toBeVisible();
    await pencere.getByLabel('ORN-MIL-20 miktar').fill('12');
    await expect(pencere.locator('[data-sd-sinif]')).toHaveAttribute('data-sd-sinif', 'onay');
    await expect(pencere.getByText('Tahmini: onaya gider.')).toBeVisible();
    // Gerekçesiz kayıt gitmez; hata okunur ve odak gerekçededir.
    let gonderilen: unknown = null;
    await page.route(`**/api/satin-alma-talepleri/${ID}/siparis-degistir`, async (r) => { gonderilen = r.request().postDataJSON(); await r.fulfill({ json: ONERI }); });
    await pencere.getByRole('button', { name: 'Kaydet' }).click();
    await expect(pencere.getByRole('alert')).toContainText('Gerekçe zorunlu');
    await expect(pencere.getByLabel(/Gerekçe/)).toBeFocused();
    expect(gonderilen).toBeNull();
    await pencere.getByLabel(/Gerekçe/).fill('ORN gerekçe');
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await pencere.getByRole('button', { name: 'Kaydet' }).click();
    await expect(pencere).toBeHidden();
    const g = gonderilen as unknown as { satirlar: { miktar: string }[]; gerekce: string };
    expect([g.satirlar.map((x) => x.miktar), g.gerekce]).toEqual([['12', '4'], 'ORN gerekçe']);
    // Sentetik talebin çizim okumaları 404 döner (çizim paneli sessiz); başka hata yok.
    expect(ag.hatalar.filter((h) => !/cizim|Failed to load resource/.test(h))).toEqual([]);
  });

  test('geçmiş R1 ve bekleyen R2? gösterir; onaylayan önce/sonra görür; ret notsuz gitmez, notla gider', async ({ page, ac }) => {
    await talepleAc(page, ac, ONERI);
    const gecmis = page.locator('[data-sa-sd-gecmis]');
    await expect(gecmis.getByRole('heading', { name: /Değişiklik geçmişi/ })).toBeVisible();
    await expect(gecmis.locator('li')).toHaveCount(3);
    await expect(gecmis.locator('[data-sd-gecmis="bekliyor"]')).toContainText('R2?');
    await expect(gecmis.locator('[data-sd-gecmis="onaysiz"]')).toContainText('R1');
    await expect(gecmis.locator('[data-sd-gecmis="r0"]')).toContainText('Sipariş verildi');
    // Bekleyen varken yeni değişiklik açılmaz; neden okunur.
    await expect(page.getByRole('button', { name: 'Siparişi değiştir' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Önce bekleyen değişiklik sonuçlansın.')).toBeVisible();

    const kutu = page.locator('[data-sa-siparis-degisikligi-onerisi]');
    const tablo = kutu.getByRole('table', { name: 'Bekleyen değişiklikler' });
    await expect(tablo).toBeVisible();
    await expect(tablo).toContainText('ORN-MIL-20');
    await expect(tablo).toContainText('onaya düşürür');
    await expect(kutu.getByRole('button', { name: /^Onayla, \+/ })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);

    let karar: unknown = null;
    await page.route(`**/api/satin-alma-talepleri/${ID}/siparis-onerisi-karari`, async (r) => { karar = r.request().postDataJSON(); await r.fulfill({ json: R1 }); });
    await kutu.getByRole('button', { name: 'Reddet' }).click();
    await expect(kutu.getByLabel(/Not/)).toHaveAttribute('aria-invalid', 'true');
    expect(karar).toBeNull();
    await kutu.getByLabel(/Not/).fill('ORN fiyat yüksek');
    await kutu.getByRole('button', { name: 'Reddet' }).click();
    await expect.poll(() => karar).toMatchObject({ sonuc: 'ret', notlar: 'ORN fiyat yüksek' });
  });

  test('Onaylar listesinde sipariş değişikliği rozetiyle görünür', async ({ page, ac }) => {
    await page.route('**/api/satin-alma-acilis', async (r) => {
      const cevap = await r.fetch();
      const j = await cevap.json() as { talepler: unknown[] };
      j.talepler.push(ONERI);
      await r.fulfill({ response: cevap, body: JSON.stringify(j) });
    });
    await ac('/satin-alma/onaylar');
    const satir = page.getByRole('row', { name: /ORN değişecek sipariş/ });
    await expect(satir).toBeVisible({ timeout: 15_000 });
    await expect(satir.getByText('Sipariş değişikliği')).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  });
});
