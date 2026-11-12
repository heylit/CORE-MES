import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { KayitTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { cihazYazicisiKaydet } from './cihaz-yazicisi.ts';
import { useDogrudanBasim } from './HizliBas.tsx';

// 2929 a: olay ekranından doğrudan basımda refakat kartı iki kopya gider; öteki türler tek adet kalır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const KULLANICI = { id: 5, ad: 'Deneme Depocu', islemler: ['sayfa.etiket-merkezi', 'etiket-merkezi.bas'] };

function sunucuKur() {
  const govdeler: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const cevap = (veri: unknown) => new Response(JSON.stringify(veri), { status: 200, headers: { 'content-type': 'application/json' } });
    if (yol === '/oturum') return cevap({ kullanici: KULLANICI });
    if (secenek?.method === 'POST') { govdeler.push(JSON.parse(String(secenek.body))); return cevap({ baskiId: 1, sonuc: 'gonderildi', ileti: null }); }
    return new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' }), { status: 404 });
  }));
  return govdeler;
}

function Bas({ tur }: { tur: KayitTuru }) {
  const { yazici, bas } = useDogrudanBasim(tur);
  return yazici ? <button type="button" onClick={() => bas([7])}>Bas</button> : null;
}

function ciz(tur: KayitTuru) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Bas tur={tur} /></BildirimSaglayici></QueryClientProvider>);
}

describe('doğrudan basım adedi', () => {
  it('refakat kartı iki kopya gönderir', async () => {
    cihazYazicisiKaydet('refakat', { yaziciId: 3, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'refakat-100x150', sablonAd: 'Refakat kartı 100x150' });
    const govdeler = sunucuKur();
    ciz('refakat-partisi');
    fireEvent.click(await screen.findByRole('button', { name: 'Bas' }));
    await waitFor(() => expect(govdeler).toEqual([{ yaziciId: 3, adet: 2, kayit: { tur: 'refakat-partisi', idler: [7] } }]));
  });

  it('lot etiketi tek adet kalır', async () => {
    cihazYazicisiKaydet('lot', { yaziciId: 4, yaziciAd: 'Depo yazıcısı', sablonAnahtar: 'lot-100x50', sablonAd: 'Lot 100x50' });
    const govdeler = sunucuKur();
    ciz('lot');
    fireEvent.click(await screen.findByRole('button', { name: 'Bas' }));
    await waitFor(() => expect(govdeler).toEqual([{ yaziciId: 4, adet: 1, kayit: { tur: 'lot', idler: [7] } }]));
  });
});

// 2953 c + 2916 a: USB'ye atanmış tür indirme ucundan komutu alır (yetki ve defter sunucuda) ve bu bilgisayarda eşleşmiş aygıta aktarır.
describe('doğrudan basım USB yolu (3025)', () => {
  const ARGOX = { yaziciId: 2, yaziciAd: 'Argox masa', sablonAnahtar: 'lot-100x50', sablonAd: 'Lot 100x50', baglanti: 'usb' as const };
  const usbKur = (aygitlar: unknown[]) => {
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'usb', { value: { getDevices: async () => aygitlar, requestDevice: async () => null }, configurable: true });
  };
  const aygit = () => {
    const giden: string[] = [];
    return {
      giden, productName: 'Deneme yazıcısı', opened: false,
      configuration: { interfaces: [{ interfaceNumber: 0, alternate: { interfaceClass: 7, endpoints: [{ endpointNumber: 1, direction: 'out' as const, type: 'bulk' as const }] } }] },
      open: async () => undefined, close: async () => undefined, selectConfiguration: async () => undefined,
      claimInterface: async () => undefined, releaseInterface: async () => undefined,
      transferOut: async (_uc: number, veri: BufferSource) => { giden.push(new TextDecoder().decode(veri)); return { status: 'ok' as const }; },
    };
  };
  const indirSunucusu = () => {
    const yollar: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yol = adres.replace('/api', '');
      const cevap = (veri: unknown) => new Response(JSON.stringify(veri), { status: 200, headers: { 'content-type': 'application/json' } });
      if (yol === '/oturum') return cevap({ kullanici: KULLANICI });
      if (secenek?.method === 'POST') { yollar.push(yol); return cevap({ baskiId: 1, dosyaAdi: 'lot-100x50-203.prn', komut: '\nN\nP1\n' }); }
      return new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' }), { status: 404 });
    }));
    return yollar;
  };
  afterEach(() => { Reflect.deleteProperty(navigator, 'usb'); });

  it('komut indirme ucundan alınır ve eşleşmiş USB yazıcıya aktarılır; ağ ucu çağrılmaz', async () => {
    cihazYazicisiKaydet('lot', ARGOX);
    const a = aygit();
    usbKur([a]);
    const yollar = indirSunucusu();
    ciz('mal-kabul');
    fireEvent.click(await screen.findByRole('button', { name: 'Bas' }));
    expect(await screen.findByText('Etiketler gönderildi: Argox masa.')).toBeTruthy();
    expect(yollar).toEqual(['/etiket-merkezi/sablonlar/lot-100x50/indir']);
    expect(a.giden).toEqual(['\nN\nP1\n']);
  });

  it('bu bilgisayarda eşleşme yoksa istek atılmaz ve neden yazılır', async () => {
    cihazYazicisiKaydet('lot', ARGOX);
    usbKur([]);
    const yollar = indirSunucusu();
    ciz('lot');
    fireEvent.click(await screen.findByRole('button', { name: 'Bas' }));
    expect(await screen.findByText(/Bu bilgisayarda eşleşmiş USB yazıcı yok\./)).toBeTruthy();
    expect(yollar).toEqual([]);
  });
});
