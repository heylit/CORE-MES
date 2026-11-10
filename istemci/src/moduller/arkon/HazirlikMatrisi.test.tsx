import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { HazirlikCevabi, HazirlikMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { HazirlikMatrisi, emirOzeti, matrisSatirlari } from './HazirlikMatrisi.tsx';

// 2227e, 2748: açık emirlerin hazırlık ve üretim matrisi (satır emir x operasyon; emir görünümü). Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const HAZIRLIKCI: Kullanici = { id: 4, ad: 'Deneme Hazirlik', islemler: ['sayfa.arkon', 'arkon.hazirlik', 'sayfa.uretim-emirleri'] };
const OPERATOR: Kullanici = { id: 5, ad: 'Deneme Operator', islemler: ['sayfa.uretim-terminali', 'terminal.uret'] };

type Emir = HazirlikMatrisiCevabi['emirler'][number];
type IsEmri = Emir['isEmirleri'][number];
const m = (madde: HazirlikCevabi['maddeler'][number]['madde'], durum: HazirlikCevabi['maddeler'][number]['durum'], isEmriDuzeyi: boolean) =>
  ({ madde, durum, muafTutulur: madde === 'cnc', isEmriDuzeyi });
const ie = (emirId: number, isEmriId: number, opNo: number, ad: string, durum: IsEmri['durum'], ek: Partial<IsEmri> = {}): IsEmri => ({
  isEmriId, emirId, opNo, sira: opNo / 10, ad, istasyonId: 7, istasyon: 'Deneme Torna', durum, fason: false, hedef: 10,
  saglam: durum === 'tamam' ? 10 : 0, hurda: 0, kararBekliyor: 0, kalan: durum === 'tamam' ? 0 : 10, hazir: 10, fasonda: 0, devirAdedi: null, ...ek,
});
const hazirlik = (cnc: Record<number, string>, talimat: Record<number, string>, isler: readonly IsEmri[]): NonNullable<Emir['hazirlik']> => ({
  maddeler: [m('cnc', 'eksik', true), m('cizim', 'tamam', false), m('talimat', 'eksik', true)],
  isEmirleri: isler.map((i) => ({
    isEmriId: i.isEmriId, opNo: i.opNo, ad: i.ad, bitti: i.durum === 'tamam',
    maddeler: [{ madde: 'cnc', durum: (cnc[i.isEmriId] ?? 'tamam') as 'tamam' }, { madde: 'talimat', durum: (talimat[i.isEmriId] ?? 'tamam') as 'tamam' }],
  })),
});
const emir = (id: number, teslim: string | null, isler: IsEmri[], h: Emir['hazirlik']): Emir => ({
  id, emirNo: `UE-DNM-${String(id)}`, urun: { id: 500 + id, kod: `DNM-${String(id)}`, ad: `Deneme parça ${String(id)}` }, adet: 10, teslim,
  durum: isler.some((i) => i.durum !== 'bekliyor') ? 'basladi' : 'planli', isEmirleri: isler, hazirlik: h,
});

// Emir 2 önce teslim edilir. Emir 1: OP 10 bitti, OP 20 çalışıyor (CNC eksik: durur), OP 30 bekliyor (talimat eksik: uyarı).
// Emir 2: OP 10 fasonda, hazır.
const isler1 = [ie(1, 11, 10, 'Tornalama', 'tamam'), ie(1, 12, 20, 'Frezeleme', 'calisiyor', { saglam: 4, hurda: 1, kalan: 6, hazir: 5 }), ie(1, 13, 30, 'Taşlama', 'bekliyor', { hazir: -2 })];
const isler2 = [ie(2, 21, 10, 'Kaplama', 'calisiyor', { fason: true, fasonda: 6, istasyon: null, istasyonId: null })];
const VERI: HazirlikMatrisiCevabi = {
  emirler: [
    emir(2, '2026-11-20', isler2, hazirlik({}, {}, isler2)),
    emir(1, '2026-12-01', isler1, hazirlik({ 12: 'eksik' }, { 13: 'eksik' }, isler1)),
  ],
};

function ciz(kisi: Kullanici, adres = '/arkon/hazirlik-matrisi', veri: HazirlikMatrisiCevabi = VERI) {
  const sorulan: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (a: string) => {
    const yol = a.replace('/api', '');
    if (yol === '/oturum') return new Response(JSON.stringify({ kullanici: kisi }), { status: 200 });
    if (yol.startsWith('/adimli-emirler/hazirlik-matrisi')) { sorulan.push(yol); return new Response(JSON.stringify(veri), { status: 200 }); }
    return new Response('{}', { status: 404 });
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BildirimSaglayici><MemoryRouter initialEntries={[adres]}><HazirlikMatrisi /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return sorulan;
}

describe('Hazırlık matrisi sayfası (2227e, 2748)', () => {
  it('satır her iş emri başınadır; biten iş emrinde hazırlık sorulmaz; durduran eksik durur, uyaran eksik uyarıyla başlar', () => {
    const l = matrisSatirlari(VERI.emirler);
    expect(l.map((s) => [s.emir.id, s.isEmri?.opNo, s.durum])).toEqual([[2, 10, 'hazir'], [1, 10, 'bitti'], [1, 20, 'durur'], [1, 30, 'uyari']]);
    const ozet = emirOzeti(l.filter((s) => s.emir.id === 1));
    expect([ozet.durum, ozet.biten, ozet.toplam, ozet.simdiki?.opNo]).toEqual(['durur', 1, 3, 20]);
    const rotasiz = matrisSatirlari([emir(3, null, [], { ...hazirlik({}, {}, []), maddeler: [m('cnc', 'eksik', true)] })]);
    expect(rotasiz.map((s) => [s.isEmri, s.hal.get('cnc'), s.durum])).toEqual([[null, 'eksik', 'durur']]);
  });

  it('operasyon görünümü: üretim durumu, sağlam / hedef, hazır adet ve hazırlık; özetler sıfırsa çizilmez; süzgeç ve arama', async () => {
    const sorulan = ciz(HAZIRLIKCI);
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    expect(sorulan).toEqual(['/adimli-emirler/hazirlik-matrisi']);
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(satirlar.map((r) => within(r).getByRole('link').textContent)).toEqual(['UE-DNM-2', 'UE-DNM-1', 'UE-DNM-1', 'UE-DNM-1']);
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['Emir · operasyon', 'Teslim', 'Üretim', 'Hazır adet', 'Hazırlık', 'CNCdurdurur', 'Çizimdurdurur', 'Talimatuyarır']);
    expect(within(satirlar[0]!).getByText('Fasonda')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('0 / 10 · 6 fasonda')).toBeTruthy();
    expect(within(satirlar[2]!).getByText('4 / 10 · 1 hurda')).toBeTruthy();
    expect(within(satirlar[2]!).getByText('5')).toBeTruthy();
    expect(within(satirlar[2]!).getByTitle('CNC kurulumu: Eksik · sorumlu CNC Kurulum')).toBeTruthy();
    expect(within(satirlar[3]!).getByTitle('Hazırlık talimatı: Uyarı · sorumlu Terminal')).toBeTruthy();
    expect(within(satirlar[3]!).getByTitle('Bu adım öncülünden 2 fazla saydı; sayımı amir ya da kalite düzeltir.').textContent).toBe('0 fazla sayım');
    expect(within(screen.getByRole('list', { name: 'Hazırlık özeti' })).getAllByRole('listitem').map((x) => x.textContent))
      .toEqual(['1 durur', '1 uyarıyla başlar', '1 hazır']);
    expect(within(screen.getByRole('list', { name: 'Üretim özeti' })).getAllByRole('listitem').map((x) => x.textContent))
      .toEqual(['2 emir', '1 operasyon çalışıyor', '1 operasyon fasonda', '1 operasyon bekliyor', '1 operasyon bitti']);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: 'taşlama' } });
    expect(within(tablo).getAllByRole('row').slice(1)).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Ara' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Hazırlık' }), { target: { value: 'durur' } });
    expect(within(tablo).getAllByRole('row').slice(1).map((r) => within(r).getByRole('link').textContent)).toEqual(['UE-DNM-1']);
  });

  it('emir görünümü: emir başına satır, biten operasyon sayısı, şu anki operasyon ve en kötü hazırlık', async () => {
    ciz(HAZIRLIKCI);
    await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Görünüm' }), { target: { value: 'emir' } });
    const tablo = screen.getByRole('table', { name: 'Emirlerin hazırlık ve üretim durumu' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(satirlar.map((r) => within(r).getByRole('link').textContent)).toEqual(['UE-DNM-2', 'UE-DNM-1']);
    expect(within(satirlar[1]!).getByText('1 / 3')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('OP 20 · Frezeleme')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Durur')).toBeTruthy();
  });

  it('operatör emir ayrıntısına bağlantı görmez; adresteki emir yalnız o emri sorar', async () => {
    const sorulan = ciz(OPERATOR, '/uretim-terminali/hazirlik?hazirlik-emri=1', { emirler: [VERI.emirler[1]!] });
    const tablo = await screen.findByRole('table', { name: 'Hazırlık matrisi' });
    expect(sorulan).toEqual(['/adimli-emirler/hazirlik-matrisi?emirler=1']);
    expect(within(tablo).queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText('Yalnız bir emir gösteriliyor.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bütün emirleri göster' })).toBeTruthy();
  });
});
