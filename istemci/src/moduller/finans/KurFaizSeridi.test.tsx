import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { KurFaizOzeti } from '#paylasilan/sozlesme/finans.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { KurFaizSeridi } from './disari.ts';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
// Kişi ve kurlar uydurmadır.
const OZET: KurFaizOzeti = {
  bugun: '2026-10-13',
  kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-13', kur: '41.500000', girenAd: 'Deneme Satinalma', giris: '2026-10-13T06:44:00.000Z' }],
  faizler: [{ paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', aylikYuzde: '3.5000', girenAd: 'Deneme Muhasebe', giris: '2026-10-01T07:00:00.000Z' }],
  sonGiris: { tur: 'kur', giris: '2026-10-13T06:44:00.000Z', girenAd: 'Deneme Satinalma' },
};

function sunucuKur(islemler: string[]) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme', islemler } });
    if (yol === '/finans/kur-ozeti') return json(200, OZET);
    if (yol === '/finans/kurlar/ekle') return json(200, { paraBirimi: 'USD', tarih: '2026-10-13' });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><KurFaizSeridi /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('KurFaizSeridi (kart #953)', () => {
  it('finans.kur-yaz son girişi, kişileri gösterir ve kuru kaydeder; finans rakamı okumaz', async () => {
    const istekler = sunucuKur(['finans.kur-yaz', 'musteri-tedarikci.oku']);
    ac();
    const son = await screen.findByText(/Son giriş:/);
    expect(son.textContent).toBe('Son giriş: bugün 09:44, Deneme Satinalma (kur)');
    expect(screen.getByText(/USD 41,5 · bugün · Deneme Satinalma/)).toBeTruthy();
    expect(screen.getByText(/TRY faiz %3,5\/ay · 01.10.2026 · Deneme Muhasebe/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Kur \(TRY\)/), { target: { value: '41,75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kuru kaydet' }));
    await vi.waitFor(() => expect(istekler.some((i) => i.yol === '/finans/kurlar/ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/finans/kurlar/ekle')?.govde).toEqual({ paraBirimi: 'USD', tarih: '2026-10-13', kur: 41.75 });
    expect(istekler.some((i) => i.yol.startsWith('/finans/') && !['/finans/kur-ozeti', '/finans/kurlar/ekle'].includes(i.yol))).toBe(false);
  });

  it('FNS-40: faiz kaydı istek kimliğiyle gider; cevabı gelmeyen gönderim aynı kimlikle yinelenir, sonraki kayıt yeni kimlik alır', async () => {
    const faizKimlikleri: (string | null)[] = [];
    let kopar = true;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yol = adres.replace('/api', '');
      if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme', islemler: ['finans.kur-yaz'] } });
      if (yol === '/finans/kur-ozeti') return json(200, OZET);
      if (yol === '/finans/faizler/ekle') {
        faizKimlikleri.push(new Headers(secenek?.headers).get(ISTEK_KIMLIGI_BASLIGI));
        if (kopar) { kopar = false; throw new TypeError('ağ koptu'); }
        return json(200, { paraBirimi: 'TRY', tarih: '2026-10-13' });
      }
      return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    }));
    ac();
    const kaydet = async (deger: string) => {
      fireEvent.change(await screen.findByLabelText(/Aylık faiz/), { target: { value: deger } });
      fireEvent.click(screen.getByRole('button', { name: 'Faizi kaydet' }));
    };
    await kaydet('3,6');
    await vi.waitFor(() => expect(faizKimlikleri).toHaveLength(2), { timeout: 4000 });
    await vi.waitFor(() => expect((screen.getByLabelText(/Aylık faiz/) as HTMLInputElement).value).toBe(''));
    await kaydet('3,7');
    await vi.waitFor(() => expect(faizKimlikleri).toHaveLength(3));
    const [ilk, yineleme, sonraki] = faizKimlikleri;
    expect(ilk).toMatch(/^[0-9a-f-]{36}$/);
    expect(yineleme).toBe(ilk);
    expect(sonraki).not.toBe(ilk);
  });

  it('finans.oku değerleri görür ama giriş formu almaz; ikisi de yoksa şerit çizilmez ve istek gitmez', async () => {
    sunucuKur(['finans.oku']);
    ac();
    await screen.findByText(/Son giriş:/);
    expect(screen.queryByRole('button', { name: 'Kuru kaydet' })).toBeNull();
    cleanup();
    const istekler = sunucuKur(['musteri-tedarikci.oku']);
    ac();
    await vi.waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(screen.queryByText('Günlük kur ve faiz')).toBeNull();
    expect(istekler.some((i) => i.yol === '/finans/kur-ozeti')).toBe(false);
  });
});
