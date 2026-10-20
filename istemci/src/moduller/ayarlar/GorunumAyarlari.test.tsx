import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Ayar, AyarlarCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { GorunumAyarlari } from './GorunumAyarlari.tsx';
import { ayarKategorisi } from './SistemAyarlari.tsx';

const secim = (anahtar: string, deger: string, degerler: string[]): Ayar => ({
  anahtar, baslik: anahtar, aciklama: 'A', tur: 'secim', deger, secenekler: degerler.map((d) => ({ deger: d, etiket: d })),
});
const AYARLAR: AyarlarCevabi = {
  ayarlar: [
    secim('kabuk.hareket', 'orta', ['kapali', 'sade', 'orta', 'cesur', 'ultra']),
    secim('kabuk.acilis', 'yok', ['yok', 'tezgah', 'talas', 'lazer', 'cmm', 'dokum', '3b', 'rastgele']),
    secim('kabuk.gecis-hizi', 'normal', ['hizli', 'normal', 'yavas']),
    { anahtar: 'kabuk.acilis-suresi', baslik: 'S', aciklama: 'A', tur: 'sayi', deger: 2, enAz: 0.5, enCok: 5, ondalik: 1 },
  ],
};
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function kur() {
  const yazilanlar: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: RequestInit = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/ayarlar') return json(200, AYARLAR);
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    if (yol.endsWith('/degistir')) {
      const govde = JSON.parse(String(secenek.body)) as { deger: string | number };
      yazilanlar.push({ yol, govde });
      const anahtar = decodeURIComponent(yol.split('/')[2] ?? '');
      const eski = AYARLAR.ayarlar.find((a) => a.anahtar === anahtar);
      return json(200, { ...eski, deger: govde.deger });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BildirimSaglayici><GorunumAyarlari /></BildirimSaglayici>
    </QueryClientProvider>,
  );
  return yazilanlar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('görünüm ve hareket', () => {
  it('kayıtlı seçim işaretli gelir; karta dokununca yeni seçim kaydedilir ve işaret ona geçer', async () => {
    const yazilanlar = kur();
    const orta = await screen.findByRole('radio', { name: /^Orta/ });
    expect(orta.getAttribute('aria-checked')).toBe('true');
    const acilis = within(screen.getByRole('radiogroup', { name: 'Açılış gösterisi' }));
    expect(acilis.getByRole('radio', { name: /^Kapalı/ }).getAttribute('aria-checked')).toBe('true');
    const hareket = within(screen.getByRole('radiogroup', { name: 'Hareket dili' }));
    expect(hareket.getByRole('radio', { name: /^Kapalı/ }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: /^Ultra/ }));
    await waitFor(() => expect(yazilanlar).toEqual([{ yol: '/ayarlar/kabuk.hareket/degistir', govde: { deger: 'ultra' } }]));
    await waitFor(() => expect(screen.getByRole('radio', { name: /^Ultra/ }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(screen.getByRole('radio', { name: /^Rastgele/ }));
    await waitFor(() => expect(yazilanlar.at(-1)).toEqual({ yol: '/ayarlar/kabuk.acilis/degistir', govde: { deger: 'rastgele' } }));
    fireEvent.click(hareket.getByRole('radio', { name: /^Kapalı/ }));
    await waitFor(() => expect(yazilanlar.at(-1)).toEqual({ yol: '/ayarlar/kabuk.hareket/degistir', govde: { deger: 'kapali' } }));
  });

  it('seçili karta yeniden dokunmak kaydetmez; her seçeneğin önizleme taslağı kendi seviyesini taşır', async () => {
    const yazilanlar = kur();
    fireEvent.click(await screen.findByRole('radio', { name: /^Orta/ }));
    expect(yazilanlar).toEqual([]);
    const onizleme = (grup: string) => [...screen.getByRole('radiogroup', { name: grup }).querySelectorAll('.tc-gorunum-onizleme')]
      .map((o) => `${o.getAttribute('data-hareket') ?? ''}/${o.getAttribute('data-gecis-hizi') ?? ''}`);
    expect(onizleme('Hareket dili')).toEqual(['kapali/normal', 'sade/normal', 'orta/normal', 'cesur/normal', 'ultra/normal']);
    expect(onizleme('Geçiş hızı')).toEqual(['orta/hizli', 'orta/normal', 'orta/yavas']);
  });

  it('geçiş hızı kartla, açılış süresi kaydırıcı bırakılınca bir kez kaydedilir', async () => {
    const yazilanlar = kur();
    fireEvent.click(await screen.findByRole('radio', { name: /^Yavaş/ }));
    await waitFor(() => expect(yazilanlar).toEqual([{ yol: '/ayarlar/kabuk.gecis-hizi/degistir', govde: { deger: 'yavas' } }]));
    const kaydirici = screen.getByRole('slider');
    expect(kaydirici.getAttribute('aria-valuetext')).toBe('2,0 sn');
    fireEvent.change(kaydirici, { target: { value: '3.5' } });
    fireEvent.change(kaydirici, { target: { value: '4' } });
    expect(yazilanlar).toHaveLength(1);
    fireEvent.pointerUp(kaydirici);
    await waitFor(() => expect(yazilanlar.at(-1)).toEqual({ yol: '/ayarlar/kabuk.acilis-suresi/degistir', govde: { deger: 4 } }));
    expect(yazilanlar).toHaveLength(2);
  });

  it('hareket ve açılış ayarları Genel listesinden çıkar, kendi sekmesine düşer', () => {
    expect(ayarKategorisi({ anahtar: 'kabuk.hareket', tur: 'secim' })).toBe('gorunum');
    expect(ayarKategorisi({ anahtar: 'kabuk.acilis', tur: 'secim' })).toBe('gorunum');
    expect(ayarKategorisi({ anahtar: 'kabuk.gecis-hizi', tur: 'secim' })).toBe('gorunum');
    expect(ayarKategorisi({ anahtar: 'kabuk.acilis-suresi', tur: 'sayi' })).toBe('gorunum');
    expect(ayarKategorisi({ anahtar: 'kabuk.kurum-adi', tur: 'metin' })).toBe('genel');
  });
});
