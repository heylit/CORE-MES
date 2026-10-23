import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BILDIRIM_SURESI_MS, BildirimSaglayici, EYLEMLI_BILDIRIM_SURESI_MS, useBildirim } from './Bildirim.tsx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Tetik({ geriAl }: { geriAl: () => void }) {
  const { bildir } = useBildirim();
  return (
    <>
      <button type="button" onClick={() => bildir('tamam', 'Kayıt silindi', { eylem: { etiket: 'Geri al', yap: geriAl } })}>sil</button>
      <button type="button" onClick={() => bildir('hata', 'Silinemedi', { eylem: { etiket: 'Yeniden dene', yap: geriAl } })}>hata</button>
      <button type="button" onClick={() => bildir('bilgi', 'Kaydedildi')}>yalin</button>
    </>
  );
}

describe('Bildirim eylemi', () => {
  it('eylem düğmesi işi yapar ve bildirimi kapatır', () => {
    const geriAl = vi.fn();
    render(<BildirimSaglayici><Tetik geriAl={geriAl} /></BildirimSaglayici>);
    fireEvent.click(screen.getByRole('button', { name: 'sil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    expect(geriAl).toHaveBeenCalledOnce();
    expect(screen.queryByText('Kayıt silindi')).toBeNull();
  });

  it('eylemli bildirim süresi uzundur; eylemsiz bildirim eskisi gibi kısa sürede kalkar', () => {
    vi.useFakeTimers();
    render(<BildirimSaglayici><Tetik geriAl={vi.fn()} /></BildirimSaglayici>);
    fireEvent.click(screen.getByRole('button', { name: 'sil' }));
    fireEvent.click(screen.getByRole('button', { name: 'yalin' }));
    act(() => { vi.advanceTimersByTime(BILDIRIM_SURESI_MS); });
    expect(screen.queryByText('Kaydedildi')).toBeNull();
    expect(screen.getByText('Kayıt silindi')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(EYLEMLI_BILDIRIM_SURESI_MS - BILDIRIM_SURESI_MS); });
    expect(screen.queryByText('Kayıt silindi')).toBeNull();
  });

  it('eylemli hata bildirimi de kapatılana kadar kalır', () => {
    vi.useFakeTimers();
    render(<BildirimSaglayici><Tetik geriAl={vi.fn()} /></BildirimSaglayici>);
    fireEvent.click(screen.getByRole('button', { name: 'hata' }));
    act(() => { vi.advanceTimersByTime(EYLEMLI_BILDIRIM_SURESI_MS * 2); });
    expect(screen.getByRole('alert').textContent).toContain('Silinemedi');
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });
});
