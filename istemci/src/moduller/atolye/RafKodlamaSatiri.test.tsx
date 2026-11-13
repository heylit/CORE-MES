import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { HaritaEslemeCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { BolmeCephesi } from './RafCephesi.tsx';
import { RafKodlamaSatiri } from './RafKodlamaSatiri.tsx';
import type { RafBoyu } from './raf-kodlama.ts';

// 3168 a: sıra numaralı kodda cephe her gözde kodunu yazar, kat adı yoktur; sonradan göz eklenen rafta "Yeniden numarala" tehlikeli
// onayla Stok'un ucunu çağırır ve "Konum kodu değişti" penceresi tehlike uyarısıyla açılır. Düğme yalnız stok tanımı yetkisinde.
const raf = (gozNolari: number[] | null): RafBoyu & { id: number } => ({ id: 3, kod: 'ORNA', bolmeSayisi: 2, katSayisi: 2, gozSayisi: 1, gozNolari });
const esleme: HaritaEslemeCevabi = {
  eklenen: 0, guncellenen: 2, kapatilan: 0, atlanan: [],
  koduDegisenler: [
    { konumId: 1, eskiKod: 'ORNA5', yeniKod: 'ORNA3', tur: 'raf_gozu', ad: null, bolmeNo: 2, katNo: 1, satirSayisi: 0 },
    { konumId: 2, eskiKod: 'ORNA6', yeniKod: 'ORNA4', tur: 'raf_gozu', ad: null, bolmeNo: 2, katNo: 2, satirSayisi: 0 },
  ],
};

function kur(islemler: Kullanici['islemler']) {
  const istekler: { yontem: string; yol: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol });
    if (yol === '/oturum') return new Response(JSON.stringify({ kullanici: { id: 1, ad: 'Deneme', islemler } satisfies Kullanici }), { status: 200 });
    if (yontem === 'POST' && yol === '/stok/harita-raflari/3/yeniden-numarala') return new Response(JSON.stringify(esleme), { status: 200 });
    return new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'yok' }), { status: 404 });
  }));
  return istekler;
}
const goster = (dugum: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BildirimSaglayici><MemoryRouter>{dugum}</MemoryRouter></BildirimSaglayici>
  </QueryClientProvider>,
);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('raf kodlama ekranı (3168)', () => {
  it('cephe sıra numaralı kodda gözün kodunu yazar, kat adı yazmaz; öbür kodlamada kat adı kalır', () => {
    goster(<BolmeCephesi raf={raf([1, 2, 5, 6])} bolme={2} stok={null} secili={null} sec={() => {}} />);
    const c = screen.getByRole('group', { name: 'ORNA gözleri ORNA5–ORNA6 önden' });
    expect(within(c).getByText('ORNA5')).toBeTruthy();
    expect(within(c).queryByText('K1')).toBeNull();
    cleanup();
    goster(<BolmeCephesi raf={raf(null)} bolme={2} stok={null} secili={null} sec={() => {}} />);
    expect(within(screen.getByRole('group', { name: 'ORNA bölme 2 önden' })).getByText('K1')).toBeTruthy();
  });

  it('sırası bozuk rafta yeniden numarala tehlikeli onayla çağrılır; pencere tehlike uyarısıyla açılır', async () => {
    const istekler = kur(['sayfa.stok', 'stok.tanim', 'sayfa.etiket-merkezi']);
    goster(<RafKodlamaSatiri raf={raf([1, 2, 5, 6])} stok={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeniden numarala' }));
    const onay = await screen.findByRole('dialog', { name: 'ORNA rafı yeniden numaralansın mı?' });
    expect(within(onay).getByText('2 gözün kodu değişir. Stok yerinde kalır.')).toBeTruthy();
    expect(within(onay).getByText('ORNA5 → ORNA3')).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: 'Yeniden numarala' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/harita-raflari/3/yeniden-numarala')).toBe(true));
    const p = await screen.findByRole('dialog', { name: 'Konum kodu değişti' });
    expect(within(p).getByRole('alert').textContent).toContain('2 gözün kodu değişti. Eski etiketler başka gözü gösterir; okutmayın.');
  });

  it('sırası düzgün rafta ve öbür kodlamada satır yok; stok tanımı olmayan düğmeyi görmez', async () => {
    kur(['sayfa.stok']);
    const { container } = goster(<RafKodlamaSatiri raf={raf([1, 2, 3, 4])} stok={null} />);
    expect(container.querySelector('.tc-atolye-kodlama')).toBeNull();
    cleanup();
    goster(<RafKodlamaSatiri raf={raf(null)} stok={null} />);
    expect(screen.queryByText(/sonradan göz eklendi/)).toBeNull();
    cleanup();
    goster(<RafKodlamaSatiri raf={raf([1, 2, 5, 6])} stok={null} />);
    expect(await screen.findByText(/sonradan göz eklendi/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeniden numarala' })).toBeNull();
  });
});
