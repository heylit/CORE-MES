import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, tasmaOlc, test } from './ortak.ts';

// 3708: mal kabulde fason dönüşü (adet ve hasar, aktarım formu) ve satın almanın Dış operasyonlar listesi. Gerçek bileşenler gerçek
// sunucuda açılır; örnek veride fason iş olmadığından yalnız bu ekranların okuma uçları (GET) sabit cevapla beslenir, yazma ucu çağrılmaz.
// Görüntü klasörü TMIV2_EKRAN_GORUNTU ile verilirse üç genişliğin çekimi oraya yazılır.
const GORUNTU = process.env['TMIV2_EKRAN_GORUNTU']?.trim();

const cevap = (govde: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(govde) });
const ozet = (id: number, tur: string, ad: string) => ({ ozet: { id, tur, kod: `K-${id}`, ad, onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } });
const KUTU = { id: 77, kod: 'FSN-01', tur: 'fason', ad: 'Deneme fasoncu', depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 1, haritaGozId: null, haritaAlanId: null, surum: 1 };
const AYRINTI = {
  satir: { malzemeId: 904, ad: 'Deneme mil kaplamalı', stokKodu: 'K-904', tur: 'yarimamul', birim: 'adet', toplam: '0', serbest: '0', statude: '0', rezerve: '0', kritikSeviye: null, durum: 'tanimsiz', konumSayisi: 0, konumlar: [], kategoriAdi: null, kartDurumu: null, varsayilanKonum: null, sonHareket: null },
  bakiyeler: [], ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null }, sonHareketler: [], statuKirilimi: [], tanimliStatuler: [], rezerveler: [], bekleyenler: [],
};

async function malKabulBesle(page: Page, yol: 'adet-hasar' | 'aktarim'): Promise<void> {
  const is = { isEmriId: 5, emirNo: 'ORN-UE-001', opNo: 30, adim: 'Kaplama', gonderilen: 20, donen: 4, hurda: 1, donenKart: { malzemeId: 904, kod: 'K-904', ad: 'Deneme mil kaplamalı', birim: 'adet' }, statulu: false, donusYolu: yol, sonrakiFirma: yol === 'aktarim' ? 'Deneme İkinci Firma' : null };
  const acik = { satirlar: [{ id: 51, siparisNo: 'SA-F', talepNo: 'ST-2026-009', tedarikciAdi: 'Deneme Kaplama', malzemeId: 903, malzemeTur: 'hizmet', kalemAdi: 'Kaplama', miktar: '20', kalanMiktar: '20', birim: 'adet', beklenenTeslim: null }] };
  await page.route('**/api/stok/**', async (r) => {
    const u = new URL(r.request().url());
    const p = u.pathname.replace('/api', '');
    if (r.request().method() !== 'GET') return r.continue();
    if (p === '/stok/konumlar') return r.fulfill(cevap({ satirlar: [KUTU], toplam: 1, sayfa: 1, sayfaBoyu: 200 }));
    if (p === '/stok/konumlar/77') return r.fulfill(cevap({ konum: KUTU, raf: null, bakiyeler: [], haritaYeri: null, zemin: null }));
    if (p === '/stok/fason-isleri') return r.fulfill(cevap({ isler: [is] }));
    if (p === '/stok/acik-siparis-satirlari') return r.fulfill(cevap(acik));
    if (p === '/stok/malzemeler/903/ozet') return r.fulfill(cevap(ozet(903, 'hizmet', 'Deneme kaplama hizmeti')));
    if (p === '/stok/malzemeler/904/ozet') return r.fulfill(cevap(ozet(904, 'yarimamul', 'Deneme mil kaplamalı')));
    if (p === '/stok/malzemeler/904') return r.fulfill(cevap(AYRINTI));
    if (p === '/stok/malzemeler/904/goz-onerisi') return r.fulfill(cevap({ oneri: null }));
    return r.continue();
  });
}

