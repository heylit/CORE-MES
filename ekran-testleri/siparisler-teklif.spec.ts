import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// Teklif ver, termin ve fiyat kademesi (44, 3301): 360, 768 ve 1280 genişlikte yatay taşma yok; termin yerleşimi, kâr ve alt çubuk görünür.
// İki yol da deneme cevabı yönlendirilerek çizilir: Planlama sayfası açılınca boş çalışmayı kurduğundan (657 a) motorun bağlı olup olmadığı
// aynı veritabanında koşan öteki testlere bağlıdır. "cozucu-yok" cevabını sunucu birim testleri sınar (siparisler/teklif-deneme.test.ts).
test.use({ hesap: 'ornek.yonetici' });

const DENEME = {
  durum: 'hazir', planSurumu: '1', gecerlilik: null, istenenTermin: null, yerlesim: 'arkaya', baslangic: null, planTermini: '2099-07-14', termin: '2099-07-14', terminGun: null,
  yetisir: null, onayGerekli: false, satinalmaGerekli: true, maliyetToplami: '400.00', genelGiderSaatBasi: '10.00',
  kayanlar: [{ siparis: 'ORN-SS-1', once: '2099-07-01T10:00:00+03:00', sonra: '2099-07-04T10:00:00+03:00', termin: '2099-07-02', gecikir: true }],
  plan: {
    baslangic: '2099-07-01T08:00:00+03:00', bitis: '2099-07-20T00:00:00+03:00', kapaliGunler: ['2099-07-05', '2099-07-12'],
    hatlar: [{ makineId: 'ORN-T1', ad: 'Örnek torna', fason: false }, { makineId: 'ORN-T2', ad: 'Örnek freze', fason: false }],
    bloklar: [
      { makineId: 'ORN-T1', tur: 'siparis', etiket: 'ORN-SS-1', kalem: null, adim: '10', baslangic: '2099-07-01T08:00:00+03:00', bitis: '2099-07-04T10:00:00+03:00', gecikir: true },
      { makineId: 'ORN-T2', tur: 'satis-taslagi', etiket: 'TK-2099-001', kalem: 1, adim: '20', baslangic: '2099-07-03T08:00:00+03:00', bitis: '2099-07-06T08:00:00+03:00', gecikir: false },
      { makineId: 'ORN-T1', tur: 'teklif', etiket: 'Bu teklif', kalem: 1, adim: '10', baslangic: '2099-07-08T08:00:00+03:00', bitis: '2099-07-10T16:00:00+03:00', gecikir: false },
    ],
  },
};
const ADET = {
  durum: 'hazir',
  satirlar: [['0.5', '20.000', '2099-07-12', '13.0000', '260.00'], ['1', '40.000', '2099-07-14', '10.0000', '400.00'], ['2', '80.000', '2099-07-18', '8.0000', '640.00'], ['4', '160.000', '2099-07-25', '7.0000', '1120.00']]
    .map(([carpan, adet, termin, birim, toplam]) => ({ carpan, termin, maliyetToplami: toplam, kalemler: [{ satirId: 0, adet, birimMaliyet: birim }] })),
};

// Örnek veriden müşteri firması ve satılan kart seçilir; teklif API'den açılır (ekran kaydı yazmaz, yalnız çizer).
async function teklifAc(page: Page): Promise<{ id: number; satirId: number; tanim: string }> {
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  const kart = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number; ad: string | null }[] }).satirlar[0];
  test.skip(firma === undefined || kart === undefined, 'örnek veride müşteri firması ya da satılan kart yok');
  const tanim = `Ekran testi ${randomUUID().slice(0, 8)}`;
  const c = await page.request.post(`${ADRES}/api/siparisler/teklifler/ekle`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: { firmaId: firma?.id, baslik: 'Ekran testi teklifi', satirlar: [{ malzemeNo: kart?.no, tanim, miktar: '40' }] },
  });
  expect(c.status(), await c.text()).toBe(200);
  const t = await c.json() as { id: number; satirlar: { id: number }[] };
  return { id: t.id, satirId: t.satirlar[0]?.id ?? 0, tanim };
}

