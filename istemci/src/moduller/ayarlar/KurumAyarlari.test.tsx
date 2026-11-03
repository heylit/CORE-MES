import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KurumLogosuCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { Ayrinti } from '#paylasilan/sozlesme/saglik.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { DERLEME } from '../../ortak/veri/surum.ts';
import { KurumLogosu, SurumBilgisi, logoHazirla } from './KurumAyarlari.tsx';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const AYRINTI: Ayrinti = { veritabaniGecikmeMs: 1, sonGoc: '20261011000000_deneme.sql', commit: 'abcdef1234567', calismaSuresiSn: 5, ortam: 'gelistirme', isler: [], uyarilar: [] };

function sunucuKur(baslangic: string | null, yazma: (govde: { logo: string | null }) => Response = (g) => json(200, g)) {
  const yazilanlar: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/kurum-logosu') return json(200, { logo: baslangic } satisfies KurumLogosuCevabi);
    if (yol === '/kurum-logosu/degistir') {
      const govde = JSON.parse(secenek.body ?? '{}') as { logo: string | null };
      yazilanlar.push(govde);
      return yazma(govde);
    }
    if (yol === '/saglik/ayrinti') return json(200, AYRINTI);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilanlar;
}

function ac(ekran: React.ReactNode, islemler: Islem[] = []) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
  return istemci;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('kurum logosu', () => {
  it('seçilen resim yeniden PNG olarak çizilip gönderilir; okunamayan resim gönderilmez', async () => {
    const ciz = vi.fn(async () => PNG);
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'logo.jpg', { type: 'image/jpeg' });
    expect(await logoHazirla(jpeg, ciz)).toEqual({ logo: PNG });
    expect(ciz).toHaveBeenCalledWith(jpeg);
    expect(await logoHazirla(jpeg, async () => { throw new Error('bozuk'); })).toEqual({ hata: 'Resim okunamadı; dosya bozuk olabilir.' });
  });

  it('dosya seçilince veri adresi uca gider; kaydedilen logo görünür ve ortak anahtara yazılır', async () => {
    const yazilanlar = sunucuKur(null);
    const istemci = ac(<KurumLogosu ciz={async () => PNG} />);
    await screen.findByText('Logo yüklenmedi; TMI işareti görünüyor.');
    const dosya = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Logo dosyası'), { target: { files: [dosya] } });
    await waitFor(() => expect(yazilanlar).toHaveLength(1));
    expect((yazilanlar[0] as { logo: string }).logo).toMatch(/^data:image\/png;base64,/);
    await screen.findByText('Logo kaydedildi.');
    expect(screen.getByRole('img', { name: 'Kurum logosu' })).toBeTruthy();
    expect(istemci.getQueryData<KurumLogosuCevabi>(ortakAnahtarlar.kurumLogosu)?.logo).toMatch(/^data:image\/png/);
  });

  it('kaldırmak null gönderir; sunucunun reddi bildirimde görünür, logo değişmez', async () => {
    const yazilanlar = sunucuKur(PNG, (g) => (g.logo === null ? json(200, g) : json(400, { kod: 'DOGRULAMA', mesaj: 'Logo en çok 140 KB olabilir.' })));
    ac(<KurumLogosu ciz={async () => PNG} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kaldır' }));
    await screen.findByText('Logo kaldırıldı.');
    expect(yazilanlar).toEqual([{ logo: null }]);
    fireEvent.change(screen.getByLabelText('Logo dosyası'), { target: { files: [new File(['x'], 'b.png', { type: 'image/png' })] } });
    await screen.findByText('Logo en çok 140 KB olabilir.');
    expect(screen.queryByRole('img', { name: 'Kurum logosu' })).toBeNull();
  });

  it('PNG, JPEG ve WebP dışındaki dosya okunmadan reddedilir', async () => {
    expect(await logoHazirla(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }))).toEqual({ hata: 'Logo PNG, JPEG ya da WebP olmalı.' });
  });
});

describe('sürüm bölümü', () => {
  it('derleme sürümünü ve tarihini gösterir; sunucu commit ve son göç yalnız sağlık ayrıntısını okuyana', async () => {
    sunucuKur(null);
    ac(<SurumBilgisi />);
    // Güncelleyicinin kurduğu derlemede yayın adı, elle kurulumda package.json yer tutucusu yerine "geliştirme".
    expect(screen.getByText(/^0\.0\.0/.test(DERLEME.surum) ? 'geliştirme' : DERLEME.surum)).toBeTruthy();
    expect(screen.queryByText(`v${DERLEME.surum}`)).toBeNull();
    expect(screen.getByText('Derleme tarihi')).toBeTruthy();
    expect(screen.queryByText('Sunucu commit')).toBeNull();
    cleanup();
    ac(<SurumBilgisi />, ['saglik.ayrinti-oku']);
    await screen.findByText('abcdef1');
    expect(screen.getByText(AYRINTI.sonGoc as string)).toBeTruthy();
  });
});
