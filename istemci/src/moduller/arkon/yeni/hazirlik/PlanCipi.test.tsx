import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PlanliPaket, TmiPlan } from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import { PlanCipi } from './PlanCipi.tsx';

// 2218-1 c: emir planlı olunca iş Hazırlık'a düşer; canlı planda değilse Hazırlık listesinde "Planlanmadı" ile işaretlenir, Hazırlık
// plandan önce hazırlığa başlayabilir. Veriler uydurmadır.
afterEach(cleanup);

const paket = (plan: TmiPlan | null, status = 'draft'): PlanliPaket => ({ id: 'tmi-ie-7', status, tmi: { isEmriId: 7, plan } });
const CANLI: TmiPlan = { canli: true, sira: 2, eslesiyor: true, kaynak: { tur: 'makine', id: 3 }, zorunlu: false };

describe('Hazırlık plan çipi (2218-1 c)', () => {
  it('canlı planda olmayan iş "Planlanmadı" ile işaretlenir; taslak da yayınlı da', () => {
    for (const status of ['draft', 'published']) {
      render(<PlanCipi paket={paket({ canli: false, sira: null, eslesiyor: false, kaynak: null, zorunlu: false }, status)} sira />);
      expect(screen.getByText('Planlanmadı')).toBeTruthy();
      expect(screen.queryByText(/Plan sırası/)).toBeNull();
      cleanup();
    }
  });

  it('canlı ve eşleşen işte işaret yok, plan sırası görünür; taslaksa hazırlık bekler', () => {
    render(<PlanCipi paket={paket(CANLI, 'published')} sira />);
    expect(screen.queryByText('Planlanmadı')).toBeNull();
    expect(screen.queryByText(/hazırlık bekliyor/)).toBeNull();
    expect(screen.getByText('Plan sırası 2')).toBeTruthy();
    cleanup();
    render(<PlanCipi paket={paket(CANLI, 'draft')} />);
    expect(screen.getByText('Plan canlı · hazırlık bekliyor')).toBeTruthy();
  });

  it('başka kaynağa yerleşmiş iş ayrı işaretlenir; plan durumu olmayan (rotasız) işte işaret yok', () => {
    render(<PlanCipi paket={paket({ ...CANLI, eslesiyor: false })} />);
    expect(screen.getByText('Plan başka kaynakta')).toBeTruthy();
    cleanup();
    const { container } = render(<PlanCipi paket={paket(null)} />);
    expect(container.textContent).toBe('');
  });
});
