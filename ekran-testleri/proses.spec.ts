import { expect, kesilenBasliklar, tasmaOlc, test } from './ortak.ts';

// Proses parça dosyası (3290): adresteki parça seçimsiz açılır, zincir sekiz halkayı, tablo operasyonları gösterir; üç genişlikte
// yatay taşma yok. Cevap sahte veridir: örnek veride rotalı, balonlu ve ölçümlü parça yoktur; biçim sunucu testiyle aynıdır.
test.use({ hesap: 'ornek.yonetici' });

const halka = (anahtar: string, durum: string, ozet: string | null, sahip: string, yol: string | null) => ({ anahtar, durum, ozet, sahip, yol });
const CEVAP = {
  malzeme: { no: 1, kod: 'ORN-PRC-1042', ad: 'Deneme gövde flanşı' },
  parcaRevizyonu: 'C',
  rota: { revizyon: 'B', acikTaslak: true },
  halkalar: [
    halka('cizim', 'tamam', 'Rev C alındı', 'Kalite Merkezi', '/kalite-merkezi/parcalar'),
    halka('rota', 'tamam', 'Rev B yürürlükte · 3 op · açık taslak var', 'Reçete ve Rota', '/recete-rota/schema'),
    halka('nc', 'kaynak-yok', null, 'Sahibi belli değil', null),
    halka('takim', 'kaynak-yok', null, 'CNC Kurulum', null),
    halka('baglama', 'kaynak-yok', null, 'Rota', null),
    halka('kurulum', 'kaynak-yok', null, 'CNC Kurulum', null),
    halka('kontrol', 'eksik', '12 karakteristik · numune planı yok: OP 30', 'Kalite Merkezi', '/kalite-merkezi/parcalar'),
    halka('ilk-parca', 'eksik', '1/2 açık emirde karar yok', 'Kalite Merkezi', '/kalite-merkezi'),
  ],
  operasyonlar: [
    { opNo: 10, ad: 'Torna ön işleme', fason: false, tezgah: 'ORN-T01', ayarSuresiDk: '30.00', birimSureDk: '6.5000', gercek: { ortancaDk: '7.2000', n: 4 }, karakteristik: 8, talimat: true, numunePlani: true },
    { opNo: 20, ad: 'Isıl işlem', fason: true, tezgah: null, ayarSuresiDk: null, birimSureDk: null, gercek: null, karakteristik: null, talimat: false, numunePlani: false },
    { opNo: 30, ad: 'Freze son işleme', fason: false, tezgah: 'ORN-F02', ayarSuresiDk: '45.00', birimSureDk: '11.0000', gercek: null, karakteristik: null, talimat: false, numunePlani: false },
  ],
};

test('adresteki parçanın proses dosyası açılır: başlıkta parça kodu, sekiz halka, operasyon tablosu; yatay taşma yok', async ({ page, ag, ac }, bilgi) => {
  await page.route('**/api/proses/parca?*', (r) => r.fulfill({ json: CEVAP }));
  await ac('/proses?malzemeNo=1');
  await expect(page.getByRole('heading', { name: 'ORN-PRC-1042 · Deneme gövde flanşı' })).toBeVisible();
  const zincir = page.getByRole('list', { name: 'Proses zinciri' });
  await expect(zincir.getByRole('listitem')).toHaveCount(8);
  await expect(zincir.getByText('Kaynak yok')).toHaveCount(4);
  const tablo = page.getByRole('table', { name: 'Operasyonlar' });
  await expect(tablo.getByText('ORN-T01')).toBeVisible();
  await expect(tablo.getByText('6,5 dk / 7,2 dk (4)')).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(await kesilenBasliklar(page)).toEqual([]);
  await page.screenshot({ path: bilgi.outputPath('proses-parca-dosyasi.png'), fullPage: true });
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'dosya yalnız okur').toEqual([]);
});

test('parça seçilmemişken seçim ister ve sunucuya gitmez', async ({ page, ac }) => {
  let istendi = false;
  await page.route('**/api/proses/parca?*', (r) => { istendi = true; return r.fulfill({ json: CEVAP }); });
  await ac('/proses');
  await expect(page.getByText('Proses zincirini görmek için parça seçin.')).toBeVisible();
  expect(istendi).toBe(false);
});
