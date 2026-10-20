import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KodOkuyucu } from './KodOkuyucu.tsx';

describe('KodOkuyucu', () => {
  it('el okuyucunun yazdigini Enter ile bosluksuz bildirir, bos girdiyi bildirmez', () => {
    const okundu = vi.fn();
    render(<KodOkuyucu okundu={okundu} />);
    const alan = screen.getByLabelText('Kod');
    fireEvent.change(alan, { target: { value: '   ' } });
    fireEvent.submit(alan.closest('form')!);
    expect(okundu).not.toHaveBeenCalled();
    fireEvent.change(alan, { target: { value: ' LOC:R1-02 ' } });
    fireEvent.submit(alan.closest('form')!);
    expect(okundu).toHaveBeenCalledWith('LOC:R1-02');
    expect((alan as HTMLInputElement).value).toBe('');
  });

  it('kamerasi olmayan tarayicida kamera acilinca elle girisi gosteren uyari cikar', async () => {
    render(<KodOkuyucu okundu={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kamerayı aç' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/kameraya erişemiyor/);
  });
});
