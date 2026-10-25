import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KodOkuyucu } from './KodOkuyucu.tsx';
import { Pencere } from './Pencere.tsx';

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

  describe('kendiliginden', () => {
    afterEach(() => { vi.restoreAllMocks(); Reflect.deleteProperty(navigator, 'mediaDevices'); });
    function sahteKamera() {
      const durdur = vi.fn();
      let ver: (a: MediaStream) => void = () => undefined;
      const getUserMedia = vi.fn(() => new Promise<MediaStream>((r) => { ver = r; }));
      Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      return { getUserMedia, durdur, ver: () => ver({ getTracks: () => [{ stop: durdur }] } as unknown as MediaStream) };
    }

    it('verilmezse kamera dokunmadan acilmaz', () => {
      const k = sahteKamera();
      render(<KodOkuyucu okundu={() => undefined} />);
      expect(k.getUserMedia).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Kamerayı aç' })).toBeTruthy();
    });

    it('verilirse kamera acilista baslar, kapatilinca akis durur', async () => {
      const k = sahteKamera();
      render(<KodOkuyucu okundu={() => undefined} kendiliginden />);
      expect(k.getUserMedia).toHaveBeenCalledTimes(1);
      k.ver();
      fireEvent.click(await screen.findByRole('button', { name: 'Kamerayı kapat' }));
      expect(k.durdur).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Kamerayı aç' })).toBeTruthy();
    });

    it('izin beklenirken ekran kapanirsa gec gelen akis acik kalmaz', async () => {
      const k = sahteKamera();
      const { unmount } = render(<KodOkuyucu okundu={() => undefined} kendiliginden />);
      unmount();
      k.ver();
      await vi.waitFor(() => expect(k.durdur).toHaveBeenCalledTimes(1));
    });
  });

  describe('acilista odak', () => {
    afterEach(() => { vi.unstubAllGlobals(); });
    const isaretci = (ince: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: ince && q === '(pointer: fine)' }));

    it('secenek verilmezse dokunmatikte de kod alani acilista odak alir', () => {
      isaretci(false);
      render(<KodOkuyucu okundu={() => undefined} />);
      expect(document.activeElement).toBe(screen.getByLabelText('Kod'));
    });

    it('pencere icinde de kod alani acilista odak alir; secenekle dokunmatikte almaz', () => {
      isaretci(false);
      const { unmount } = render(<Pencere acik kapat={() => undefined} baslik="Okut"><KodOkuyucu okundu={() => undefined} /></Pencere>);
      expect(document.activeElement).toBe(screen.getByLabelText('Kod'));
      unmount();
      render(<Pencere acik kapat={() => undefined} baslik="Okut"><KodOkuyucu okundu={() => undefined} dokunmatikteOdakYok /></Pencere>);
      expect(document.activeElement).not.toBe(screen.getByLabelText('Kod'));
    });

    it('secenekle fareli cihazda kod alani acilista odak alir', () => {
      isaretci(true);
      render(<KodOkuyucu okundu={() => undefined} dokunmatikteOdakYok />);
      expect(document.activeElement).toBe(screen.getByLabelText('Kod'));
    });

    it('secenekle dokunmatikte acilista odak almaz, kamera hata verince alir', async () => {
      isaretci(false);
      render(<KodOkuyucu okundu={() => undefined} dokunmatikteOdakYok />);
      expect(document.activeElement).not.toBe(screen.getByLabelText('Kod'));
      fireEvent.click(screen.getByRole('button', { name: 'Kamerayı aç' }));
      await screen.findByRole('status');
      expect(document.activeElement).toBe(screen.getByLabelText('Kod'));
    });
  });
});
