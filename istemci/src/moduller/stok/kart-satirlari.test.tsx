import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { RefakatKartSatiri, RefakatPartisi, SepetCevabi, SepetSatiri, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IsEmriniAc, KartSatirlari } from './KartSatirlari.tsx';
import { DepoSepeti } from './Sepet.tsx';
import { OkutmaSonucu } from './OkutmaSonucu.tsx';
import { teslimGovdesi } from './okut-akisi.ts';
import { cihazYazicisiKaydet } from '../etiket-merkezi/disari.ts';
import { json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const KART: RefakatPartisi = {
  id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
  partiId: 40, lotNo: 'LT-000040', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '10', adet: null, durum: 'acik', surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00', lotaBaglanmaZamani: null,
  ust: null, birlestigi: null, birlesmeZamani: null,
};
const satir = (x: Partial<RefakatKartSatiri>): RefakatKartSatiri => ({
  konumId: 31, konumKod: 'IST-T1', konumAd: 'Torna 1', konumTur: 'istasyon', istasyonId: 3, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
  partiId: 40, partiEtiketi: 'LT-000040', statuId: null, kaliteDurumu: 'serbest', miktar: '6.000', yolda: '1.000', alinabilir: '5.000', ...x,
});
const KUTU = { gelenler: [], gonderdiklerim: [], isteklerim: [], istasyonlar: [{ id: 4, kod: 'F2', ad: 'Freze 2' }], hedefIstasyonlar: [], depoKonumlari: [], araAlanlar: [], buradakiIstasyonId: 4, harita: null, zemin: null } satisfies TeslimKutusuCevabi;

function emirOkut(kap: HTMLElement, kod: string) {
  const alan = within(kap).getByRole('textbox', { name: 'Kod' });
  fireEvent.change(alan, { target: { value: kod } });
  fireEvent.submit(alan.closest('form')!);
}
function Adres() { const l = useLocation(); return <p>Adres {l.pathname}{l.search}</p>; }
function ciz(icerik: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/']}>
      <Routes><Route path="/" element={icerik} /><Route path="/uretim-terminali" element={<Adres />} /></Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

describe('Kart satırları (kart #155, Soru 128, 133)', () => {
  it('satır seçilince kendi istasyonuna Serbest Al gider; yoldaki görünür; serbest olmayan satır seçilmez', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, KUTU),
      'POST /stok/refakat-partileri/12/serbest-al': () => json(200, {}),
    });
    ciz(<KartSatirlari r={KART} satirlar={[satir({}), satir({ konumId: 32, konumKod: 'IST-T2', konumAd: 'Torna 2', istasyonId: 5, kaliteDurumu: 'karar_bekliyor', alinabilir: '0' })]} />);
    const liste = screen.getByRole('list', { name: 'Kartın satırları listesi' });
    const [t1, t2] = within(liste).getAllByRole('listitem');
    expect(t1!.textContent).toMatch(/yolda 1/);
    expect(within(t2!).queryByRole('button', { name: 'Seç' })).toBeNull();
    fireEvent.click(within(t1!).getByRole('button', { name: 'Seç' }));
    const grup = screen.getByRole('group', { name: 'Seçilen satır' });
    fireEvent.change(within(grup).getByLabelText('Miktar'), { target: { value: '2' } });
    fireEvent.click(await within(grup).findByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ konumId: 31, partiId: 40, statuId: null, miktar: '2', istasyonId: 4 }));
  });

  it('Sepete ekle satırı kartla ekler; satır kendi istasyonumdaysa Teslim al yok', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/teslim-kutusu': () => json(200, { ...KUTU, buradakiIstasyonId: 3, istasyonlar: [{ id: 3, kod: 'T1', ad: 'Torna 1' }] }),
      'POST /stok/sepet/satir-ekle': () => json(200, { satirlar: [] } satisfies SepetCevabi),
    });
    ciz(<KartSatirlari r={KART} satirlar={[satir({})]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Seç' }));
    const grup = screen.getByRole('group', { name: 'Seçilen satır' });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/teslim-kutusu')).toBe(true));
    expect(within(grup).queryByRole('button', { name: 'Teslim al' })).toBeNull();
    fireEvent.click(within(grup).getByRole('button', { name: 'Sepete ekle' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ malzemeId: 901, miktar: '5', kaynakKonumId: 31, partiId: 40, refakatPartisiId: 12 }));
  });

  it('İş emrini aç Üretim Terminali\'ni emir ve kartla açar; iptal kartta yok', () => {
    sunucuKur(OPERATOR, {});
    ciz(<IsEmriniAc r={KART} />);
    fireEvent.click(screen.getByRole('button', { name: 'İş emrini aç' }));
    expect(screen.getByText('Adres /uretim-terminali?emir=1&kart=12')).toBeTruthy();
    cleanup();
    ciz(<IsEmriniAc r={{ ...KART, durum: 'iptal' }} />);
    expect(screen.queryByRole('button', { name: 'İş emrini aç' })).toBeNull();
  });

  it('Bıraktım gövdesi birak taşır; Teslim et taşımaz', () => {
    const kaynak = { malzemeId: 901, malzemeAd: 'Deneme sac', birim: 'kg', yer: { konumId: 31, kod: 'IST-T1', ad: 'Torna 1', tur: 'istasyon' as const, istasyonId: 3 }, partiId: 40, partiEtiketi: null, statuId: null, miktar: '5' };
    const hedef = { konumId: 7, kod: 'KABUL', ad: 'Mal kabul', tur: 'kabul' as const, istasyonId: null };
    expect(teslimGovdesi(kaynak, hedef, '2', 'k-1', true)).toMatchObject({ birak: true, hedef: { konumId: 7 } });
    expect(teslimGovdesi(kaynak, hedef, '2', 'k-1')).not.toHaveProperty('birak');
  });
});

