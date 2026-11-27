import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { anahtarlar } from '../../../ortak/veri/anahtarlar.ts';
import { tabloTercihleriniSifirla } from '../../../ortak/veri/tablo-tercihi.ts';
import '../../../ortak/arayuz/index.ts';
import type { PurchaseRequest, Quote } from '../merkez/tipler.ts';
import { DEFAULT_SETTINGS } from '../merkez/constants.ts';
import { S, V, bump } from '../merkez/store.ts';
import { Siparisler } from './Siparisler.tsx';
import { Talepler } from './Talepler.tsx';

// 3798 (Öneri A): Talepler ve Siparişler satırı okla açılır, altında kalemler; Görünüm menüsünde Grupla (varsayılan Yok).
const teklif = (id: string, supplierId: string, prices: Record<string, number>): Quote => ({
  id, supplierId, supplierName: '', date: '2026-11-20', validUntil: '', currency: 'TRY', fxRate: null, prices, discountPct: 0, shipping: 0, otherCost: 0,
  deliveryTerm: '', deliveryIncluded: true, leadDays: 10, payDays: 30, advancePct: 0, warrantyMonths: null, compliant: true, note: '',
});
function talep(id: string, no: string, status: PurchaseRequest['status'], ek: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id, no, title: `ORN talep ${no}`, department: '', requester: '', priority: 'normal', needDate: '2026-12-15', notes: '', status,
    items: [{ id: `${id}-k1`, materialId: null, name: 'ORN-MIL-20', spec: '', qty: 12, unit: 'adet' }, { id: `${id}-k2`, materialId: null, name: 'ORN-PUL-8', spec: '', qty: 400, unit: 'adet' }],
    rfqs: [], quotes: [], log: [], createdAt: Date.now(), award: null, ...ek,
  } as PurchaseRequest;
}
const sarmala = (el: React.ReactNode) => {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData(anahtarlar.oturum, null);
  return render(<QueryClientProvider client={istemci}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
};
beforeEach(() => {
  document.body.innerHTML = '<main id="main"></main>';
  S.requests = {
    a: talep('a', 'ORN-1', 'rfq', { uretimEmriNo: 'ORN-E1' }),
    b: talep('b', 'ORN-2', 'ordered', {
      quotes: [teklif('qa', 'fa', { 'b-k1': 185, 'b-k2': 0.9 })],
      award: { mode: 'single', quoteId: 'qa', orderNo: 'ORN-SP-1', orderDate: '2026-11-20', expectedDate: '', lines: [{ id: 1, itemId: 'b-k1', quoteId: 'qa', qty: 12, unit: 'adet', received: 4, expectedDate: '2026-12-01' }, { id: 2, itemId: 'b-k2', quoteId: 'qa', qty: 400, unit: 'adet', received: 0 }] } as unknown as PurchaseRequest['award'],
    }),
  };
  S.materials = {};
  S.suppliers = { fa: { id: 'fa', name: 'ORN Tedarikçi A' } as never };
  S.settings = { ...DEFAULT_SETTINGS };
  V.status = 'all'; V.view = 'list'; V.sort = ''; V.dir = 1; V.prio = ''; V.dept = ''; V.q = '';
  bump();
});
afterEach(() => { cleanup(); tabloTercihleriniSifirla(); localStorage.clear(); });

describe('3798 Talepler açılır satır ve gruplama', () => {
  it('ok kalemleri satırın altında açar; satıra basmak talebi açmaya devam eder (ok basışı talebi açmaz)', () => {
    sarmala(<Talepler />);
    fireEvent.click(screen.getByRole('button', { name: 'Aç: ORN-1' }));
    const kalemler = screen.getByRole('table', { name: 'ORN-1 kalemleri' });
    expect(within(kalemler).getByText('ORN-PUL-8')).toBeTruthy();
    expect(within(kalemler).getByText('400 adet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kapat: ORN-1' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('sipariş verilmiş talepte kalemin tedarikçisi ve sipariş termini görünür', () => {
    sarmala(<Talepler />);
    fireEvent.click(screen.getByRole('button', { name: 'Aç: ORN-2' }));
    const kalemler = screen.getByRole('table', { name: 'ORN-2 kalemleri' });
    expect(within(kalemler).getAllByText('ORN Tedarikçi A')).toHaveLength(2);
    expect(within(kalemler).getByRole('columnheader', { name: 'Sipariş termini' })).toBeTruthy();
    expect(within(kalemler).getAllByText('30.11.2026')).toHaveLength(2);
  });

  it('Grupla varsayılanı Yok; Üretim emri seçilince grup başlıkları çizilir', () => {
    const { container } = sarmala(<Talepler />);
    expect(container.querySelector('tr.tc-tablo-grup')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Üretim emri' }));
    const basliklar = [...container.querySelectorAll('tr.tc-tablo-grup')].map((x) => x.textContent ?? '');
    expect(basliklar.some((b) => b.startsWith('Emir ORN-E1'))).toBe(true);
    expect(basliklar.some((b) => b.startsWith('Emirsiz'))).toBe(true);
  });
});

describe('3798 Siparişler açılır satır ve gruplama', () => {
  it('ok sipariş kalemlerini açar: miktar, satır termini (boşsa siparişin) ve gelen', () => {
    sarmala(<Siparisler />);
    fireEvent.click(screen.getByRole('button', { name: /^Aç: / }));
    const kalemler = screen.getByRole('table', { name: 'ORN-SP-1 kalemleri' });
    const satirlar = within(kalemler).getAllByRole('row').slice(1).map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(satirlar[0]).toEqual(expect.arrayContaining(['ORN-MIL-20', '12 adet', '01.12.2026', '4 adet']));
    expect(satirlar[1]).toEqual(expect.arrayContaining(['ORN-PUL-8', '400 adet', '30.11.2026', '0 adet']));
  });

  it('Grupla: Tedarikçi seçilince tedarikçi başlığı çizilir', () => {
    const { container } = sarmala(<Siparisler />);
    expect(container.querySelector('tr.tc-tablo-grup')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Tedarikçi' }));
    expect(container.querySelector('tr.tc-tablo-grup')?.textContent).toContain('ORN Tedarikçi A');
  });
});
