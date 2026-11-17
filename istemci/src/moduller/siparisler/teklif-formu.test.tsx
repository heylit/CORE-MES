import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { TeklifAyrintiCevabi, TeklifFormuCevabi, TeklifFormuVerisiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { TeklifFormuAyari } from './TeklifFormuAyari.tsx';
import { TeklifFormuKagidi, type FormVerisi } from './TeklifFormuKagidi.tsx';
import { TeklifFormuPenceresi } from './TeklifFormuPenceresi.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { alanlariDoldur, formSayisi, formTarihi, hitap, kdvOraniOku } from './teklif-formu.ts';

const KURUM = { unvan: 'Deneme Kurum A.Ş.', adres: 'Deneme adres', telefon: '0000', eposta: 'deneme@ornek.invalid', vergi: 'Deneme VD 1' };
const ICERIK = {
  baslik: 'TEKLİF FORMU', giris: 'Sayın {YETKILI},\n{TEKLIF_NO} teklifimiz {GECERLILIK} tarihine kadar geçerlidir.',
  sartlar: ['Deneme şart 1', 'Deneme şart 2'], imza1: 'Hazırlayan', imza2: 'Müşteri onayı', alt: '',
};
const AYAR = {
  kurum: KURUM, kurumSurum: 1,
  sablonlar: [
    { id: 1, ad: 'Standart teklif', dil: 'tr', varsayilan: true, icerik: ICERIK, surum: 1 },
    { id: 2, ad: 'Quotation (English)', dil: 'en', varsayilan: false, icerik: { ...ICERIK, baslik: 'QUOTATION', giris: '', sartlar: [], imza1: '', imza2: '' }, surum: 1 },
  ],
} satisfies TeklifFormuCevabi;
const FORM_VERISI = {
  musteri: { ad: 'Deneme Musteri A', adres: 'Deneme Mah.\nDeneme İl', vergiDairesi: 'Deneme VD', vergiNo: '2' },
  araToplam: '400.00', iskontoTutari: '40.00', kdvHaric: '360.00', kdvOrani: '20', kdvTutari: '72.00', genelToplam: '432.00', metin: null,
} satisfies TeklifFormuVerisiCevabi;
const SURUM = {
  surumNo: 1, iskontoOrani: '10.00', teslimGun: 14, terminTarihi: null, odemeKosulu: '30 gün', gecerlilik: '2026-11-01', aciklama: null, olusturma: '2026-10-02T09:00:00+03:00',
  fiyatlar: [{ satirId: 11, birimFiyat: '10.0000', iskontoluFiyat: '9.0000', tutar: '360.00' }], toplam: '360.00', iskontoOnaylayan: null, iskontoOnayAni: null,
};
const TEKLIF = {
  id: 21, no: 'TK-2026-0021', durum: 'verildi', firmaId: 7, firmaAd: 'Deneme Musteri A', baslik: 'Deneme braket ihtiyacı', paraBirimi: 'TRY',
  istenenTarih: null, aciklama: null, not: null, kabulSurumu: null, siparisId: null, sonSurumNo: 1, olusturma: '2026-10-01T09:00:00+03:00', guncelleme: null, surum: 4,
  satirlar: [{ id: 11, sira: 1, malzemeNo: 31, malzemeKodu: 'DNM-001', malzemeAdi: 'Deneme Mil', aciklamalar: [], tanim: 'Deneme Mil 20mm', birim: 'adet', miktar: '40.000' }],
  surumler: [SURUM],
} satisfies TeklifAyrintiCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown }

function sunucuKur(kullanici: Kullanici, ozel: (yontem: string, yol: string, govde: unknown) => Response | undefined = () => undefined) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) as unknown : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    const oz = ozel(yontem, yol, govde);
    if (oz) return oz;
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    if (yol === '/siparisler/teklif-formu') return json(200, AYAR);
    if (yol.startsWith('/siparisler/teklifler/21/form?')) return json(200, FORM_VERISI);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return istekler;
}

