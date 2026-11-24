import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HazirlikMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { ProjeHazirlik, celiskili } from './ProjeHazirlik.tsx';

const rol = { tur: 'rol' as const, id: 3, ad: 'CNC programcı', kisiSayisi: 2 };
const gorev = (id: number, madde: string, isEmriId: number | null, ek: Partial<HazirlikMatrisiCevabi['gorevler'][number]> = {}) => ({
  id, madde, emriId: 1, isEmriId, ad: `Görev ${String(id)}`, durum: 'yapilacak', onaylandi: false, planBitis: '2026-11-20', gecikmeGun: null,
  yapan: rol, kontrol: null, surum: 1, kademe: null, sistem: null, ...ek,
});
const MATRIS = (dagitir: boolean, emirAcik = true, gerekmezYazar = dagitir): HazirlikMatrisiCevabi => ({
  proje: { id: 9, kod: 'ORN-PRJ-0412', ad: 'Deneme', durum: 'aktif' },
  dagitir,
  gerekmezYazar,
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
  gerekmezler: [],
});
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function kur(dagitir: boolean, emirAcik = true, duzenle: (m: HazirlikMatrisiCevabi) => HazirlikMatrisiCevabi = (m) => m) {
  const cagrilar: { yontem: string; yol: string; govde: unknown; }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = ayar?.method ?? 'GET';
    const govde = typeof ayar?.body === 'string' ? JSON.parse(ayar.body) as unknown : undefined;
    cagrilar.push({ yontem, yol, govde });
    if (yol.startsWith('/hazirlik-matrisi?')) return json(200, duzenle(MATRIS(dagitir, emirAcik)));
    if (yol.endsWith('/hazirlik-gerekmez') || yol.endsWith('/hazirlik-gerekmez-kaldir')) return json(200, { iptalEdilen: 1 });
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

describe('Proje > Görevler > Emir × madde (3396 A, 3430 a)', () => {

  it('sayılar süzgeçte, hücrede görev ve sistem hâli yazıyla; okuyanda Aç yok', async () => {
    kur(false);
    const tablo = await screen.findByRole('table', { name: 'Emir görevleri' });
    expect(screen.getByRole('tab', { name: /Hepsi.*3/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Gecikmiş.*1/ })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /OP20 CNC kurulumu: görev Yapılıyor, ORN Burak Yıldız, 2 gün gecikti; Sistem: Hazır/ }).textContent).toBe('Görev: YapılıyorSistem: Hazır2 gün gecikti · ORN Burak Yıldız');
    expect(within(tablo).getByRole('button', { name: /OP10 CNC kurulumu: görev Bitti, CNC programcı \(rol · 2 kişi\); Sistem: Eksik/ })).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /Çizim revizyonu: görev Atanmamış; Sistem hâli yok/ }).textContent).toBe('Görev: Atanmamış');
    expect(screen.getByRole('tab', { name: /Bitti.*1/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /görevlerini aç/ })).toBeNull();
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

  it('hücreye dokununca panel; atanmamış görev role atanır', async () => {
    const cagrilar = kur(true);
    const tablo = await screen.findByRole('table', { name: 'Emir görevleri' });
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

  it('görev bitti ama madde sistemde eksikse hücre işaretli, üstte uyarı satırı', async () => {
    kur(false);
    const tablo = await screen.findByRole('table', { name: 'Emir görevleri' });
    expect(screen.getByRole('status').textContent).toContain('1 hücrede görev bitti ama madde sistemde hâlâ eksik: ORN-UE-1201 OP10 · CNC kurulumu');
    const celiskili = within(tablo).getByRole('button', { name: /OP10 CNC kurulumu: görev Bitti/ }).closest('td');
    expect(celiskili?.className).toContain('tc-prj-hz-celiski');
    expect(within(tablo).getByRole('button', { name: /OP20 CNC kurulumu/ }).closest('td')?.className ?? '').not.toContain('tc-prj-hz-celiski');
  });

  // 3642: "Bu emirde gerekmez" işareti. Durduran madde, kontrolde ya da bitmiş görev ve yetkisiz kişi için eylem yoktur.
  const APARAT = { kod: 'aparat', ad: 'Aparat', kisa: 'Aparat', durduran: false, isEmriDuzeyi: false };
  const aparatli = (gorevEk: Partial<HazirlikMatrisiCevabi['gorevler'][number]> | null, gerekmezler: HazirlikMatrisiCevabi['gerekmezler'] = []) => (m: HazirlikMatrisiCevabi): HazirlikMatrisiCevabi => ({
    ...m, maddeler: [...m.maddeler, APARAT], gorevler: gorevEk === null ? m.gorevler : [...m.gorevler, gorev(4, 'aparat', null, gorevEk)], gerekmezler,
  });
  const KAYIT = { emriId: 1, madde: 'aparat', gerekce: 'Parça aparatsız işlenir', kisiAdi: 'ORN Selin Kaya', an: '2026-11-24T08:00:00.000Z' as HazirlikMatrisiCevabi['gerekmezler'][number]['an'] };

  it('eylem yalnız yetkili kişiye, durduran olmayan ve açık görevde görünür', async () => {
    kur(true, true, aparatli({}));
    const tablo = await screen.findByRole('table', { name: 'Emir görevleri' });
    fireEvent.click(within(tablo).getByRole('button', { name: /Çizim revizyonu: görev Atanmamış/ }));
    expect(screen.queryByRole('button', { name: 'Bu emirde gerekmez' }), 'durduran madde işaretlenemez').toBeNull();
    expect(screen.getByRole('region', { name: 'Görev ayrıntısı' }).textContent).toContain('Durduran madde (CNC, çizim, yayın) bu emirde gerekmez diye işaretlenemez');
    fireEvent.click(within(tablo).getByRole('button', { name: /Aparat: görev/ }));
    expect(screen.getByRole('button', { name: 'Bu emirde gerekmez' })).toBeTruthy();
    cleanup();
    kur(true, true, aparatli({ durum: 'kontrolde' }));
    fireEvent.click(within(await screen.findByRole('table', { name: 'Emir görevleri' })).getByRole('button', { name: /Aparat: görev/ }));
    expect(screen.queryByRole('button', { name: 'Bu emirde gerekmez' }), 'kontrolde görev değişmez').toBeNull();
    expect(screen.getByRole('region', { name: 'Görev ayrıntısı' }).textContent).toContain('Kontrolde ya da biten görev işaretlenemez');
    cleanup();
    kur(true, true, (m) => ({ ...aparatli({})(m), gerekmezYazar: false }));
    fireEvent.click(within(await screen.findByRole('table', { name: 'Emir görevleri' })).getByRole('button', { name: /Aparat: görev/ }));
    expect(screen.queryByRole('button', { name: 'Bu emirde gerekmez' }), 'yetkisiz').toBeNull();
  });

  it('gerekçe zorunlu; gönderince emir ucuna madde ve gerekçeyle gider', async () => {
    const cagrilar = kur(true, true, aparatli({ durum: 'suruyor' }));
    fireEvent.click(within(await screen.findByRole('table', { name: 'Emir görevleri' })).getByRole('button', { name: /Aparat: görev/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Bu emirde gerekmez' }));
    const panel = screen.getByRole('region', { name: 'Görev ayrıntısı' });
    expect(within(panel).getByRole('note').textContent).toContain('Görev sürüyor; işaretlenirse iptal olur');
    const gonder = within(panel).getByRole('button', { name: 'Gerekmez olarak işaretle' });
    expect((gonder as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText(/Gerekçe/), { target: { value: '  Parça aparatsız işlenir ' } });
    fireEvent.click(gonder);
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/hazirlik-gerekmez'))).toBe(true));
    expect(cagrilar.find((c) => c.yol.endsWith('/hazirlik-gerekmez'))).toMatchObject({
      yontem: 'POST', yol: '/adimli-emirler/1/hazirlik-gerekmez', govde: { madde: 'aparat', gerekce: 'Parça aparatsız işlenir' },
    });
  });

  it('işaretli madde görevi iptal olsa da hücrede "Gerekmez" görünür; panelde gerekçe ve kaldırma', async () => {
    const cagrilar = kur(true, true, aparatli(null, [KAYIT]));
    const tablo = await screen.findByRole('table', { name: 'Emir görevleri' });
    fireEvent.click(within(tablo).getByRole('button', { name: /Aparat: bu emirde gerekmez$/ }));
    const panel = screen.getByRole('region', { name: 'Gerekmez ayrıntısı' });
    expect(panel.textContent).toContain('ORN Selin Kaya');
    expect(panel.textContent).toContain('Parça aparatsız işlenir');
    fireEvent.click(within(panel).getByRole('button', { name: 'İşareti kaldır' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/hazirlik-gerekmez-kaldir'))).toBe(true));
    expect(cagrilar.find((c) => c.yol.endsWith('/hazirlik-gerekmez-kaldir'))).toMatchObject({ yol: '/adimli-emirler/1/hazirlik-gerekmez-kaldir', govde: { madde: 'aparat' } });
  });

  it('yazma yetkisi olmayan işareti görür ama kaldıramaz', async () => {
    kur(false, true, aparatli(null, [KAYIT]));
    fireEvent.click(within(await screen.findByRole('table', { name: 'Emir görevleri' })).getByRole('button', { name: /Aparat: bu emirde gerekmez/ }));
    expect(screen.getByRole('region', { name: 'Gerekmez ayrıntısı' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İşareti kaldır' })).toBeNull();
  });

  it('görevi açılmamış hücreden ön işaret konur; durduran madde ve yetkisiz kişide hücre düz çizgidir', async () => {
    const cagrilar = kur(true, true, aparatli(null));
    const tablo = await screen.findByRole('table', { name: 'Emir görevleri' });
    expect(within(tablo).queryByRole('button', { name: /Çizim revizyonu: görev yok/ })).toBeNull();
    fireEvent.click(within(tablo).getByRole('button', { name: /Aparat: görev yok; bu emirde gerekmez diye işaretlenebilir/ }));
    const panel = screen.getByRole('region', { name: 'Ön işaret' });
    expect(panel.textContent).toContain('Bu madde için görev henüz açılmadı');
    fireEvent.change(within(panel).getByLabelText(/Gerekçe/), { target: { value: 'Aparatsız parça' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Gerekmez olarak işaretle' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol.endsWith('/hazirlik-gerekmez'))).toBe(true));
    expect(cagrilar.find((c) => c.yol.endsWith('/hazirlik-gerekmez'))).toMatchObject({ yol: '/adimli-emirler/1/hazirlik-gerekmez', govde: { madde: 'aparat', gerekce: 'Aparatsız parça' } });
    cleanup();
    kur(false, true, aparatli(null));
    const t2 = await screen.findByRole('table', { name: 'Emir görevleri' });
    expect(within(t2).queryByRole('button', { name: /görev yok; bu emirde gerekmez/ })).toBeNull();
  });
});
