import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LogoProjeDurumuCevabi } from '#paylasilan/sozlesme/logo.ts';
import { ProjeLogoSatiri } from './ProjeLogoSatiri.tsx';

// Biçim sunucu cevabından (logo/proje.test.ts LP-7); değerler deneme değerleridir.
function cizdir(cevap: LogoProjeDurumuCevabi | null) {
  vi.stubGlobal('fetch', vi.fn(async () => (cevap === null
    ? new Response(JSON.stringify({ kod: 'BULUNAMADI', mesaj: 'Yok.' }), { status: 404 })
    : new Response(JSON.stringify(cevap), { status: 200 }))));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}><ProjeLogoSatiri projeId={12} /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Proje kartı Logo satırı (3315)', () => {
  it('Logo\'da: rozet ve kod ayrı düz metin', async () => {
    cizdir({ durum: 'logoda', logoKodu: 'ORN.PRJ12', metin: null });
    expect(await screen.findByText('Logo\'da')).toBeTruthy();
    expect(screen.getByText('ORN.PRJ12').className).toBe('tc-prj-logo-kod');
  });
  it('durdu ve gönderilmez metinleriyle; okunamazsa Okunamadı', async () => {
    cizdir({ durum: 'durdu', logoKodu: null, metin: 'Logo reddetti: Deneme. Proje kartını düzeltip kaydedin; yeniden gider.' });
    expect(await screen.findByText('Durdu')).toBeTruthy();
    expect(screen.getByText(/düzeltip kaydedin/)).toBeTruthy();
    cleanup();
    cizdir({ durum: 'gonderilmez', logoKodu: null, metin: 'Proje Logo\'ya gönderilmiyor (Sistem Ayarları\'nda kapalı); belgeler proje kodu olmadan gider.' });
    expect(await screen.findByText('Gönderilmez')).toBeTruthy();
    cleanup();
    cizdir(null);
    expect(await screen.findByText('Okunamadı')).toBeTruthy();
  });
});
