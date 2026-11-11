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
