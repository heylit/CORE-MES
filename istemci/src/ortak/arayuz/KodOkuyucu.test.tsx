import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { KodOkuyucu } from './KodOkuyucu.tsx';
import { Pencere } from './Pencere.tsx';
import { useOkutmaGecmisi } from './okutma-geribildirimi.ts';
import { useOkuyucuKomutu, type KomutIsleyici } from './okuyucu-komutu.ts';

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

  it('fabrika ayarindaki okuyucunun Turkce Q klavyede bozdugu ayraclar duzelir, baska metin degismez', () => {
    const okundu = vi.fn();
    render(<KodOkuyucu okundu={okundu} />);
    const alan = screen.getByLabelText('Kod');
    fireEvent.change(alan, { target: { value: 'LOTŞLT*000123' } });
    fireEvent.submit(alan.closest('form')!);
    expect(okundu).toHaveBeenLastCalledWith('LOT:LT-000123');
    fireEvent.change(alan, { target: { value: 'ŞAFT 2*3' } });
    fireEvent.submit(alan.closest('form')!);
    expect(okundu).toHaveBeenLastCalledWith('ŞAFT 2*3');
  });

  it('alansiz: kod alani ve dugme cizilmez; el okuyucu odak aramadan okunur, yazi alanindaki tuslar okutma sayilmaz', () => {
    const okundu = vi.fn();
    render(<><KodOkuyucu okundu={okundu} alansiz /><input aria-label="Miktar" /></>);
    expect(screen.queryByLabelText('Kod')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    for (const key of [...'LOT:LT-000123', 'Enter']) fireEvent.keyDown(document.body, { key });
    expect(okundu).toHaveBeenCalledWith('LOT:LT-000123');
    for (const key of ['4', 'Enter']) fireEvent.keyDown(screen.getByLabelText('Miktar'), { key });
    expect(okundu).toHaveBeenCalledTimes(1);
  });

  it('alansiz: kamerayi cagiran acar; kamerasi olmayan tarayicida uyari cikar', async () => {
    const { rerender } = render(<KodOkuyucu okundu={() => undefined} alansiz />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<KodOkuyucu okundu={() => undefined} alansiz kameraAcik />);
    expect((await screen.findByRole('status')).textContent).toMatch(/kameraya erişemiyor/);
  });

  it('kamerasi olmayan tarayicida kamera acilinca elle girisi gosteren uyari cikar', async () => {
    render(<KodOkuyucu okundu={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kamerayı aç' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/kameraya erişemiyor/);
  });

  it('sik: tek satirda kamera, kod, bul ve fotograf; kamera kapaliyken goruntu alani yer kaplamaz, ipucu alanin aciklamasidir', () => {
    const okundu = vi.fn();
    const { container } = render(<KodOkuyucu sik okundu={okundu} ipucu="Malzeme ya da yer okut" />);
    expect(container.querySelector('.tc-kod-okuyucu-kamera')?.hasAttribute('hidden')).toBe(true);
    expect(screen.getByRole('button', { name: 'Kamerayı aç' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fotoğraftan oku' })).toBeTruthy();
    const alan = screen.getByLabelText('Kod');
    expect(alan.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Malzeme ya da yer okut')).toBeTruthy();
    fireEvent.change(alan, { target: { value: ' MLZ:901 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bul' }));
    expect(okundu).toHaveBeenCalledWith('MLZ:901');
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

    it('secenekle dokunmatikte alan odaksizken el okuyucunun tuslari koda yazilir, Enter bildirir, odaktaki dugmeye basilmaz', () => {
      isaretci(false);
      const okundu = vi.fn();
      const kapat = vi.fn();
      render(<Pencere acik kapat={kapat} baslik="Okut"><KodOkuyucu okundu={okundu} dokunmatikteOdakYok /></Pencere>);
      const alan = screen.getByLabelText('Kod') as HTMLInputElement;
      const dugme = screen.getByRole('button', { name: 'Kamerayı aç' });
      dugme.focus();
      for (const t of 'LOT:12') fireEvent.keyDown(dugme, { key: t });
      expect(alan.value).toBe('LOT:12');
      expect(document.activeElement).toBe(dugme);
      expect(fireEvent.keyDown(dugme, { key: 'Enter' })).toBe(false);
      expect(okundu).toHaveBeenCalledWith('LOT:12');
      expect(alan.value).toBe('');
      fireEvent.keyDown(document.body, { key: 'Enter' });
      expect(okundu).toHaveBeenCalledTimes(1);
    });

    it('alan odaktayken ya da fareli cihazda tuslar ayrica yakalanmaz', () => {
      isaretci(true);
      const okundu = vi.fn();
      render(<KodOkuyucu okundu={okundu} dokunmatikteOdakYok />);
      fireEvent.keyDown(document.body, { key: 'A' });
      fireEvent.keyDown(document.body, { key: 'Enter' });
      expect((screen.getByLabelText('Kod') as HTMLInputElement).value).toBe('');
      expect(okundu).not.toHaveBeenCalled();
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

  describe('komut barkodu (1909)', () => {
    function Ekran({ okundu, komut }: { okundu: (k: string) => void; komut?: KomutIsleyici }) {
      const g = useOkutmaGecmisi();
      return <KodOkuyucu okundu={okundu} geribildirim={g} {...(komut ? { komut } : {})} />;
    }
    const okut = (kod: string) => {
      const alan = screen.getByLabelText('Kod');
      fireEvent.change(alan, { target: { value: kod } });
      fireEvent.submit(alan.closest('form')!);
    };

    it('komut ekranin isleyicisine gider, okunduya gitmez; sonucu seritte gorunur', () => {
      const okundu = vi.fn();
      const komut = vi.fn<KomutIsleyici>(() => ({ ton: 'tamam', metin: 'Kaydedildi' }));
      render(<Ekran okundu={okundu} komut={komut} />);
      okut('CMDŞKAYDET');
      expect(komut).toHaveBeenCalledWith({ ad: 'KAYDET' });
      expect(okundu).not.toHaveBeenCalled();
      expect(screen.getByText(/Kaydedildi/)).toBeTruthy();
      okut('LOC:A1');
      expect(okundu).toHaveBeenCalledWith('LOC:A1');
    });

    it('ekranda olmayan komut uyari olarak yazilir; isleyici yoksa komut siradan kod gibi gider', () => {
      const okundu = vi.fn();
      const { unmount } = render(<Ekran okundu={okundu} komut={() => null} />);
      okut('CMD:EVET');
      expect(screen.getByText(/Bu ekranda bu komut yok/)).toBeTruthy();
      expect(okundu).not.toHaveBeenCalled();
      unmount();
      render(<Ekran okundu={okundu} />);
      okut('CMD:EVET');
      expect(okundu).toHaveBeenCalledWith('CMD:EVET');
    });

    it('okuyucunun disinda pencere aciksa alan odaksizken tuslari yakalamaz', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: false }));
      const okundu = vi.fn();
      render(<><KodOkuyucu okundu={okundu} dokunmatikteOdakYok /><Pencere acik kapat={() => undefined} baslik="Onay"><button type="button">Vazgeç</button></Pencere></>);
      const dugme = screen.getByRole('button', { name: 'Vazgeç' });
      for (const t of 'LOT:12') fireEvent.keyDown(dugme, { key: t });
      fireEvent.keyDown(dugme, { key: 'Enter' });
      expect(okundu).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('useOkuyucuKomutu', () => {
    function Onay({ isle }: { isle: (k: unknown) => boolean }) {
      useOkuyucuKomutu(true, isle);
      return <button type="button" onClick={() => isle('tik')}>Vazgeç</button>;
    }
    it('hizli gelen komut islenir ve Enter odaktaki dugmeye basmaz; elle Enter dugmeye basar', () => {
      const isle = vi.fn(() => true);
      render(<Onay isle={isle} />);
      const dugme = screen.getByRole('button', { name: 'Vazgeç' });
      dugme.focus();
      for (const t of 'CMD:EVET') fireEvent.keyDown(dugme, { key: t, timeStamp: 1 });
      expect(fireEvent.keyDown(dugme, { key: 'Enter' })).toBe(false);
      expect(isle).toHaveBeenCalledWith({ ad: 'EVET' });
      vi.spyOn(performance, 'now').mockReturnValue(10_000);
      expect(fireEvent.keyDown(dugme, { key: 'Enter' })).toBe(true);
      vi.restoreAllMocks();
    });
  });
});
