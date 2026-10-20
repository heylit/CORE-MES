import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KayitIcerigiCevabi, KayitListesiCevabi, KayitSatiri, SuzgecSecenekleriCevabi } from '#paylasilan/sozlesme/denetim.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { DenetimKaydi } from './DenetimKaydi.tsx';

const MUDUR: Kullanici = { id: 2, ad: 'Deneme Müdür', islemler: ['sayfa.denetim', 'denetim.oku'] };
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.denetim', 'denetim.oku', 'denetim.govde-oku'] };

const SATIRLAR: KayitSatiri[] = [
  { id: 12, zaman: '2026-10-07T10:00:00.000+03:00', kisiId: 2, kisiAd: 'Deneme Müdür', yontem: 'POST', yol: '/uretim-emirleri/:id/baslat', kimlikler: { id: 41 } },
  { id: 11, zaman: '2026-10-07T09:00:00.000+03:00', kisiId: null, kisiAd: null, yontem: 'POST', yol: '/oturum/giris', kimlikler: {} },
];
const SECENEKLER = {
  kisiler: [{ id: 2, ad: 'Deneme Müdür' }],
  komutlar: [{ yontem: 'POST', yol: '/oturum/giris' }, { yontem: 'POST', yol: '/uretim-emirleri/:id/baslat' }],
} satisfies SuzgecSecenekleriCevabi;
const ICERIK = { id: 12, parametre: { id: 41 }, govde: { not: '<b>kalın değil</b>', parola: '[gizli]' } } satisfies KayitIcerigiCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/denetim-kayitlari/suzgecler') return json(200, SECENEKLER);
    if (yol === '/denetim-kayitlari/12/govde') {
      return kullanici.islemler.includes('denetim.govde-oku') ? json(200, ICERIK) : json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' });
    }
    if (yol.startsWith('/denetim-kayitlari?')) {
      const kisi = new URL(yol, 'http://x').searchParams.get('kisi');
      const satirlar = kisi === null ? SATIRLAR : SATIRLAR.filter((s) => String(s.kisiId) === kisi);
      return json(200, { satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 } satisfies KayitListesiCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yollar;
}

function ac() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DenetimKaydi /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DenetimKaydi', () => {
  it('listede zaman, kişi, komut ve kayıt kimliği görünür; oturumsuz komut kişisiz yazılır; yazma düğmesi yok', async () => {
    sunucuKur(MUDUR);
    ac();
    expect(await screen.findByRole('cell', { name: 'POST /uretim-emirleri/:id/baslat' })).toBeTruthy();
    expect(screen.getByText('id 41')).toBeTruthy();
    expect(screen.getByText('Oturumsuz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sil|kaydet|düzenle/i })).toBeNull();
  });

  it('kişi süzgeci sunucuya kisi olarak gider ve listeyi daraltır', async () => {
    const yollar = sunucuKur(MUDUR);
    ac();
    await screen.findByText('Oturumsuz');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Deneme Müdür' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Kişi'), { target: { value: '2' } });
    await waitFor(() => expect(screen.queryByText('Oturumsuz')).toBeNull());
    expect(yollar.some((y) => y.includes('kisi=2'))).toBe(true);
    fireEvent.change(screen.getByLabelText('İşlem'), { target: { value: 'POST /oturum/giris' } });
    await waitFor(() => expect(yollar.some((y) => y.includes('yontem=POST') && y.includes(`yol=${encodeURIComponent('/oturum/giris')}`))).toBe(true));
  });

  it('içerik yetkisi olmayan satırı açınca "İçerik görme yetkiniz yok" görür; gövde ucu çağrılmaz', async () => {
    const yollar = sunucuKur(MUDUR);
    ac();
    fireEvent.click(await screen.findByRole('cell', { name: 'POST /uretim-emirleri/:id/baslat' }));
    expect(await screen.findByText('İçerik görme yetkiniz yok.')).toBeTruthy();
    expect(yollar.some((y) => y.includes('/govde'))).toBe(false);
  });

  it('içerik yetkisi olan gövdeyi maskeli ve düz metin olarak görür', async () => {
    const yollar = sunucuKur(YONETICI);
    ac();
    await screen.findByText('Oturumsuz');
    await waitFor(() => expect(yollar).toContain('/oturum'));
    fireEvent.click(screen.getByRole('cell', { name: 'POST /uretim-emirleri/:id/baslat' }));
    const govde = await screen.findByText(/kalın değil/);
    expect(govde.textContent).toContain('<b>kalın değil</b>');
    expect(govde.textContent).toContain('[gizli]');
    expect(screen.queryByText('İçerik görme yetkiniz yok.')).toBeNull();
  });
});
