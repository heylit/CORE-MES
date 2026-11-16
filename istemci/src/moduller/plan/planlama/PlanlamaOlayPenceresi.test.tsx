import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useOlayAc, type PlanOlayTuru } from './gorunumler.ts';
import { CALISMA_KAYDI, MALIYETSIZ, YONETICI, ac, sunucuKur } from './test-ortak.tsx';

// Şeridin "Olay ekle" düğmesi iskeletin verdiği bağlamı çağırır; iskelet olay penceresini istenen türle açar (3308-1 a).
// Sınama görünümü şeridin yerine bağlamı çağırır, sınama penceresi iskeletin verdiği türü yazar.
const Sinama = () => {
  const olayAc = useOlayAc();
  return (
    <div>
      <output data-testid="baglam">{olayAc ? 'var' : 'yok'}</output>
      <button type="button" onClick={() => { olayAc?.('acil'); }}>Acil olay</button>
      <button type="button" onClick={() => { olayAc?.('fason'); }}>Fason olayı</button>
    </div>
  );
};
vi.mock('./motor/index.tsx', () => ({ PlanlamaMotoru: Sinama }));
vi.mock('./motor/olay/OlayFormu.tsx', () => ({
  OlayPenceresi: ({ on, kapat }: { on: PlanOlayTuru | null; kapat: () => void }) => (
    <div>
      <output data-testid="olay-turu">{on ?? 'kapali'}</output>
      <button type="button" onClick={kapat}>Pencereyi kapat</button>
    </div>
  ),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('iskeletin olay penceresi', () => {
  it('plan yazabilen kişide bağlam verilir; pencere istenen türle açılır, kapanır, başka türle yeniden açılır (izinli)', async () => {
    sunucuKur(YONETICI, [CALISMA_KAYDI]);
    ac('/plan/plan');
    const tur = await screen.findByTestId('olay-turu', {}, { timeout: 10000 });
    expect(tur.textContent).toBe('kapali');
    expect(screen.getByTestId('baglam').textContent).toBe('var');
    fireEvent.click(screen.getByRole('button', { name: 'Acil olay' }));
    expect(screen.getByTestId('olay-turu').textContent).toBe('acil');
    fireEvent.click(screen.getByRole('button', { name: 'Pencereyi kapat' }));
    expect(screen.getByTestId('olay-turu').textContent).toBe('kapali');
    fireEvent.click(screen.getByRole('button', { name: 'Fason olayı' }));
    expect(screen.getByTestId('olay-turu').textContent).toBe('fason');
  }, 20000);

  it('plan yazamayan kişide bağlam yoktur, pencere hiç kurulmaz (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, [CALISMA_KAYDI]);
    ac('/plan/plan');
    await waitFor(() => { expect(screen.getByTestId('baglam').textContent).toBe('yok'); }, { timeout: 10000 });
    expect(screen.queryByTestId('olay-turu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Acil olay' }));
    expect(screen.queryByTestId('olay-turu')).toBeNull();
  }, 20000);
});
