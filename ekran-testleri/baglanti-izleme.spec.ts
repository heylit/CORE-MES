import { expect, tasmaOlc, test } from './ortak.ts';

// Bağlantı izleme (3313): üç kart, görünüm çipleri ve liste her genişlikte taşmasız; akışlarda okunmamış gelen akış "Henüz okunmadı".
test.use({ hesap: 'ornek.yonetici' });

test('bağlantı izleme: kartlar, çipler ve liste taşmaz; ayrıntı paneli açılır', async ({ page, ag, ac }) => {
  await ac('/guvenlik/baglantilar');
  await expect(page.getByRole('region', { name: 'Gitmeyen belgeler' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Logo yardımcısı' })).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  const satir = page.getByRole('table', { name: 'Gitmeyen belgeler' }).getByRole('row').nth(1);
  if (await satir.count() > 0 && !(await satir.textContent())?.includes('Gitmeyen belge yok')) {
    await satir.click();
    await expect(page.getByRole('heading', { name: 'Ne yapmalı' })).toBeVisible();
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Akışlar' }).click();
  await expect(page.getByText('Henüz okunmadı').first()).toBeVisible();
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
});

// 3315: projesi Logo'ya gitmemiş belge "Proje bekliyor" sayılır; rozet yalnız sayaç 0'dan büyükken, çip her zaman. Logo listesi sahte cevapla.
test('bağlantı izleme: Proje bekliyor rozeti ve çipi taşmaz; çip listeyi süzer', async ({ page, ag, ac }) => {
  const satir = (no: number, durum: string, neden: string, belgeAdi: string) => ({
    belge: 'satin-alma-talebi', belgeAdi, no, islem: 'gonder', durum, neden, neYapmali: 'Proje Logo\'ya gidince belge kendiliğinden gider.',
    yenidenGonderilebilir: false, denemeSayisi: null, sonDeneme: null, sonrakiDeneme: null,
  });
  await page.route('**/api/logo/giden', (r) => r.fulfill({ json: {
    sayac: { durdu: 0, yenidenDenenecek: 0, kartBekliyor: 1, projeBekliyor: 2, sirada: 0 },
    belgeler: [
      satir(901, 'proje-bekliyor', "ORN_EK.PRJ01 Logo'ya gidince belge kendiliğinden gider.", 'Satın alma talebi ST-ORN-901'),
      satir(902, 'proje-bekliyor', "ORN_EK.PRJ01 Logo'ya gidince belge kendiliğinden gider.", 'Satın alma talebi ST-ORN-902'),
      satir(903, 'kart-bekliyor', 'Kart bekliyor: HM-ORN-00903.', 'Satın alma talebi ST-ORN-903'),
    ],
    kesildi: false,
  } }));
  await ac('/guvenlik/baglantilar');
  const kart = page.getByRole('region', { name: 'Gitmeyen belgeler' });
  await expect(kart.getByText('2 proje bekliyor')).toBeVisible();
  const cip = page.getByRole('button', { name: 'Proje bekliyor 2' });
  await expect(cip).toHaveAttribute('aria-pressed', 'false');
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  for (const d of await page.getByRole('group', { name: 'Görünüm' }).getByRole('button').all()) {
    expect(await d.evaluate((e) => e.scrollWidth - e.clientWidth), 'çip metni kesilmez').toBeLessThanOrEqual(0);
  }
  await page.screenshot({ path: test.info().outputPath('proje-cip-secili-degil.png'), fullPage: true });
  await cip.click();
  await expect(cip).toHaveAttribute('aria-pressed', 'true');
  const tablo = page.getByRole('table', { name: 'Gitmeyen belgeler' });
  await expect(tablo.getByText('Satın alma talebi ST-ORN-901')).toBeVisible();
  await expect(tablo.getByText('Satın alma talebi ST-ORN-903')).toHaveCount(0);
  expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
  await page.screenshot({ path: test.info().outputPath('proje-cip-secili.png'), fullPage: true });
  expect(ag.hatalar).toEqual([]);
});
