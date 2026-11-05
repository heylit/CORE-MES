import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { DosyalarCevabi, GecmisCevabi, Klasor, KlasorlerCevabi, OrtakDosya, YetkiCevabi } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '../../ortak/veri/api.ts';
import { OrtakDosyalar, type Gorunum } from './OrtakDosyalar.tsx';

vi.mock('../belge-merkezi/disari.ts', () => ({ DosyaHatasi: class extends Error {}, dosyaYukle: vi.fn(async () => 'a'.repeat(64)) }));

const klasor = (k: Partial<Klasor> & { id: number; ad: string }): Klasor => ({ ustId: null, ozelYetki: false, duzey: 'gorur', dosyaSayisi: 0, surum: 1, ...k });
const ORTAK = klasor({ id: 1, ad: 'Ortak', ozelYetki: true });
const DUYURU = klasor({ id: 2, ustId: 1, ad: 'Duyurular', dosyaSayisi: 1 });
const DOSYA: OrtakDosya = {
  id: 9, klasorId: 2, klasorYolu: ['Ortak', 'Duyurular'], ad: 'Plan.pdf', surumSirasi: 2, boyut: 182000, yukleyenAd: 'Kişi A',
  zaman: '2026-11-03T08:12:00Z', arsiv: false, surum: 1,
};
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

interface Cagri { yol: string; yontem: string; govde: unknown; kimlik: string | null }

function sunucuKur(yonetici: boolean, duzey: Klasor['duzey']) {
  const cagrilar: Cagri[] = [];
  const kl = [{ ...ORTAK, duzey }, { ...DUYURU, duzey }];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({
      yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined, kimlik: new Headers(secenek?.headers).get(ISTEK_KIMLIGI_BASLIGI),
    });
    if (yol === '/ortak-dosyalar/klasorler' && yontem === 'GET') return json(200, { klasorler: kl, yonetici, arsivSayisi: 0 } satisfies KlasorlerCevabi);
    if (yol === '/ortak-dosyalar/klasorler' && yontem === 'POST') return json(200, klasor({ id: 3, ustId: 1, ad: 'Yeni', duzey }));
    if (yol === '/ortak-dosyalar/klasorler/1/dosyalar') {
      return json(200, { klasor: kl[0], altKlasorler: [kl[1]], dosyalar: [] } as unknown as DosyalarCevabi);
    }
    if (yol === '/ortak-dosyalar/klasorler/2/dosyalar') return json(200, { klasor: kl[1], altKlasorler: [], dosyalar: [DOSYA] } as unknown as DosyalarCevabi);
    if (yol === '/ortak-dosyalar/klasorler/1/yetki') {
      return json(200, {
        klasorId: 1, ozelYetki: true, kaynakId: 1, kaynakAd: 'Ortak', surum: 4,
        roller: [{ id: 1, ad: 'Yönetici', yonetici: true }, { id: 5, ad: 'Kalite', yonetici: false }], satirlar: [{ rolId: 5, duzey: 'gorur' }],
      } satisfies YetkiCevabi);
    }
    if (yol === '/ortak-dosyalar/klasorler/1/gecmis') {
      return json(200, { olaylar: [{ olay: 'klasor-acildi', kisiAd: 'Kişi A', zaman: '2026-11-01T08:00:00Z', dosyaAdi: null, surumSirasi: null }] } satisfies GecmisCevabi);
    }
    if (yol === '/ortak-dosyalar/son-eklenenler') return json(200, { dosyalar: [DOSYA] });
    if (yol === '/ortak-dosyalar/arsiv') return json(200, { dosyalar: [] });
    return json(404, { kod: 'BULUNAMADI', mesaj: yol });
  }));
  return cagrilar;
}

function ciz(gorunum: Gorunum = 'klasorler') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter><OrtakDosyalar gorunum={gorunum} /></MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Ortak Dosyalar ekranı', () => {
  it('ağaç sunucunun verdiği klasörleri çizer; Yetkiler sekmesi yalnız yöneticide', async () => {
    sunucuKur(false, 'gorur');
    ciz();
    expect(await screen.findByRole('button', { name: /Duyurular/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Yetkiler/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Geçmiş/ })).toBeTruthy();
  });

  it('görür düzeyinde yükleme düğmesi pasif, alt klasör düğmesi ve kök klasör düğmesi yok', async () => {
    sunucuKur(false, 'gorur');
    ciz();
    const yukle = await screen.findByRole('button', { name: /Dosya yükle/ });
    expect((yukle as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Alt klasör/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Üst düzeyde klasör aç/ })).toBeNull();
  });

  it('yönetici alt klasör açar: istek kimliğiyle tek POST, gövde üst klasör ve ad', async () => {
    const cagrilar = sunucuKur(true, 'yonetir');
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: /Alt klasör/ }));
    fireEvent.change(screen.getByLabelText(/Klasör adı/), { target: { value: '  Yeni  ' } });
    fireEvent.click(screen.getByRole('button', { name: /^Aç$/ }));
    await waitFor(() => expect(cagrilar.filter((c) => c.yontem === 'POST')).toHaveLength(1));
    const post = cagrilar.find((c) => c.yontem === 'POST');
    expect(post?.govde).toEqual({ ustId: 1, ad: 'Yeni' });
    expect(post?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('yetki sekmesi: yönetici satırı sabit; düzey değişince Kaydet sürümle gider', async () => {
    const cagrilar = sunucuKur(true, 'yonetir');
    ciz();
    fireEvent.click(await screen.findByRole('tab', { name: /Yetkiler/ }));
    expect(await screen.findByText('Her klasörü yönetir')).toBeTruthy();
    const grup = screen.getByRole('group', { name: /Kalite yetki düzeyi/ });
    fireEvent.click(within(grup).getByRole('button', { name: 'Ekler' }));
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST' && c.yol === '/ortak-dosyalar/klasorler/1/yetki')).toBe(true));
    const post = cagrilar.find((c) => c.yontem === 'POST' && c.yol === '/ortak-dosyalar/klasorler/1/yetki');
    expect(post?.govde).toEqual({ surum: 4, ozelYetki: true, satirlar: [{ rolId: 5, duzey: 'ekler' }] });
  });

  it('Son eklenenler klasör yolunu gösterir; sürümü birden çok olan dosyada sürüm listesi açılır', async () => {
    sunucuKur(false, 'gorur');
    ciz('son');
    expect(await screen.findByText('Ortak / Duyurular')).toBeTruthy();
    expect(screen.getByRole('button', { name: 's2' })).toBeTruthy();
  });

  it('Geçmiş sekmesi olayları kişisiyle listeler', async () => {
    sunucuKur(false, 'gorur');
    ciz();
    fireEvent.click(await screen.findByRole('tab', { name: /Geçmiş/ }));
    expect(await screen.findByText(/Kişi A: Klasör açtı/)).toBeTruthy();
  });
});
