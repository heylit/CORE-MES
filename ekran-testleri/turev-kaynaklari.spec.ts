import { expect, tasmaOlc, test } from './ortak.ts';
import type { Page } from '@playwright/test';

// 3609: Çizim Merkezi "Türev ekle" üç kaynaktan açılır. API yanıtları yönlendirilir (yazma isteği sunucuya gitmez); veriler uydurmadır (ORN-).
test.use({ hesap: 'ornek.yonetici' });

const OZET = 'a'.repeat(64);
const rev = (id: number, sira: number, harf: string, durum: 'taslak' | 'yayinda' | 'eski', revKodu: string, dosyaTuru = 'pdf') => ({
  id, sira, harf, durum, ozet: OZET, dosyaAdi: `orn-flans-${harf.toLowerCase()}.${dosyaTuru}`, dosyaTuru, boyut: 2048, not: null,
  yukleyenAd: 'ORN Teknik', yuklendi: '2026-10-01T08:00:00.000Z', yayinlayanAd: durum === 'taslak' ? null : 'ORN Şef', yayinlandi: durum === 'taslak' ? null : '2026-10-02T08:00:00.000Z',
  onizlemeKareSayisi: 0, antetRev: revKodu, revKodu,
});
const belge = (dosyaTuru: string) => ({
  id: 7, ad: 'ORN-Flanş', tur: 'teknik-resim', aciklama: null, resimNo: null, aktif: true, olusturanAd: 'ORN Teknik',
  olusturuldu: '2026-09-01T08:00:00.000Z', guncellendi: '2026-10-01T08:00:00.000Z', surum: 3,
  revizyonlar: [rev(11, 1, 'A', 'yayinda', '00', dosyaTuru)], baglar: [],
  turevler: [{ id: 21, ad: 'ORN-Flanş · iç üretim', kullanim: 'ic-uretim', aktif: true, kaynakRevizyonId: 11, yayindakiRevKodu: null, yayindakiHarf: null, kaynakEski: false }],
});
const satir = (id: number, ad: string, ek: Record<string, unknown> = {}) => ({
  id, ad, tur: 'teknik-resim', aktif: true, yayindakiHarf: 'A', sonHarf: 'A', yayindakiRevKodu: '00', sonRevKodu: '00', dosyaTuru: 'pdf', bagSayisi: 0,
  guncellendi: '2026-11-20T08:00:00.000Z', surum: 2, ...ek,
});
const ADAYLAR = [
  satir(7, 'ORN-Flanş', { turevSayisi: 1 }),
  satir(34, 'ORN-Kapak raporu'),
  satir(31, 'ORN-Flanş (düzenlenmiş)', { yayindakiHarf: null, yayindakiRevKodu: null, sonRevKodu: '01' }),
  satir(32, 'ORN-Mil taşıyıcı (düzenlenmiş)'),
  satir(35, 'ORN-Pafta (düzenlenmiş)', { turevSayisi: 2 }),
  satir(36, 'ORN-Saha fotoğrafı', { dosyaTuru: 'png' }),
];

