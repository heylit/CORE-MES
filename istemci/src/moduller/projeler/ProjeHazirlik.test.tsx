import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HazirlikDagitCevabi, HazirlikMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ProjeHazirlik, basHarf } from './ProjeHazirlik.tsx';

const rol = { tur: 'rol' as const, id: 3, ad: 'CNC programcı', kisiSayisi: 2 };
const gorev = (id: number, madde: string, isEmriId: number | null, ek: Partial<HazirlikMatrisiCevabi['gorevler'][number]> = {}) => ({
  id, madde, emriId: 1, isEmriId, ad: `Görev ${String(id)}`, durum: 'yapilacak', onaylandi: false, planBitis: '2026-11-20', gecikmeGun: null,
  yapan: rol, kontrol: null, surum: 1, kademe: null, ...ek,
});
const MATRIS = (dagitir: boolean, emirAcik = true): HazirlikMatrisiCevabi => ({
  proje: { id: 9, kod: 'ORN-PRJ-0412', ad: 'Deneme', durum: 'aktif' },
  dagitir,
  maddeler: [
    { kod: 'cnc', ad: 'CNC kurulumu', kisa: 'CNC', durduran: true, isEmriDuzeyi: true },
    { kod: 'cizim', ad: 'Çizim revizyonu', kisa: 'Çizim', durduran: true, isEmriDuzeyi: false },
  ],
  emirler: [{ id: 1, emirNo: 'ORN-UE-1201', parcaNo: 'ORN-PARCA-77', adet: 40, acik: emirAcik, isEmirleri: [{ id: 11, opNo: 10, ad: 'Torna' }, { id: 12, opNo: 20, ad: 'Freze' }] }],
  gorevler: [
    gorev(1, 'cnc', 11, { durum: 'bitti', onaylandi: true }),
    gorev(2, 'cnc', 12, { gecikmeGun: 2, yapan: { tur: 'kisi', id: 5, ad: 'ORN Burak Yıldız', kisiSayisi: 1 } }),
    gorev(3, 'cizim', null, { yapan: null }),
  ],
});
const DENEME: HazirlikDagitCevabi = {
  eklenen: 0, gorevSayisi: 3, toplamKisi: 2, atanmamis: 0,
  alicilar: [{ ...rol, gorevler: [{ madde: 'cnc', ad: 'CNC kurulumu', sayi: 3 }] }],
};
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function kur(dagitir: boolean, emirAcik = true) {
  const cagrilar: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    const govde = typeof ayar?.body === 'string' ? JSON.parse(ayar.body) as { deneme?: boolean } : undefined;
    cagrilar.push({ yontem, yol, govde });
    if (yol.startsWith('/hazirlik-matrisi?')) return json(200, MATRIS(dagitir, emirAcik));
    if (yol === '/hazirlik-matrisi/dagit') return json(200, govde?.deneme ? DENEME : { ...DENEME, eklenen: 3 });
    if (yol === '/projeler/sablon-secenekleri') return json(200, { sablonlar: [{ id: 2, ad: 'ORN-CNC Standart', varsayilan: true, gorevSayisi: 1, hazirlikSayisi: 3 }] });
    if (yol === '/projeler/sorumlu-secenekleri') return json(200, { kisiler: [{ id: 5, ad: 'ORN Burak Yıldız' }] });
    if (yol === '/projeler/rol-secenekleri') return json(200, { roller: [{ id: 3, ad: 'CNC programcı' }] });
    if (yol.endsWith('/hazirlik-ata')) return json(200, { id: 3, surum: 2 });
    return json(404, { kod: 'yok', mesaj: 'yok' });
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><ProjeHazirlik projeId={9} /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Proje > Hazırlık (3396 A)', () => {
  it('baş harf iki kelimeden', () => { expect(basHarf('ORN Burak Yıldız')).toBe('OB'); expect(basHarf('Kalite')).toBe('K'); });

  it('sayılar süzgeçte, hücre hâli yazıyla; okuyanda Dağıt yok', async () => {
    kur(false);
    const tablo = await screen.findByRole('table', { name: 'Hazırlık görevleri' });
    expect(screen.getByRole('tab', { name: /Hepsi.*3/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Gecikmiş.*1/ })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /OP20 CNC kurulumu: Yapılıyor, ORN Burak Yıldız, 2 gün gecikti/ }).textContent).toBe('!OB');
    expect(within(tablo).getByRole('button', { name: /OP10 CNC kurulumu: Hazır/ })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /Çizim revizyonu: Atanmamış/ }).textContent).toBe('?');
    expect(screen.queryByRole('button', { name: /Görevleri dağıt/ })).toBeNull();
    fireEvent.click(within(tablo).getByRole('button', { name: /Çizim revizyonu: Atanmamış/ }));
    expect(screen.queryByRole('button', { name: 'Ata' })).toBeNull();
  });

  it('açık emri olmayan projede dağıtan için de Dağıt yok', async () => {
    kur(true, false);
    await screen.findByRole('table', { name: 'Hazırlık görevleri' });
    expect(screen.queryByRole('button', { name: /Görevleri dağıt/ })).toBeNull();
  });

  it('hücreye dokununca panel; atanmamış görev role atanır', async () => {
    const cagrilar = kur(true);
    const tablo = await screen.findByRole('table', { name: 'Hazırlık görevleri' });
    fireEvent.click(within(tablo).getByRole('button', { name: /Çizim revizyonu: Atanmamış/ }));
    const panel = screen.getByRole('region', { name: 'Görev ayrıntısı' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Ata' }));
    const secim = await within(panel).findByLabelText(/Yapan/);
    await within(panel).findByRole('option', { name: 'Rol: CNC programcı' });
    fireEvent.change(secim, { target: { value: 'rol:3' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Ata' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/hazirlik-ata'))).toBe(true));
    expect(cagrilar.find((c) => c.yol.endsWith('/hazirlik-ata'))).toMatchObject({ yol: '/projeler/gorevler/3/hazirlik-ata', govde: { sorumluKisiId: null, yapanRolId: 3, surum: 1 } });
  });

  it('Dağıt önce dener, alıcıyı kişi sayısıyla gösterir, onayla dağıtır', async () => {
    const cagrilar = kur(true);
    fireEvent.click(await screen.findByRole('button', { name: /Görevleri dağıt/ }));
    const p = await screen.findByRole('dialog');
    await within(p).findByText('CNC programcı (rol · 2 kişi)');
    expect(within(p).getByText('2 kişiye zil')).toBeTruthy();
    expect(cagrilar.filter((c) => c.yol === '/hazirlik-matrisi/dagit')).toHaveLength(1);
    fireEvent.click(within(p).getByRole('button', { name: '3 görevi dağıt' }));
    await waitFor(() => expect(cagrilar.filter((c) => c.yol === '/hazirlik-matrisi/dagit')).toHaveLength(2));
    expect(cagrilar.filter((c) => c.yol === '/hazirlik-matrisi/dagit')[1]?.govde).toEqual({ projeId: 9, sablonId: null, deneme: false });
    await screen.findByText('3 hazırlık görevi dağıtıldı.');
  });
});
