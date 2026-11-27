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
    halka('nc', 'eksik', '2 program · 1 onaysız', 'Proses', null),
    halka('takim', 'tamam', '7 takım satırı', 'Proses', null),
    halka('baglama', 'tamam', '2 aparat satırı', 'Proses', null),
    halka('kurulum', 'kaynak-yok', null, 'CNC Kurulum', null),
    halka('kontrol', 'eksik', '12 karakteristik · numune planı yok: OP 30', 'Kalite Merkezi', '/kalite-merkezi/parcalar'),
    halka('ilk-parca', 'eksik', '1/2 açık emirde karar yok', 'Kalite Merkezi', '/kalite-merkezi'),
  ],
  operasyonlar: [
    { opNo: 10, ad: 'Torna ön işleme', fason: false, tezgah: 'ORN-T01', ayarSuresiDk: '30.00', birimSureDk: '6.5000', gercek: { ortancaDk: '7.2000', n: 4 }, karakteristik: 8, talimat: true, numunePlani: true },
    { opNo: 20, ad: 'Isıl işlem', fason: true, tezgah: null, ayarSuresiDk: null, birimSureDk: null, gercek: null, karakteristik: null, talimat: false, numunePlani: false },
    { opNo: 30, ad: 'Freze son işleme', fason: false, tezgah: 'ORN-F02', ayarSuresiDk: '45.00', birimSureDk: '11.0000', gercek: null, karakteristik: null, talimat: false, numunePlani: false },
  ],
  revizyonlar: [{ kod: 'C', durum: 'yururlukte' }, { kod: 'B', durum: 'eski' }, { kod: 'A', durum: 'eski' }],
  seciliRevizyon: 'C',
  ncProgramlari: [
    {
      id: 11, opNo: 10, revizyonKodu: null, ad: 'ORN1042_OP10', kontrol: 'iso', makine: { id: 1, kod: 'ORN-T01' },
      camYazilimi: 'ORN-CAM 2026', camDosyasi: 'ornek/1042/op10.cam', sifirNoktasi: 'Ön yüz merkezi', cevrimSuresiDk: '6.50', durum: 'onayli',
      aciklama: null, surum: 3, guncelleme: '2026-11-20T08:00:00.000Z',
      takimlar: [
        { tNo: 'T1', kart: { id: 21, kod: 'ORN-TK-KABA', ad: 'Kaba tornalama ucu' }, tutucu: 'ORN-PCLNR', cikintiMm: '40.00', islem: 'Alın ve dış çap kaba' },
        { tNo: 'T3', kart: { id: 22, kod: 'ORN-TK-FIN', ad: 'Finiş ucu' }, tutucu: 'ORN-SVJBR', cikintiMm: '40.00', islem: 'Dış çap finiş' },
      ],
      aparatlar: [{ kart: { id: 31, kod: 'ORN-APR-AYNA', ad: 'Yumuşak ayna çenesi' }, aciklama: 'Ø80 iç sıkma' }],
      genelYerine: false,
    },
    {
      id: 12, opNo: 30, revizyonKodu: 'C', ad: 'ORN1042_OP30_RC', kontrol: 'heidenhain', makine: { id: 2, kod: 'ORN-F02' },
      camYazilimi: 'ORN-CAM 2026', camDosyasi: 'ornek/1042/op30-revc.cam', sifirNoktasi: 'G54, üst yüzey merkezi (3B prob)', cevrimSuresiDk: '11.70', durum: 'taslak',
      aciklama: 'Rev C: cep derinliği 12 mm oldu, T12 eklendi.', surum: 1, guncelleme: '2026-11-27T07:30:00.000Z',
      takimlar: [
        { tNo: 'T5', kart: { id: 23, kod: 'ORN-TK-D63', ad: 'Tarama freze Ø63' }, tutucu: 'SK40 kaba', cikintiMm: '55.00', islem: 'Üst yüzey' },
        { tNo: 'T8', kart: { id: 24, kod: 'ORN-TK-D10', ad: 'Parmak freze Ø10' }, tutucu: 'SK40 pens', cikintiMm: '35.00', islem: 'Cep kaba' },
        { tNo: 'T12', kart: { id: 25, kod: 'ORN-TK-D6', ad: 'Parmak freze Ø6' }, tutucu: 'SK40 pens', cikintiMm: '28.50', islem: 'Cep finiş' },
        { tNo: 'T15', kart: { id: 26, kod: 'ORN-TK-M8', ad: 'Kılavuz M8' }, tutucu: null, cikintiMm: null, islem: 'Diş' },
        { tNo: 'T21', kart: { id: 27, kod: 'ORN-TK-PAH', ad: null }, tutucu: 'SK40 pens', cikintiMm: '30.00', islem: 'Pah' },
      ],
      aparatlar: [{ kart: { id: 32, kod: 'ORN-APR-MNG', ad: 'Hassas mengene 125' }, aciklama: 'Ağız 120 mm, alttan paralel 20' }],
      genelYerine: false,
    },
  ],
};

