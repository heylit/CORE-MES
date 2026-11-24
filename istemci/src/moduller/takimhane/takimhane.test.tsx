import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AcikTeslim, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { CikisFormu, IadePenceresi } from './CikisIade.tsx';
import { stokDurumu } from './gosterim.ts';
import { rotalar } from './rotalar.tsx';

const takim = (t: Partial<TakimSatiri> = {}): TakimSatiri => ({
  kartKimlik: 1, kod: 'ORN-TKM-1', ad: 'ORN Freze 12', kategori: 'Freze', sinif: 'freze', capMm: '12', kesiciSayisi: 4, isoKodu: null, malzemeGruplari: ['P'],
  yenidenBilenir: true, izleme: 'adet', rafKodu: 'ORN-R1', konumlar: { raf: 5, tezgah: null, kisi: null, bileme: null, ara: null }, toplam: 5, kritikSeviye: null, ...t,
});
const teslim: AcikTeslim = { konumKimligi: 9, kartKimlik: 1, kod: 'ORN-TKM-1', ad: 'ORN Freze 12', adet: 3, alan: 'ORN Operatör A', alanTuru: 'kisi', verildi: null };

function ac(icerik: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>{icerik}</MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Takımhane', () => {
  it('rotalar sayfanın dört yolunu açar', () => {
    expect(rotalar.map((r) => r.yol)).toEqual(['/takimhane', '/takimhane/emirler', '/takimhane/cikis-iade', '/takimhane/baslangic']);
  });

  it('sipariş noktası yoksa durum uydurulmaz: yalnız sıfır bilinir', () => {
    expect(stokDurumu(takim({ toplam: 0 }))).toBe('sifir');
    expect(stokDurumu(takim({ toplam: 5, kritikSeviye: null }))).toBe('esiksiz');
    expect(stokDurumu(takim({ toplam: 2, kritikSeviye: 3 }))).toBe('kritik');
  });

  it('çıkış düğmesi kapalıyken sebebi yazar: önce takım, sonra alan', () => {
    ac(<CikisFormu takimlar={[takim()]} son={[takim()]} alicilar={[{ deger: 'k:1', baslik: 'ORN Operatör A' }]} emirler={[]} gonder={vi.fn()} />);
    expect(screen.getByText('Takım seçin.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Teslim et' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /ORN-TKM-1/ }));
    expect(screen.getByText('Alan seçin.')).toBeTruthy();
  });

  it('kırık iade nedensiz onaylanmaz; neden yazılınca gönderilir', () => {
    const onayla = vi.fn();
    ac(<IadePenceresi teslim={teslim} kapat={vi.fn()} onayla={onayla} ilkDurum="kirik" />);
    const dugme = screen.getByRole('button', { name: 'İade al' }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    expect(screen.getByText('Kırılma nedenini yazın.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Kırılma nedeni/), { target: { value: 'Mandren çarpması' } });
    expect(dugme.disabled).toBe(false);
    fireEvent.click(dugme);
    expect(onayla).toHaveBeenCalledWith({ adet: 3, durum: 'kirik', neden: 'Mandren çarpması' });
  });
});
