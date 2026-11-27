import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { TeklifAyrintiCevabi, TeklifFormuCevabi, TeklifFormuIcerigi, TeklifFormuVerisiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { TeklifFormuAyari } from './TeklifFormuAyari.tsx';
import { TeklifFormuKagidi, type FormVerisi } from './TeklifFormuKagidi.tsx';
import { TeklifFormuPenceresi } from './TeklifFormuPenceresi.tsx';
import { FORM_ALAN_TANIMLARI, alanDegistir, degersizAlanlar } from './teklif-formu.ts';

const KURUM = { unvan: 'ORN Kurum A.Ş.', adres: 'ORN adres', telefon: '0000', eposta: 'orn@ornek.invalid', vergi: 'ORN VD 1' };
const ICERIK: TeklifFormuIcerigi = { baslik: 'TEKLİF FORMU', giris: 'Sayın {MUSTERI}', sartlar: [], imza1: '', imza2: '', alt: '' };
const VERI: FormVerisi = {
  no: 'TK-1', surumNo: 2, tarih: '2026-10-02', gecerlilik: '2026-11-01', baslik: 'ORN konu', paraBirimi: 'TRY', teslimGun: 14, terminTarihi: null, odemeKosulu: '30 gün', iskontoOrani: '0',
  satirlar: [{ id: 1, kod: 'ORN-001', ad: 'ORN kalem', miktar: '2', birim: 'adet', birimFiyat: '5.0000', iskontoluFiyat: '5.0000', tutar: '10.00', yerlilik: null }],
  musteri: { ad: 'ORN Müşteri', adres: 'ORN Mah.', vergiDairesi: 'ORN VD', vergiNo: '1' }, ilgili: '',
  toplam: { araToplam: '10.00', iskontoTutari: '0.00', kdvHaric: '10.00', kdvOrani: '20', kdvTutari: '2.00', genelToplam: '12.00' },
};
const kagit = (icerik: TeklifFormuIcerigi) => {
  render(<TeklifFormuKagidi dil="tr" icerik={icerik} kurum={KURUM} logo={null} veri={VERI} />);
  return screen.getByRole('article', { name: 'Teklif TK-1' });
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.querySelectorAll('.tc-tf-baski').forEach((d) => d.remove()); });

describe('3794 alan ayarı', () => {
  it('boş etiket ya da değer saklanmaz, durum kalkınca ayar ve liste silinir', () => {
    const a1 = alanDegistir(ICERIK, 'musteriAdres', { durum: 'gizli', etiket: 'Teslim adresi' });
    expect(a1).toEqual({ musteriAdres: { durum: 'gizli', etiket: 'Teslim adresi' } });
    const a2 = alanDegistir({ ...ICERIK, alanlar: a1 }, 'musteriAdres', { durum: null, etiket: '  ' });
    expect(a2).toBeUndefined();
    expect(alanDegistir(ICERIK, 'teklifKonu', { deger: 'ORN yeni konu' })).toEqual({ teklifKonu: { deger: 'ORN yeni konu' } });
  });
  it('şablona giden alanlarda değer atılır', () => {
    expect(degersizAlanlar({ teklifKonu: { deger: 'x' }, musteriAdres: { durum: 'gizli', deger: 'y' } })).toEqual({ musteriAdres: { durum: 'gizli' } });
    expect(degersizAlanlar({ teklifKonu: { deger: 'x' } })).toBeUndefined();
  });
  it('kilitli alanlar fiyat, miktar, toplam, teklif bilgisi, teslim ve ödemedir; değeri yazılmaz', () => {
    const kilitli = FORM_ALAN_TANIMLARI.filter((t) => t.kilitli).map((t) => t.anahtar);
    expect(kilitli).toEqual(expect.arrayContaining(['sutunMiktar', 'sutunBirimFiyat', 'sutunTutar', 'toplamGenel', 'toplamKdv', 'teklifNo', 'teklifTarih', 'kosulTeslim', 'kosulOdeme']));
    expect(FORM_ALAN_TANIMLARI.filter((t) => t.kilitli && t.degerli)).toEqual([]);
  });
});

