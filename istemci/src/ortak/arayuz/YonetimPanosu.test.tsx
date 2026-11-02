import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AnaSayfaKaynagi, GrafikOzellikleri } from '../rota/ana-sayfa.ts';
import { YonetimPanosu } from './YonetimPanosu.tsx';

afterEach(cleanup);

const grafik = (anahtar: string, bolum: AnaSayfaKaynagi['bolum'], ek: Partial<AnaSayfaKaynagi> = {}): AnaSayfaKaynagi => ({
  anahtar, tur: 'grafik', baslik: anahtar, simge: 'chart', sira: 100, bolum,
  kaynak: ({ gun }: GrafikOzellikleri) => <section aria-label={anahtar}>{anahtar} {gun} gün</section>, ...ek,
});
const ac = (kaynaklar: AnaSayfaKaynagi[], islemler: string[] = [], adres = '/pano') =>
  render(<MemoryRouter initialEntries={[adres]}><YonetimPanosu kaynaklar={kaynaklar} islemler={islemler} /></MemoryRouter>);

describe('YonetimPanosu (kart 1773)', () => {
  const KAYNAKLAR = [
    grafik('uretim-a', 'uretim'),
    grafik('teslim-a', 'teslim'),
    grafik('kalite-gizli', 'kalite', { islem: 'oee.oku' }),
    { anahtar: 'is-a', tur: 'is', baslik: 'İş', simge: 'list', sira: 1, kaynak: () => null } satisfies AnaSayfaKaynagi,
  ];

  it('yalniz grafigi olan bolumleri sirayla gosterir; islemi olmayan grafigin bolumu cizilmez', () => {
    ac(KAYNAKLAR);
    expect(screen.getByRole('navigation', { name: 'Bölümler' }).textContent).toBe('ÜretimTeslim');
    expect(screen.getByRole('button', { name: 'Üretim' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Kalite' })).toBeNull();
    expect(screen.getByRole('region', { name: 'uretim-a' }).textContent).toBe('uretim-a 30 gün');
    expect(screen.queryByRole('region', { name: 'teslim-a' })).toBeNull();
  });

  it('donem suzgeci butun grafiklere gecer; bolum dugmesi bolumu degistirir; adres secimi tasir', () => {
    ac(KAYNAKLAR);
    fireEvent.click(screen.getByRole('button', { name: 'Son 7 gün' }));
    expect(screen.getByRole('region', { name: 'uretim-a' }).textContent).toBe('uretim-a 7 gün');
    fireEvent.click(screen.getByRole('button', { name: 'Teslim' }));
    expect(screen.getByRole('region', { name: 'teslim-a' }).textContent).toBe('teslim-a 7 gün');
    cleanup();
    ac(KAYNAKLAR, [], '/pano?bolum=teslim&gun=90');
    expect(screen.getByRole('region', { name: 'teslim-a' }).textContent).toBe('teslim-a 90 gün');
    cleanup();
    ac(KAYNAKLAR, [], '/pano?bolum=yok&gun=5');
    expect(screen.getByRole('region', { name: 'uretim-a' }).textContent).toBe('uretim-a 30 gün');
  });

  it('gorunen grafik yoksa bos durum', () => {
    ac([grafik('kalite-gizli', 'kalite', { islem: 'oee.oku' })]);
    expect(screen.getByText('Size açık bir grafik yok.')).toBeTruthy();
  });
});
