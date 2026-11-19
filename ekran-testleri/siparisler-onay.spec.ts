import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { ADRES, expect, tasmaOlc, test } from './ortak.ts';

// 3272 B: sipariş onay penceresi açılacak projeyi, emir sayılarını ve rota uyarısını gösterir (3427-3 b: emir tablosu yok); "Proje ve emirler" kartı açılmışları. 360, 768 ve 1280 genişlikte
// yatay taşma yok, onay düğmesi görünür (dokunmatik boyu ortak ölçüdedir: fareyle yoğun, dokunmatikte 44 px). Açılış cevabı yönlendirilir (örnek verinin rotasına bağlı
// kalmasın); onay gönderilmez, yazma yapılmaz. Veriler uydurmadır (ORN-).
test.use({ hesap: 'ornek.yonetici' });

const satir = (kalemId: number, sira: number, kod: string, ad: string, ek: Record<string, unknown> = {}) => ({
  kalemId, kalemSira: sira, partiId: null, malzemeNo: kalemId, malzemeKodu: kod, malzemeAdi: ad, emirTuru: 'seri', adet: 40, teslim: '2099-07-14',
  rota: { ad: 'Standart', harf: 'C' }, emir: null, atlama: null, ...ek,
});
const ACILIS = {
  acik: true, proje: { id: null, kod: 'ORN_SS_2099_014', ad: 'ORN-Müşteri A ORN-SS-2099-014', bitis: '2099-07-14' },
  satirlar: [
    satir(901, 1, 'ORN-MIL-100', 'Örnek mil uzun adlı kalem', { partiId: 1, emirTuru: 'fai', adet: 10, rota: { ad: 'FAI', harf: 'C' } }),
    satir(901, 1, 'ORN-MIL-100', 'Örnek mil uzun adlı kalem', { partiId: 2, adet: 90 }),
    satir(902, 2, 'ORN-BRK-310', 'Örnek braket', { rota: null }),
    satir(903, 3, 'ORN-CVT-001', 'Örnek civata', { atlama: 'uretilmez' }),
  ],
  eksikIslemler: [],
};

// Sipariş tarihi bugünden en çok bir yıl ileri olabilir (SIP kuralı).
const gun = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function siparisAc(page: Page): Promise<number> {
  const firma = (await (await page.request.get(`${ADRES}/api/musteri-tedarikci/firmalar/secim`)).json() as { firmalar: { id: number; tur: string }[] })
    .firmalar.find((f) => f.tur !== 'tedarikci');
  const kart = (await (await page.request.get(`${ADRES}/api/siparisler/malzeme-secenekleri`)).json() as { satirlar: { no: number }[] }).satirlar[0];
  test.skip(firma === undefined || kart === undefined, 'örnek veride müşteri firması ya da satılan kart yok');
  const c = await page.request.post(`${ADRES}/api/siparisler/ekle`, {
    headers: { 'istek-kimligi': randomUUID() },
    data: {
      firmaId: firma?.id, musteriSiparisNo: null, siparisTarihi: gun(0), termin: gun(30), kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: kart?.no, miktar: '40', birimFiyat: '10', termin: null, aciklama: null }],
    },
  });
  expect(c.status(), await c.text()).toBe(200);
  return (await c.json() as { id: number }).id;
}