test('Teklif termin ve fiyat: plan denemesiyle termin, maliyet, kâr ve fiyat taşmadan çizilir', async ({ page, ag, ac }) => {
  const t = await teklifAc(page);
  await page.route(`**/api/siparisler/teklifler/${String(t.id)}/termin-denemesi**`, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ...DENEME,
      istenenTermin: new URL(r.request().url()).searchParams.get('istenenTermin'),
      yerlesim: new URL(r.request().url()).searchParams.get('yerlesim') ?? 'arkaya',
      baslangic: new URL(r.request().url()).searchParams.get('baslangic'),
      kalemler: [{
        satirId: t.satirId, sira: 1, tanim: t.tanim, malzemeNo: 1, adet: '40', plansiz: false, yerlesti: true, bitis: '2099-07-10T16:00:00+03:00', planTermini: '2099-07-14',
        malzemeGelisi: '2099-07-03T08:00:00+03:00', satinalma: [{ kod: 'ORN-HM', miktar: '12.5', birim: 'kg', gelis: '2099-07-03T08:00:00+03:00' }],
        birimMaliyet: '10.0000', toplamMaliyet: '400.00', eksikVeri: [],
        dokum: [{ tur: 'malzeme', ad: 'Malzeme', tezgah: null, saat: null, tutar: '100.00' }, { tur: 'isleme', ad: '10', tezgah: 'ORN-T1', saat: '2.00', tutar: '300.00' }],
      }],
    }),
  }));
  await page.route(`**/api/siparisler/teklifler/${String(t.id)}/adet-denemesi**`, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...ADET, satirlar: ADET.satirlar.map((s) => ({ ...s, kalemler: s.kalemler.map((k) => ({ ...k, satirId: t.satirId })) })) }),
  }));
  await ac(`/siparisler/teklifler/${String(t.id)}/teklif-ver`);
  const form = page.getByRole('form', { name: 'Termin ve fiyat' });
  await expect(form.getByText('14.07.2099').first()).toBeVisible();
  await expect(form.getByRole('region', { name: 'Plan denemesi' })).toBeVisible();
  await expect(form.getByRole('table', { name: 'Adet değişirse' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '3 Termin ve fiyat', selected: true })).toBeVisible();
  await expect(form.getByRole('group', { name: 'Kâr oranı' })).toBeVisible();
  await expect(form.getByRole('table', { name: 'Maliyet dökümü' })).toBeVisible();
  await expect(form.getByLabel(new RegExp(`^${t.tanim} birim fiyat`))).toHaveValue('12,50');
  // 3326: seçilen günde başlatmada plandan tıklanan gün başlangıç günü olur.
  await form.getByLabel('Seçilen günde başlat').check();
  const gun = form.getByRole('group', { name: 'Başlangıç' }).getByRole('button', { name: /^08\.07\.2099/ });
  await gun.click();
  await expect(gun).toHaveAttribute('aria-pressed', 'true');
  await expect(form.getByRole('definition').filter({ hasText: '08.07.2099' }).first()).toBeVisible();
  // Seçilen günde başlatmada kimse kaymaz: kayan listesi ve onay kutusu çizilmez (yönlendirilen cevapta kayan olsa da).
  await expect(form.getByText(/terminini kaçırır/)).toHaveCount(0);
  await expect(form.locator('.tc-sp-blok-yazi', { hasText: 'Bu teklif' })).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await form.getByLabel('Terminden geriye').check();
  await form.getByLabel(/^İstenen termin/).fill('2099-07-05');
  await expect(form.getByRole('table', { name: 'Bitişi değişen siparişler' })).toBeVisible();
  await expect(form.getByLabel('Tutar')).toBeVisible();
  await expect(form.getByRole('button', { name: 'Devam' })).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('Teklif termin ve fiyat: motor bağlı değilken elle fiyat ve termin taşmadan çizilir', async ({ page, ag, ac }) => {
  const t = await teklifAc(page);
  await page.route(`**/api/siparisler/teklifler/${String(t.id)}/termin-denemesi**`, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      durum: 'cozucu-yok', planSurumu: null, gecerlilik: null, istenenTermin: null, yerlesim: 'arkaya', baslangic: null, planTermini: null, termin: null, terminGun: null, yetisir: null,
      onayGerekli: false, satinalmaGerekli: false, maliyetToplami: null, genelGiderSaatBasi: null, kayanlar: [], plan: null,
      kalemler: [{
        satirId: t.satirId, sira: 1, tanim: t.tanim, malzemeNo: 1, adet: '40', plansiz: false, yerlesti: false, bitis: null, planTermini: null,
        malzemeGelisi: null, satinalma: [], birimMaliyet: null, toplamMaliyet: null, dokum: null, eksikVeri: [],
      }],
    }),
  }));
  await page.route(`**/api/siparisler/teklifler/${String(t.id)}/adet-denemesi**`, (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ durum: 'cozucu-yok', satirlar: [] }),
  }));
  await ac(`/siparisler/teklifler/${String(t.id)}/teklif-ver`);
  const form = page.getByRole('form', { name: 'Termin ve fiyat' });
  await expect(form.getByText('Termin denemesi kullanılamıyor')).toBeVisible();
  await form.getByLabel(new RegExp(`^${t.tanim} birim fiyat`)).fill('11');
  await form.getByRole('button', { name: 'Devam' }).click();
  // Kademe 4 kayıt yapmadan açılır: elle termin ve koşullar.
  await expect(page.getByRole('form', { name: 'Koşullar ve gönder' }).getByLabel('Termin tarihi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Teklifi ver' })).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('Teklif termin ve fiyat (3347): kalem yerleşmezse sebebi kalem kalem yazılır, plan şeridi yine çizilir, taşma yok', async ({ page, ag, ac }) => {
  const t = await teklifAc(page);
  const neden = ['OP 10 Örnek freze: işi yapabilecek tezgâh ya da fasoncu yok (İstasyonlar > Makineler)', 'OP 20 Örnek taşlama: önceki adım (OP 10 Örnek freze) yerleşmedi'];
  await page.route(`**/api/siparisler/teklifler/${String(t.id)}/termin-denemesi**`, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ...DENEME, planTermini: null, termin: null, maliyetToplami: null, genelGiderSaatBasi: null, kayanlar: [],
      plan: { ...DENEME.plan, bloklar: DENEME.plan.bloklar.filter((b) => b.tur !== 'teklif') },
      kalemler: [{
        satirId: t.satirId, sira: 1, tanim: t.tanim, malzemeNo: 1, adet: '40', plansiz: false, yerlesti: false, bitis: null, planTermini: null,
        malzemeGelisi: null, satinalma: [], birimMaliyet: null, toplamMaliyet: null, dokum: null, eksikVeri: neden,
      }],
    }),
  }));
  await page.route(`**/api/siparisler/teklifler/${String(t.id)}/adet-denemesi**`, (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ durum: 'cozucu-yok', satirlar: [] }),
  }));
  await ac(`/siparisler/teklifler/${String(t.id)}/teklif-ver`);
  const form = page.getByRole('form', { name: 'Termin ve fiyat' });
  const liste = form.getByRole('list', { name: 'Yerleşmeyen kalemler' });
  await expect(liste.getByText(`1. ${t.tanim}`)).toBeVisible();
  for (const n of neden) await expect(liste.getByRole('list', { name: `${t.tanim} sebepleri` }).getByText(n)).toBeVisible();
  await expect(form.getByText(/Genel gider oranı tanımlı değil/)).toHaveCount(0);
  await expect(form.getByRole('region', { name: 'Plan denemesi' })).toBeVisible();
  await expect(form.getByText('Bu teklifin yerleşen adımı yok; şeritte yalnız plandaki işler görünür.')).toBeVisible();
  await expect(form.getByLabel(new RegExp(`^${t.tanim} birim fiyat`))).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  const klasor = process.env['TMIV2_EKRAN_GORUNTU']?.trim();
  if (klasor) {
    const w = page.viewportSize()?.width ?? 0;
    await page.setViewportSize({ width: w, height: 2600 });
    await form.getByRole('region', { name: 'Termin' }).screenshot({ path: `${klasor}/3347-g${String(w)}.png` });
  }
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('Yeni teklif (3301): dört kademe sekmesi ve alt çubuk taşmadan çizilir; kayıtsız talepte termin ve fiyat nedenini yazar', async ({ page, ag, ac }) => {
  await ac('/siparisler/teklifler/yeni');
  await expect(page.getByRole('tablist', { name: 'Teklif kademeleri' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Müşteri ve konu' }).getByLabel(/^Konu/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Devam' })).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await page.getByRole('tab', { name: '2 Kalemler' }).click();
  await expect(page.getByLabel(/^Kalem 1 tanım/)).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  // 3301-5, 3400-1: malzemesiz kalemde ileti görünür; tanıma yazınca kartlar kutunun altında ekrandan taşmadan açılır;
  // listeden seçilince tanım isteğe bağlıdır ve kartın adı yazılır.
  await expect(page.getByText(/Kartsız kalem: siparişe dönüşmeden malzeme seçilir/)).toBeVisible();
  const tanimKutusu = page.getByRole('combobox', { name: /^Kalem 1 tanım/ });
  await tanimKutusu.fill('ab');
  const liste = page.getByRole('listbox', { name: /^Kalem 1 tanım/ });
  await expect(liste).toBeVisible();
  const kutu = await liste.boundingBox();
  const genislik = page.viewportSize()?.width ?? 0;
  expect(kutu !== null && kutu.x >= 0 && kutu.x + kutu.width <= genislik, 'arama listesi ekran içinde').toBe(true);
  expect((await tasmaOlc(page)).belge, 'arama listesi açıkken yatay taşma').toBeLessThanOrEqual(0);
  await tanimKutusu.press('Escape');
  await expect(liste).toBeHidden();
  await expect(tanimKutusu).toHaveValue('ab');
  await tanimKutusu.fill('');
  await page.getByRole('button', { name: 'Listeden seç' }).click();
  const secici = page.getByRole('dialog', { name: 'Malzeme kartı seç' });
  const ilk = secici.getByRole('table', { name: 'Malzeme kartları' }).locator('tbody tr.tc-tablo-secilir').first();
  test.skip(!(await ilk.waitFor({ timeout: 10_000 }).then(() => true, () => false)), 'örnek veride satılan kart yok');
  await ilk.click();
  await expect(secici).toBeHidden();
  await expect(page.getByLabel(/^Kalem 1 tanım \(isteğe bağlı\)/)).not.toHaveValue('');
  await expect(page.getByRole('button', { name: 'Malzemeyi değiştir' })).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'malzemeli kalemde yatay taşma').toBeLessThanOrEqual(0);
  await page.getByRole('tab', { name: '3 Termin ve fiyat' }).click();
  await expect(page.getByText(/Önce kalemleri kaydedin/)).toBeVisible();
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

// Teklif formu basımda boş çıkmasın: başka modülün basım kuralı (body * gizli) basım kopyasını görünmez yapıyordu.
test('Teklif formu basımda görünür: Yazdır / PDF kopyası kâğıda çıkar', async ({ page, ac }) => {
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  test.skip(firma === undefined, 'örnek veride müşteri firması yok');
  const tanim = `Ekran testi ${randomUUID().slice(0, 8)}`;
  const c = await page.request.post(`${ADRES}/api/siparisler/teklifler/ekle`, {
    headers: { 'istek-kimligi': randomUUID() }, data: { firmaId: firma?.id, baslik: 'Ekran testi teklifi', satirlar: [{ malzemeNo: null, tanim, miktar: '40' }] },
  });
  expect(c.status(), await c.text()).toBe(200);
  const t = await c.json() as { id: number };
  await ac(`/siparisler/teklifler/${String(t.id)}/teklif-ver`);
  await page.getByLabel(new RegExp(`^${tanim} birim fiyat`)).fill('11');
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.getByLabel('Teslim süresi (gün)').fill('14');
  await page.getByRole('button', { name: 'Teklifi ver' }).click();
  await expect(page.getByRole('button', { name: 'Yazdır / PDF' })).toBeEnabled();
  await page.emulateMedia({ media: 'print' });
  const baski = page.locator('.tc-tf-baski .tc-tf-kagit');
  await expect(baski).toBeVisible();
  await expect(baski.getByText(tanim)).toBeVisible();
});
