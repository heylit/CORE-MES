import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HazirlikDagitCevabi, HazirlikMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { HazirlikGorevleriAc, ProjeHazirlik, celiskili } from './ProjeHazirlik.tsx';

const rol = { tur: 'rol' as const, id: 3, ad: 'CNC programcı', kisiSayisi: 2 };
const gorev = (id: number, madde: string, isEmriId: number | null, ek: Partial<HazirlikMatrisiCevabi['gorevler'][number]> = {}) => ({
  id, madde, emriId: 1, isEmriId, ad: `Görev ${String(id)}`, durum: 'yapilacak', onaylandi: false, planBitis: '2026-11-20', gecikmeGun: null,
  yapan: rol, kontrol: null, surum: 1, kademe: null, sistem: null, ...ek,
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
    gorev(1, 'cnc', 11, { durum: 'bitti', onaylandi: true, sistem: 'eksik' }),
    gorev(2, 'cnc', 12, { gecikmeGun: 2, yapan: { tur: 'kisi', id: 5, ad: 'ORN Burak Yıldız', kisiSayisi: 1 }, sistem: 'tamam' }),
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
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><HazirlikGorevleriAc projeId={9} /><ProjeHazirlik projeId={9} /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return cagrilar;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Proje > Görevler > Emir × madde (3396 A, 3430 a)', () => {

  it('sayılar süzgeçte, hücrede görev ve sistem hâli yazıyla; okuyanda Aç yok', async () => {
    kur(false);
    const tablo = await screen.findByRole('table', { name: 'Hazırlık görevleri' });
    expect(screen.getByRole('tab', { name: /Hepsi.*3/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Gecikmiş.*1/ })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /OP20 CNC kurulumu: görev Yapılıyor, ORN Burak Yıldız, 2 gün gecikti; Sistem: Hazır/ }).textContent).toBe('Görev: YapılıyorSistem: Hazır2 gün gecikti · ORN Burak Yıldız');
    expect(within(tablo).getByRole('button', { name: /OP10 CNC kurulumu: görev Bitti, CNC programcı \(rol · 2 kişi\); Sistem: Eksik/ })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /Çizim revizyonu: görev Atanmamış; Sistem hâli yok/ }).textContent).toBe('Görev: Atanmamış');
    expect(screen.getByRole('tab', { name: /Bitti.*1/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Hazırlık görevlerini aç/ })).toBeNull();
    fireEvent.click(within(tablo).getByRole('button', { name: /Çizim revizyonu: görev Atanmamış/ }));
    expect(screen.queryByRole('button', { name: 'Ata' })).toBeNull();
    fireEvent.click(within(tablo).getByRole('button', { name: /OP20 CNC kurulumu/ }));
    expect(screen.getByRole('region', { name: 'Görev ayrıntısı' }).textContent).toContain('Sistem: Hazır');
  });

  it('çelişki yalnız görev bitti ve madde sistemde eksikken', () => {
    const g = (durum: string, sistem: 'tamam' | 'eksik' | null) => ({ ...gorev(1, 'cnc', 11), durum, sistem }) as HazirlikMatrisiCevabi['gorevler'][number];
    expect(celiskili(g('bitti', 'eksik'))).toBe(true);
    expect(celiskili(g('bitti', 'tamam'))).toBe(false);
    expect(celiskili(g('bitti', null))).toBe(false);
    expect(celiskili(g('kontrolde', 'eksik'))).toBe(false);
  });

  it('açık emri olmayan projede açma yetkilisi için de Aç yok', async () => {
    kur(true, false);
    await screen.findByRole('table', { name: 'Hazırlık görevleri' });
    expect(screen.queryByRole('button', { name: /Hazırlık görevlerini aç/ })).toBeNull();
  });

  it('hücreye dokununca panel; atanmamış görev role atanır', async () => {
    const cagrilar = kur(true);
    const tablo = await screen.findByRole('table', { name: 'Hazırlık görevleri' });
    fireEvent.click(within(tablo).getByRole('button', { name: /Çizim revizyonu: görev Atanmamış/ }));
    const panel = screen.getByRole('region', { name: 'Görev ayrıntısı' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Ata' }));
    const secim = await within(panel).findByLabelText(/Yapan/);
    await within(panel).findByRole('option', { name: 'Rol: CNC programcı' });
    fireEvent.change(secim, { target: { value: 'rol:3' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Ata' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/hazirlik-ata'))).toBe(true));
    expect(cagrilar.find((c) => c.yol.endsWith('/hazirlik-ata'))).toMatchObject({ yol: '/projeler/gorevler/3/hazirlik-ata', govde: { sorumluKisiId: null, yapanRolId: 3, surum: 1 } });
  });

  it('Aç önce dener, alıcıyı kişi sayısıyla gösterir, onayla açar', async () => {
    const cagrilar = kur(true);
    fireEvent.click(await screen.findByRole('button', { name: /Hazırlık görevlerini aç/ }));
    const p = await screen.findByRole('dialog');
    await within(p).findByText('CNC programcı (rol · 2 kişi)');
    expect(within(p).getByText('2 kişiye zil')).toBeTruthy();
    expect(cagrilar.filter((c) => c.yol === '/hazirlik-matrisi/dagit')).toHaveLength(1);
    fireEvent.click(within(p).getByRole('button', { name: '3 görevi aç' }));
    await waitFor(() => expect(cagrilar.filter((c) => c.yol === '/hazirlik-matrisi/dagit')).toHaveLength(2));
    expect(cagrilar.filter((c) => c.yol === '/hazirlik-matrisi/dagit')[1]?.govde).toEqual({ projeId: 9, sablonId: null, deneme: false });
    await screen.findByText('3 hazırlık görevi açıldı.');
  });

  it('görev bitti ama madde sistemde eksikse hücre işaretli, üstte uyarı satırı', async () => {
    kur(false);
    const tablo = await screen.findByRole('table', { name: 'Hazırlık görevleri' });
    expect(screen.getByRole('status').textContent).toContain('1 hücrede görev bitti ama madde sistemde hâlâ eksik: ORN-UE-1201 OP10 · CNC kurulumu');
    const celiskili = within(tablo).getByRole('button', { name: /OP10 CNC kurulumu: görev Bitti/ }).closest('td');
    expect(celiskili?.className).toContain('tc-prj-hz-celiski');
    expect(within(tablo).getByRole('button', { name: /OP20 CNC kurulumu/ }).closest('td')?.className ?? '').not.toContain('tc-prj-hz-celiski');
  });
});
