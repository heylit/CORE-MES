import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { anahtarlar } from '../../../ortak/veri/anahtarlar.ts';
import '../../../ortak/arayuz/index.ts';
import type { PurchaseRequest } from '../merkez/tipler.ts';
import { DEFAULT_SETTINGS } from '../merkez/constants.ts';
import { S, V, bump } from '../merkez/store.ts';
import { Talepler } from './Talepler.tsx';

// 3710 sade üst (karar D): dört sekme, süzgeçler ve CSV tek "Süz ve CSV" düğmesinin altında, alt yazı yok.
function talep(id: string, no: string, status: PurchaseRequest['status']): PurchaseRequest {
  return {
    id, no, title: `ORN talep ${no}`, department: '', requester: '', priority: 'normal', needDate: '', notes: '', status,
    items: [{ id: `${id}-k`, materialId: null, name: 'ORN kalem', spec: '', qty: 1, unit: 'adet' }],
    rfqs: [], quotes: [], log: [], createdAt: Date.now(), award: null,
  };
}
function ciz() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData(anahtarlar.oturum, null);
  return render(<QueryClientProvider client={istemci}><MemoryRouter><Talepler /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  // Süzgeç değişince merkez kendi gövdesini de yeniden çizer; gövde kabı olmalı.
  document.body.innerHTML = '<main id="main"></main>';
  S.requests = { a: talep('a', 'ORN-1', 'rfq'), b: talep('b', 'ORN-2', 'received') };
  S.materials = {};
  S.suppliers = {};
  S.settings = { ...DEFAULT_SETTINGS };
  V.status = 'open'; V.view = 'list'; V.sort = ''; V.dir = 1; V.prio = ''; V.dept = ''; V.q = '';
  bump();
});
afterEach(() => { cleanup(); });

describe('3710 Talepler sade üst', () => {
  it('dört sekme; araç çubuğunda ayrı CSV ya da süzgeç yok, alt yazı yok', () => {
    ciz();
    const sekmeler = within(screen.getByRole('tablist', { name: 'Talep durumu' })).getAllByRole('tab').map((s) => s.textContent ?? '');
    expect(sekmeler.map((s) => s.replace(/\d.*$/, ''))).toEqual(['Açık', 'Onayda', 'Siparişte', 'Tümü']);
    expect(screen.queryByRole('button', { name: /^CSV$/ })).toBeNull();
    expect(screen.queryByText(/Taleplerim'den açılır/)).toBeNull();
    expect(screen.getByText('Süz ve CSV')).toBeTruthy();
  });

  it('Süz menüsünden seçilen öteki durum beşinci sekme olarak görünür ve süzer', () => {
    ciz();
    fireEvent.change(screen.getByRole('combobox', { name: 'Durum' }), { target: { value: 'received' } });
    expect(V.status).toBe('received');
    // Ekranı merkezin aboneliği yeniden çizer (MerkezEkrani); burada elle yeniden çizilir.
    cleanup();
    ciz();
    const sekme = screen.getByRole('tab', { selected: true });
    expect(sekme.textContent).toContain('Tamamlanan');
    expect(screen.getByText('ORN talep ORN-2')).toBeTruthy();
    expect(screen.queryByText('ORN talep ORN-1')).toBeNull();
  });
});
