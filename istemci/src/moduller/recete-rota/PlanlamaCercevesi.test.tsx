import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';
import { YAZAR, ac, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

// Kayıt uydurmadır.
const KAYIT = { anahtar: 'recete-rota-motoru-v1', bicim: 'json' as const, deger: { name: 'Deneme fabrika', items: [], savedAt: 5 }, surum: 4 };

function Git({ yol }: { yol: string }) {
  const git = useNavigate();
  return <button type="button" onClick={() => { void git(yol); }}>git</button>;
}

describe('planlama çerçevesi', () => {
  it('planlama sayfası kendi çerçevesinde, köprü ve içerik politikasıyla açılır; ortak stil ve simgeler konmuştur', async () => {
    sunucuKur(YAZAR, [KAYIT]);
    ac('/recete-rota/terminler');
    const cerceve = await screen.findByTitle('Planlama', {}, { timeout: 20000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(cerceve.getAttribute('sandbox')).toBe('allow-scripts');
    expect(belge).toContain("connect-src 'none'");
    expect(belge).toContain('worker-src blob:');
    expect(belge).toContain("frame-src 'none'");
    expect(belge).not.toContain('/*TMI-ORTAK-STIL*/');
    expect(belge).not.toContain('/*TMI-SIMGELER*/');
    expect(belge).toContain('const VERI = {};');
    // Köprü planlama betiğinden önce koşar; ana tablo kaydı açılış değeridir.
    const kopru = belge.indexOf('"kanal":"recete-rota"');
    expect(kopru).toBeGreaterThan(-1);
    expect(kopru).toBeLessThan(belge.indexOf("const ANAHTAR = typeof window.tmi"));
    expect(belge).toContain('"recete-rota-motoru-v1":{"deger":');
    // Ekran tercihleri cihazdadır; denemenin veri araçları gizlidir; Reçete ve Rota'nın düğme gizlemeleri buraya gelmez.
    expect(belge).toContain('"recete-rota-motoru-v1:planlama-ui4"');
    expect(belge).toContain('[data-act=\\"iceri-ac\\"]');
    expect(belge).not.toContain('[data-act=\\"revApprove\\"]');
  }, 30000);

  it('Reçete ve Rota bölümünden planlama sayfasına geçişte eski çerçeve bekler, sonra kayıt yeniden okunup planlama açılır', async () => {
    const istekler = sunucuKur(YAZAR, [KAYIT]);
    const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={['/recete-rota']}>
        <Git yol="/recete-rota/terminler" />
        <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
      </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
    );
    const rr = await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 });
    const okuma = () => istekler.filter((i) => i === 'GET /recete-rota/kayitlar').length;
    expect(okuma()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'git' }));
    // Geçişte eski çerçeve aynı öğedir ve gizlidir (yeniden kurulmaz); kayıt henüz yeniden okunmaz.
    await waitFor(() => { expect(rr.closest('[hidden]')).not.toBeNull(); });
    expect(screen.getByTitle('Reçete ve Rota')).toBe(rr);
    expect(okuma()).toBe(1);
    await screen.findByTitle('Planlama', {}, { timeout: 20000 });
    expect(screen.queryByTitle('Reçete ve Rota')).toBeNull();
    expect(okuma()).toBe(2);
  }, 40000);
});
