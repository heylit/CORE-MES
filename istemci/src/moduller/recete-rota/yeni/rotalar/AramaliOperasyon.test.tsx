import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Adım panelinde operasyon yazarak aranır; seçilen operasyonun varsayılan istasyonu adıma gelir. Veriler uydurmadır.
const kur = (istasyonsuz = false, pasif = false) => {
  const d0 = rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, [adimOrnegi(istasyonsuz ? { stationId: null } : {})])]);
  const d = pasif ? { ...d0, stations: (d0.stations ?? []).map((x) => ({ ...x, aktif: false })) } : d0;
  sunucuKur(YONETICI, {
    durum: {
      ...d,
      opdefs: [...(d.opdefs ?? []),
        { id: '22', code: 'FRZ', abbr: 'F', name: 'Frezeleme', group: 'talasli', groupName: 'Talaşlı', stationId: '32', setup: 20, cycle: 4, aktif: true },
        { id: '23', code: 'TAS', abbr: null, name: 'Taşlama', group: 'talasli', groupName: 'Talaşlı', stationId: null, setup: 10, cycle: 2, aktif: true }],
      stations: [...(d.stations ?? []), { id: '32', code: 'FZ1', name: 'Freze 1', wcId: '41', eff: null, opPer: null, count: 1, cost: null, aktif: true }],
    },
  });
};
const adimPaneli = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const dugme = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (dugme) fireEvent.click(dugme);
  fireEvent.click((await within(bolge).findAllByRole('button', { name: 'OP 10 Tornalama' }))[0]!);
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};

describe('adım panelinde operasyon araması', () => {
  it('yazınca liste daralır, istasyon adıyla da bulunur; seçilen operasyonun istasyonu adıma gelir', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    expect((within(panel).getByLabelText('İstasyon') as HTMLSelectElement).value).toBe('31');
    fireEvent.click(within(panel).getByRole('button', { name: 'Operasyon' }));
    const ara = screen.getByRole('combobox', { name: 'Operasyon ara' });
    fireEvent.change(ara, { target: { value: 'freze 1' } });
    expect(within(screen.getByRole('listbox', { name: 'Operasyon' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['F FrezelemeFRZ · FZ1 Freze 1']);
    fireEvent.change(ara, { target: { value: 'frez' } });
    fireEvent.keyDown(ara, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => { expect(within(panel).getByRole('button', { name: 'Operasyon' }).textContent).toContain('F Frezeleme'); });
    expect((within(panel).getByLabelText('İstasyon') as HTMLSelectElement).value).toBe('32');
  });

  it('aranan yoksa "Aramaya uyan yok" der; Escape seçimi değiştirmeden kapatır', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    fireEvent.click(within(panel).getByRole('button', { name: 'Operasyon' }));
    const ara = screen.getByRole('combobox', { name: 'Operasyon ara' });
    fireEvent.change(ara, { target: { value: 'ORN-YOK' } });
    expect(screen.getByText('Aramaya uyan yok.')).toBeTruthy();
    fireEvent.keyDown(ara, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Operasyon' }).textContent).toContain('T Tornalama');
  });

  it('istasyonu boş eski adımda operasyonun varsayılan istasyonu önerilir; "Bu istasyonu ata" atar', async () => {
    kur(true);
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    expect((within(panel).getByLabelText('İstasyon') as HTMLSelectElement).value).toBe('');
    expect(within(panel).getByText(/T operasyonunun varsayılan istasyonu TZ1 Torna 1\./)).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Bu istasyonu ata' }));
    await waitFor(() => { expect((within(panel).getByLabelText('İstasyon') as HTMLSelectElement).value).toBe('31'); });
    expect(within(panel).queryByRole('button', { name: 'Bu istasyonu ata' })).toBeNull();
  });

  it('varsayılan istasyon pasifse öneri çıkmaz', async () => {
    kur(true, true);
    rrAc('/recete-rota/schema');
    const panel = await adimPaneli();
    expect(within(panel).queryByRole('button', { name: 'Bu istasyonu ata' })).toBeNull();
  });
});
