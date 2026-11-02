import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api, ApiHatasi, ISTEK_KIMLIGI_BASLIGI } from './api.ts';
import { useKorumaliKomut, useTekGonderim } from './korumali-komut.ts';

type Adim = { durum: number; govde: unknown };

// Sırayla verilen cevapları dönen sunucu; her cevap ancak `birak` çağrılınca gelir (istek sürerken çift tık sınanır).
function sunucu(...adimlar: Adim[]) {
  const bekleyen: (() => void)[] = [];
  const sahte = vi.fn((_adres: string, _ayar: RequestInit) => {
    const adim = adimlar[Math.min(sahte.mock.calls.length, adimlar.length) - 1]!;
    return new Promise<Response>((coz) => {
      bekleyen.push(() => { coz(new Response(JSON.stringify(adim.govde), { status: adim.durum })); });
    });
  });
  vi.stubGlobal('fetch', sahte);
  const kimlikler = () => sahte.mock.calls.map(([, ayar]) => (ayar.headers as Record<string, string>)[ISTEK_KIMLIGI_BASLIGI]);
  const birak = async () => { await act(async () => { bekleyen.splice(0).forEach((b) => { b(); }); }); };
  return { sahte, kimlikler, birak };
}

const sarmala = (children: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

function Korumali({ tamam, hata }: { tamam?: () => void; hata?: (e: Error) => void }) {
  const k = useKorumaliKomut<{ ad: string }, { id: number }>({
    gonder: (govde, deneme) => api.post<{ id: number }>('/kayitlar', govde, deneme),
    tekrar: { tekrar: 0 },
    ...(tamam ? { onSuccess: tamam } : {}),
    ...(hata ? { onError: hata } : {}),
  });
  return <button type="button" disabled={k.isPending} onClick={() => { k.mutate({ ad: 'Mil' }); }}>Kaydet</button>;
}

const tikla = () => { fireEvent.click(screen.getByRole('button', { name: 'Kaydet' })); };
// Çift tık iki olayı yeniden çizim beklemeden aynı düğmeye verir.
const ciftTikla = () => { const d = screen.getByRole('button', { name: 'Kaydet' }); fireEvent.click(d); fireEvent.click(d); };

afterEach(() => { vi.unstubAllGlobals(); });

describe('useKorumaliKomut', () => {
  it('çift tık tek istek ve tek başarı çağrısı', async () => {
    const s = sunucu({ durum: 200, govde: { id: 1 } });
    const tamam = vi.fn();
    render(sarmala(<Korumali tamam={tamam} />));
    ciftTikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(1); });
    await s.birak();
    await waitFor(() => { expect(tamam).toHaveBeenCalledTimes(1); });
    expect(s.sahte).toHaveBeenCalledTimes(1);
  });

  it('başarıdan sonra ikinci komut yeni kimlikle gider', async () => {
    const s = sunucu({ durum: 200, govde: { id: 1 } });
    const tamam = vi.fn();
    render(sarmala(<Korumali tamam={tamam} />));
    tikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(1); });
    await s.birak();
    await waitFor(() => { expect(tamam).toHaveBeenCalledTimes(1); });
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Kaydet' })).toHaveProperty('disabled', false); });
    tikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(2); });
    await s.birak();
    const [ilk, ikinci] = s.kimlikler();
    expect(ilk).toBeTruthy();
    expect(ikinci).toBeTruthy();
    expect(ikinci).not.toBe(ilk);
  });

  it('sonucu bilinmeyen hatadan (5xx) sonra elle yeniden gönderim aynı kimlikle gider', async () => {
    const s = sunucu({ durum: 503, govde: { kod: 'MESGUL', mesaj: 'Meşgul' } }, { durum: 200, govde: { id: 1 } });
    const hata = vi.fn();
    render(sarmala(<Korumali hata={hata} />));
    tikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(1); });
    await s.birak();
    await waitFor(() => { expect(hata).toHaveBeenCalledTimes(1); });
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Kaydet' })).toHaveProperty('disabled', false); });
    tikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(2); });
    await s.birak();
    const [ilk, ikinci] = s.kimlikler();
    expect(ikinci).toBe(ilk);
  });

  it('sunucunun reddinden (4xx) sonra kimlik yenilenir: düzeltilen form ilk gövdeye takılmaz', async () => {
    const s = sunucu({ durum: 400, govde: { kod: 'DOGRULAMA', mesaj: 'Ad yazın.' } }, { durum: 200, govde: { id: 1 } });
    const hata = vi.fn();
    render(sarmala(<Korumali hata={hata} />));
    tikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(1); });
    await s.birak();
    await waitFor(() => { expect(hata).toHaveBeenCalledTimes(1); });
    expect(hata.mock.calls[0]![0]).toBeInstanceOf(ApiHatasi);
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Kaydet' })).toHaveProperty('disabled', false); });
    tikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(2); });
    await s.birak();
    const [ilk, ikinci] = s.kimlikler();
    expect(ikinci).not.toBe(ilk);
  });
});

function Duz({ tamam }: { tamam: () => void }) {
  const k = useTekGonderim<void, unknown>({ mutationFn: () => api.post('/yayinla', {}), onSuccess: tamam });
  return <button type="button" onClick={() => { k.mutate(); }}>Kaydet</button>;
}

describe('useTekGonderim', () => {
  it('kimliksiz uçta da çift tık tek istek; kilit gönderim bitince kalkar', async () => {
    const s = sunucu({ durum: 200, govde: {} });
    const tamam = vi.fn();
    render(sarmala(<Duz tamam={tamam} />));
    ciftTikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(1); });
    expect(s.kimlikler()[0]).toBeUndefined();
    await s.birak();
    await waitFor(() => { expect(tamam).toHaveBeenCalledTimes(1); });
    tikla();
    await waitFor(() => { expect(s.sahte).toHaveBeenCalledTimes(2); });
    await s.birak();
  });
});
