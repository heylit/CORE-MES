import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { RafGozleriCevabi, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { CikisFormu } from './CikisIade.tsx';
import { BAGSIZ_RAF, kalemBul, kutuphaneSatirlari, satirDurumu, satirEylemi, suz } from './kutuphane.ts';
import { GirisPenceresi, KutuphaneListesi } from './Kutuphane.tsx';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';

const takim = (t: Partial<TakimSatiri> = {}): TakimSatiri => ({
  kartKimlik: 1, kod: 'SF-TKM-00001', ad: 'ORN Freze 10', kategori: 'Kütüphane', sinif: 'freze', capMm: null, kesiciSayisi: null, isoKodu: null, malzemeGruplari: [],
  yenidenBilenir: false, izleme: 'adet', rafKodu: null, konumlar: { raf: 6, tezgah: 2, kisi: null, bileme: null, ara: null }, toplam: 8, kritikSeviye: null,
  kutuphaneKimligi: 'orn-pf-10', kartDurumu: 'aktif', gozler: [{ konumKimligi: 11, kod: 'ORN-TH-A1-03', adet: 6 }], omurYuzde: 72, ...t,
});
const raflar = [
  { anahtar: 'tm_end', baslik: 'Freze · Parmak frezeler', kalemler: [
    { kimlik: 'orn-pf-10', ad: 'ORN Freze 10', kod: 'ORN-PF-10' }, { kimlik: 'orn-pf-12', ad: 'ORN Freze 12', kod: 'ORN-PF-12' },
  ] },
];
const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200, headers: { 'content-type': 'application/json' } });
function ac(icerik: ReactNode, islemler?: string[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: islemler ? Infinity : 0 } } });
  if (islemler) istemci.setQueryData(ortakAnahtarlar.oturum, { id: 1, ad: 'ORN Kişi', islemler });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>{icerik}</MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Takımhane kütüphanesi (3762)', () => {
  it('kütüphane kalemi kartıyla birleşir; kartsız kalem ve bağlanmamış eski kart kaybolmaz', () => {
    const eski = takim({ kartKimlik: 2, kod: 'TKM-ORN-0412', kutuphaneKimligi: null, gozler: [] });
    const s = kutuphaneSatirlari(raflar, [takim(), eski]);
    expect(s.map((x) => [x.raf, x.kimlik, x.takim?.kartKimlik ?? null])).toEqual([
      ['Freze · Parmak frezeler', 'orn-pf-10', 1], ['Freze · Parmak frezeler', 'orn-pf-12', null], [BAGSIZ_RAF, null, 2],
    ]);
    expect(s.map(satirDurumu)).toEqual(['esiksiz', 'kart-yok', 'baglanacak']);
    expect(s.map(satirEylemi)).toEqual(['sayim', null, 'bagla']);
    expect(suz(s, { suzgec: 'kartli', raf: '', ara: '' })).toHaveLength(2);
    expect(suz(s, { suzgec: 'kart-yok', raf: '', ara: '' }).map((x) => x.kimlik)).toEqual(['orn-pf-12']);
  });

  it('boş gözlü aktif kartta açılış, onaydaki kartta düğme yok', () => {
    const [bos] = kutuphaneSatirlari(raflar, [takim({ gozler: [] })]);
    const [onayda] = kutuphaneSatirlari(raflar, [takim({ kartDurumu: 'onayda' })]);
    expect(bos && satirEylemi(bos)).toBe('acilis');
    expect(onayda && [satirDurumu(onayda), satirEylemi(onayda)]).toEqual(['onayda', null]);
  });

  it('Excel kalemi kart kodundan ya da kütüphane kodundan bulunur; kartsız kalem nedeniyle reddedilir', () => {
    const s = kutuphaneSatirlari(raflar, [takim()]);
    expect(kalemBul(s, 'sf-tkm-00001').takim?.kartKimlik).toBe(1);
    expect(kalemBul(s, 'ORN-PF-10').takim?.kartKimlik).toBe(1);
    expect(kalemBul(s, 'ORN-PF-12').hata).toBe('Kalemin stok kartı yok.');
    expect(kalemBul(s, 'ORN-XX').hata).toBe('Kütüphanede yok.');
    const ayniKod = kutuphaneSatirlari([{ anahtar: 'r', baslik: 'R', kalemler: [{ kimlik: 'a1', ad: 'A', kod: 'Karbür' }, { kimlik: 'a2', ad: 'B', kod: 'Karbür' }] }], []);
    expect(kalemBul(ayniKod, 'karbür').hata).toMatch(/birden çok/);
  });

  it('pencere göze göre açılış ya da kör sayım olur; sayımda sistem adedi gösterilmez', async () => {
    const gozler: RafGozleriCevabi = { gozler: [{ konumKimligi: 11, kod: 'ORN-TH-A1-03', ad: null, dolu: true }, { konumKimligi: 12, kod: 'ORN-TH-A1-06', ad: null, dolu: false }] };
    const gonderilen: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { gonderilen.push(JSON.parse(String(init.body))); return json({ tur: 'sayim', belgeNo: null, onayaGiden: 1 }); }
      return json(gozler);
    }));
    ac(<GirisPenceresi takim={takim()} kapat={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /ORN-TH-A1-06/ }));
    expect(screen.getByRole('button', { name: 'Açılış olarak yaz' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ORN-TH-A1-03/ }));
    const gonder = screen.getByRole('button', { name: 'Sayımı gönder' }) as HTMLButtonElement;
    expect(screen.getByText(/kör sayım/)).toBeTruthy();
    expect(screen.queryByText(/\b6\b/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Sayılan adet'), { target: { value: '5' } });
    fireEvent.click(gonder);
    await waitFor(() => { expect(gonderilen).toHaveLength(1); });
    expect(gonderilen[0]).toMatchObject({ kartKimlik: 1, konumKimligi: 11, adet: 5 });
  });

  it('çıkışta birden çok gözü olan takımın gözü seçilir', () => {
    const gonder = vi.fn();
    const t = takim({ gozler: [{ konumKimligi: 11, kod: 'ORN-TH-A1-03', adet: 4 }, { konumKimligi: 13, kod: 'ORN-TH-A2-01', adet: 2 }] });
    ac(<CikisFormu takimlar={[t]} son={[t]} alicilar={[{ deger: 'k:1', baslik: 'ORN Operatör A' }]} emirler={[]} gonder={gonder} />);
    fireEvent.click(screen.getByRole('button', { name: /SF-TKM-00001/ }));
    fireEvent.change(screen.getByLabelText('Raf gözü'), { target: { value: '13' } });
    fireEvent.change(screen.getByLabelText('Adet'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Alan/), { target: { value: 'k:1' } });
    expect(screen.getByText('Bu gözde bu kadar yok.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Adet'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teslim et' }));
    expect(gonder).toHaveBeenCalledWith(expect.objectContaining({ kartKimlik: 1, adet: 2, goz: '13' }));
  });

  it('yetkiye göre satır düğmesi: sayım yetkisi olan Sayım görür, yalnız sayfa yetkisi olan hiç düğme görmez', () => {
    const s = kutuphaneSatirlari(raflar, [takim()]);
    ac(<KutuphaneListesi satirlar={s} satirSec={vi.fn()} ac={vi.fn()} />, ['sayfa.takimhane', 'stok.sayim']);
    expect(screen.getAllByRole('button', { name: 'Sayım' }).length).toBeGreaterThan(0);
    cleanup();
    ac(<KutuphaneListesi satirlar={s} satirSec={vi.fn()} ac={vi.fn()} />, ['sayfa.takimhane']);
    expect(screen.queryAllByRole('button', { name: /^(Sayım|Açılış gir|Kaleme bağla)$/ })).toHaveLength(0);
  });

  it('satır düğmesi ayrıntıyı açmaz; yalnız pencereyi açar', () => {
    const s = kutuphaneSatirlari(raflar, [takim()]);
    const satirSec = vi.fn();
    const pencere = vi.fn();
    ac(<KutuphaneListesi satirlar={s} satirSec={satirSec} ac={pencere} />, ['sayfa.takimhane', 'stok.sayim']);
    const dugme = screen.getAllByRole('button', { name: 'Sayım' })[0];
    if (dugme) fireEvent.click(dugme);
    expect(pencere).toHaveBeenCalledTimes(1);
    expect(satirSec).not.toHaveBeenCalled();
  });
});
