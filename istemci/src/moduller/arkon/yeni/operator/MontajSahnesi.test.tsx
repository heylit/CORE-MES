import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MontajSahnesi } from './MontajSahnesi.tsx';

// İzleyici ağırdır (3B): yerine aldığı veriyi yazan benzeri.
vi.mock('../../../belge-merkezi/goruntu/montaj/Izleyici.tsx', () => ({
  default: ({ ilkSira, adimlar, veri }: { ilkSira: number; adimlar: { baslik: string }[]; veri: Uint8Array }) =>
    <p>{`izleyici ${String(ilkSira)} ${String(adimlar.length)} ${String(veri.length)}`}</p>,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Uydurma veri: işin talimatı 2. sürüm, sahne 1. adımda bir parça; 1. adım yapılmış.
const hareket = { parcalar: [0], yon: '+Z', mesafeMm: 80, sureSn: 1.6, sirali: false, kamera: null };
const SAHNE = { talimatSurum: 2, sahneSurum: 1, modelRevizyonId: 41, adimlar: [{ sira: 1, hareket }], yazan: { id: 1, ad: 'Deneme 1' }, yazma: '2026-11-13T11:00:00.000Z' };
const ADIMLAR = [{ sira: 1, ad: 'Tabanı koy', tamam: true }, { sira: 2, ad: 'Pimleri tak', tamam: false }];

function sunucu(sahne: unknown) {
  const istenen: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    istenen.push(String(adres));
    if (String(adres).endsWith('/sahne-modeli')) return new Response(new Uint8Array([73, 83, 79]), { status: 200 });
    return new Response(JSON.stringify({ sahne }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return istenen;
}

describe('terminal 3B montaj düğmesi (3209 a, 3213)', () => {
  it('sahnesi olmayan işte düğme çıkmaz', async () => {
    const istenen = sunucu(null);
    render(<MontajSahnesi isEmriId={51} adimlar={ADIMLAR} />);
    await vi.waitFor(() => { expect(istenen).toHaveLength(1); });
    expect(istenen[0]).toMatch(/\/arkon\/is-emirleri\/51\/sahne$/);
    expect(screen.queryByRole('button', { name: '3B montaj' })).toBeNull();
  });

  it('düğme modeli yalnız işin ucundan, açılınca indirir; izleyici ilk yapılmamış adımda açılır', async () => {
    const istenen = sunucu(SAHNE);
    render(<MontajSahnesi isEmriId={51} adimlar={ADIMLAR} />);
    fireEvent.click(await screen.findByRole('button', { name: '3B montaj' }));
    expect(await screen.findByText('izleyici 2 2 3')).toBeTruthy();
    expect(istenen.map((a) => a.replace(/^.*\/api/, ''))).toEqual(['/arkon/is-emirleri/51/sahne', '/arkon/is-emirleri/51/sahne-modeli']);
  });
});