describe('3794 kâğıt', () => {
  it('gizli ve kaldırılan alan basılmaz, etiket değişir, bu forma yazılan değer kayıttakinin yerine basılır', () => {
    const k = kagit({
      ...ICERIK,
      alanlar: {
        musteriVergiDairesi: { durum: 'gizli' }, teklifSurum: { durum: 'kaldirildi' }, musteriAdres: { etiket: 'Teslim adresi' },
        musteriUnvan: { deger: 'ORN Müşteri Şubesi' }, sutunTutar: { durum: 'gizli' }, imzaMusteri: { durum: 'kaldirildi' }, imzaFirma: { etiket: 'ONAY' },
      },
    });
    expect(within(k).queryByText('Vergi dairesi')).toBeNull();
    expect(within(k).queryByText('Sürüm')).toBeNull();
    expect(within(k).getByText('Teslim adresi')).toBeTruthy();
    expect(within(k).queryByText('Adres')).toBeNull();
    // Unvan değeri girişteki {MUSTERI} alanına da geçer.
    expect(within(k).getByText('Sayın ORN Müşteri Şubesi')).toBeTruthy();
    expect(within(k).queryByRole('columnheader', { name: /Tutar/ })).toBeNull();
    expect(within(k).getByRole('columnheader', { name: 'Birim fiyat' })).toBeTruthy();
    expect(within(k).queryByText('MÜŞTERİ ONAYI / CUSTOMER CONFIRMATION')).toBeNull();
    expect(within(k).getByText('ONAY')).toBeTruthy();
    // Toplamlar sürümden gelir; gizlenmeyen genel toplam değişmeden basılır.
    expect(within(k).getByText('12,00 TRY')).toBeTruthy();
  });
  it('alan ayarı yoksa form eskisi gibi basılır', () => {
    const k = kagit(ICERIK);
    for (const ad of ['Ünvan', 'Adres', 'Vergi dairesi', 'Vergi no', 'Teklif no', 'Sürüm', 'Konu', 'Teslim süresi', 'Ödeme']) expect(within(k).getByText(ad)).toBeTruthy();
    expect(within(k).getByRole('columnheader', { name: 'Tutar (TRY)' })).toBeTruthy();
  });
  it('bütün koşullar gizlenince "Teslim ve ödeme" bölümü basılmaz', () => {
    const k = kagit({ ...ICERIK, alanlar: { kosulTeslim: { durum: 'gizli' }, kosulOdeme: { durum: 'gizli' }, kosulGecerlilik: { durum: 'kaldirildi' } } });
    expect(within(k).queryByText('Teslim ve ödeme')).toBeNull();
  });
});

const AYAR = { kurum: KURUM, kurumSurum: 1, sablonlar: [{ id: 1, ad: 'Standart', dil: 'tr', varsayilan: true, icerik: ICERIK, surum: 1 }] } satisfies TeklifFormuCevabi;
const FORM_VERISI = {
  musteri: { ad: 'ORN Müşteri', adres: 'ORN Mah.', vergiDairesi: 'ORN VD', vergiNo: '1' },
  araToplam: '20.00', iskontoTutari: '0.00', kdvHaric: '20.00', kdvOrani: '20', kdvTutari: '4.00', genelToplam: '24.00', metin: null,
} satisfies TeklifFormuVerisiCevabi;
const SURUM = {
  surumNo: 1, iskontoOrani: '0.00', teslimGun: 14, terminTarihi: null, odemeKosulu: '30 gün', gecerlilik: '2026-11-01', aciklama: null, olusturma: '2026-10-02T09:00:00+03:00',
  fiyatlar: [{ satirId: 11, birimFiyat: '10.0000', iskontoluFiyat: '10.0000', tutar: '20.00' }], toplam: '20.00', iskontoOnaylayan: null, iskontoOnayAni: null,
  kdvOrani: null, kdvTutari: null, genelToplam: null,
};
const TEKLIF = {
  id: 21, no: 'TK-2026-0021', durum: 'verildi', firmaId: 7, firmaAd: 'ORN Müşteri', firmaKodu: null, baslik: 'ORN konu', paraBirimi: 'TRY',
  istenenTarih: null, aciklama: null, not: null, kabulSurumu: null, siparisId: null, siparisteSurumNo: null, sonSurumNo: 1, olusturma: '2026-10-01T09:00:00+03:00', guncelleme: null, surum: 4, olusturanId: 3, arsiv: null,
  satirlar: [{ id: 11, sira: 1, malzemeNo: null, malzemeKodu: null, malzemeAdi: null, aciklamalar: [], tanim: 'ORN kalem', birim: 'adet', miktar: '2.000', yerlilikOrani: null }],
  surumler: [SURUM], kdvSecenekleri: { oranlar: ['20.00'], genel: '20.00' },
} satisfies TeklifAyrintiCevabi;
const YAZAN: Kullanici = { id: 1, ad: 'ORN Yazan', islemler: ['ayarlar.yaz', 'siparisler.fiyat-oku', 'siparisler.yaz'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur() {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) as unknown : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici: YAZAN } satisfies OturumCevabi);
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    if (yol === '/siparisler/teklif-formu') return json(200, AYAR);
    if (yol.startsWith('/siparisler/teklifler/21/form?')) return json(200, FORM_VERISI);
    if (yontem === 'POST') return json(200, yol.includes('/teklif-formu/') ? AYAR : TEKLIF);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return istekler;
}
function sar(dugum: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{dugum}</BildirimSaglayici></QueryClientProvider>);
}
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });

