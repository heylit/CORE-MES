import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BildirimSaglayici } from '../../../ortak/arayuz/Bildirim.tsx';
import { AdimliForm, TASLAK_ONEKI, eksikler, ilkDegerler, taslakOku, type KmAlan } from './AdimliForm.tsx';
import { YONETICI, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const ALANLAR: KmAlan[] = [
  { k: 'parcaNo', etiket: 'Parça no', zorunlu: true },
  { k: 'aciklama', etiket: 'Açıklama', tur: 'cokSatir' },
];

function ac(kaydet = vi.fn(), ozellik: Partial<Parameters<typeof AdimliForm>[0]> = {}) {
  sunucuKur(YONETICI);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <BildirimSaglayici>
        <AdimliForm baslik="Deneme" alanlar={ALANLAR} kaydet={kaydet} kapat={() => {}} {...ozellik} />
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return kaydet;
}

describe('AdimliForm yardımcıları', () => {
  it('varsayılanı ve ilk değeri birleştirir, boş zorunluyu bulur', () => {
    const d = ilkDegerler([{ k: 'a', etiket: 'A', varsayilan: () => 'v' }, { k: 'b', etiket: 'B', zorunlu: true }], { b: '' }, {});
    expect(d.a).toBe('v');
    expect(eksikler([{ k: 'b', etiket: 'B', zorunlu: true }], d).map((a) => a.k)).toEqual(['b']);
  });

  it('süresi geçmiş taslağı okumaz', () => {
    localStorage.setItem(`${TASLAK_ONEKI}x`, JSON.stringify({ t: 0, d: { a: 1 } }));
    expect(taslakOku('x', 8 * 24 * 3600 * 1000)).toBeNull();
  });
});

describe('AdimliForm', () => {
  it('zorunlu alan boşken kaydetmez, doluyken toplanan veriyle kaydeder', async () => {
    const kaydet = ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kaydet' }));
    expect(kaydet).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Parça no/), { target: { value: 'P-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kaydet).toHaveBeenCalledTimes(1));
    expect(kaydet.mock.calls[0]?.[0]).toMatchObject({ parcaNo: 'P-1' });
  });

  it('adımlı formda İleri ile ilerler', async () => {
    ac(vi.fn(), { adimlar: [{ baslik: 'Birinci', alanlar: ['parcaNo'] }, { baslik: 'İkinci', alanlar: ['aciklama'] }] });
    fireEvent.click(await screen.findByRole('button', { name: 'İleri' }));
    expect(await screen.findByLabelText(/Açıklama/)).toBeTruthy();
  });
});
