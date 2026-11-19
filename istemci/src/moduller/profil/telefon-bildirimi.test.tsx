import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarBaytlari, type PushOrtami } from './telefon-bildirimi.ts';
import { TelefonBildirimiKarti } from './TelefonBildirimi.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(yollar: Record<string, () => Response>) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined });
    const isle = yollar[`${yontem} ${yol}`];
    return isle ? isle() : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ADR 0031, 3435-1: kişi bu cihazın telefon bildirimini Profilim'de kendisi açar ve kapatır; açılamıyorsa nedeni yazılır.
describe('uygulama kapalıyken cihaz bildirimi (Web Push)', () => {
  const UC = 'https://fcm.googleapis.com/fcm/send/deneme';
  function pushSahte(destek = true, baslangic: string | null = null, izin: 'granted' | 'denied' | 'default' = 'default') {
    let mevcut = baslangic;
    const ortam: PushOrtami = {
      destek,
      izin: vi.fn(() => (destek ? izin : null)),
      mevcut: vi.fn(() => Promise.resolve(mevcut)),
      aboneOl: vi.fn(() => { mevcut = UC; return Promise.resolve(UC); }),
      birak: vi.fn(() => { const m = mevcut; mevcut = null; return Promise.resolve(m); }),
    };
    return ortam;
  }
  function cihazAc(push: PushOrtami) {
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <MemoryRouter initialEntries={['/profil']}><TelefonBildirimiKarti push={push} /></MemoryRouter>
        </BildirimSaglayici>
      </QueryClientProvider>,
    );
  }
  const DURUM = { acik: true, acikAnahtar: 'BAAA', cihazSayisi: 0 };

  it('açınca izin ister, abone olur ve adresi sunucuya yazar; kapatınca bırakır ve siler', async () => {
    const istekler = sunucuKur({
      'GET /bildirimler/push': () => json(200, DURUM),
      'POST /bildirimler/push/abone-ol': () => json(200, { ...DURUM, cihazSayisi: 1 }),
      'POST /bildirimler/push/abonelik-sil': () => json(200, DURUM),
    });
    const push = pushSahte();
    cihazAc(push);
    const anahtar = await screen.findByRole('switch', { name: 'Uygulama kapalıyken bu cihaza bildir' });
    expect(anahtar.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/içeriği şirket dışına çıkmaz/)).toBeTruthy();
    fireEvent.click(anahtar);
    await waitFor(() => expect(istekler.find((i) => i.yol === '/bildirimler/push/abone-ol')?.govde).toEqual({ ucNokta: UC }));
    expect(push.aboneOl).toHaveBeenCalledWith('BAAA');
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Uygulama kapalıyken bu cihaza bildir' }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(screen.getByRole('switch', { name: 'Uygulama kapalıyken bu cihaza bildir' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/bildirimler/push/abonelik-sil')?.govde).toEqual({ ucNokta: UC }));
  });

  it('sunucuda kapalı, tarayıcı desteklemiyor ya da izin reddedilmişse anahtar yerine nedeni yazılır; yönetici notu her durumda durur', async () => {
    const anahtarYok = () => expect(screen.queryByRole('switch', { name: 'Uygulama kapalıyken bu cihaza bildir' })).toBeNull();
    const istekler = sunucuKur({ 'GET /bildirimler/push': () => json(200, { acik: false, acikAnahtar: null, cihazSayisi: 0 }) });
    cihazAc(pushSahte());
    expect(await screen.findByText('Telefon bildirimi sistemde kapalı.')).toBeTruthy();
    expect(screen.getByText(/sistem yöneticiniz belirler/)).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/bildirimler/push')).toBe(true);
    anahtarYok();
    cleanup();
    const ikinci = sunucuKur({ 'GET /bildirimler/push': () => json(200, DURUM) });
    cihazAc(pushSahte(false));
    expect(await screen.findByText(/Bu tarayıcı telefon bildirimini desteklemiyor/)).toBeTruthy();
    expect(screen.getByText(/sistem yöneticiniz belirler/)).toBeTruthy();
    expect(ikinci.some((i) => i.yol === '/bildirimler/push')).toBe(false);
    anahtarYok();
    cleanup();
    sunucuKur({ 'GET /bildirimler/push': () => json(200, DURUM) });
    cihazAc(pushSahte(true, null, 'denied'));
    expect(await screen.findByText(/bildirim izni kapalı/)).toBeTruthy();
    anahtarYok();
  });

  it('açık anahtar base64url çözülür', () => {
    expect([...anahtarBaytlari('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});
