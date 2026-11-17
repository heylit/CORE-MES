import { randomUUID } from 'node:crypto';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// Teklif formu (3245 d): fiyatı gören satış hesabı sürümü verilmiş teklifte formu açar; kâğıt pencereye sığacak kadar küçülür,
// 360, 768 ve 1280 genişlikte yatay taşma yoktur. Metin düzenlenir ama kaydedilmez; basım tarayıcının işidir, burada açılmaz.
test.use({ hesap: 'ornek.satis' });

test('Teklif formu: satış hesabı şablonla formu açar, toplamlar ve kâğıt taşmadan çizilir', async ({ page, ag, ac }) => {
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  const kart = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number }[] }).satirlar[0];
  test.skip(firma === undefined || kart === undefined, 'örnek veride müşteri firması ya da satılan kart yok');
  const ekle = await page.request.post(`${ADRES}/api/siparisler/teklifler/ekle`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: { firmaId: firma?.id, baslik: 'Ekran testi teklif formu', satirlar: [{ malzemeNo: kart?.no, tanim: `Ekran testi ${randomUUID().slice(0, 8)}`, miktar: '40' }] },
  });
  expect(ekle.status(), await ekle.text()).toBe(200);
  const t = await ekle.json() as { id: number; no: string; surum: number; satirlar: { id: number }[] };
  const ver = await page.request.post(`${ADRES}/api/siparisler/teklifler/${String(t.id)}/surum-ver`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: { surum: t.surum, fiyatlar: [{ satirId: t.satirlar[0]?.id, birimFiyat: '10' }], teslimGun: 14, gecerlilik: '2099-01-01' },
  });
  expect(ver.status(), await ver.text()).toBe(200);

  // 3356: müşteri kutusu örnek firmanın vergi dairesi ve numarasıyla çizilir (örnek veride boş olabilir; cevap ORN değerle yönlendirilir).
  await page.route(`**/api/siparisler/teklifler/${String(t.id)}/form?**`, async (r) => {
    const c = await r.fetch(); const g = await c.json() as { musteri: Record<string, unknown> };
    await r.fulfill({ response: c, json: { ...g, musteri: { ...g.musteri, vergiDairesi: 'ORN Vergi Dairesi', vergiNo: '0000000000' } } });
  });
  const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
  // İnceleme resmi için antet örnek kurum bilgisi ve doküman kutusuyla doldurulur (örnek veride boştur).
  if (klasor) {
    await page.route('**/api/siparisler/teklif-formu', async (r) => {
      const c = await r.fetch(); const g = await c.json() as { kurum: Record<string, unknown>; sablonlar: { icerik: Record<string, unknown> }[] };
      await r.fulfill({ response: c, json: {
        ...g, kurum: { ...g.kurum, unvan: 'ORN Deneme Makina San. Ltd. Şti.', adres: 'ORN OSB 1. Cad. No: 1', telefon: '0 000 000 00 00', eposta: 'satis@ornek.invalid', vergi: 'ORN VD 0000000000' },
        sablonlar: g.sablonlar.map((x) => ({ ...x, icerik: { ...x.icerik, imza1: 'ORN Satış Sorumlusu', belge: { no: 'ORN-F-11', yayin: '01.01.2026', revTarihi: '-', revNo: '00' } } })),
      } });
    });
  }
  await ac(`/siparisler/teklifler/${String(t.id)}`);
  await page.getByRole('button', { name: 'Teklif formu' }).click();
  const pencere = page.getByRole('dialog', { name: new RegExp(`Teklif formu · ${t.no}`) });
  await expect(pencere.getByRole('article', { name: `Teklif ${t.no}` })).toBeVisible();
  await expect(pencere.getByText('400,00').first()).toBeVisible();
  await expect(pencere.getByText('480,00 TRY')).toBeVisible();
  const kagit = pencere.getByRole('article', { name: `Teklif ${t.no}` });
  await expect(kagit.getByText('ORN Vergi Dairesi')).toBeVisible();
  await expect(kagit.getByText('Satış teklifi')).toBeVisible();
  await expect(kagit.getByText('FİRMA ONAYI / COMPANY CONFIRMATION')).toBeVisible();
  await expect(kagit.getByText('MÜŞTERİ ONAYI / CUSTOMER CONFIRMATION')).toBeVisible();
  if (klasor) {
    const boyut = page.viewportSize() ?? { width: 1280, height: 800 };
    await page.setViewportSize({ width: boyut.width, height: 2600 });
    // geniş ekranda bütün kâğıt; dar ekranda onay alanları (kâğıt pencereye sığacak kadar küçülür)
    await (boyut.width >= 1100 ? kagit : kagit.locator('.tc-tf-imzalar')).screenshot({ path: `${klasor}/3356-g${String(boyut.width)}.png` });
    await page.setViewportSize(boyut);
  }
  await expect(pencere.getByRole('button', { name: 'Yazdır / PDF' })).toBeEnabled();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);

  // Teklifi yazan metni pencerede düzenler; 1100 pikselden dar ekranda Düzenle ve Ön izleme sekmedir. Kaydetmeden yazma yoktur.
  const dar = (page.viewportSize()?.width ?? 1280) < 1100;
  if (dar) await pencere.getByRole('tab', { name: 'Düzenle' }).click();
  await pencere.getByLabel(/^Form başlığı/).fill('ORN FİYAT TEKLİFİ');
  await expect(pencere.getByText('Kaydedilmedi')).toBeVisible();
  await expect(pencere.getByRole('button', { name: 'Bu teklif için kaydet' })).toBeEnabled();
  expect((await tasmaOlc(page)).belge, 'düzenlemede yatay taşma').toBeLessThanOrEqual(0);
  if (dar) await pencere.getByRole('tab', { name: 'Ön izleme' }).click();
  await expect(pencere.getByRole('heading', { level: 1, name: 'ORN FİYAT TEKLİFİ' })).toBeVisible();
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});
