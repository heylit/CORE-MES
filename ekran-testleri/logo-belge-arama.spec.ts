import { expect, tasmaOlc, test } from './ortak.ts';

// 3360 a: beş listede "Logo'da ara". Durum ve arama cevabı yönlendirilir (Logo'ya istek yok); 360, 768 ve 1280 genişlikte pencere
// ve sayfa yatay taşmaz. Veriler uydurmadır (ORN-).
test.use({ hesap: 'ornek.yonetici' });

const ONEK: Record<string, string> = { 'satis-siparisi': 'ORN-SS', teklif: 'ORN-TK', proje: 'ORN.PRJ', talep: 'ORN-TLP', 'satin-alma-siparisi': 'ORN-SAS' };
const belge = (tur: string, ref: number, no: string, core: number | null, ek: Record<string, unknown> = {}) => ({
  logoKayitNo: ref, no: no.replace('ORN-SS', ONEK[tur] ?? 'ORN'), belgeNo: null, tarih: '2026-11-12', cariKodu: 'ORN-C-1001', cariAdi: 'ORN Deneme Makina Sanayi ve Ticaret',
  projeKodu: 'ORN.PRJ.7', projeAdi: 'ORN Deneme projesi', aciklama: null, tutar: '48000', dovizTuru: null, iptal: false, satirSayisi: 1,
  satirlar: [{ kod: 'ORN-MLZ-0042', ad: 'ORNEK Mil Ø40 uzun açıklamalı kart adı', miktar: '120', birim: 'ADET', aciklama: null }],
  core: core === null ? null : { id: core }, ...ek,
});
const LISTELER = [
  { yol: '/siparisler', tur: 'satis-siparisi', baslik: "Logo'da satış siparişi ara" },
  { yol: '/siparisler/teklifler', tur: 'teklif', baslik: "Logo'da teklif ara" },
  { yol: '/projeler', tur: 'proje', baslik: "Logo'da proje ara" },
  { yol: '/satin-alma/talepler', tur: 'talep', baslik: "Logo'da satın alma talebi ara" },
  { yol: '/satin-alma/siparisler', tur: 'satin-alma-siparisi', baslik: "Logo'da satın alma siparişi ara" },
] as const;

for (const l of LISTELER) {
  test(`${l.yol}: "Logo'da ara" türünde arar ve sonucu gösterir`, async ({ page, ag, ac }) => {
    await page.route('**/api/logo/belge-arama-durumu', (r) => r.fulfill({ json: { acik: true, neden: null } }));
    const sorulan: string[] = [];
    await page.route('**/api/logo/belge-ara?*', (r) => {
      sorulan.push(new URL(r.request().url()).searchParams.get('tur') ?? '');
      return r.fulfill({ json: { durum: 'tamam', ileti: null, fiyatGorunur: true, belgeler: [
        belge(l.tur, 41, 'ORN-SS-141', 88), belge(l.tur, 42, 'ORN-SS-142', null),
        belge(l.tur, 43, 'ORN-SS-139', null, { satirlar: [], satirSayisi: 0, aciklama: 'ORN-MLZ-0042 numune', iptal: true }),
      ] } });
    });
    await ac(l.yol);
    const dugme = page.getByRole('button', { name: "Logo'da ara" });
    await expect(dugme).toHaveCount(1);
    await expect(dugme).toBeVisible();
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`liste-${l.tur}.png`) });
    await dugme.click();
    const pencere = page.getByRole('dialog', { name: l.baslik });
    await expect(pencere).toBeVisible();
    await pencere.getByLabel('Aranan').fill('ORN-MLZ-0042');
    await pencere.getByRole('button', { name: 'Ara', exact: true }).click();
    await expect(pencere.getByText(`${ONEK[l.tur] ?? ''}-141`)).toBeVisible();
    expect(sorulan).toEqual([l.tur]);
    expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`logo-ara-${l.tur}.png`) });
    expect(ag.yazmalar).toEqual([]);
    expect(ag.hatalar).toEqual([]);
  });
}
