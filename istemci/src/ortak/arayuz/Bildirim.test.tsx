import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { BILDIRIM_SURESI_MS, BildirimSaglayici, BildirimSayfaIzleyici, EYLEMLI_BILDIRIM_SURESI_MS, useBildirim } from './Bildirim.tsx';

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

function Gezgin() {
  const { bildir } = useBildirim();
  const git = useNavigate();
  return (
    <>
      <button type="button" onClick={() => bildir('hata', 'Kaydedilemedi')}>hata</button>
      <button type="button" onClick={() => bildir('tamam', 'Kayıt silindi', { eylem: { etiket: 'Geri al', yap: () => undefined } })}>sil</button>
      <button type="button" onClick={() => { void git('/kalite-merkezi/olcum'); }}>ic</button>
      <button type="button" onClick={() => { void git('/uretim-terminali'); }}>terminal</button>
    </>
  );
}

function gezginKur() {
  render(
    <BildirimSaglayici>
      <MemoryRouter initialEntries={['/kalite-merkezi']}>
        <BildirimSayfaIzleyici />
        <Gezgin />
      </MemoryRouter>
    </BildirimSaglayici>,
  );
}

describe('Bildirim ve sayfa değişimi', () => {
  it('başka sayfaya geçince önceki sayfanın hata bildirimi kapanır', () => {
    gezginKur();
    fireEvent.click(screen.getByRole('button', { name: 'hata' }));
    expect(screen.getByRole('alert').textContent).toContain('Kaydedilemedi');
    fireEvent.click(screen.getByRole('button', { name: 'terminal' }));
    expect(screen.queryByText('Kaydedilemedi')).toBeNull();
  });

  it('aynı sayfanın iç görünümüne geçiş hatayı kapatmaz', () => {
    gezginKur();
    fireEvent.click(screen.getByRole('button', { name: 'hata' }));
    fireEvent.click(screen.getByRole('button', { name: 'ic' }));
    expect(screen.getByRole('alert').textContent).toContain('Kaydedilemedi');
  });

  it('hata olmayan bildirim sayfa değişiminde kalır, kendi süresiyle kalkar', () => {
    gezginKur();
    fireEvent.click(screen.getByRole('button', { name: 'sil' }));
    fireEvent.click(screen.getByRole('button', { name: 'terminal' }));
    expect(screen.getByText('Kayıt silindi')).toBeTruthy();
  });
});