async function cek(page: Page, ad: string, bilgi: { project: { name: string } }): Promise<void> {
  if (!GORUNTU) return;
  mkdirSync(GORUNTU, { recursive: true });
  await page.screenshot({ path: `${GORUNTU}/${ad}-${bilgi.project.name.replace('g', '')}.png` });
}

test.describe('3708 fason ekranları', () => {
  test('mal kabul: kaynağında muayeneli iş karantina sormaz, hasarlı adet kabul adedini aşarsa Kabul et kapanır', async ({ page, ac }, bilgi) => {
    await malKabulBesle(page, 'adet-hasar');
    await ac('/stok/mal-kabul?fasonIsEmri=5&siparisSatiri=51&konum=77');
    const hasar = page.getByLabel(/Hasarlı adet/);
    await expect(hasar).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Karantina konumu')).toHaveCount(0);
    await hasar.fill('99');
    await expect(page.getByText('Hasarlı adet kabul edilen adetten büyük olamaz.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kabul et' })).toBeDisabled();
    await hasar.fill('2');
    await expect(page.getByRole('button', { name: 'Kabul et' })).toBeEnabled();
    await hasar.evaluate((el) => { el.scrollIntoView({ block: 'center' }); });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await cek(page, 'mal-kabul-fason-hasar', bilgi);
  });

  test('mal kabul: aktarım yolunda sonraki firma yazılır, adet boşken düğmenin nedeni görünür, kayıttan önce özet onayı istenir', async ({ page, ac }, bilgi) => {
    await malKabulBesle(page, 'aktarim');
    await ac('/stok/mal-kabul?fasonIsEmri=5&siparisSatiri=51&konum=77');
    await expect(page.getByText('Deneme İkinci Firma')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Aktarımı kaydet' })).toBeDisabled();
    await expect(page.getByText(/Sağlam adedi girin/)).toBeVisible();
    await page.getByLabel('Sağlam adet').fill('12');
    await page.getByLabel('Hurda adet').fill('3');
    await expect(page.getByRole('button', { name: 'Aktarımı kaydet' })).toBeEnabled();
    await page.getByLabel('Sağlam adet').evaluate((el) => { el.scrollIntoView({ block: 'center' }); });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await cek(page, 'mal-kabul-fason-aktarim', bilgi);
    await page.getByRole('button', { name: 'Aktarımı kaydet' }).click();
    await expect(page.getByText(/12 sağlam, 3 hurda adet/)).toBeVisible();
    await cek(page, 'mal-kabul-fason-aktarim-onay', bilgi);
    await page.getByRole('button', { name: 'Vazgeç' }).or(page.getByRole('button', { name: 'Vazgeç', exact: true })).first().click();
  });

  test('Dış operasyonlar: teslim yeri ve kaynağında muayene notu satırda görünür', async ({ page, ac }, bilgi) => {
    const satir = (isEmriId: number, emirNo: string, teslimYeri: string, muayene: boolean) => ({
      isEmriId, uretimEmriId: 10 + isEmriId, emirNo, urun: 'Deneme flanş', opNo: 30, adim: 'Kaplama', firmaId: 3, firmaAdi: 'Deneme Kaplama', teslimYeri, kaynaktaMuayene: muayene,
      planlananGidis: '2026-11-26', gerceklesenGidis: '2026-11-25T08:00:00Z', termin: '2026-11-30', ilkDonus: null, sonDonus: null, gonderilen: 40, donen: null, hurda: null,
      gecikmeGun: 0, gecikmeSonDonus: 0, gecikmeAgirlikli: 0, siparisSatirId: null, fasonKonumId: null, sirada: true, dieId: null, dieNo: null, durum: null,
    });
    await page.route('**/api/satin-alma-dis-operasyonlar', (r) => r.request().method() === 'GET'
      ? r.fulfill(cevap({ hazir: true, operasyonlar: [satir(1, 'ORN-UE-001', 'Deneme İkinci Firma', true), satir(2, 'ORN-UE-002', 'TMI', false)], partiOperasyonlari: [] }))
      : r.continue());
    await ac('/satin-alma/dis-operasyonlar');
    await expect(page.getByText('Teslim: Deneme İkinci Firma · kaynağında muayene yapılacak')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Teslim: TMI', { exact: true })).toBeVisible();
    await page.getByText('Teslim: Deneme İkinci Firma · kaynağında muayene yapılacak').evaluate((el) => { el.scrollIntoView({ block: 'center' }); });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await cek(page, 'dis-operasyonlar', bilgi);
  });

  // Belge kapısı: Adım Durumu'nda kaynağında muayene adımının açılımında belgeler. Örnek veride muayene adımı yok: ilk adım muayene
  // diye işaretlenir, belge listesi sabit cevapla gelir; yükleme ve kaldırma çağrılmaz.
  test('Adım Durumu: muayene adımının açılımında eksik zorunlu belgeler ve yükleme alanı görünür', async ({ page, ac, ag }, bilgi) => {
    let muayeneId = 0;
    await page.route(/\/api\/adimli-emirler\/\d+\/adim-durumu$/, async (r) => {
      const c = await r.fetch();
      const g = (await c.json()) as { adimlar: { isEmriId: number; muayene?: boolean }[] };
      muayeneId = g.adimlar[0]?.isEmriId ?? 0;
      await r.fulfill({ response: c, json: { ...g, adimlar: g.adimlar.map((a, i) => ({ ...a, muayene: i === 0 })) } });
    });
    await page.route(/\/muayene-belgeleri$/, (r) => r.fulfill(cevap({
      zorunlu: ['Malzeme sertifikası', 'Test raporu'], eksik: ['Test raporu'],
      belgeler: [{ ozet: 'a'.repeat(64), ad: 'ORN-sertifika.pdf', boyut: 2000, tur: 'pdf', belgeTuru: 'Malzeme sertifikası', ekleyenId: 1, zaman: '2026-11-25T10:00:00Z' }],
    })));
    await ac('/adim-durumu');
    await page.getByRole('list', { name: 'Açık emirler' }).getByRole('button').first().click();
    const ac1 = page.getByRole('table').getByRole('button', { name: /^OP \d+ .* ayrıntısı$/ }).first();
    await ac1.click();
    const bolum = page.getByRole('region', { name: /muayene belgeleri$/ });
    await expect(bolum).toBeVisible({ timeout: 15_000 });
    expect(muayeneId).toBeGreaterThan(0);
    await expect(bolum.getByText('Eksik: Test raporu. Eksik belgeyle adım bitirilemez.')).toBeVisible();
    await expect(bolum.getByRole('link', { name: 'ORN-sertifika.pdf' })).toBeVisible();
    await expect(bolum.getByLabel('Belge türü')).toBeVisible();
    await bolum.evaluate((el) => { el.scrollIntoView({ block: 'center' }); });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await cek(page, 'adim-durumu-muayene-belgeleri', bilgi);
    expect(ag.yazmalar, 'görünüm yazmaz').toEqual([]);
  });

  test('Operasyon tipi: kalite grubunda Zorunlu belgeler alanı çıkar, başka grupta çıkmaz', async ({ page, ac }, bilgi) => {
    await ac('/istasyonlar/operasyon-tipleri');
    await page.getByRole('button', { name: 'Yeni operasyon tipi' }).click();
    const pencere = page.getByRole('dialog');
    await pencere.getByLabel(/Grup/).selectOption('TAL');
    await expect(pencere.getByLabel(/Zorunlu belgeler/)).toHaveCount(0);
    await pencere.getByLabel(/Grup/).selectOption('KAL');
    const alan = pencere.getByLabel(/Zorunlu belgeler/);
    await expect(alan).toBeVisible();
    await alan.fill('Malzeme sertifikası, Test raporu');
    await alan.evaluate((el) => { el.scrollIntoView({ block: 'center' }); });
    expect((await tasmaOlc(page)).belge).toBeLessThanOrEqual(0);
    await cek(page, 'operasyon-tipi-zorunlu-belgeler', bilgi);
  });
});
