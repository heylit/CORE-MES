import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { KodOkuyucu } from './KodOkuyucu.tsx';
import { gecmiseEkle, okutmaSesiAcik, okutmaSesiYaz, SON_OKUTMA_SAYISI, useOkutmaGecmisi, type OkutmaKaydi, type OkutmaTonu } from './okutma-geribildirimi.ts';

const kayit = (kimlik: number): OkutmaKaydi => ({ kimlik, kod: `LOC:A-${kimlik}`, ton: 'tamam', metin: 'Göz', zaman: '10:00' });

// Ekranın sonucu bildirdiği en küçük örnek: LOC doğru, gerisi yanlış.
function Ornek() {
  const g = useOkutmaGecmisi();
  const okundu = (kod: string) => { const ton: OkutmaTonu = kod.startsWith('LOC:') ? 'tamam' : kod.startsWith('MLZ:') ? 'uyari' : 'hata'; g.bildir(kod, ton, ton === 'hata' ? 'Kod tanınmadı' : 'Göz'); };
  return <KodOkuyucu sik okundu={okundu} geribildirim={g} />;
}
const okut = (kod: string) => {
  const alan = screen.getByLabelText('Kod');
  fireEvent.change(alan, { target: { value: kod } });
  fireEvent.submit(alan.closest('form')!);
};

describe('okutma geri bildirimi (1906)', () => {
  afterEach(() => { vi.useRealTimers(); okutmaSesiYaz(true); });

  it('gecmis en yeni basta, en cok bes kayit tutar', () => {
    let son: OkutmaKaydi[] = [];
    for (let i = 1; i <= 7; i++) son = gecmiseEkle(son, kayit(i));
    expect(son).toHaveLength(SON_OKUTMA_SAYISI);
    expect(son.map((k) => k.kimlik)).toEqual([7, 6, 5, 4, 3]);
  });

  it('okutma serite duser; alan sonucun tonuyla bir an yanar, sonra soner', () => {
    vi.useFakeTimers();
    const { container } = render(<Ornek />);
    expect(screen.getByText('Henüz okutma yok.')).toBeTruthy();
    const kok = container.querySelector('.tc-kod-okuyucu')!;
    okut('LOC:A01');
    expect(kok.getAttribute('data-ton')).toBe('tamam');
    okut('XYZ:1');
    expect(kok.getAttribute('data-ton')).toBe('hata');
    const satirlar = screen.getByRole('list', { name: 'Son okutmalar' }).querySelectorAll('li');
    expect([...satirlar].map((l) => l.getAttribute('data-ton'))).toEqual(['hata', 'tamam']);
    expect(satirlar[0]!.textContent).toContain('XYZ:1');
    expect(satirlar[0]!.textContent).toContain('Kod tanınmadı');
    act(() => { vi.advanceTimersByTime(1300); });
    expect(kok.hasAttribute('data-ton')).toBe(false);
  });

  it('ses dugmesi cihaz tercihini degistirir; bilgisi olmayan okuyucu serit gostermez', () => {
    render(<Ornek />);
    const dugme = screen.getByRole('button', { name: 'Ses açık' });
    expect(dugme.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(dugme);
    expect(screen.getByRole('button', { name: 'Ses kapalı' }).getAttribute('aria-pressed')).toBe('false');
    expect(okutmaSesiAcik()).toBe(false);
  });

  it('geribildirim verilmeyen okuyucu bugunku gibidir', () => {
    const { container } = render(<KodOkuyucu sik okundu={() => undefined} />);
    expect(container.querySelector('.tc-kod-okuyucu-serit')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ses / })).toBeNull();
  });
});
