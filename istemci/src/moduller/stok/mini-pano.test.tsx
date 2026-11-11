import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { DepoSevkCevabi, IsKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { gorunenMiniPanolar, miniPanolar } from '../../ortak/rota/mini-pano.ts';
import { StokPanosu, gecenSure } from './mini-pano.tsx';
import { DEPOCU, OKUYUCU, json, sunucuKur } from './test-ortak.tsx';

const KUTU: IsKutusuCevabi = {
  kabuldeBekleyen: 2, eksiBakiye: 1, kritik: 0, sayimBekleyen: 4, logoFarki: 0, logoHatasi: 2, fasondaEksik: 0, fasonEksikGonderimi: 0,
  teslimBekleyenIstek: 5, depoyaGelenTeslim: 0, defterFarki: null,
};
const saatOnce = (s: number) => new Date(Date.now() - s * 3_600_000).toISOString();
const satir = (kalemId: number, is: 'cikis' | 'kabul', saat: number): DepoSevkCevabi['satirlar'][number] => ({
  kalemId, is, kaynak: 'urun', uretimEmriId: null, emirNo: null, isEmriId: null, opNo: null, malzemeId: null, malzemeAd: null,
  adet: null, kabulAdet: null, firmaId: null, firmaAd: null, tasima: 'biz', tetiklendi: saatOnce(saat), erken: false, siparisSatirId: null,
});
const SEVK: DepoSevkCevabi = { satirlar: [satir(1, 'cikis', 26), satir(2, 'cikis', 3), satir(3, 'kabul', 5)] };

function Adres() {
  const l = useLocation();
  return <output aria-label="adres">{l.pathname + l.search}</output>;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="*" element={<><StokPanosu /><Adres /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const kutucuk = (ad: string) => screen.getByRole('button', { name: new RegExp(ad) });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Stok mini panosu (3016 a)', () => {
  it('altı kutucuk riskten işe; düzeltilecek eksi + defter + Logo hatasının toplamı, sevkte en eski bekleyen', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, KUTU), 'GET /stok/depo-sevk': () => json(200, SEVK) });
    ac();
    await waitFor(() => expect(kutucuk('Sevke çıkacak').textContent).toContain('2'));
    const adlar = screen.getAllByRole('button').map((d) => d.querySelector('.tc-mp-kutu-baslik')?.textContent);
    expect(adlar).toEqual(['Düzeltilecek', 'Sevke çıkacak', 'Malzeme isteği', 'Gelen sevk', 'Rafa yerleşecek', 'Sayım bekleyen']);
    expect(kutucuk('Düzeltilecek').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('3');
    expect(kutucuk('Sevke çıkacak').textContent).toContain('en eskisi 1 gün');
    expect(kutucuk('Gelen sevk').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('1');
    expect(kutucuk('Malzeme isteği').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('5');
  });

  it('Düzeltilecek defter farkını da sayar; üçü sıfırsa 0 yazar', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, { ...KUTU, defterFarki: 4 }), 'GET /stok/depo-sevk': () => json(200, SEVK) });
    ac();
    await waitFor(() => expect(kutucuk('Düzeltilecek').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('7'));
    cleanup();
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, { ...KUTU, eksiBakiye: 0, logoHatasi: 0, defterFarki: 0 }), 'GET /stok/depo-sevk': () => json(200, SEVK) });
    ac();
    await waitFor(() => expect(kutucuk('Düzeltilecek').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('0'));
  });

  it('kutucuğa tıklayınca ana pencere o listeye gider', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, KUTU), 'GET /stok/depo-sevk': () => json(200, SEVK) });
    ac();
    await waitFor(() => expect(kutucuk('Sevke çıkacak').textContent).toContain('2'));
    // Kutucuk ana pencereyi öne alır; jsdom'da pencere odağı yoktur.
    vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    fireEvent.click(kutucuk('Sevke çıkacak'));
    expect(screen.getByLabelText('adres').textContent).toBe('/stok/depo-sevk');
  });

  it('sevk yetkisi olmayan depo sevk ucunu çağırmaz; sevk kutucukları "—" ve "veri yok" der, sıfır uydurulmaz', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, { ...KUTU, teslimBekleyenIstek: null }) });
    ac();
    await waitFor(() => expect(kutucuk('Sayım bekleyen').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('4'));
    expect(kutucuk('Sevke çıkacak').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('—');
    expect(kutucuk('Sevke çıkacak').textContent).toContain('veri yok');
    expect(kutucuk('Malzeme isteği').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('—');
    expect(istekler.some((i) => i.yol.startsWith('/stok/depo-sevk'))).toBe(false);
  });

  it('iş kutusu hata verirse sayılar "—" kalır', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(500, { kod: 'HATA', mesaj: 'x' }), 'GET /stok/depo-sevk': () => json(200, SEVK) });
    ac();
    await waitFor(() => expect(kutucuk('Düzeltilecek').querySelector('.tc-mp-kutu-sayi')?.textContent).toBe('—'));
  });

  it('pano stok okuyan ya da stok işi olan kişiye görünür, ötekine görünmez', () => {
    expect(gorunenMiniPanolar(miniPanolar, ['stok.cikis']).map((p) => p.anahtar)).toContain('stok');
    expect(gorunenMiniPanolar(miniPanolar, ['sayfa.stok']).map((p) => p.anahtar)).toContain('stok');
    expect(gorunenMiniPanolar(miniPanolar, ['satin-alma.oku']).map((p) => p.anahtar)).not.toContain('stok');
  });

  it('geçen süre dakika, saat ve gün olarak yazılır', () => {
    const simdi = Date.parse('2026-11-11T12:00:00Z');
    expect(gecenSure('2026-11-11T11:35:00Z', simdi)).toBe('25 dk');
    expect(gecenSure('2026-11-11T09:00:00Z', simdi)).toBe('3 sa');
    expect(gecenSure('2026-11-09T12:00:00Z', simdi)).toBe('2 gün');
    expect(gecenSure('2026-11-11T12:05:00Z', simdi)).toBe('0 dk');
  });
});