function sar(dugum: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{dugum}</BildirimSaglayici></QueryClientProvider>);
}

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yonetici', islemler: ['ayarlar.yaz', 'siparisler.fiyat-oku'] };

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.querySelectorAll('.tc-tf-baski').forEach((d) => d.remove()); });

describe('Teklif formu biçimleri', () => {
  it('sayı dile göre ayrılır; yuvarlama yapılmaz, fiyatta sondaki sıfırlar atılır', () => {
    expect(formSayisi('1250.5', 'tr')).toBe('1.250,50');
    expect(formSayisi('1250.5', 'en')).toBe('1,250.50');
    expect(formSayisi('176.2250', 'tr', 'fiyat')).toBe('176,225');
    expect(formSayisi('420.0000', 'tr', 'fiyat')).toBe('420,00');
    expect(formSayisi('40.000', 'tr', 'miktar')).toBe('40');
    expect(formSayisi('-2583.00', 'tr')).toBe('-2.583,00');
    expect(formSayisi(null, 'tr')).toBe('—');
  });
  it('tarih dile göre yazılır, boş tarih tire olur', () => {
    expect(formTarihi('2026-11-01', 'tr')).toBe('01.11.2026');
    expect(formTarihi('2026-10-02T09:00:00+03:00', 'en')).toBe('02/10/2026');
    expect(formTarihi(null, 'tr')).toBe('—');
  });
  it('alanlar dolar, bilinmeyen süslü parantez kalır; ilgili yoksa hitap firmayadır', () => {
    const d = { musteri: 'M', yetkili: 'Y', teklifNo: 'T-1', gecerlilik: '01.11.2026', teslimGun: '14' };
    expect(alanlariDoldur('{MUSTERI} {YETKILI} {TEKLIF_NO} {GECERLILIK} {TESLIM_GUN} {BILINMEYEN}', d)).toBe('M Y T-1 01.11.2026 14 {BILINMEYEN}');
    expect(hitap('  Deneme Kisi ', 'F', 'tr')).toBe('Deneme Kisi');
    expect(hitap('', 'F', 'tr')).toBe('F yetkilisi');
    expect(hitap('', 'F', 'en')).toBe('F');
    expect(hitap('', null, 'en')).toBe('Sir or Madam');
  });
  it('KDV oranı virgülle de yazılır; 100 üstü ve harf geçersizdir', () => {
    expect(kdvOraniOku('20')).toBe('20');
    expect(kdvOraniOku(' 8,5 ')).toBe('8.5');
    expect(kdvOraniOku('101')).toBeNull();
    expect(kdvOraniOku('yirmi')).toBeNull();
  });
});