// Elle yazılmış tek sayfalık boş PDF (düzenleyicinin dosya okuması için).
function bosPdf(): Buffer {
  const nesneler = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>'];
  let govde = '%PDF-1.4\n';
  const konumlar: number[] = [];
  nesneler.forEach((n, i) => { konumlar.push(govde.length); govde += `${String(i + 1)} 0 obj\n${n}\nendobj\n`; });
  const xref = govde.length;
  govde += `xref\n0 4\n0000000000 65535 f \n${konumlar.map((k) => `${String(k).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(govde, 'latin1');
}

async function yonlendir(page: Page, dosyaTuru = 'pdf') {
  const yazmalar: { yol: string; govde: unknown }[] = [];
  await page.route('**/api/cizimler/**', (r) => {
    const u = new URL(r.request().url());
    const yol = u.pathname.replace('/api', '');
    if (r.request().method() === 'POST') { yazmalar.push({ yol, govde: r.request().postDataJSON() as unknown }); return r.fulfill({ json: { ...belge(dosyaTuru), id: 31, ad: 'ORN-Flanş (düzenlenmiş)', turevler: [] } }); }
    if (yol === '/cizimler/7') return r.fulfill({ json: belge(dosyaTuru) });
    if (yol === '/cizimler/7/revizyonlar/11/dosya') return r.fulfill({ body: bosPdf(), contentType: 'application/pdf' });
    if (yol === '/cizimler/ayni-dosya') return r.fulfill({ json: { yerler: [] } });
    return r.fulfill({ status: 404, json: { kod: 'BULUNAMADI', mesaj: 'ORN yok' } });
  });
  await page.route('**/api/cizimler?*', (r) => {
    const ara = (new URL(r.request().url()).searchParams.get('ara') ?? '').toLocaleLowerCase('tr-TR');
    const satirlar = ADAYLAR.filter((s) => ara === '' || s.ad.toLocaleLowerCase('tr-TR').includes(ara));
    return r.fulfill({ json: { satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 20 } });
  });
  return yazmalar;
}

async function turevPenceresiAc(page: Page, ac: (y: string) => Promise<void>) {
  await ac('/cizimler/belge/7');
  await page.getByRole('button', { name: 'Rev 00 için türev ekle' }).click();
  const pencere = page.getByRole('dialog', { name: /türev ekle/ });
  await expect(pencere).toBeVisible();
  return pencere;
}

test('Türev ekle üç kaynak sunar ve her sekme taşmadan çalışır', async ({ page, ac }) => {
  await yonlendir(page);
  const pencere = await turevPenceresiAc(page, ac);
  for (const ad of ['Yükle', 'PDF düzenle', 'Kayıtlı PDF']) await expect(pencere.getByRole('radio', { name: ad, exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('1-bilgisayardan.png') });
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);

  await pencere.getByRole('radio', { name: 'PDF düzenle' }).click();
  // İç üretimde başka türev var: kısa ad zorunlu.
  await pencere.getByRole('radio', { name: 'İç üretim' }).check();
  await expect(pencere.getByRole('button', { name: "PDF düzenleyiciyi aç" })).toBeDisabled();
  await pencere.getByLabel('Kısa ad').fill('kaplama');
  await expect(pencere.getByRole('button', { name: "PDF düzenleyiciyi aç" })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('2-pdf-duzenle.png') });
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);

  await pencere.getByRole('radio', { name: 'Kayıtlı PDF', exact: true }).click();
  await expect(pencere.getByRole('radio', { name: /ORN-Flanş \(düzenlenmiş\)/ })).toBeVisible();
  // Kaynağın kendisi, türevli belge ve PDF olmayan dosya aday değildir.
  await expect(pencere.getByRole('radio', { name: /ORN-Pafta/ })).toHaveCount(0);
  await expect(pencere.getByRole('radio', { name: /ORN-Saha/ })).toHaveCount(0);
  await expect(pencere.getByRole('radio', { name: /^ORN-Flanş Rev/ })).toHaveCount(0);
  await expect(pencere.getByRole('button', { name: 'Bağla' })).toBeDisabled();
  await expect(pencere.getByText('Bir PDF seçin.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('3-cizim-merkezi-liste.png') });
  await pencere.getByLabel("Kayıtlı PDF'i ara").fill('yok-boyle-bir-belge');
  await expect(pencere.getByText('Eşleşen PDF yok.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('7-cizim-merkezi-bos.png') });
  await pencere.getByRole('button', { name: 'Aramayı temizle' }).click();
  await pencere.getByRole('radio', { name: /ORN-Mil taşıyıcı/ }).check();
  await pencere.getByRole('radio', { name: 'Kalite' }).check();
  await expect(pencere.getByRole('button', { name: 'Bağla' })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('4-cizim-merkezi-secili.png') });
  expect((await tasmaOlc(page)).belge, 'yatay taşma').toBeLessThanOrEqual(0);
});

test('Çizim Merkezi\'nden seçilen PDF, kaynak revizyonla turev-bagla ucuna gider', async ({ page, ac }) => {
  const yazmalar = await yonlendir(page);
  const pencere = await turevPenceresiAc(page, ac);
  await pencere.getByRole('radio', { name: 'Kayıtlı PDF', exact: true }).click();
  await pencere.getByLabel("Kayıtlı PDF'i ara").fill('mil');
  await expect(pencere.getByRole('radio', { name: /ORN-Flanş/ })).toHaveCount(0);
  await pencere.getByRole('radio', { name: /ORN-Mil taşıyıcı/ }).check();
  await pencere.getByRole('radio', { name: 'Kalite' }).check();
  await pencere.getByRole('button', { name: 'Bağla' }).click();
  await expect.poll(() => yazmalar.length).toBe(1);
  expect(yazmalar[0]).toEqual({ yol: '/cizimler/32/turev-bagla', govde: { kaynakBelgeId: 7, kaynakRevizyonId: 11, kullanim: 'kalite', surum: 2 } });
});

test('PDF düzenle: düzenleyici açılır, Kaydet penceresine kullanım ve kısa ad hazır gelir', async ({ page, ac }) => {
  await yonlendir(page);
  const pencere = await turevPenceresiAc(page, ac);
  await pencere.getByRole('radio', { name: 'PDF düzenle' }).click();
  await pencere.getByRole('radio', { name: 'Kalite' }).check();
  await pencere.getByLabel('Kısa ad').fill('kaplama');
  await pencere.getByRole('button', { name: 'PDF düzenleyiciyi aç' }).click();
  await expect(page).toHaveURL(/\/cizimler\/belge\/7\/duzenle\/11$/);
  const alan = page.getByLabel('Sayfa 1 düzenleme alanı');
  await expect(alan).toBeVisible();
  const k = await alan.boundingBox();
  if (k === null) throw new Error('düzenleme alanı ölçülemedi');
  // Sayfa görünümden uzundur; sürükleme görünen üst bölümde yapılır.
  await page.mouse.move(k.x + k.width * 0.2, k.y + 30);
  await page.mouse.down();
  await page.mouse.move(k.x + k.width * 0.7, k.y + 90, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Yeni belge olarak kaydet' }).click();
  const kaydet = page.getByRole('dialog', { name: 'Türev olarak kaydet' });
  await expect(kaydet).toBeVisible();
  await expect(kaydet.getByRole('radio', { name: 'Kalite' })).toBeChecked();
  await expect(kaydet.getByLabel('Kısa ad')).toHaveValue('kaplama');
  await page.screenshot({ path: test.info().outputPath('5-duzenleyici-kaydet.png') });
});

test('PDF olmayan revizyonda varsayılan Yükle; PDF düzenle soluk, sebep panelin başında, Yükle\'ye geç döndürür', async ({ page, ac }) => {
  await yonlendir(page, 'png');
  const pencere = await turevPenceresiAc(page, ac);
  await expect(pencere.getByRole('radio', { name: 'Yükle', exact: true })).toBeChecked();
  const duzenle = pencere.getByRole('radio', { name: 'PDF düzenle' });
  await expect(duzenle).toHaveAttribute('aria-disabled', 'true');
  await duzenle.click({ force: true });
  await expect(pencere.getByText(/dosyası PDF değil/)).toBeVisible();
  await expect(pencere.getByRole('radio', { name: 'Kalite' })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('6-pdf-degil.png') });
  await pencere.getByRole('button', { name: "Yükle'ye geç" }).first().click();
  await expect(pencere.getByRole('radio', { name: 'Yükle', exact: true })).toBeChecked();
  await expect(pencere.getByRole('radio', { name: 'Kalite' })).toBeVisible();
});

test('Yükle: dosya seçilmeden düğme kapalı ve sebebi yazılı', async ({ page, ac }) => {
  await yonlendir(page);
  const pencere = await turevPenceresiAc(page, ac);
  await expect(pencere.getByRole('button', { name: 'Yükle', exact: true })).toBeDisabled();
  await expect(pencere.getByText('Dosya seçin.')).toBeVisible();
});

test('Seçili PDF yeni aramanın sonucunda yoksa seçim düşer ve Bağla kapanır', async ({ page, ac }) => {
  await yonlendir(page);
  const pencere = await turevPenceresiAc(page, ac);
  await pencere.getByRole('radio', { name: 'Kayıtlı PDF', exact: true }).click();
  await pencere.getByRole('radio', { name: /ORN-Mil taşıyıcı/ }).check();
  await pencere.getByRole('radio', { name: 'Kalite' }).check();
  await expect(pencere.getByRole('button', { name: 'Bağla' })).toBeEnabled();
  await pencere.getByLabel("Kayıtlı PDF'i ara").fill('kapak');
  await expect(pencere.getByRole('radio', { name: /ORN-Mil/ })).toHaveCount(0);
  await expect(pencere.getByRole('button', { name: 'Bağla' })).toBeDisabled();
  await expect(pencere.getByText('Bir PDF seçin.')).toBeVisible();
});
