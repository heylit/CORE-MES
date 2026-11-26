import type { Page } from '@playwright/test';
import { expect, test } from './ortak.ts';

// Adım Durumu Tek madde merceği (3738 dilim 2): hücrede tek dokunuş, geri al ve toplu onay. Matris ve yazma sahte cevapla denenir (ortak veritabanına bağlı olmasın).
test.use({ hesap: 'ornek.planlama' });

const sayfaTasmaz = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'sayfa yatay taşmaz').toBeLessThanOrEqual(0);
};
const adim = (isEmriId: number, opNo: number, cnc: 'eksik' | 'tamam', malzeme: 'eksik' | 'gerekmez') => ({
  isEmriId, opNo, ad: opNo === 10 ? 'Kesim' : 'Tornalama', durum: 'bekliyor', hedef: 40, yapilan: 0, yuzde: 0, sistemStatusu: 'baslayabilir', elle: null, sablondanFark: 0,
  maddeler: [{ madde: 'cnc', hal: cnc, ham: cnc, elle: null }, { madde: 'malzeme', hal: malzeme, ham: malzeme, elle: null }],
});
const MATRIS = {
  yazabilir: true,
  emirler: [
    { emirId: 9001, emirNo: 'UE-9001', urun: { kod: 'ORN-1', ad: 'Deneme ürün 1' }, durum: 'planli', teslim: '2026-12-05', adimlar: [adim(90011, 10, 'eksik', 'eksik'), adim(90012, 20, 'tamam', 'eksik')] },
    { emirId: 9002, emirNo: 'UE-9002', urun: { kod: 'ORN-2', ad: 'Deneme ürün 2' }, durum: 'planli', teslim: '2026-12-06', adimlar: [adim(90021, 10, 'eksik', 'gerekmez'), adim(90022, 20, 'eksik', 'eksik')] },
  ],
};

test('Tek madde: tek dokunuş uyaran maddeyi onaylar, Geri al ikinci istektir; durduran maddede gerekçe ve toplu sayım gelir; sayfa taşmaz', async ({ page, ac }) => {
  const govdeler: { madde: string; kalemler: { emirId: number; isEmriId: number; islem: string; gerekce: string | null }[] }[] = [];
  await page.route('**/api/adimli-emirler/adim-matrisi*', (r) => r.fulfill({ json: MATRIS }));
  await page.route('**/api/adimli-emirler/hazirlik-toplu', async (r) => {
    const g = r.request().postDataJSON() as (typeof govdeler)[number];
    govdeler.push(g);
    await r.fulfill({ json: { kalemler: g.kalemler.map((k) => ({ emirId: k.emirId, isEmriId: k.isEmriId, sonuc: k.islem === 'kaldir' ? 'kaldirildi' : 'yazildi', neden: null })) } });
  });
  await ac('/adim-durumu?mercek=tek&madde=malzeme');
  const genislik = page.viewportSize()?.width ?? 0;
  const hucre = page.getByRole('table').getByRole('button', { name: /UE-9001, OP 10 Kesim: Malzeme/ });
  await expect(hucre).toBeVisible();
  // Dokunma hedefi parmak boyunda (360 ve 768'de simge hücre).
  if (genislik < 1024) expect((await hucre.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('list', { name: 'Madde simgeleri' })).toBeVisible();
  await hucre.click();
  await expect(page.getByText(/^Son yazım \(Malzeme \(girdi stoğu\)\): 1 adım yazıldı\.$/)).toBeVisible();
  expect(govdeler).toHaveLength(1);
  expect(govdeler[0]?.kalemler[0]).toMatchObject({ isEmriId: 90011, islem: 'onayla', gerekce: null });
  await page.getByRole('button', { name: 'Geri al' }).click();
  await expect(page.getByText('Son yazım geri alındı.')).toBeVisible();
  expect(govdeler).toHaveLength(2);
  await sayfaTasmaz(page);

  // Durduran madde: tek dokunuş gerekçe ister, istek gitmez; toplu seçimde sayım yazmadan önce görünür.
  await page.getByLabel('Madde', { exact: true }).selectOption('cnc');
  await page.getByRole('table').getByRole('button', { name: /UE-9002, OP 10 Kesim: CNC kurulumu/ }).click();
  const onay = page.getByRole('region', { name: 'Yazma onayı' });
  await expect(onay.getByRole('button', { name: '1 adımı onayla' })).toBeDisabled();
  expect(govdeler).toHaveLength(2);
  await onay.getByRole('button', { name: 'Vazgeç' }).click();
  await page.getByRole('button', { name: 'Hepsini onayla…' }).click();
  await expect(page.getByRole('region', { name: 'Yazma onayı' })).toContainText(/\d+ seçili: \d+ yazılır/);
  await page.getByRole('region', { name: 'Yazma onayı' }).getByLabel('Gerekçe').fill('Revizyon sorgusu bekliyor');
  await page.getByRole('region', { name: 'Yazma onayı' }).getByRole('button', { name: /adımı onayla$/ }).click();
  await expect(page.getByText(/^Son yazım \(CNC kurulumu\): \d+ adım yazıldı\./)).toBeVisible();
  expect(govdeler).toHaveLength(3);
  expect(govdeler[2]?.kalemler.every((k) => k.gerekce === 'Revizyon sorgusu bekliyor')).toBe(true);
  await sayfaTasmaz(page);
});
