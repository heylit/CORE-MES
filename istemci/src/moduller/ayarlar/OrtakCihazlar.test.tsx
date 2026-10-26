import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OrtakCihaz } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { SistemAyarlari } from './SistemAyarlari.tsx';

// Sunucunun gerçek cevap biçimi; değerler denemedir.
const TERMINAL: OrtakCihaz = { id: 7, ad: 'Deneme terminali', kaydedenKisiId: 1, kaydedildi: '2026-10-13T23:00:00.000Z', buCihaz: false };
const ADI_VAR = { kod: 'CAKISMA', mesaj: 'Bu adda açık bir ortak cihaz var.' } satisfies HataGovdesi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(cihazlar: OrtakCihaz[], kaydet: (govde: unknown) => Response = () => json(404, {})) {
  const istekler: { yontem: string; yol: string; govde?: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek.method ?? 'GET';
    const govde: unknown = secenek.body === undefined ? undefined : JSON.parse(secenek.body);
    istekler.push({ yontem, yol, ...(govde === undefined ? {} : { govde }) });
    if (yol === '/ayarlar') return json(200, { ayarlar: [] });
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    if (yol === '/oturum/ortak-cihazlar' && yontem === 'GET') return json(200, { cihazlar });
    if (yol === '/oturum/ortak-cihazlar') return kaydet(govde);
    if (yol === `/oturum/ortak-cihazlar/${String(TERMINAL.id)}/kapat`) return json(200, { tamam: true });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(islemler: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><SistemAyarlari ekranlar={[]} /></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const YONETICI: Islem[] = ['sayfa.ayarlar', 'ayarlar.yaz', 'oturum.ortak-cihaz'];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Sistem Ayarları, ortak cihazlar', () => {
  it('sekme yalnız ortak cihaz işlemi olana görünür; olmayanın ekranı listeyi istemez', async () => {
    const istekler = sunucuKur([TERMINAL]);
    ac(['sayfa.ayarlar', 'ayarlar.yaz']);
    await screen.findByRole('tab', { name: 'Genel' });
    expect(screen.queryByRole('tab', { name: 'Ortak cihazlar' })).toBeNull();
    expect(istekler.some((i) => i.yol === '/oturum/ortak-cihazlar')).toBe(false);
    cleanup();
    ac(YONETICI);
    expect(await screen.findByRole('tab', { name: 'Ortak cihazlar' })).toBeTruthy();
  });

  it('kişisel cihazda adı alıp bu cihazı kaydeder; sunucunun reddi bildirilir', async () => {
    let cevap = () => json(409, ADI_VAR);
    const istekler = sunucuKur([TERMINAL], () => cevap());
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Ortak cihazlar' }));
    expect(await screen.findByText('Bu cihaz kişisel')).toBeTruthy();
    expect(screen.getByText('Deneme terminali')).toBeTruthy();
    const dugme = screen.getByRole('button', { name: /Bu cihazı ortak cihaz yap/ }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Cihaz adı'), { target: { value: '  Deneme terminali  ' } });
    fireEvent.click(dugme);
    expect(await screen.findByText(ADI_VAR.mesaj)).toBeTruthy();
    cevap = () => json(200, { cihaz: { ...TERMINAL, id: 8, ad: 'Freze tableti', buCihaz: true } });
    fireEvent.change(screen.getByLabelText('Cihaz adı'), { target: { value: 'Freze tableti' } });
    fireEvent.click(dugme);
    expect(await screen.findByText(/"Freze tableti" adıyla ortak cihaz oldu/)).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([
      { yontem: 'POST', yol: '/oturum/ortak-cihazlar', govde: { ad: 'Deneme terminali' } },
      { yontem: 'POST', yol: '/oturum/ortak-cihazlar', govde: { ad: 'Freze tableti' } },
    ]);
  });

  it('ortak cihazda kayıt formu yoktur ve satırı işaretlenir', async () => {
    sunucuKur([{ ...TERMINAL, buCihaz: true }]);
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Ortak cihazlar' }));
    expect(await screen.findByText('Bu cihaz ortak')).toBeTruthy();
    expect(screen.getByText('Bu cihaz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bu cihazı ortak cihaz yap/ })).toBeNull();
  });

  it('iptal önce onay ister, sonra kapat komutunu gönderir', async () => {
    const istekler = sunucuKur([TERMINAL]);
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Ortak cihazlar' }));
    fireEvent.click(await screen.findByRole('button', { name: `${TERMINAL.ad} iptal et` }));
    const pencere = await screen.findByRole('dialog');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => {
      expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual([`/oturum/ortak-cihazlar/${String(TERMINAL.id)}/kapat`]);
    });
    expect(await screen.findByText(/artık ortak cihaz değil/)).toBeTruthy();
  });
});
