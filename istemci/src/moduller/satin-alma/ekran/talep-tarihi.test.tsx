import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { anahtarlar } from '../../../ortak/veri/anahtarlar.ts';
import '../../../ortak/arayuz/index.ts';
import type { PurchaseRequest } from '../merkez/tipler.ts';
import { DEFAULT_SETTINGS } from '../merkez/constants.ts';
import { S, V, bump } from '../merkez/store.ts';
import { dstr } from '../merkez/util.ts';
import { reqTable } from '../merkez/views.ts';
import { Talepler } from './Talepler.tsx';
import { TalepTarihi } from './TalepTarihi.tsx';

// 3710 (karar: tüm satın alma talep listelerinde): talebin açıldığı gün ayrı sütun; kayıt zamanı yoksa "–".
const GUN = 86_400_000;
const ogle = (gun: string) => new Date(`${gun}T12:00:00`).getTime();
function talep(id: string, no: string, createdAt: number): PurchaseRequest {
  return {
    id, no, title: `ORN talep ${no}`, department: '', requester: '', priority: 'normal', needDate: '', notes: '', status: 'rfq',
    items: [{ id: `${id}-k`, materialId: null, name: 'ORN kalem', spec: '', qty: 1, unit: 'adet' }],
    rfqs: [], quotes: [], log: [], createdAt, award: null,
  };
}
function sorguIle(ic: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData(anahtarlar.oturum, null);
  return <QueryClientProvider client={istemci}>{ic}</QueryClientProvider>;
}
beforeEach(() => {
  const bugun = Date.now();
  S.requests = { a: talep('a', 'ORN-1', bugun - 3 * GUN), b: talep('b', 'ORN-2', bugun - 10 * GUN) };
  S.materials = {};
  S.suppliers = {};
  S.settings = { ...DEFAULT_SETTINGS };
  V.status = 'all'; V.view = 'list'; V.sort = ''; V.dir = 1;
  bump();
});
afterEach(() => { cleanup(); });

describe('3710 talep tarihi', () => {
  it('hücre günü ve kaç gün önce olduğunu yazar; kayıt zamanı yoksa tire', () => {
    render(<TalepTarihi r={{ createdAt: ogle('2026-11-20') }} bugun="2026-11-25" />);
    expect(screen.getByText('20.11.2026')).toBeTruthy();
    expect(screen.getByText('5 gün önce')).toBeTruthy();
    cleanup();
    render(<TalepTarihi r={{ createdAt: ogle('2026-11-25') }} bugun="2026-11-25" />);
    expect(screen.getByText('bugün')).toBeTruthy();
    cleanup();
    const { container } = render(<TalepTarihi r={{ createdAt: 0 }} bugun="2026-11-25" />);
    expect(container.textContent).toBe('–');
  });

  it('Talepler: "Talep tarihi" sütunu İstenen termin\'den önce; başlığa basınca eskiden yeniye sıralar', () => {
    render(sorguIle(<MemoryRouter><Talepler /></MemoryRouter>));
    const basliklar = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const i = basliklar.findIndex((b) => b.includes('Talep tarihi'));
    expect(i).toBeGreaterThan(-1);
    expect(basliklar[i + 1]).toContain('İstenen termin');
    expect(screen.getByText('3 gün önce')).toBeTruthy();
    V.sort = 'created'; V.dir = 1; bump();
    cleanup();
    render(sorguIle(<MemoryRouter><Talepler /></MemoryRouter>));
    const satirlar = screen.getAllByRole('row').slice(1).map((r) => within(r).queryByText(/^ORN-\d$/)?.textContent);
    expect(satirlar).toEqual(['ORN-2', 'ORN-1']);
  });

  it('malzeme hafızasındaki talep tablosu (reqTable): tam tabloda sütun var, sıkışık tabloda yok', () => {
    const r = talep('c', 'ORN-3', ogle('2026-11-18'));
    const tam = reqTable([r]);
    expect(tam).toContain('Talep tarihi');
    expect(tam).toContain('18.11.2026');
    expect(reqTable([r], true)).not.toContain('Talep tarihi');
    expect(dstr(new Date(ogle('2026-11-18')))).toBe('2026-11-18');
  });
});