test('Sipariş onayı: açılacak proje, emir sayıları ve rota bekleyen kalem taşmadan çizilir; emir tablosu yok (3427-3 b)', async ({ page, ag, ac }) => {
  const id = await siparisAc(page);
  ag.sifirla();
  await page.route(`**/api/uretim-emirleri/siparis-acilisi/${String(id)}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACILIS) }));
  await ac(`/siparisler/${String(id)}`);
  await page.getByRole('button', { name: 'Onayla', exact: true }).click();
  const pencere = page.getByRole('dialog', { name: 'Siparişi onayla' });
  await expect(pencere.getByLabel(/Proje no/)).toHaveValue('ORN_SS_2099_014');
  await expect(pencere.getByText('1 emir rota bekliyor')).toBeVisible();
  await expect(pencere.getByText('Onaylayınca açılacak emirler')).toHaveCount(0);
  await expect(pencere.getByText('Üretilmez, emir açılmaz')).toHaveCount(0);
  await expect(pencere.getByText(/ORN-BRK-310 için yürürlükte rota yok/)).toBeVisible();
  const dugme = pencere.getByRole('button', { name: 'Onayla, proje ve 3 emri aç' });
  await dugme.scrollIntoViewIfNeeded();
  await expect(dugme).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await pencere.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(pencere).toBeHidden();
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('"Proje ve emirler" kartı: uzun emir no kısalır, rota bekleyen emir rozetle görünür, taşma yok', async ({ page, ag, ac }) => {
  const id = await siparisAc(page);
  ag.sifirla();
  const emirli = {
    ...ACILIS, proje: { id: 1, kod: 'ORN_SS_2099_014', ad: 'ORN-Müşteri A ORN-SS-2099-014', bitis: null },
    satirlar: ACILIS.satirlar.map((s, i) => (s.atlama !== null ? s : {
      ...s, emir: { id: 900 + i, no: `ORN-A-ORN_SS_2099_014-${s.malzemeKodu}-99-07-00${String(i + 1)}`, durum: 'taslak', rotaBekliyor: s.rota === null },
    })),
  };
  // Kart yalnız onaylı siparişte açılışı okur: ayrıntı onaylı gösterilir (yazma yok).
  await page.route(`**/api/siparisler/${String(id)}`, async (r) => {
    const c = await r.fetch();
    await r.fulfill({ response: c, json: { ...(await c.json() as object), durum: 'onayli', onayZamani: '2099-06-01T09:00:00+03:00' } });
  });
  await page.route(`**/api/uretim-emirleri/siparis-acilisi/${String(id)}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emirli) }));
  await ac(`/siparisler/${String(id)}`);
  const tablo = page.getByRole('table', { name: 'Siparişin emirleri' });
  await tablo.scrollIntoViewIfNeeded();
  await expect(tablo.getByText('Rota bekliyor')).toBeVisible();
  await expect(tablo.getByTitle(emirli.satirlar[0]!.emir!.no)).toBeVisible();
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});

test('3272-2: onay geri alma penceresi talebi ya da hazırlığı olan emri uyarıyla gösterir; taşma yok, yazma yok', async ({ page, ag, ac }) => {
  const id = await siparisAc(page);
  ag.sifirla();
  const uyarili = {
    ...ACILIS, proje: { id: 1, kod: 'ORN_SS_2099_014', ad: 'ORN-Müşteri A ORN-SS-2099-014', bitis: null },
    geriAlmaUyarilari: [{ emirId: 901, emirNo: 'ORN-A-ORN_SS_2099_014-ORN-MIL-100-99-07-001', nedenler: ['talep', 'hazirlik'] }],
  };
  await page.route(`**/api/siparisler/${String(id)}`, async (r) => {
    const c = await r.fetch();
    await r.fulfill({ response: c, json: { ...(await c.json() as object), durum: 'onayli', onayZamani: '2099-06-01T09:00:00+03:00' } });
  });
  await page.route(`**/api/uretim-emirleri/siparis-acilisi/${String(id)}`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(uyarili) }));
  await ac(`/siparisler/${String(id)}`);
  await page.getByRole('button', { name: 'Onayı geri al' }).click();
  const pencere = page.getByRole('dialog', { name: 'Onayı geri al' });
  const uyari = pencere.getByRole('status').filter({ hasText: 'Bu emirler kalemden çözülür' });
  await expect(uyari).toBeVisible();
  await expect(uyari).toContainText('malzeme talebi var, hazırlık maddesi tamamlanmış');
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
  await pencere.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(pencere).toBeHidden();
  expect(ag.hatalar).toEqual([]);
  expect(ag.yazmalar).toEqual([]);
});