describe('Teklif formu kâğıdı', () => {
  const veri: FormVerisi = {
    no: 'TK-1', surumNo: 2, tarih: '2026-10-02', gecerlilik: '2026-11-01', baslik: 'Deneme', paraBirimi: 'TRY', teslimGun: 14, terminTarihi: null, odemeKosulu: null, iskontoOrani: '0',
    satirlar: [{ id: 1, kod: null, ad: 'Deneme kalem', miktar: '2', birim: null, birimFiyat: '5.0000', iskontoluFiyat: '5.0000', tutar: '10.00' }],
    musteri: { ad: 'Deneme Musteri', adres: null, vergiDairesi: null, vergiNo: null }, ilgili: '',
    toplam: { araToplam: '10.00', iskontoTutari: '0.00', kdvHaric: '10.00', kdvOrani: '20', kdvTutari: '2.00', genelToplam: '12.00' },
  };
  it('boş giriş ve şart basılmaz, onay alanları imza adı boşken de basılır; iskontosuz teklifte ara toplam ve iskonto satırı yoktur', () => {
    render(<TeklifFormuKagidi dil="tr" icerik={{ ...ICERIK, giris: '', sartlar: [], imza1: '', imza2: '' }} kurum={KURUM} logo={null} veri={veri} />);
    const kagit = screen.getByRole('article', { name: 'Teklif TK-1' });
    expect(kagit.getAttribute('data-theme')).toBe('light');
    expect(within(kagit).queryByText('Şartlar')).toBeNull();
    expect(within(kagit).queryByText('Ara toplam')).toBeNull();
    expect(within(kagit).queryByText('İskontolu')).toBeNull();
    expect(within(kagit).getByText('12,00 TRY')).toBeTruthy();
    // 3356: örnek formdaki gibi iki onay alanı her zaman basılır; boş vergi dairesi basılmaz.
    expect(within(kagit).getByText('FİRMA ONAYI / COMPANY CONFIRMATION')).toBeTruthy();
    expect(within(kagit).getByText('MÜŞTERİ ONAYI / CUSTOMER CONFIRMATION')).toBeTruthy();
    expect(within(kagit).queryByText('Vergi dairesi')).toBeNull();
    expect(within(kagit).getByText('Satış teklifi')).toBeTruthy();
    // Ödeme koşulu yoksa satır basılmaz.
    expect(within(kagit).queryByText('Ödeme')).toBeNull();
  });
  it('doküman kutusu yalnız doluyken antete basılır, kurum satırı alta iner; kod sütunu yalnız kodlu kalemde, birim ayrı sütundadır', () => {
    render(<TeklifFormuKagidi dil="tr" icerik={ICERIK} kurum={KURUM} logo={null} veri={veri} />);
    const bos = screen.getByRole('article', { name: 'Teklif TK-1' });
    expect(bos.querySelector('.tc-tf-belge')).toBeNull();
    expect(within(bos).queryByRole('columnheader', { name: 'Kod' })).toBeNull();
    expect(within(bos).getByRole('columnheader', { name: 'Birim' })).toBeTruthy();
    cleanup();
    const belge = { no: 'ORN-F-01', yayin: '01.01.2026', revTarihi: '', revNo: '0' };
    const kodlu = { ...veri, satirlar: [{ ...veri.satirlar[0]!, kod: 'ORN-001', birim: 'adet' }] };
    render(<TeklifFormuKagidi dil="tr" icerik={{ ...ICERIK, belge }} kurum={KURUM} logo={null} veri={kodlu} />);
    const kagit = screen.getByRole('article', { name: 'Teklif TK-1' });
    const kutu = kagit.querySelector('.tc-tf-belge');
    expect(kutu?.textContent).toContain('ORN-F-01');
    expect(kutu?.textContent).not.toContain('Rev. tarihi');
    expect(kagit.querySelector('.tc-tf-kurum-satir')?.textContent).toBe('Deneme adres · Tel 0000 · deneme@ornek.invalid · Deneme VD 1');
    expect(within(kagit).getByRole('columnheader', { name: 'Kod' })).toBeTruthy();
    expect(within(kagit).getByRole('cell', { name: 'ORN-001' })).toBeTruthy();
    expect(within(kagit).getByRole('cell', { name: 'adet' })).toBeTruthy();
  });
  it('İngilizce şablon etiketleri ve sayı biçimi İngilizcedir; giriş alanları teklifle dolar', () => {
    render(<TeklifFormuKagidi dil="en" icerik={{ ...ICERIK, giris: 'Dear {YETKILI}, {TEKLIF_NO}' }} kurum={KURUM} logo={null}
      veri={{ ...veri, ilgili: 'Deneme Kisi', musteri: { ...veri.musteri, vergiDairesi: 'Deneme VD' } }} />);
    expect(screen.getByText('Grand total')).toBeTruthy();
    expect(screen.getByText('12.00 TRY')).toBeTruthy();
    expect(screen.getByText('Dear Deneme Kisi, TK-1')).toBeTruthy();
    // 3356: onay başlığı şablon diliyle; eski şablonun başlık gibi yazılmış imza adı ('Müşteri onayı') tekrar basılmaz, gerçek ad basılır.
    expect(screen.getByText('CUSTOMER CONFIRMATION')).toBeTruthy();
    expect(screen.getByText('COMPANY CONFIRMATION')).toBeTruthy();
    expect(screen.getByText('Sales quotation').previousElementSibling?.textContent).toBe('Type');
    expect(screen.getByText('Deneme VD').previousElementSibling?.textContent).toBe('Tax office');
    // müşteri onayının altında müşteri firması
    expect(screen.getByText('CUSTOMER CONFIRMATION').parentElement?.querySelector('small')?.textContent).toBe('Deneme Musteri');
    expect(screen.queryByText('Müşteri onayı')).toBeNull();
    expect(screen.getByText('Hazırlayan')).toBeTruthy();
  });
});

