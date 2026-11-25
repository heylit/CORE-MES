// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GIDIS_GECIKTI, GidisSatiri, gidisGeciktiMi } from './gidis.tsx';

afterEach(() => vi.useRealTimers());

describe('fason gidişi gösterimi (3709)', () => {
  it('bugün tesis günüdür: UTC gece yarısından sonra İstanbul günü ileridedir', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-10T21:30:00Z'));
    expect(gidisGeciktiMi('2099-01-10', false)).toBe(true);
    expect(gidisGeciktiMi('2099-01-11', false)).toBe(false);
    expect(gidisGeciktiMi('2099-01-10', true)).toBe(false);
    expect(gidisGeciktiMi(null, false)).toBe(false);
  });
  it('plan gidişi: "Gidiş: tarih (plan)", rozet yok', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-01T09:00:00Z'));
    render(<GidisSatiri gidis="2099-01-03" kaynak="plan" gerekenTarih="2099-01-10" terminGun={4} />);
    expect(screen.getByText(/Gidiş: 03.01.2099 \(plan\)/)).toBeTruthy();
    expect(screen.queryByText(GIDIS_GECIKTI)).toBeNull();
  });
  it('hesaplı ve geçmiş gidiş: en geç, plan yok ve gidiş gecikti rozetleri', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-20T09:00:00Z'));
    render(<GidisSatiri gidis="2099-01-06" kaynak="hesap" gerekenTarih="2099-01-10" terminGun={4} />);
    expect(screen.getByText(/Gidiş: 06.01.2099 \(en geç, yaklaşık\)/)).toBeTruthy();
    expect(screen.getByText('plan yok')).toBeTruthy();
    expect(screen.getByText(GIDIS_GECIKTI)).toBeTruthy();
  });
  it('hesaplanamazsa satır kaybolmaz: bilinmiyor ve neden', () => {
    const { rerender } = render(<GidisSatiri gidis={null} kaynak={null} gerekenTarih={null} terminGun={4} />);
    expect(screen.getByText('Gidiş: bilinmiyor (emir teslim günü yok)')).toBeTruthy();
    rerender(<GidisSatiri gidis={null} kaynak={null} gerekenTarih="2099-01-10" terminGun={null} />);
    expect(screen.getByText('Gidiş: bilinmiyor (firma süresi yok)')).toBeTruthy();
  });
});
