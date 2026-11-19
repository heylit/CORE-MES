import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MalzemeSecenekleriCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { CizimSecici, TalepCizimleri, cizimAdresi } from './Cizimler.tsx';
import { TalepAc } from './TalepAc.tsx';

const ID = '00000000-0000-4000-8000-000000000001';
const OZET = 'a'.repeat(64);
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const KARTLAR = { malzemeler: [{
  no: 7, kod: 'HM-00007', ad: 'ORN- çubuk', birim: 'kg', kategori: null, katalogId: null,
  ayrinti: [{ ad: 'Kalite', deger: 'ORN-K1' }, { ad: 'Ölçü', deger: 'Ø50×3000 mm' }],
}] } satisfies MalzemeSecenekleriCevabi;
function sunucu(): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === `/satin-alma-talepleri/${ID}/cizimler`) return json(200, { cizimler: [{ ozet: OZET, ad: 'ORN-cizim.pdf', boyut: 2048, zaman: '2026-11-19T10:00:00Z' }] });
    if (yol.startsWith('/satin-alma-malzeme-secenekleri?')) return json(200, KARTLAR);
    if (yol === '/satin-alma-acik-emirler') return json(200, { emirler: [] });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
  }));
  return yollar;
}
const sar = (c: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici>{c}</BildirimSaglayici></QueryClientProvider>,
);
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3442-2 talebin çizimi', () => {
  it('liste dosyayı talebin ucundan indirir; yazamayan ekleyemez ve kaldıramaz', async () => {
    sunucu();
    sar(<TalepCizimleri talepId={ID} yazabilir={false} />);
    const bag = await screen.findByRole('link', { name: /ORN-cizim\.pdf/ });
    expect(bag.getAttribute('href')).toBe(cizimAdresi(ID, OZET));
    expect(bag.getAttribute('href')).toBe(`/api/satin-alma-talepleri/${ID}/cizimler/${OZET}/dosya`);
    expect(screen.queryByRole('button', { name: /Çizim ekle/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /kaldır/ })).toBeNull();
  });

  it('yazan ekler; kaldırma onay ister, vazgeçince istek gitmez', async () => {
    const yollar = sunucu();
    sar(<TalepCizimleri talepId={ID} yazabilir />);
    expect(screen.getByRole('button', { name: /Çizim ekle/ })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'ORN-cizim.pdf: kaldır' }));
    expect(await screen.findByText('ORN-cizim.pdf talepten kaldırılsın mı?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByText('ORN-cizim.pdf talepten kaldırılsın mı?')).toBeNull());
    expect(yollar.some((y) => y.endsWith('/kaldir'))).toBe(false);
  });

  it('yasak: PDF olmayan dosya yüklenmez, iletiyle reddedilir; depoya istek gitmez', async () => {
    const yollar = sunucu();
    const degistir = vi.fn();
    sar(<CizimSecici secilen={[]} degistir={degistir} />);
    const girdi = screen.getByLabelText('Çizim dosyası (PDF)') as HTMLInputElement;
    fireEvent.change(girdi, { target: { files: [new File(['x'], 'ORN-resim.png', { type: 'image/png' })] } });
    expect((await screen.findByRole('alert')).textContent).toBe('Çizim PDF olmalı.');
    await waitFor(() => expect(degistir).toHaveBeenCalledWith([]));
    expect(yollar.some((y) => y.startsWith('/dosyalar'))).toBe(false);
  });

  it('birden çok dosyada her reddedilen dosya adıyla yazılır', async () => {
    sunucu();
    sar(<CizimSecici secilen={[]} degistir={vi.fn()} />);
    const girdi = screen.getByLabelText('Çizim dosyası (PDF)') as HTMLInputElement;
    fireEvent.change(girdi, { target: { files: [new File(['x'], 'ORN-a.png', { type: 'image/png' }), new File(['x'], 'ORN-b.png', { type: 'image/png' })] } });
    expect((await screen.findByRole('alert')).textContent).toBe('2 dosyadan 2 tanesi eklenemedi. ORN-a.png: Çizim PDF olmalı. ORN-b.png: Çizim PDF olmalı.');
  });

  it('talep formunda seçilen kartın ayrıntısı açık görünür', async () => {
    sunucu();
    sar(<TalepAc />);
    const kutu = screen.getByRole('combobox', { name: 'Malzeme' });
    fireEvent.focus(kutu);
    await screen.findByRole('option', { name: /HM-00007/ });
    fireEvent.keyDown(kutu, { key: 'ArrowDown' });
    fireEvent.keyDown(kutu, { key: 'Enter' });
    const foy = screen.getByLabelText('Kartın ayrıntısı');
    expect(foy.textContent).toBe('KaliteORN-K1ÖlçüØ50×3000 mm');
  });
});
