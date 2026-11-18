import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { LogoBelgeAramaCevabi, LogoBelgeBulgusu } from '#paylasilan/sozlesme/logo.ts';
import { LogoBelgeAramasi } from './LogoBelgeAramasi.tsx';

// 3360 a: "Logo'da ara" penceresi. Belgeler uydurmadır (ORN-).
const BELGE: LogoBelgeBulgusu = {
  logoKayitNo: 41, no: 'ORN-SS-141', belgeNo: null, tarih: '2026-11-12', cariKodu: 'ORN-C-1001', cariAdi: 'ORN Deneme Makina', projeKodu: null, projeAdi: null,
  aciklama: null, tutar: '48000', dovizTuru: null, iptal: false, satirSayisi: 2,
  satirlar: [{ kod: 'ORN-MLZ-0042', ad: 'ORNEK Mil', miktar: '120', birim: 'ADET', aciklama: null }], core: { id: 88 }, bagla: null,
};
const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });
function sunucuKur(acik: boolean, cevap: LogoBelgeAramaCevabi) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    istekler.push(yol);
    if (yol === '/logo/belge-arama-durumu') return json({ acik, neden: null });
    return json(cevap);
  }));
  return istekler;
}
function ciz(tur: 'satis-siparisi' | 'talep') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}><MemoryRouter><LogoBelgeAramasi tur={tur} /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Logo\'da belge arama (3360 a)', () => {
  it('arama kapalıyken düğme çizilmez ve aramaya istek gitmez', async () => {
    const istekler = sunucuKur(false, { durum: 'tamam', ileti: null, fiyatGorunur: true, belgeler: [], baglanacak: null });
    const { container } = ciz('satis-siparisi');
    await waitFor(() => { expect(istekler).toContain('/logo/belge-arama-durumu'); });
    expect(container.textContent).toBe('');
    expect(istekler.some((y) => y.startsWith('/logo/belge-ara?'))).toBe(false);
  });

  it('türünde arar; eşleşen satır, tutar, CORE karşılığı ve "CORE\'da aç" bağlantısı görünür', async () => {
    const istekler = sunucuKur(true, { durum: 'tamam', ileti: null, fiyatGorunur: true, belgeler: [BELGE, { ...BELGE, logoKayitNo: 42, no: 'ORN-SS-142', core: null, iptal: true, satirlar: [], satirSayisi: 0, aciklama: 'numune' }], baglanacak: null });
    ciz('satis-siparisi');
    fireEvent.click(await screen.findByRole('button', { name: "Logo'da ara" }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Aranan/), { target: { value: 'ORN-MLZ-0042' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ara' }));
    expect(await within(pencere).findByText('ORN-SS-141')).toBeTruthy();
    expect(istekler).toContain('/logo/belge-ara?tur=satis-siparisi&q=ORN-MLZ-0042');
    expect(within(pencere).getByText('Satır: ORN-MLZ-0042 · ORNEK Mil · 120 ADET (+1 satır)')).toBeTruthy();
    expect(within(pencere).getAllByText('48.000,00 TL')).toHaveLength(2);
    expect(within(pencere).getByRole('link', { name: "CORE'da aç" }).getAttribute('href')).toBe('/siparisler/88');
    expect(within(pencere).getByText('Açıklama: "numune"')).toBeTruthy();
    expect(within(pencere).getByText('İptal')).toBeTruthy();
    expect(within(pencere).getByText("CORE'dan gitmedi")).toBeTruthy();
  });

  it('talepte tutar sütunu yok; kapalı cevabın iletisi yazılır', async () => {
    sunucuKur(true, { durum: 'kapali', ileti: 'Logo\'da belge araması Sistem Ayarları\'nda kapalı.', fiyatGorunur: false, belgeler: [], baglanacak: null });
    ciz('talep');
    fireEvent.click(await screen.findByRole('button', { name: "Logo'da ara" }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Aranan/), { target: { value: 'ORN' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ara' }));
    expect((await within(pencere).findByRole('alert')).textContent).toMatch(/kapalı/);
  });
});
