import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TeklifIstekFormuCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { IstekFormuAyari } from './IstekFormuAyari.tsx';

const FORM: TeklifIstekFormuCevabi = {
  icerik: { baslik: 'TEKLİF İSTEME FORMU', giris: 'Sayın {YETKILI},', istenenler: ['Birim fiyat', 'Termin'], kapanis: 'Son tarih {SON_TARIH}.', imza1: 'Satın alma', imza2: '', alt: '' },
  surum: 3, kurum: { unvan: 'ORN- Atölye', adres: '', telefon: '', eposta: '', vergi: '' },
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3442-4 Sistem Ayarları > Formlar > Teklif isteme formu', () => {
  it('metin değişince ön izleme değişir; kaydet sürümle ve maddeler satır satır gider', async () => {
    const gonderilen: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
      if (ayar?.method === 'POST') { gonderilen.push(JSON.parse(String(ayar.body))); return new Response(JSON.stringify({ ...FORM, surum: 4 }), { status: 200 }); }
      expect(adres).toBe('/api/satin-alma-teklif-istek-formu');
      return new Response(JSON.stringify(FORM), { status: 200 });
    }));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici><IstekFormuAyari /></BildirimSaglayici></QueryClientProvider>);
    const baslik = await screen.findByLabelText('Başlık');
    const kagit = screen.getByLabelText('Formun ön izlemesi');
    expect(kagit.querySelector('.doc-co')?.textContent).toBe('ORN- Atölye');
    expect(kagit.textContent).toContain('Sayın ORN- Yetkili,');
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(baslik, { target: { value: 'ORN- FİYAT İSTEĞİ' } });
    fireEvent.change(screen.getByLabelText(/Teklifte istenen bilgiler/), { target: { value: 'Birim fiyat\n\n  Garanti  ' } });
    await waitFor(() => expect(kagit.querySelector('h2')?.textContent).toBe('ORN- FİYAT İSTEĞİ'));
    expect([...kagit.querySelectorAll('.doc-liste li')].map((x) => x.textContent)).toEqual(['Birim fiyat', 'Garanti']);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(gonderilen).toHaveLength(1));
    expect(gonderilen[0]).toMatchObject({ surum: 3, icerik: { baslik: 'ORN- FİYAT İSTEĞİ', istenenler: ['Birim fiyat', 'Garanti'] } });
  });
  it('kaydet 409 dönünce ileti gösterilir, taslak bırakılır ve güncel metin yeniden okunur', async () => {
    let okuma = 0;
    vi.stubGlobal('fetch', vi.fn(async (_adres: string, ayar?: RequestInit) => {
      if (ayar?.method === 'POST') return new Response(JSON.stringify({ hata: 'surum' }), { status: 409 });
      okuma += 1;
      return new Response(JSON.stringify(okuma === 1 ? FORM : { ...FORM, surum: 5, icerik: { ...FORM.icerik, baslik: 'ORN- GÜNCEL BAŞLIK' } }), { status: 200 });
    }));
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici><IstekFormuAyari /></BildirimSaglayici></QueryClientProvider>);
    fireEvent.change(await screen.findByLabelText('Başlık'), { target: { value: 'ORN- BENİM DEĞİŞİKLİĞİM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Form bu arada değişti');
    await waitFor(() => expect(okuma).toBe(2));
    await waitFor(() => expect((screen.getByLabelText('Başlık') as HTMLInputElement).value).toBe('ORN- GÜNCEL BAŞLIK'));
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

