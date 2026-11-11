import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { HazirlikMaddeleriCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { EkHazirlikMaddeleri } from './EkHazirlikMaddeleri.tsx';

// 2227-1 b: iş emrine özel hazırlık maddesi, Üretim Hazırlık Yayınla sekmesinde. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const HAZIRLIK: Kullanici = { id: 4, ad: 'Deneme Hazirlik', islemler: ['sayfa.arkon', 'arkon.hazirlik'] };
const PLANLAMA: Kullanici = { id: 6, ad: 'Deneme Planlama', islemler: ['sayfa.arkon', 'arkon.planlama'] };
const OPERATOR: Kullanici = { id: 8, ad: 'Deneme Operator', islemler: ['sayfa.arkon', 'arkon.operator'] };
const ZAMAN = '2026-11-07T10:00:00+03:00';
const cevap = (ek: Partial<HazirlikMaddeleriCevabi> = {}): HazirlikMaddeleriCevabi => ({
  isEmriId: 730, kapali: false,
  maddeler: [
    { id: 1, ad: 'Bağlama aparatını getir', ekleyenAdi: 'Deneme Hazirlik', eklenme: ZAMAN, tamam: true, tamamlayanAdi: 'Deneme Hazirlik', tamamlanma: ZAMAN },
    { id: 2, ad: 'Ölçü aletini ayarla', ekleyenAdi: 'Deneme Hazirlik', eklenme: ZAMAN, tamam: false, tamamlayanAdi: null, tamamlanma: null },
  ],
  ...ek,
});
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function kur(kullanici: Kullanici, ilk: HazirlikMaddeleriCevabi, yazma?: (yol: string, govde: unknown) => Response) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici });
    if (yontem === 'GET' && yol === '/arkon/hazirlik-maddeleri?isEmriId=730') return json(200, ilk);
    if (yontem === 'POST' && yazma) return yazma(yol, govde);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const degisti = vi.fn();
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><EkHazirlikMaddeleri isEmriId={730} degisti={degisti} /></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return { istekler, degisti };
}

describe('Ek hazırlık maddeleri (2227-1 b)', () => {
  it('hazırlık ekler, işaretler ve kaldırır; her yazımdan sonra matris yenilenir', async () => {
    const { istekler, degisti } = kur(HAZIRLIK, cevap(), () => json(200, cevap({ maddeler: [] })));
    expect(await screen.findByText('1 / 2 tamam')).toBeTruthy();
    expect(screen.getByText('Tamamlayan: Deneme Hazirlik')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tamamlandı' }));
    await waitFor(() => expect(degisti).toHaveBeenCalledTimes(1));
    expect(istekler.at(-1)).toEqual({ yontem: 'POST', yol: '/arkon/hazirlik-maddeleri/2/isaretle', govde: { olay: 'tamamla' } });
    await screen.findByText('Madde yok');
    fireEvent.change(screen.getByRole('textbox', { name: 'Yeni hazırlık maddesi' }), { target: { value: '  Kalıbı ısıt  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(degisti).toHaveBeenCalledTimes(2));
    expect(istekler.at(-1)).toEqual({ yontem: 'POST', yol: '/arkon/hazirlik-maddeleri', govde: { isEmriId: 730, ad: 'Kalıbı ısıt' } });
  });

  it('sunucu reddi bildirimle görünür, matris yenilenmez', async () => {
    const { degisti } = kur(HAZIRLIK, cevap(), () => json(409, { kod: 'CAKISMA', mesaj: 'Bitmiş iş emrinde hazırlık maddesi değişmez.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ölçü aletini ayarla: kaldır' }));
    expect(await screen.findByText('Bitmiş iş emrinde hazırlık maddesi değişmez.')).toBeTruthy();
    expect(degisti).not.toHaveBeenCalled();
  });

  it('planlama yalnız görür; bitmiş iş emrinde düzenleme yok; operatöre liste hiç gelmez', async () => {
    kur(PLANLAMA, cevap());
    expect(await screen.findByText('Ölçü aletini ayarla')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tamamlandı' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    cleanup();
    kur(HAZIRLIK, cevap({ kapali: true }));
    expect(await screen.findByText('İş emri bitti; maddeler değişmez.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Geri al' })).toBeNull();
    cleanup();
    const { istekler } = kur(OPERATOR, cevap());
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(istekler.some((i) => i.yol.startsWith('/arkon/hazirlik-maddeleri'))).toBe(false);
    expect(screen.queryByText('Ek hazırlık maddeleri')).toBeNull();
  });
});
