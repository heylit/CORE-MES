import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../ortak/arayuz/index.ts';
import type { PurchaseRequest, RequestItem } from '../merkez/tipler.ts';
import { DEFAULT_SETTINGS } from '../merkez/constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, bump } from '../merkez/store.ts';
import { IsTablosu } from './IsTablosu.tsx';
import { KalemOzeti } from './KalemOzeti.tsx';

const KARTLI: RequestItem = {
  id: 'k1', materialId: null, name: 'ORN- çubuk', spec: 'ORN- tezgah 3 için', qty: 2, unit: 'adet',
  malzeme: { kalite: 'ORN-K1', durum: 'ORN-tavlı', islem: null, olcu: 'Ø50', aciklama: null, ayrinti: [{ ad: 'Sertlik', deger: 'ORN-30 HRC' }] },
};
const KARTSIZ: RequestItem = { id: 'k2', materialId: null, name: 'ORN- vida', spec: '', qty: 5, unit: 'adet' };
function talep(cizimSayisi?: number): PurchaseRequest {
  return {
    id: 't1', no: 'ORN-T-1', title: 'ORN talep', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'draft',
    items: [KARTLI, KARTSIZ], rfqs: [], quotes: [], log: [], createdAt: 1, award: null, ...(cizimSayisi ? { cizimSayisi } : {}),
  };
}
beforeEach(() => { S.materials = {}; S.suppliers = {}; S.settings = { ...DEFAULT_SETTINGS }; V.status = 'all'; V.view = 'list'; });
afterEach(cleanup);

describe('3571 ilk tablo kalem alt satırları', () => {
  it('kartlı kalemde Kart (kalite · ölçü · durum), Talep notu ve Kart ayrıntısı; kartsız ve notsuz kalemde satır yok', () => {
    render(<KalemOzeti kalem={KARTLI} talepId="t1" />);
    expect(screen.getByTitle('ORN-K1 · Ø50 · ORN-tavlı').textContent).toBe('Kart: ORN-K1 · Ø50 · ORN-tavlı');
    expect(screen.getByTitle('ORN- tezgah 3 için').textContent).toBe('Talep notu: ORN- tezgah 3 için');
    fireEvent.click(screen.getByText('Kart ayrıntısı'));
    expect(screen.getByText('ORN-30 HRC')).toBeTruthy();
    // Kartsız (kataloğa bağlı olmayan) kalemde alternatif satırı istenmez.
    expect(screen.queryByText(/Alternatif:/)).toBeNull();
    cleanup();
    const { container } = render(<KalemOzeti kalem={KARTSIZ} talepId="t1" />);
    expect(container.textContent).toBe('');
  });

  it('tabloda talep numarasının yanında çizim sayısı; çizimsiz talepte yok', () => {
    S.requests = { t1: talep(2) };
    bump();
    render(<MemoryRouter><IsTablosu /></MemoryRouter>);
    const satirlar = screen.getAllByRole('row').slice(1);
    expect(satirlar).toHaveLength(2);
    expect(within(satirlar[0]!).getByText('2 çizim')).toBeTruthy();
    expect(within(satirlar[0]!).getByTitle('ORN-K1 · Ø50 · ORN-tavlı')).toBeTruthy();
    cleanup();
    S.requests = { t1: talep() };
    bump();
    render(<MemoryRouter><IsTablosu /></MemoryRouter>);
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    expect(screen.queryByText(/^\d+ çizim$/)).toBeNull();
  });
});
