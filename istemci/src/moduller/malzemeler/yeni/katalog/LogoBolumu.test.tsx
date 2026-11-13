import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { LogoKartAlislariCevabi, LogoKartBolumuCevabi, LogoKartHareketleriCevabi } from '#paylasilan/sozlesme/logo.ts';
import { json, sunucuKur, yeniIstemci, OKUYAN } from '../test-ortak.tsx';
import { LogoBolumu } from './LogoBolumu.tsx';

// 3201 a (D): kodlar, ambarlar ve tedarikçi uydurmadır (ORN-).
const KOD = 'ORN-HM-0042';
const YOL = `/logo/malzeme-karti/${KOD}`;
const STOK: NonNullable<LogoKartBolumuCevabi['stok']> = {
  sonOkuma: '2026-11-13T10:00:00.000Z',
  ambarlar: [
    { ambarNo: 0, ambarAdi: 'ORN merkez', logo: '412.5', depo: { kod: 'ANA', ad: 'ORN ana depo' }, core: '405', fark: '7.5' },
    { ambarNo: 3, ambarAdi: 'ORN fason', logo: '30', depo: null, core: null, fark: null },
  ],
  eslenen: { logo: '412.5', core: '405', fark: '7.5' },
  eslenmemis: '30',
};
const bolum = (p: Partial<LogoKartBolumuCevabi['parcalar']>, stok: LogoKartBolumuCevabi['stok'] = STOK): LogoKartBolumuCevabi =>
  ({ parcalar: { stok: false, hareket: false, fiyat: false, ...p }, logoKodu: KOD, stok });
const hareket = (n: number, yon: 'giris' | 'cikis', tarih = '2026-11-12'): LogoKartHareketleriCevabi['kayitlar'][number] => ({
  logoKayitNo: n, tarih, fisTuru: yon === 'giris' ? 1 : 12, fisAdi: yon === 'giris' ? 'Satın alma irsaliyesi' : 'Sarf fişi', yon,
  fisNo: `ORN-F-${n}`, ambarNo: 0, miktar: '24', birim: 'KG',
});
const ALIS: LogoKartAlislariCevabi = {
  durum: 'tamam', ileti: null,
  kayitlar: [{ logoKayitNo: 9, tarih: '2026-11-12', tedarikci: 'ORN Tedarikçi', faturaNo: 'ORN-F-20', miktar: '100', birim: 'KG', fiyat: '42.5', dovizTuru: null, dovizFiyati: null }],
};

function ac(yollar: Parameters<typeof sunucuKur>[1]) {
  const istekler = sunucuKur(OKUYAN, yollar);
  render(<QueryClientProvider client={yeniIstemci()}><LogoBolumu kod={KOD} birim="kg" /></QueryClientProvider>);
  return istekler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Malzeme kartı "Logo\'da" bölümü (3201 a, D)', () => {
  it('anahtarlar kapalıyken bölüm hiç görünmez', async () => {
    const istekler = ac({ [`GET ${YOL}`]: () => json(200, bolum({})) });
    await waitFor(() => expect(istekler.some((i) => i.yol === YOL)).toBe(true));
    expect(screen.queryByText('Logo\'da')).toBeNull();
  });

  it('stok: eşli ambar farkı ve toplamı, eşlenmemiş ambar ayrı; kartı açmak hareket okumaz', async () => {
    const istekler = ac({ [`GET ${YOL}`]: () => json(200, bolum({ stok: true, hareket: true })) });
    expect(await screen.findByText('Eşlenen ambarlar')).toBeTruthy();
    expect(screen.getAllByText('+7,5')).toHaveLength(2);
    expect(screen.getByText('CORE deposu eşlenmedi')).toBeTruthy();
    expect(screen.getByText('yalnız okunur')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hareketleri oku/ })).toBeTruthy();
    expect(istekler.some((i) => i.yol.includes('/hareketler'))).toBe(false);
  });

  it('hareketler zaman çizgisinde ay ay; alış fiyatı alış satırında; "Daha eski" sonraki sayfayı ekler', async () => {
    const istekler = ac({
      [`GET ${YOL}`]: () => json(200, bolum({ stok: true, hareket: true, fiyat: true })),
      [`GET ${YOL}/hareketler`]: (_g, yol) => json(200, (yol ?? '').includes('once=')
        ? { durum: 'tamam', ileti: null, kayitlar: [hareket(5, 'cikis', '2026-10-30')], dahaEski: null }
        : { durum: 'tamam', ileti: null, kayitlar: [hareket(21, 'cikis'), hareket(20, 'giris')], dahaEski: 20 }),
      [`GET ${YOL}/son-alislar`]: () => json(200, ALIS),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Hareketleri oku/ }));
    expect(await screen.findByText('Kasım 2026')).toBeTruthy();
    expect(screen.getByText(/alış 42,5 TL\/KG ORN Tedarikçi/)).toBeTruthy();
    expect(screen.getAllByText('Çıkış')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Daha eski hareketler' }));
    expect(await screen.findByText('Ekim 2026')).toBeTruthy();
    expect(istekler.filter((i) => i.yol.startsWith(`${YOL}/hareketler`)).map((i) => i.yol).at(-1)).toBe(`${YOL}/hareketler?once=20`);
    expect(screen.queryByRole('button', { name: 'Daha eski hareketler' })).toBeNull();
  });

  it('fiyat parçası kapalıyken son alışlar istenmez; Logo\'ya ulaşılamazsa kullanıcıya göre ileti ve yeniden dene', async () => {
    const istekler = ac({
      [`GET ${YOL}`]: () => json(200, bolum({ hareket: true })),
      [`GET ${YOL}/hareketler`]: () => json(200, { durum: 'hata', ileti: 'Köprü 503 döndü.', kayitlar: [], dahaEski: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Hareketleri oku/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Logo'ya şu an ulaşılamıyor/);
    expect(screen.getByRole('button', { name: /Yeniden dene/ })).toBeTruthy();
    expect(istekler.some((i) => i.yol.includes('son-alislar'))).toBe(false);
    expect(screen.queryByText('Stok · ambar ambar')).toBeNull();
  });
});
