import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CALISMA_ACILINCA, MOTOR_NOTU, PLANDA_IYILESTIR } from '../ortak.tsx';
import { Cubuk } from './Cubuk.tsx';

// B-2483-36/-37: motor sunucuda açıkken (576) çubuğun pasif düğmesi motoru neden göstermez; neden görünür kısa nottadır.
afterEach(() => { cleanup(); });

const ciz = (o: { plan: boolean; guncel?: boolean; planaGit?: (() => void) | null }) => render(
  <Cubuk plan={o.plan} guncel={o.guncel ?? true} planYaz nabiz={null} nabizAcik={false} nabizAc={() => {}} etkin={null} planaGit={o.planaGit ?? null}
    studyo={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null} />,
);
const cubuk = () => within(screen.getByRole('toolbar', { name: 'Plan çubuğu' }));

describe('plan çubuğunun pasif düğmeleri', () => {
  it('plan varken başka sayfada "Plan iyileştirme ara" plan sayfasına gider; pasif değildir, not yoktur', () => {
    const git = vi.fn();
    ciz({ plan: true, planaGit: git });
    const d = cubuk().getByRole('button', { name: 'Plan iyileştirme ara' });
    expect(d.getAttribute('aria-disabled')).toBeNull();
    expect(d.getAttribute('title')).not.toContain(MOTOR_NOTU);
    fireEvent.click(d);
    expect(git).toHaveBeenCalledTimes(1);
    expect(cubuk().queryByText('Plan sayfasında')).toBeNull();
  });

  it('çalışma yokken Planı kur pasif; nedeni çalışmadır, görünür notta yazar', () => {
    ciz({ plan: false, planaGit: () => {} });
    const d = cubuk().getByRole('button', { name: 'Planı kur' });
    expect(d.getAttribute('aria-disabled')).toBe('true');
    expect(d.getAttribute('title')).toContain(CALISMA_ACILINCA);
    expect(cubuk().getByText('Çalışma açılınca')).toBeTruthy();
  });

  it('plan varken gidecek yer de yoksa pasif; neden iyileştirmenin yeridir, motor değil', () => {
    ciz({ plan: true });
    const d = cubuk().getByRole('button', { name: 'Plan iyileştirme ara' });
    expect(d.getAttribute('aria-disabled')).toBe('true');
    expect(d.getAttribute('title')).toContain(PLANDA_IYILESTIR);
    expect(cubuk().getByText('Plan sayfasında')).toBeTruthy();
  });
});
