import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IsMalzemeDurumu } from '../../../stok/disari.ts';
import { MalzemeGostergesi, UretimGostergesi, malzemeTonu } from './YanGostergeler.tsx';
import type { Is } from './tipler.ts';

const durum = vi.hoisted(() => ({ deger: null as IsMalzemeDurumu | null, acilan: [] as unknown[] }));
vi.mock('../../baglanti.ts', () => ({
  useIsMalzemeDurumu: () => ({ durum: durum.deger, istasyonId: 7 }),
  durumMetni: () => ({ metin: 'Girdi tamam', ton: 'tamam' }),
  isMalzemesiniAc: (x: unknown) => { durum.acilan.push(x); },
}));
afterEach(cleanup);

// Veriler uydurmadır (ORN-).
describe('sayacın yan göstergeleri', () => {
  it('malzeme (Elde): kaç adetlik, kalan işe oranla dolar; tonu orana göre; dokununca malzeme paneli', () => {
    durum.deger = { girdi: 1, eksik: 0, istendi: 0, gelen: 0, yetme: { adetlik: 9, kalanAdet: 15, miktar: '3.600', birim: 'm', kod: 'ORN-CUBUK-40', ad: null } };
    render(<MalzemeGostergesi istasyon="ORN-IST-1" emirId={42} />);
    const m = screen.getByRole('meter', { name: 'Elde %60' });
    expect(m.getAttribute('aria-valuenow')).toBe('60');
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.getByRole('button').getAttribute('title')).toContain('9 adetlik');
    expect(screen.getByText('6 eksik')).toBeTruthy();
    expect(screen.getByRole('button').getAttribute('data-ton')).toBe('tamam');
    fireEvent.click(screen.getByRole('button'));
    expect(durum.acilan).toEqual([{ istasyonId: 7, uretimEmriId: 42, malzemeId: null }]);
  });

  it('malzeme verisi yoksa çubuk yok, yer boş tutulur (sıfır uydurulmaz)', () => {
    durum.deger = { girdi: 0, eksik: 0, istendi: 0, gelen: 0, yetme: null };
    const { container } = render(<MalzemeGostergesi istasyon="ORN-IST-1" emirId={42} />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(container.querySelector('[data-bos]')).not.toBeNull();
  });

  it('ton eşikleri: %50 ve üstü tamam, %20 ve üstü uyarı, altı hata', () => {
    expect([malzemeTonu(0.5), malzemeTonu(0.49), malzemeTonu(0.2), malzemeTonu(0.19)]).toEqual(['tamam', 'uyari', 'uyari', 'hata']);
  });

  it('üretilen: iyi / hedef ile dolar; hedefsiz işte çizilmez', () => {
    render(<UretimGostergesi is={{ good: 6, target: 15, empty: false } as Is} />);
    expect(screen.getByRole('meter', { name: 'Üretilen %40' })).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('/ 15')).toBeTruthy();
    cleanup();
    render(<UretimGostergesi is={{ good: 0, target: 0, empty: false } as Is} />);
    expect(screen.queryByRole('meter')).toBeNull();
  });
});