describe('Teklif formu penceresi', () => {
  it('varsayılan şablonla açılır; KDV oranı ve sürüm sorguya gider, toplamlar sunucudan gelir', async () => {
    const istekler = sunucuKur(YONETICI);
    sar(<TeklifFormuPenceresi acik kapat={() => undefined} teklif={TEKLIF} surum={SURUM} />);
    const pencere = await screen.findByRole('dialog', { name: /Teklif formu · TK-2026-0021/ });
    await waitFor(() => expect(within(pencere).getByText('432,00 TRY')).toBeTruthy());
    expect((within(pencere).getByLabelText('Şablon') as HTMLSelectElement).value).toBe('1');
    // 3356: firmanın vergi dairesi sunucudan gelir, müşteri kutusunda vergi numarasından önce basılır.
    const musteri = within(pencere).getByRole('article').querySelector('.tc-tf-bilgi section')!;
    expect([...musteri.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Ünvan', 'Adres', 'Vergi dairesi', 'Vergi no']);
    expect(within(musteri as HTMLElement).getByText('Deneme VD')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/siparisler/teklifler/21/form?surumNo=1&kdvOrani=20')).toBe(true);
    // Basım kopyası gövdeye konur; ekranda gizlidir, basımda yalnız o çıkar.
    expect(document.body.querySelector(':scope > .tc-tf-baski .tc-tf-kagit')).not.toBeNull();

    fireEvent.change(within(pencere).getByLabelText('KDV oranı (%)'), { target: { value: '10' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/siparisler/teklifler/21/form?surumNo=1&kdvOrani=10')).toBe(true));
    fireEvent.change(within(pencere).getByLabelText('KDV oranı (%)'), { target: { value: '150' } });
    expect(within(pencere).getByText(/KDV oranı 0 ile 100 arasında/)).toBeTruthy();
    expect((within(pencere).getByRole('button', { name: 'Yazdır / PDF' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ilgili kişi hitaba girer, kaydedilmez; şablon değişince dil değişir; Yazdır basım penceresini açar', async () => {
    const istekler = sunucuKur(YONETICI);
    const yazdir = vi.fn();
    vi.stubGlobal('print', yazdir);
    sar(<TeklifFormuPenceresi acik kapat={() => undefined} teklif={TEKLIF} surum={SURUM} />);
    const pencere = await screen.findByRole('dialog', { name: /Teklif formu/ });
    await waitFor(() => expect(within(pencere).getByText(/Sayın Deneme Musteri A yetkilisi,/)).toBeTruthy());
    fireEvent.change(within(pencere).getByLabelText(/İlgili kişi/), { target: { value: 'Deneme Kisi' } });
    expect(within(pencere).getByText(/Sayın Deneme Kisi,/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yazdır / PDF' }));
    expect(yazdir).toHaveBeenCalledOnce();
    expect(document.title).toBe('TK-2026-0021-S1');
    fireEvent(window, new Event('afterprint'));
    expect(document.title).not.toBe('TK-2026-0021-S1');
    fireEvent.change(within(pencere).getByLabelText('Şablon'), { target: { value: '2' } });
    expect(within(pencere).getByText('Grand total')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
    // Teklifi yazamayan metni düzenleyemez.
    expect(within(pencere).queryByLabelText(/^Form başlığı/)).toBeNull();
  });

  it('3328 teklifi yazan metni düzenler: kâğıt hemen yansır, kaydetmeden basılır; "Bu teklif için kaydet" metni sürümle yazar', async () => {
    const istekler = sunucuKur({ ...YONETICI, islemler: [...YONETICI.islemler, 'siparisler.yaz'] }, (yontem, yol) =>
      (yontem === 'POST' && yol === '/siparisler/teklifler/21/form-metni-kaydet' ? json(200, { ...TEKLIF, surum: 5 }) : undefined));
    sar(<TeklifFormuPenceresi acik kapat={() => undefined} teklif={TEKLIF} surum={SURUM} />);
    const pencere = await screen.findByRole('dialog', { name: /Teklif formu/ });
    const kaydet = await within(pencere).findByRole('button', { name: 'Bu teklif için kaydet' });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(await within(pencere).findByLabelText(/^Form başlığı/), { target: { value: 'ÖZEL TEKLİF' } });
    fireEvent.click(within(pencere).getByRole('button', { name: '1. şartı sil' }));
    expect(within(pencere).getByText('Kaydedilmedi')).toBeTruthy();
    const kagit = within(pencere).getByRole('article', { name: 'Teklif TK-2026-0021' });
    expect(within(kagit).getByText('ÖZEL TEKLİF')).toBeTruthy();
    expect(within(kagit).queryByText('Deneme şart 1')).toBeNull();
    // Basım kopyası da düzenlenen metindir.
    expect(document.body.querySelector(':scope > .tc-tf-baski .tc-tf-baslik')?.textContent).toBe('ÖZEL TEKLİF');
    fireEvent.click(kaydet);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({
      yol: '/siparisler/teklifler/21/form-metni-kaydet',
      govde: { surum: 4, metin: { dil: 'tr', icerik: { ...ICERIK, baslik: 'ÖZEL TEKLİF', sartlar: ['Deneme şart 2'] } } },
    });
  });

  // Pencere teklifi sayfadaki gibi sorgudan alır: kayıt cevabı sorguya yazılınca sonraki kayıt yeni sürümle gider.
  function SorguluPencere() {
    const t = useQuery({ queryKey: anahtarlar.teklif(21), queryFn: () => TEKLIF, staleTime: Infinity });
    return t.data ? <TeklifFormuPenceresi acik kapat={() => undefined} teklif={t.data} surum={SURUM} /> : null;
  }

  it('3328 art arda iki kayıtta ikincisi ilk kaydın döndürdüğü sürümle gider', async () => {
    let surum = 4;
    let kayitli: unknown = null;
    const istekler = sunucuKur({ ...YONETICI, islemler: [...YONETICI.islemler, 'siparisler.yaz'] }, (yontem, yol, govde) => {
      if (yol.startsWith('/siparisler/teklifler/21/form?')) return json(200, { ...FORM_VERISI, metin: kayitli });
      if (yontem !== 'POST' || yol !== '/siparisler/teklifler/21/form-metni-kaydet') return undefined;
      kayitli = (govde as { metin: unknown }).metin;
      surum += 1;
      return json(200, { ...TEKLIF, surum });
    });
    sar(<SorguluPencere />);
    const pencere = await screen.findByRole('dialog', { name: /Teklif formu/ });
    const baslik = await within(pencere).findByLabelText(/^Form başlığı/);
    fireEvent.change(baslik, { target: { value: 'BİRİNCİ' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bu teklif için kaydet' }));
    await waitFor(() => expect(within(pencere).getByText('Bu teklife özel metin kayıtlı')).toBeTruthy());
    fireEvent.change(within(pencere).getByLabelText(/^Form başlığı/), { target: { value: 'İKİNCİ' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bu teklif için kaydet' }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(2));
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => (i.govde as { surum: number }).surum)).toEqual([4, 5]);
  });

  it('3328 kayıtlı metin yokken "Şablona dön" sunucuya gitmez, taslağı atar; kabul edilmiş teklifte metin düzenlenmez', async () => {
    const istekler = sunucuKur({ ...YONETICI, islemler: [...YONETICI.islemler, 'siparisler.yaz'] });
    sar(<TeklifFormuPenceresi acik kapat={() => undefined} teklif={TEKLIF} surum={SURUM} />);
    const pencere = await screen.findByRole('dialog', { name: /Teklif formu/ });
    fireEvent.change(await within(pencere).findByLabelText(/^Form başlığı/), { target: { value: 'GEÇİCİ' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Şablona dön' }));
    expect((within(pencere).getByLabelText(/^Form başlığı/) as HTMLInputElement).value).toBe('TEKLİF FORMU');
    expect(within(pencere).queryByText('Kaydedilmedi')).toBeNull();
    await new Promise((r) => { setTimeout(r, 20); });
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
    cleanup();
    sunucuKur({ ...YONETICI, islemler: [...YONETICI.islemler, 'siparisler.yaz'] });
    sar(<TeklifFormuPenceresi acik kapat={() => undefined} teklif={{ ...TEKLIF, durum: 'kabul', kabulSurumu: 1 }} surum={SURUM} />);
    const kabul = await screen.findByRole('dialog', { name: /Teklif formu/ });
    await within(kabul).findByRole('article', { name: 'Teklif TK-2026-0021' });
    expect(within(kabul).queryByLabelText(/^Form başlığı/)).toBeNull();
    expect(within(kabul).queryByRole('button', { name: 'Bu teklif için kaydet' })).toBeNull();
  });

  it('3328 kayıtlı metinle açılır; "Şablona dön" kaydı kaldırır; başlık boşken kaydedilmez', async () => {
    const ozel = { dil: 'tr' as const, icerik: { ...ICERIK, baslik: 'KAYITLI BAŞLIK' } };
    const istekler = sunucuKur({ ...YONETICI, islemler: [...YONETICI.islemler, 'siparisler.yaz'] }, (yontem, yol) => {
      if (yol.startsWith('/siparisler/teklifler/21/form?')) return json(200, { ...FORM_VERISI, metin: ozel });
      return yontem === 'POST' ? json(200, TEKLIF) : undefined;
    });
    sar(<TeklifFormuPenceresi acik kapat={() => undefined} teklif={TEKLIF} surum={SURUM} />);
    const pencere = await screen.findByRole('dialog', { name: /Teklif formu/ });
    expect(await within(pencere).findByText('Bu teklife özel metin kayıtlı')).toBeTruthy();
    expect(within(within(pencere).getByRole('article', { name: 'Teklif TK-2026-0021' })).getByText('KAYITLI BAŞLIK')).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/^Form başlığı/), { target: { value: ' ' } });
    expect((within(pencere).getByRole('button', { name: 'Bu teklif için kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Şablona dön' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({ yol: '/siparisler/teklifler/21/form-metni-kaydet', govde: { surum: 4, metin: null } }));
  });
});

describe('Sistem Ayarları › Formlar › Teklif formu', () => {
  it('şablon kaydedilir: metin, alan çipi ve şart taslakta değişir, önizleme hemen yansır, gövde sürümle gider', async () => {
    const istekler = sunucuKur(YONETICI, (yontem, yol, govde) => {
      if (yontem === 'POST' && yol === '/siparisler/teklif-formu/sablonlar/1/kaydet') {
        const g = govde as { ad: string; dil: 'tr'; icerik: typeof ICERIK };
        return json(200, { ...AYAR, sablonlar: [{ ...AYAR.sablonlar[0], ...g, surum: 2 }, AYAR.sablonlar[1]] });
      }
      return undefined;
    });
    sar(<TeklifFormuAyari />);
    const baslik = await screen.findByLabelText(/^Form başlığı/);
    const kaydet = screen.getByRole('button', { name: 'Şablonu kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(baslik, { target: { value: 'FİYAT TEKLİFİ' } });
    expect(screen.getByRole('heading', { level: 1, name: 'FİYAT TEKLİFİ' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Giriş metni'), { target: { value: 'Merhaba ' } });
    fireEvent.click(screen.getByRole('button', { name: '{MUSTERI} alanını ekle' }));
    expect((screen.getByLabelText('Giriş metni') as HTMLTextAreaElement).value).toBe('Merhaba {MUSTERI}');
    fireEvent.change(screen.getByLabelText('Yeni şart'), { target: { value: 'Deneme şart 3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    fireEvent.click(screen.getByRole('button', { name: '1. şartı sil' }));
    fireEvent.change(screen.getByLabelText('Doküman no'), { target: { value: 'ORN-F-01' } });
    expect(document.querySelector('.tc-tf-belge')?.textContent).toContain('ORN-F-01');
    expect(screen.getByText('Kaydedilmedi')).toBeTruthy();
    fireEvent.click(kaydet);
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({
      surum: 1, ad: 'Standart teklif', dil: 'tr', icerik: {
        ...ICERIK, baslik: 'FİYAT TEKLİFİ', giris: 'Merhaba {MUSTERI}', sartlar: ['Deneme şart 2', 'Deneme şart 3'],
        belge: { no: 'ORN-F-01', yayin: '', revTarihi: '', revNo: '' },
      },
    });
    await waitFor(() => expect(screen.queryByText('Kaydedilmedi')).toBeNull());
  });

  it('başlık boşken kaydedilmez; sürüm çakışması iletisi yazılır; varsayılan yap ve firma bilgisi kendi uçlarına gider', async () => {
    const istekler = sunucuKur(YONETICI, (yontem, yol) => {
      if (yontem === 'POST' && yol === '/siparisler/teklif-formu/sablonlar/2/kaydet') return json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başkası tarafından değişti.' } satisfies HataGovdesi);
      if (yontem === 'POST' && yol === '/siparisler/teklif-formu/sablonlar/2/varsayilan-yap') return json(200, AYAR);
      if (yontem === 'POST' && yol === '/siparisler/teklif-formu/kurum/kaydet') return json(200, AYAR);
      return undefined;
    });
    sar(<TeklifFormuAyari />);
    fireEvent.click(await screen.findByRole('button', { name: /Quotation \(English\)/ }));
    const baslik = screen.getByLabelText(/^Form başlığı/);
    fireEvent.change(baslik, { target: { value: ' ' } });
    expect(screen.getByText('Form başlığı boş olamaz.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Şablonu kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(baslik, { target: { value: 'QUOTE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Şablonu kaydet' }));
    await waitFor(() => expect(screen.getAllByText(/başkası tarafından değişti/).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Varsayılan yap' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/siparisler/teklif-formu/sablonlar/2/varsayilan-yap')).toBe(true));
    expect(istekler.find((i) => i.yol.endsWith('/varsayilan-yap'))?.govde).toEqual({ surum: 1 });

    fireEvent.change(screen.getByLabelText('Ünvan'), { target: { value: 'Deneme Kurum B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Firma bilgilerini kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/siparisler/teklif-formu/kurum/kaydet')).toBe(true));
    expect(istekler.find((i) => i.yol === '/siparisler/teklif-formu/kurum/kaydet')?.govde).toEqual({ surum: 1, kurum: { ...KURUM, unvan: 'Deneme Kurum B' } });
  });
});