describe('3794 teklif formu penceresinde alan paneli', () => {
  it('göz gizler, çöp kaldırır ve "Geri al" geri getirir; kilitli alanda çöp yoktur; kayıt alanları gövdeyle gönderir', async () => {
    const istekler = sunucuKur();
    sar(<TeklifFormuPenceresi acik kapat={() => undefined} teklif={TEKLIF} surum={SURUM} />);
    const pencere = await screen.findByRole('dialog', { name: /Teklif formu/ });
    const belge = await within(pencere).findByRole('article', { name: 'Teklif TK-2026-0021' });
    expect(within(belge).getByText('Vergi dairesi')).toBeTruthy();

    fireEvent.click(within(pencere).getByRole('button', { name: 'Vergi dairesi alanını gizle' }));
    expect(within(belge).queryByText('Vergi dairesi')).toBeNull();
    expect(within(pencere).getByRole('button', { name: 'Vergi dairesi gizli; forma bas' })).toBeTruthy();

    // Fiyat, miktar ve toplam kilitlidir: yalnız gizlenir.
    expect(within(pencere).queryByRole('button', { name: 'Birim fiyat alanını formdan kaldır' })).toBeNull();
    expect(within(pencere).getByRole('button', { name: 'Birim fiyat alanını gizle' })).toBeTruthy();
    expect(within(pencere).queryByLabelText(/^Birim fiyat değeri/)).toBeNull();

    fireEvent.click(within(pencere).getByRole('button', { name: 'Tür alanını formdan kaldır' }));
    expect(within(belge).queryByText('Satış teklifi')).toBeNull();
    expect(within(pencere).getByRole('button', { name: 'Tür alanını forma geri al' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    expect(within(belge).getByText('Satış teklifi')).toBeTruthy();

    fireEvent.change(within(pencere).getByLabelText('Adres etiketi'), { target: { value: 'Teslim adresi' } });
    fireEvent.change(within(pencere).getByLabelText(/^Konu değeri/), { target: { value: 'ORN özel konu' } });
    expect(within(belge).getByText('Teslim adresi')).toBeTruthy();
    expect(within(belge).getByText('ORN özel konu')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Toplam (KDV hariç) alanını gizle' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Genel toplam alanını gizle' }));
    expect(within(pencere).getByText(/Gizli: Genel toplam\. Form müşteriye bu hâliyle gider\./)).toBeTruthy();

    fireEvent.click(within(pencere).getByRole('button', { name: 'Bu teklif için kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect((istekler.find((i) => i.yontem === 'POST')?.govde as { metin: { icerik: TeklifFormuIcerigi } }).metin.icerik.alanlar).toEqual({
      musteriVergiDairesi: { durum: 'gizli' }, musteriAdres: { etiket: 'Teslim adresi' }, teklifKonu: { deger: 'ORN özel konu' },
      toplamKdvHaric: { durum: 'gizli' }, toplamGenel: { durum: 'gizli' },
    });
  });

  it('kaydedilmemiş değişiklikle Kapat (çarpı da) onay ister; onaylanınca kapanır', async () => {
    sunucuKur();
    const kapat = vi.fn();
    sar(<TeklifFormuPenceresi acik kapat={kapat} teklif={TEKLIF} surum={SURUM} />);
    const pencere = await screen.findByRole('dialog', { name: /Teklif formu/ });
    await within(pencere).findByRole('article', { name: 'Teklif TK-2026-0021' });
    fireEvent.click(within(pencere).getAllByRole('button', { name: 'Kapat' })[0]!);
    expect(kapat).toHaveBeenCalledTimes(1);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ünvan alanını gizle' }));
    fireEvent.click(within(pencere).getAllByRole('button', { name: 'Kapat' })[0]!);
    const onay = await screen.findByRole('dialog', { name: 'Kaydedilmemiş değişiklik var' });
    expect(kapat).toHaveBeenCalledTimes(1);
    fireEvent.click(within(onay).getByRole('button', { name: 'Kaydetmeden kapat' }));
    expect(kapat).toHaveBeenCalledTimes(2);
  });
});

describe('3794 şablonda alan paneli', () => {
  it('şablonda değer kutusu yoktur; etiket ve görünüm şablonla kaydedilir', async () => {
    const istekler = sunucuKur();
    sar(<TeklifFormuAyari />);
    const etiket = await screen.findByLabelText('Konu etiketi');
    expect(screen.queryByLabelText(/^Konu değeri/)).toBeNull();
    fireEvent.change(etiket, { target: { value: 'Proje' } });
    fireEvent.click(screen.getByRole('button', { name: 'Para birimi alanını gizle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Şablonu kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect((istekler.find((i) => i.yontem === 'POST')?.govde as { icerik: TeklifFormuIcerigi }).icerik.alanlar).toEqual({
      teklifKonu: { etiket: 'Proje' }, teklifPara: { durum: 'gizli' },
    });
  });
});