test('adresteki parçanın proses dosyası açılır: başlıkta parça kodu, sekiz halka, operasyon tablosu; yatay taşma yok', async ({ page, ag, ac }, bilgi) => {
  await page.route('**/api/proses/parca?*', (r) => r.fulfill({ json: CEVAP }));
  await ac('/proses?malzemeNo=1');
  await expect(page.getByRole('heading', { name: 'ORN-PRC-1042 · Deneme gövde flanşı' })).toBeVisible();
  const zincir = page.getByRole('list', { name: 'Proses zinciri' });
  await expect(zincir.getByRole('listitem')).toHaveCount(8);
  await expect(zincir.getByText('Kaynak yok')).toHaveCount(1);
  await page.getByRole('tab', { name: /Operasyonlar/ }).click();
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

test('NC/CAM sekmesi: revizyon seçili, operasyona göre programlar, program kartında takım ve aparat; yatay taşma yok', async ({ page, ag, ac }, bilgi) => {
  await page.route('**/api/proses/parca?*', (r) => r.fulfill({ json: CEVAP }));
  await ac('/proses?malzemeNo=1');
  await page.getByRole('tab', { name: /NC\/CAM/ }).click();
  await expect(page.getByRole('group', { name: 'Teknik resim revizyonu' }).getByRole('button', { name: /Rev C/ })).toHaveAttribute('aria-pressed', 'true');
  const liste = page.getByRole('button', { name: /ORN1042_OP30_RC/ });
  await expect(liste).toBeVisible();
  // Telefonda önce liste, dokununca kart; genişte ikisi yan yana.
  await liste.click();
  const kart = page.getByRole('region', { name: 'ORN1042_OP30_RC programı' });
  await expect(kart).toBeVisible();
  await expect(kart.getByRole('list', { name: 'Takım listesi' }).getByRole('listitem')).toHaveCount(5);
  await expect(kart.getByText('+0,7 dk')).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(await kesilenBasliklar(page)).toEqual([]);
  await page.screenshot({ path: bilgi.outputPath('proses-nc-cam.png'), fullPage: true });
  await kart.getByRole('button', { name: 'Düzenle' }).click();
  const form = page.getByRole('dialog', { name: /ORN1042_OP30_RC/ });
  await expect(form).toBeVisible();
  // Seçici dar satırda kodu kesebilir; seçilen kart kod ve adıyla açık yazılır.
  await expect(form.getByText('ORN-TK-D10 · Parmak freze Ø10')).toBeVisible();
  await expect(form.getByText('ORN-APR-MNG · Hassas mengene 125')).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'formda yatay taşma').toBeLessThanOrEqual(0);
  await page.screenshot({ path: bilgi.outputPath('proses-nc-form.png'), fullPage: true });
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar, 'açıp bakmak yazmaz').toEqual([]);
});

test.describe('NC/CAM yazma yetkisi olmayan hesap', () => {
  // Planlama proses.oku alır, proses.nc-yaz almaz: program okunur, düzenleme ve ekleme çizilmez.
  test.use({ hesap: 'ornek.planlama' });
  test('program kartı okunur; Düzenle, diğer işlemler ve Program ekle yok', async ({ page, ag, ac }) => {
    await page.route('**/api/proses/parca?*', (r) => r.fulfill({ json: CEVAP }));
    await ac('/proses?malzemeNo=1');
    await page.getByRole('tab', { name: /NC\/CAM/ }).click();
    await page.getByRole('button', { name: /ORN1042_OP30_RC/ }).click();
    const kart = page.getByRole('region', { name: 'ORN1042_OP30_RC programı' });
    await expect(kart.getByRole('list', { name: 'Takım listesi' })).toBeVisible();
    await expect(kart.getByRole('button', { name: 'Düzenle' })).toHaveCount(0);
    await expect(kart.getByRole('button', { name: /diğer işlemler/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Program ekle/ })).toHaveCount(0);
    expect(ag.hatalar).toEqual([]);
  });
});
