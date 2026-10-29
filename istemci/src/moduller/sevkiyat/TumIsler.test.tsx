import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { FirmaAramaCevabi, TumIsSatiri, TumIslerCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { bugun } from './bicim.ts';
import { GIDIS_CIKMADI } from './tum-isler.ts';
import { TumIsler } from './TumIsler.tsx';

const BUGUN = bugun();
const SEVKIYATCI: Kullanici = { id: 3, ad: 'Deneme Sevkiyatçı', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'sevkiyat.is-yaz', 'sevkiyat.onayla'] };
const PLANCI: Kullanici = { id: 5, ad: 'Deneme Planlayıcı', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'uretim-emirleri.fason'] };
const DEPOCU: Kullanici = { id: 6, ad: 'Deneme Depocu', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'stok.cikis', 'stok.giris'] };
const OKUYUCU: Kullanici = { id: 4, ad: 'Deneme Okuyucu', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku'] };

const satir = (s: Partial<TumIsSatiri> & Pick<TumIsSatiri, 'anahtar' | 'kaynak' | 'yon' | 'asama'>): TumIsSatiri => ({
  kalemId: null, hazirTarihi: null, istenenTarih: null, uretimEmriId: null, emirNo: null, isEmriId: null, opNo: null, adim: null, ilerleme: null,
  siparisNo: null, malzemeNo: 5, malzemeAd: 'Deneme mamul', adet: '10.0000', firmaId: 9, firmaAd: 'Örnek Firma B', noktaId: 3, tasima: null, elleTuru: null,
  aciklama: null, is: null, depo: null, erken: null, sonYazan: null, bagliAnahtar: null, ...s,
});
const is = (id: number, tetiklendi: string | null = null) => ({ id, tarih: BUGUN, durum: 'planlandi' as const, tetiklendi });
const SATIRLAR = {
  satirlar: [
    satir({ anahtar: 'urun:11', kaynak: 'urun', yon: 'gidis', asama: 'hazir', uretimEmriId: 11, emirNo: 'DENEME-UE-11', istenenTarih: BUGUN }),
    satir({ anahtar: 'fason:70', kaynak: 'fason', yon: 'gidis', asama: 'hazir-degil', uretimEmriId: 12, emirNo: 'DENEME-UE-12', isEmriId: 70, opNo: 40,
      hazirTarihi: BUGUN, ilerleme: 'OP 30 bitti' }),
    satir({ anahtar: 'kalem:41', kalemId: 41, kaynak: 'urun', yon: 'gidis', asama: 'planlandi', emirNo: 'DENEME-UE-13', tasima: 'biz', is: is(6) }),
    satir({ anahtar: 'kalem:43', kalemId: 43, kaynak: 'fason-donus', yon: 'gelis', asama: 'planlandi', emirNo: 'DENEME-UE-14', tasima: 'biz', is: is(7),
      ilerleme: GIDIS_CIKMADI }),
    satir({ anahtar: 'kalem:42', kalemId: 42, kaynak: 'fason', yon: 'gidis', asama: 'depoda', emirNo: 'DENEME-UE-15', tasima: 'biz', is: is(8, `${BUGUN}T09:00:00+03:00`) }),
  ],
} satisfies TumIslerCevabi;

const FIRMA = { id: 9, ad: 'Örnek Firma B', kod: 'DENEME-F9', tur: 'musteri', fason: false, adres: null, ilce: null, il: null, noktaId: 3 } satisfies FirmaAramaCevabi['firmalar'][number];

interface Istek { yontem: string; yol: string; govde: unknown }
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const istek = { yontem: ayar?.method ?? 'GET', yol: adres.replace('/api', ''), govde: ayar?.body ? JSON.parse(String(ayar.body)) : undefined };
    istekler.push(istek);
    if (istek.yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (istek.yol.startsWith('/sevkiyat/tum-isler?')) return json(200, SATIRLAR);
    if (istek.yol.startsWith('/sevkiyat/firmalar?')) return json(200, { firmalar: [FIRMA] } satisfies FirmaAramaCevabi);
    if (istek.yol === '/sevkiyat/tum-isler/elle') return json(200, { kalemIdleri: [60, 61] });
    if (istek.yol === '/sevkiyat/tum-isler/serbest-birak') return json(200, { kalemIdleri: [50] });
    if (istek.yol === '/sevkiyat/isler/6/tetikle') return json(200, SATIRLAR);
    if (istek.yol === '/stok/depo-sevk/42/cikis') return json(200, { kalemId: 42, hareketIdler: [9], uyarilar: [] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return istekler;
}
function ac(adres = '/sevkiyat/tum-isler') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}><TumIsler /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST');
const satirOf = (tablo: HTMLElement, metin: string) => within(tablo).getByText(metin).closest('tr')!;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Tüm işler', () => {
  it('sevkiyat hazır kalemi serbest bırakır; hazır olmayanı gerekçeyle erken çıkarır', async () => {
    const istekler = sunucuKur(SEVKIYATCI);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Karar bekleyen kalemler' });
    fireEvent.click(within(satirOf(tablo, 'DENEME-UE-11')).getByRole('button', { name: 'Serbest bırak' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/sevkiyat/tum-isler/serbest-birak', govde: { anahtarlar: ['urun:11'], tasima: 'biz', erkenGerekce: null } });

    fireEvent.click(within(satirOf(tablo, 'DENEME-UE-12')).getByRole('button', { name: 'Diğer seçenekler' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'kısa' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Şimdi sevke çıkar' }));
    expect(await within(pencere).findByText('Gerekçe en az 10 karakter olmalı.')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(1);
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Son kontrol bitti, emir kapatılmadı' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Şimdi sevke çıkar' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(2));
    expect(yazmalar(istekler)[1]!.govde).toEqual({ anahtarlar: ['fason:70'], tasima: 'biz', erkenGerekce: 'Son kontrol bitti, emir kapatılmadı' });
  });

  it('genel aramadan gelen emir no: görünüm, arama kutusu ve bütün tarihler ayarlı açılır (932 a)', async () => {
    const istekler = sunucuKur(OKUYUCU);
    ac('/sevkiyat/tum-isler?ara=DENEME-UE-13&gorunum=sevkiyat');
    const tablo = await screen.findByRole('table', { name: 'Sevkiyattaki işler' });
    expect(within(tablo).getByText('DENEME-UE-13')).toBeTruthy();
    expect(within(tablo).queryByText('DENEME-UE-14')).toBeNull();
    expect((screen.getByPlaceholderText('Sipariş, emir, OP, malzeme, firma') as HTMLInputElement).value).toBe('DENEME-UE-13');
    expect(istekler.filter((i) => i.yol.startsWith('/sevkiyat/tum-isler?')).every((i) => i.yol.includes('baslangic=2000-01-01'))).toBe(true);
  });

  it('sahibi modül kendi kalemini bırakır; erken çıkış sevkiyat.onayla olmadan kilitlidir', async () => {
    sunucuKur(PLANCI);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Karar bekleyen kalemler' });
    expect(within(satirOf(tablo, 'DENEME-UE-11')).queryByRole('button', { name: 'Serbest bırak' })).toBeNull();
    fireEvent.click(within(satirOf(tablo, 'DENEME-UE-12')).getByRole('button', { name: 'Diğer seçenekler' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/yalnız sevkiyat sorumlusu ya da yönetici yapar/)).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Şimdi sevke çıkar' })).toBeNull();
  });

  it('sevkiyat işi tetikler; gidişi çıkmamış dönüşte "Al" kapalıdır', async () => {
    const istekler = sunucuKur(SEVKIYATCI);
    ac();
    await screen.findByRole('table', { name: 'Karar bekleyen kalemler' });
    fireEvent.click(screen.getByRole('tab', { name: /Sevkiyattaki/ }));
    const tablo = await screen.findByRole('table', { name: 'Sevkiyattaki işler' });
    expect((within(satirOf(tablo, 'DENEME-UE-14')).getByRole('button', { name: 'Al' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(satirOf(tablo, 'DENEME-UE-13')).getByRole('button', { name: 'Sevk et' }));
    await waitFor(() => expect(yazmalar(istekler).map((i) => i.yol)).toEqual(['/sevkiyat/isler/6/tetikle']));
    expect(await screen.findByRole('button', { name: 'Geri al' })).toBeTruthy();
  });

  it('depocu düşen gidişin son çıkışını yapar; okuyucu düğme görmez', async () => {
    const istekler = sunucuKur(DEPOCU);
    ac();
    await screen.findByRole('table', { name: 'Karar bekleyen kalemler' });
    expect(screen.queryByRole('button', { name: 'Serbest bırak' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Sevkiyattaki/ }));
    const tablo = await screen.findByRole('table', { name: 'Sevkiyattaki işler' });
    expect(within(tablo).queryByRole('button', { name: 'Sevk et' })).toBeNull();
    fireEvent.click(within(satirOf(tablo, 'DENEME-UE-15')).getByRole('button', { name: 'Çıkışı yap' }));
    await waitFor(() => expect(yazmalar(istekler).map((i) => i.yol)).toEqual(['/stok/depo-sevk/42/cikis']));
    cleanup();

    sunucuKur(OKUYUCU);
    ac();
    await screen.findByRole('table', { name: 'Karar bekleyen kalemler' });
    expect(screen.queryAllByRole('button', { name: /Serbest bırak|Diğer seçenekler/ })).toHaveLength(0);
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Sevkiyattaki/ }));
    const okunan = await screen.findByRole('table', { name: 'Sevkiyattaki işler' });
    expect(within(okunan).queryAllByRole('button', { name: /Sevk et|^Al$|Çıkışı yap|Kabul et/ })).toHaveLength(0);
  });

  it('sevkiyat elle işi başlıktan açar; dönüşlü gidiş dönüş gününü taşır; okuyucu düğmeyi görmez', async () => {
    const istekler = sunucuKur(SEVKIYATCI);
    ac();
    await screen.findByRole('table', { name: 'Karar bekleyen kalemler' });
    fireEvent.click(screen.getByRole('button', { name: 'Elle iş' }));
    const form = await screen.findByRole('form', { name: 'Elle iş' });
    fireEvent.change(within(form).getByLabelText(/^Tür/), { target: { value: 'kalibrasyon' } });
    fireEvent.change(within(form).getByRole('searchbox', { name: /^Firma/ }), { target: { value: 'örnek' } });
    fireEvent.click(await within(form).findByRole('button', { name: /Örnek Firma B/ }));
    fireEvent.change(within(form).getByLabelText(/^Açıklama/), { target: { value: 'Kalibrasyona giden mastar' } });
    fireEvent.change(within(form).getByLabelText(/^Adet/), { target: { value: '2' } });
    fireEvent.click(within(form).getByLabelText('Dönüşlü (geri gelecek)'));
    fireEvent.change(within(form).getByLabelText(/^Dönüş günü/), { target: { value: '2099-01-10' } });
    fireEvent.submit(form);
    await waitFor(() => expect(yazmalar(istekler).map((i) => i.yol)).toEqual(['/sevkiyat/tum-isler/elle']));
    expect(yazmalar(istekler)[0]!.govde).toEqual({
      tur: 'kalibrasyon', yon: 'gidis', firmaId: 9, malzemeNo: null, adet: '2', istenenTarih: BUGUN, aciklama: 'Kalibrasyona giden mastar', tasima: 'biz', donusTarihi: '2099-01-10',
    });
    expect(await screen.findByText('Elle iş ve dönüşü açıldı.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Sevkiyattaki/ }).getAttribute('aria-selected')).toBe('true');
    cleanup();

    sunucuKur(PLANCI);
    ac();
    await screen.findByRole('table', { name: 'Karar bekleyen kalemler' });
    expect(screen.queryByRole('button', { name: 'Elle iş' })).toBeNull();
  });
});