describe('Sepetim (Soru 133)', () => {
  const SATIR: SepetSatiri = {
    id: 3, malzemeId: 901, malzemeAd: 'Deneme sac', malzemeKod: 'HM-1', kaynakKonumId: 31, kaynakKonumKod: 'IST-T1', partiId: 40, partiEtiketi: 'LT-000040', miktar: '2', mevcut: '5',
    eklenme: '2026-10-23T09:00:00+03:00', refakat: { id: 12, etiket: 'UE-000001-P1' }, hedef: { konumId: 50, kod: 'IST-F2', ad: 'Freze 2', istasyonId: 4 },
  };
  it('operatör sepetini görür, Teslim et hedefli satırları gönderir; depo işleri (taşı, karta geç) yok', async () => {
    const istekler = sunucuKur(OPERATOR, {
      'GET /stok/sepet': () => json(200, { satirlar: [SATIR, { ...SATIR, id: 4, refakat: null, hedef: null }] }),
      'POST /stok/sepet/gonder': () => json(200, { teslimler: [{ satirId: 3, teslimNo: 'TS-000009' }], kalanlar: [] }),
    });
    ciz(<DepoSepeti />);
    const liste = await screen.findByRole('list', { name: 'Sepetim' });
    expect(within(liste).getAllByRole('listitem')[0]!.textContent).toMatch(/kart UE-000001-P1.*Hedef: Freze 2/);
    expect(screen.queryByRole('button', { name: 'Hepsini taşı' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refakat kartına dönüştür' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Teslim et' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ satirlar: [{ satirId: 3 }] }));
  });

  it('3337-2 a: depoda kartsız lotlu satır "Kartsız" görünür ve "Refakat kartına dönüştür" düğmesi taşır; kartlı satırda düğme yok', async () => {
    sunucuKur({ ...OPERATOR, islemler: ['stok.istek', 'stok.transfer'] }, {
      'GET /stok/sepet': () => json(200, { satirlar: [SATIR, { ...SATIR, id: 4, refakat: null }] }),
    });
    ciz(<DepoSepeti />);
    const [kartli, kartsiz] = within(await screen.findByRole('list', { name: 'Sepetim' })).getAllByRole('listitem');
    expect(within(kartli!).queryByRole('button', { name: 'Refakat kartına dönüştür' })).toBeNull();
    expect(within(kartli!).queryByText('Kartsız')).toBeNull();
    expect(within(kartsiz!).getByText('Kartsız')).toBeTruthy();
    expect(within(kartsiz!).getByText(/Kartsız satır emre teslim edilemez. Önce karta dönüştürün./)).toBeTruthy();
    fireEvent.click(within(kartsiz!).getByRole('button', { name: 'Refakat kartına dönüştür' }));
    expect(await screen.findByRole('button', { name: 'Dönüştür ve bas' })).toBeTruthy();
  });

  it('3337-2 a: "Dönüştür ve bas" emir ve sepet satırıyla kartı açar, varsayılan yazıcıya bir kez basar ve pencereyi kapatır', async () => {
    cihazYazicisiKaydet('refakat', { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'refakat-100x150', sablonAd: 'Refakat kartı 100x150' });
    const istekler = sunucuKur({ ...OPERATOR, islemler: ['stok.istek', 'stok.transfer', 'etiket-merkezi.bas'] }, {
      'GET /stok/sepet': () => json(200, { satirlar: [{ ...SATIR, id: 4, refakat: null }] }),
      'GET /uretim-emirleri': () => json(200, { emirler: [{ id: 7, emirNo: 'UE-7', parcaNo: 'P-1', parcaAd: 'Deneme', durum: 'planli', adet: 10 }] }),
      'POST /stok/refakat-partileri/ac': () => json(200, { refakat: { ...KART, id: 21 } }),
      'POST /etiket-merkezi/sablonlar/refakat-100x150/bas': () => json(200, { baskiId: 1, sonuc: 'gonderildi', ileti: null }),
    });
    ciz(<DepoSepeti />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refakat kartına dönüştür' }));
    const pencere = await screen.findByRole('dialog', { name: 'Refakat kartına dönüştür' });
    await within(pencere).findByRole('option', { name: /UE-7/ });
    fireEvent.change(within(pencere).getByRole('combobox', { name: /Üretim emri/ }), { target: { value: '7' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Dönüştür ve bas' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/refakat-partileri/ac')?.govde).toEqual({ uretimEmriId: 7, sepetSatirId: 4 }));
    await waitFor(() => expect(istekler.filter((i) => i.yol.startsWith('/etiket-merkezi/'))).toHaveLength(1));
    expect(istekler.find((i) => i.yol.startsWith('/etiket-merkezi/'))?.govde).toMatchObject({ kayit: { tur: 'refakat-partisi', idler: [21] } });
    // Pencere kapanır ve kart görünümü de açılmaz: depocu sepete döner, kart yazıcıdadır.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('3337-3 a: dönüştürürken kart adedi yazılabilir; boşsa gönderilmez, sunucu önerir', async () => {
    const istekler = sunucuKur({ ...OPERATOR, islemler: ['stok.istek', 'stok.transfer'] }, {
      'GET /stok/sepet': () => json(200, { satirlar: [{ ...SATIR, id: 4, refakat: null }] }),
      'GET /uretim-emirleri': () => json(200, { emirler: [{ id: 7, emirNo: 'UE-7', parcaNo: 'P-1', parcaAd: 'Deneme', durum: 'planli', adet: 10 }] }),
      'POST /stok/refakat-partileri/ac': () => json(409, { kod: 'CAKISMA', mesaj: 'Deneme' }),
    });
    ciz(<DepoSepeti />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refakat kartına dönüştür' }));
    const pencere = await screen.findByRole('dialog', { name: 'Refakat kartına dönüştür' });
    await within(pencere).findByRole('option', { name: /UE-7/ });
    fireEvent.change(within(pencere).getByRole('combobox', { name: /Üretim emri/ }), { target: { value: '7' } });
    expect(within(pencere).queryByRole('textbox', { name: /Karttaki parça adedi/ })).toBeNull();
    expect(within(pencere).getByText(/Karta yazılacak: otomatik/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Adedi elle değiştir' }));
    const adet = within(pencere).getByRole('textbox', { name: /Karttaki parça adedi/ });
    fireEvent.change(adet, { target: { value: '0' } });
    expect(within(pencere).getByRole('button', { name: 'Dönüştür ve bas' })).toHaveProperty('disabled', true);
    fireEvent.change(adet, { target: { value: '4' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Dönüştür ve bas' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/refakat-partileri/ac')?.govde).toEqual({ uretimEmriId: 7, sepetSatirId: 4, adet: 4 }));
  });

  it('3620-2: adet alanı kapalıyken gövdeye adet girmez; elle açılıp geri kapatılırsa yazılan adet atılır', async () => {
    const istekler = sunucuKur({ ...OPERATOR, islemler: ['stok.istek', 'stok.transfer'] }, {
      'GET /stok/sepet': () => json(200, { satirlar: [{ ...SATIR, id: 4, refakat: null }] }),
      'GET /uretim-emirleri': () => json(200, { emirler: [{ id: 7, emirNo: 'UE-7', parcaNo: 'P-1', parcaAd: 'Deneme', durum: 'planli', adet: 10 }] }),
      'POST /stok/refakat-partileri/ac': () => json(409, { kod: 'CAKISMA', mesaj: 'Deneme' }),
    });
    ciz(<DepoSepeti />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refakat kartına dönüştür' }));
    const pencere = await screen.findByRole('dialog', { name: 'Refakat kartına dönüştür' });
    await within(pencere).findByRole('option', { name: /UE-7/ });
    fireEvent.change(within(pencere).getByRole('combobox', { name: /Üretim emri/ }), { target: { value: '7' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Adedi elle değiştir' }));
    fireEvent.change(within(pencere).getByRole('textbox', { name: /Karttaki parça adedi/ }), { target: { value: '4' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Otomatiğe dön' }));
    expect(within(pencere).queryByRole('textbox', { name: /Karttaki parça adedi/ })).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Dönüştür ve bas' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/refakat-partileri/ac')?.govde).toEqual({ uretimEmriId: 7, sepetSatirId: 4 }));
  });

  it('3620-2: emir etiketi okutulunca emir seçilir (kimlik ve numara biçimi); tanınmayan kod uyarır, liste yedek kalır', async () => {
    sunucuKur({ ...OPERATOR, islemler: ['stok.istek', 'stok.transfer'] }, {
      'GET /stok/sepet': () => json(200, { satirlar: [{ ...SATIR, id: 4, refakat: null }] }),
      'GET /uretim-emirleri': () => json(200, { emirler: [
        { id: 7, emirNo: 'UE-7', parcaNo: 'P-1', parcaAd: 'Deneme', durum: 'planli', adet: 10 },
        { id: 8, emirNo: 'UE-8', parcaNo: 'P-2', parcaAd: 'Öteki', durum: 'planli', adet: 5 },
        { id: 9, emirNo: 'UE-9', parcaNo: 'P-3', parcaAd: 'Kapalı', durum: 'tamamlandi', adet: 5 },
      ] }),
    });
    ciz(<DepoSepeti />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refakat kartına dönüştür' }));
    const pencere = await screen.findByRole('dialog', { name: 'Refakat kartına dönüştür' });
    await within(pencere).findByRole('option', { name: /UE-7/ });
    const emir = within(pencere).getByRole('combobox', { name: /Üretim emri/ });
    emirOkut(pencere, 'UE:8');
    await waitFor(() => expect((emir as HTMLSelectElement).value).toBe('8'));
    expect(within(pencere).getByText('Emir seçildi: UE-8')).toBeTruthy();
    emirOkut(pencere, 'UE-7');
    await waitFor(() => expect((emir as HTMLSelectElement).value).toBe('7'));
    expect(within(pencere).getByText('Emir seçildi: UE-7')).toBeTruthy();
    fireEvent.change(emir, { target: { value: '8' } });
    expect(within(pencere).queryByText(/Emir seçildi/)).toBeNull();
    fireEvent.change(emir, { target: { value: '' } });
    expect(within(pencere).queryByText(/Emir seçildi/)).toBeNull();
    emirOkut(pencere, 'UE:9');
    expect(await within(pencere).findByText(/açık emirler arasında yok/)).toBeTruthy();
    expect((emir as HTMLSelectElement).value).toBe('');
    emirOkut(pencere, 'LOT:5');
    expect(await within(pencere).findByText(/üretim emri etiketi değil/)).toBeTruthy();
    // ABD klavyesinin Türkçe düzende bozduğu ayraç (":" yerine "Ş") ortak okuyucu düzeltmesiyle çözülür.
    emirOkut(pencere, 'UEŞ8');
    await waitFor(() => expect((emir as HTMLSelectElement).value).toBe('8'));
  });

  describe('3620-2: sepette çok lot', () => {
    const KARTSIZ_A = { ...SATIR, id: 4, refakat: null, partiId: 41, partiEtiketi: 'LT-A' };
    const KARTSIZ_B = { ...SATIR, id: 5, refakat: null, partiId: 42, partiEtiketi: 'LT-B' };
    const ACIK_YOK = { kartlar: [], sinirda: false };
    const ACIK_KART = (partiId: number, etiket: string) => ({ refakat: { ...KART, id: 60 + partiId, uretimEmriId: 7, partiId, etiket } });
    const EMIRLER = { emirler: [{ id: 7, emirNo: 'UE-7', parcaNo: 'P-1', parcaAd: 'Deneme', durum: 'planli', adet: 10 }] };
    const DEPO: Kullanici = { ...OPERATOR, islemler: ['stok.istek', 'stok.transfer', 'etiket-merkezi.bas'] };

    it('tek dokunuş her kartsız lota bir kart açar, açık kartı olan lot atlanır, kartlar tek baskıya gider', async () => {
      cihazYazicisiKaydet('refakat', { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'refakat-100x150', sablonAd: 'Refakat kartı 100x150' });
      let sayac = 30;
      const istekler = sunucuKur(DEPO, {
        'GET /stok/sepet': () => json(200, { satirlar: [SATIR, KARTSIZ_A, KARTSIZ_B] }),
        'GET /uretim-emirleri': () => json(200, EMIRLER),
        'GET /stok/refakat-kartlari': () => json(200, ACIK_YOK),
        'POST /stok/refakat-partileri/ac': () => json(200, { refakat: { ...KART, id: sayac++ } }),
        'POST /etiket-merkezi/sablonlar/refakat-100x150/bas': () => json(200, { baskiId: 1, sonuc: 'gonderildi', ileti: null }),
      });
      ciz(<DepoSepeti />);
      const dugme = await screen.findByRole('button', { name: '2 lot için kart aç ve bas' });
      expect(screen.getByText(/Önce emri okutun ya da listeden seçin/)).toBeTruthy();
      expect(screen.getByText(/Kartı olan 1 lot atlanır/)).toBeTruthy();
      expect(dugme).toHaveProperty('disabled', true);
      await screen.findByRole('option', { name: /UE-7/ });
      emirOkut(document.body, 'UE:7');
      await waitFor(() => expect(dugme).toHaveProperty('disabled', false));
      fireEvent.click(dugme);
      await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/refakat-partileri/ac').map((i) => i.govde)).toEqual([{ uretimEmriId: 7, sepetSatirId: 4 }, { uretimEmriId: 7, sepetSatirId: 5 }]));
      await waitFor(() => expect(istekler.filter((i) => i.yol.startsWith('/etiket-merkezi/'))).toHaveLength(1));
      expect(istekler.find((i) => i.yol.startsWith('/etiket-merkezi/'))?.govde).toMatchObject({ kayit: { tur: 'refakat-partisi', idler: [30, 31] } });
    });

    it('bir lot reddedilirse öteki yine açılır; hata sepet yenilense de görünür kalır, yalnız açılan basılır', async () => {
      cihazYazicisiKaydet('refakat', { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'refakat-100x150', sablonAd: 'Refakat kartı 100x150' });
      let acildi = false;
      const istekler = sunucuKur(DEPO, {
        'GET /stok/sepet': () => json(200, { satirlar: [KARTSIZ_A, acildi ? { ...KARTSIZ_B, refakat: { id: 41, etiket: 'UE-7-P2' } } : KARTSIZ_B] }),
        'GET /uretim-emirleri': () => json(200, EMIRLER),
        'GET /stok/refakat-kartlari': () => json(200, ACIK_YOK),
        'POST /stok/refakat-partileri/ac': (g) => {
          if ((g as { sepetSatirId: number }).sepetSatirId === 4) return json(409, { kod: 'CAKISMA', mesaj: 'Emrin kartsız kalanı yetmiyor.' });
          acildi = true;
          return json(200, { refakat: { ...KART, id: 41 } });
        },
        'POST /etiket-merkezi/sablonlar/refakat-100x150/bas': () => json(200, { baskiId: 1, sonuc: 'gonderildi', ileti: null }),
      });
      ciz(<DepoSepeti />);
      await screen.findByRole('option', { name: /UE-7/ });
      fireEvent.change(screen.getByRole('combobox', { name: /Üretim emri/ }), { target: { value: '7' } });
      fireEvent.click(screen.getByRole('button', { name: '2 lot için kart aç ve bas' }));
      const uyari = await screen.findByRole('alert', { name: 'Açılamayan kartlar' });
      expect(within(uyari).getAllByRole('listitem')).toHaveLength(1);
      expect(uyari.textContent).toMatch(/LT-A.*Emrin kartsız kalanı yetmiyor/);
      expect(istekler.filter((i) => i.yol === '/stok/refakat-partileri/ac')).toHaveLength(2);
      await waitFor(() => expect(istekler.find((i) => i.yol.startsWith('/etiket-merkezi/'))?.govde).toMatchObject({ kayit: { idler: [41] } }));
      // Sepet yenilendi: B kartlı, geriye tek kartsız lot kaldı (toplu panelin eşiği altında); hata yine de ekranda.
      await waitFor(() => expect(screen.getByText(/kart UE-7-P2/)).toBeTruthy());
      expect(screen.getByRole('alert', { name: 'Açılamayan kartlar' }).textContent).toMatch(/LT-A.*Emrin kartsız kalanı yetmiyor/);
    });

    it('emirde zaten açık kartı olan lot için kart açılmaz ve basılmaz; yalnız yeni kart basılır', async () => {
      cihazYazicisiKaydet('refakat', { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'refakat-100x150', sablonAd: 'Refakat kartı 100x150' });
      const istekler = sunucuKur(DEPO, {
        'GET /stok/sepet': () => json(200, { satirlar: [KARTSIZ_A, KARTSIZ_B] }),
        'GET /uretim-emirleri': () => json(200, EMIRLER),
        'GET /stok/refakat-kartlari': () => json(200, { kartlar: [ACIK_KART(41, 'UE-7-P1')], sinirda: false }),
        'POST /stok/refakat-partileri/ac': () => json(200, { refakat: { ...KART, id: 77 } }),
        'POST /etiket-merkezi/sablonlar/refakat-100x150/bas': () => json(200, { baskiId: 1, sonuc: 'gonderildi', ileti: null }),
      });
      ciz(<DepoSepeti />);
      await screen.findByRole('option', { name: /UE-7/ });
      fireEvent.change(screen.getByRole('combobox', { name: /Üretim emri/ }), { target: { value: '7' } });
      fireEvent.click(screen.getByRole('button', { name: '2 lot için kart aç ve bas' }));
      const atlanan = await screen.findByRole('list', { name: 'Atlanan lotlar' });
      expect(atlanan.textContent).toMatch(/LT-A.*zaten açık kartı var \(UE-7-P1\).*basılmadı/);
      await waitFor(() => expect(istekler.find((i) => i.yol.startsWith('/etiket-merkezi/'))?.govde).toMatchObject({ kayit: { idler: [77] } }));
      expect(istekler.filter((i) => i.yol === '/stok/refakat-partileri/ac').map((i) => i.govde)).toEqual([{ uretimEmriId: 7, sepetSatirId: 5 }]);
      expect(istekler.filter((i) => i.yol.startsWith('/etiket-merkezi/'))).toHaveLength(1);
    });

    it('açık kart listesi okunamaz ya da sınıra dayanırsa kart açılır ama hiçbiri yazıcıya gönderilmez', async () => {
      cihazYazicisiKaydet('refakat', { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'refakat-100x150', sablonAd: 'Refakat kartı 100x150' });
      const istekler = sunucuKur(DEPO, {
        'GET /stok/sepet': () => json(200, { satirlar: [KARTSIZ_A, KARTSIZ_B] }),
        'GET /uretim-emirleri': () => json(200, EMIRLER),
        'GET /stok/refakat-kartlari': () => json(200, { kartlar: [], sinirda: true }),
        'POST /stok/refakat-partileri/ac': () => json(200, { refakat: { ...KART, id: 77 } }),
        'POST /etiket-merkezi/sablonlar/refakat-100x150/bas': () => json(200, { baskiId: 1, sonuc: 'gonderildi', ileti: null }),
      });
      ciz(<DepoSepeti />);
      await screen.findByRole('option', { name: /UE-7/ });
      fireEvent.change(screen.getByRole('combobox', { name: /Üretim emri/ }), { target: { value: '7' } });
      fireEvent.click(screen.getByRole('button', { name: '2 lot için kart aç ve bas' }));
      await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/refakat-partileri/ac')).toHaveLength(2));
      expect(await screen.findByText(/ayırt edilemediği için yazıcıya gönderilmedi/)).toBeTruthy();
      expect(istekler.some((i) => i.yol.startsWith('/etiket-merkezi/'))).toBe(false);
    });

    it('"Sadece seçili lot" yalnız işaretlenen lota kart açar; seçim yokken düğme kapalı', async () => {
      const istekler = sunucuKur(DEPO, {
        'GET /stok/sepet': () => json(200, { satirlar: [KARTSIZ_A, KARTSIZ_B] }),
        'GET /uretim-emirleri': () => json(200, EMIRLER),
        'GET /stok/refakat-kartlari': () => json(200, ACIK_YOK),
        'POST /stok/refakat-partileri/ac': () => json(200, { refakat: { ...KART, id: 51 } }),
      });
      ciz(<DepoSepeti />);
      await screen.findByRole('option', { name: /UE-7/ });
      fireEvent.change(screen.getByRole('combobox', { name: /Üretim emri/ }), { target: { value: '7' } });
      const secili = screen.getByRole('button', { name: /^Sadece seçili lot/ });
      expect(secili).toHaveProperty('disabled', true);
      expect(screen.getByText(/önce satırlarda en az bir lotu işaretleyin/)).toBeTruthy();
      const [, ikinci] = within(screen.getByRole('list', { name: 'Sepetim' })).getAllByRole('listitem');
      fireEvent.click(within(ikinci!).getByRole('checkbox', { name: 'Seç' }));
      await waitFor(() => expect(secili).toHaveProperty('disabled', false));
      expect(secili.textContent).toBe('Sadece seçili lot (1)');
      fireEvent.click(secili);
      await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/refakat-partileri/ac').map((i) => i.govde)).toEqual([{ uretimEmriId: 7, sepetSatirId: 5 }]));
    });

    it('kısmi hatadan sonra tek kartsız lot kalınca seçim kutusu ve "Sadece seçili lot" çalışır', async () => {
      let acildi = false;
      const istekler = sunucuKur(DEPO, {
        'GET /stok/sepet': () => json(200, { satirlar: [KARTSIZ_A, acildi ? { ...KARTSIZ_B, refakat: { id: 41, etiket: 'UE-7-P2' } } : KARTSIZ_B] }),
        'GET /uretim-emirleri': () => json(200, EMIRLER),
        'GET /stok/refakat-kartlari': () => json(200, ACIK_YOK),
        'POST /stok/refakat-partileri/ac': (g) => {
          if ((g as { sepetSatirId: number }).sepetSatirId === 4 && !acildi) { return json(409, { kod: 'CAKISMA', mesaj: 'Emrin kartsız kalanı yetmiyor.' }); }
          acildi = true;
          return json(200, { refakat: { ...KART, id: 41 } });
        },
      });
      ciz(<DepoSepeti />);
      await screen.findByRole('option', { name: /UE-7/ });
      fireEvent.change(screen.getByRole('combobox', { name: /Üretim emri/ }), { target: { value: '7' } });
      fireEvent.click(screen.getByRole('button', { name: '2 lot için kart aç ve bas' }));
      await screen.findByRole('alert', { name: 'Açılamayan kartlar' });
      await waitFor(() => expect(screen.getByText(/kart UE-7-P2/)).toBeTruthy());
      const kutu = await screen.findByRole('checkbox', { name: 'Seç' });
      const secili = screen.getByRole('button', { name: /^Sadece seçili lot/ });
      expect(secili).toHaveProperty('disabled', true);
      fireEvent.click(kutu);
      await waitFor(() => expect(secili).toHaveProperty('disabled', false));
      fireEvent.click(secili);
      await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/refakat-partileri/ac').map((i) => i.govde).at(-1)).toEqual({ uretimEmriId: 7, sepetSatirId: 4 }));
    });

    it('tek kartsız lotta toplu düğme yok; depo yetkisi yoksa panel yok', async () => {
      sunucuKur(DEPO, { 'GET /stok/sepet': () => json(200, { satirlar: [KARTSIZ_A, SATIR] }) });
      ciz(<DepoSepeti />);
      await screen.findByRole('list', { name: 'Sepetim' });
      expect(screen.queryByRole('button', { name: /lot için kart aç ve bas/ })).toBeNull();
      cleanup();
      sunucuKur(OPERATOR, { 'GET /stok/sepet': () => json(200, { satirlar: [KARTSIZ_A, KARTSIZ_B] }) });
      ciz(<DepoSepeti />);
      await screen.findByRole('list', { name: 'Sepetim' });
      expect(screen.queryByRole('button', { name: /lot için kart aç ve bas/ })).toBeNull();
    });
  });

  it('Lot izi okutulan kartın lotunun izini açar; stok okuması olmayan görmez', async () => {
    const cevap = { tur: 'malzeme' as const, malzeme: { id: 901, kod: 'HM-1', ad: 'Deneme sac', birim: 'kg' }, parti: { id: 40, etiket: 'LT-000040' }, yerler: [], refakat: KART, kartSatirlari: [] };
    const istekler = sunucuKur({ ...OPERATOR, islemler: ['stok.istek', 'sayfa.stok'] }, {
      'GET /stok/kod-coz': () => json(200, { tur: 'bilinmiyor', kod: 'RP:12' }),
      'GET /stok/partiler/40/iz': () => json(200, { parti: null }),
    });
    ciz(<OkutmaSonucu okunan={{ kod: 'RP:12', cevap }} sec={() => {}} kapat={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Lot izi' }));
    await waitFor(() => expect(istekler.some((x) => x.yol === '/stok/partiler/40/iz')).toBe(true));
    cleanup();
    sunucuKur(OPERATOR, {});
    ciz(<OkutmaSonucu okunan={{ kod: 'RP:12', cevap }} sec={() => {}} kapat={() => {}} />);
    await screen.findByText('Deneme sac');
    expect(screen.queryByRole('button', { name: 'Lot izi' })).toBeNull();
  });
});
