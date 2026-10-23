import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SayfaBasligi } from './SayfaBasligi.tsx';

afterEach(cleanup);

describe('SayfaBasligi', () => {
  it('başlığı, alt satırı ve birincil eylemi çizer; birincil düğme işini yapar', () => {
    const yap = vi.fn();
    render(<SayfaBasligi baslik="Kayıtlar" alt="Son 30 gün" birincil={{ etiket: 'Kayıt gir', simge: 'plus', yap }} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Kayıtlar' })).toBeTruthy();
    expect(screen.getByText('Son 30 gün')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kayıt gir' }));
    expect(yap).toHaveBeenCalledOnce();
  });

  it('ikincil eylemleri tek menü düğmesinde toplar', () => {
    const sec = vi.fn();
    render(<SayfaBasligi baslik="Kayıtlar" eylemler={[{ anahtar: 'yazdir', baslik: 'Yazdır', sec }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kayıtlar: diğer işlemler' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Yazdır' }));
    expect(sec).toHaveBeenCalledOnce();
  });

  it('eylem verilmezse düğme çizmez; pasif birincil eylem tıklanmaz', () => {
    render(<SayfaBasligi baslik="Rapor" />);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    const yap = vi.fn();
    render(<SayfaBasligi baslik="Rapor" birincil={{ etiket: 'Kaydet', yap, pasif: true }} />);
    const dugme = screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
  });
});
