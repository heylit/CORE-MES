import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { YardimGorunumu } from './YardimGorunumu.tsx';

afterEach(cleanup);

describe('İK kullanım kılavuzu', () => {
  it('açılışta görünümün konusu, sık arananlar ve kategoriler', () => {
    render(<YardimGorunumu gorunum="gorev" git={vi.fn()} kapat={vi.fn()} />);
    expect(screen.getByText('Bu sayfa hakkında')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Yapılacaklar/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'kıdem tazminatı' })).toBeTruthy();
  });

  it('konu şekli ve metniyle açılır; ilgili sayfa ayarlar sekmesiyle gider; kapat çağrılır', () => {
    const git = vi.fn();
    const kapat = vi.fn();
    render(<YardimGorunumu gorunum="pano" git={git} kapat={kapat} konu="prim" />);
    expect(document.querySelector('svg.tc-ikr-sekil')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /İlgili sayfayı aç/ }));
    expect(git).toHaveBeenCalledWith('ayarlar', 'yanhak');
    fireEvent.click(screen.getByRole('button', { name: 'Kılavuzu kapat' }));
    expect(kapat).toHaveBeenCalled();
  });

  it('arama sonuç verir, sonuç vurgulu açılır; sonuç yoksa söyler', () => {
    render(<YardimGorunumu gorunum="pano" git={vi.fn()} kapat={vi.fn()} />);
    const kutu = screen.getByLabelText('Kılavuzda ara');
    fireEvent.change(kutu, { target: { value: 'kıdem' } });
    expect(screen.getByText(/sonuç$/)).toBeTruthy();
    fireEvent.keyDown(kutu, { key: 'Enter' });
    expect(document.querySelector('.tc-ikr-metin mark')).not.toBeNull();
    fireEvent.change(kutu, { target: { value: 'qqqzzz' } });
    expect(screen.getByText(/için sonuç yok/)).toBeTruthy();
  });

  it('şekil büyütülür', () => {
    render(<YardimGorunumu gorunum="pano" git={vi.fn()} kapat={vi.fn()} konu="baslangic" />);
    fireEvent.click(screen.getByRole('button', { name: /Şekli büyüt/ }));
    expect(screen.getByRole('dialog').querySelector('svg')).not.toBeNull();
  });
});
