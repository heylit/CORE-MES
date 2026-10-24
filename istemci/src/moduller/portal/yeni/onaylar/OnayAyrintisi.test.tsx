import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { SIMDI } from '../ornek-veri.ts';
import { ac, sunucuKur } from '../test-ortak.tsx';
import { onay, onayDeposu, SATINALMACI_KISI } from './test-verisi.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('OnayAyrintisi', () => {
  it('kimlikle gelen adres tek onayın kartını ve geçmişini açar', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const a = onay({ id: 'a7', no: 'ON-2026-0007', history: [{ at: new Date(SIMDI).toISOString(), by: 'firm', u: 'tmi-7', text: 'Onaya gönderildi' }] });
    sunucuKur(SATINALMACI_KISI, onayDeposu(a));
    ac('/portal/yeni/approvals?id=a7');
    expect(await screen.findByRole('heading', { name: 'ON-2026-0007' }, { timeout: 5000 })).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    const gecmis = screen.getByRole('region', { name: 'Geçmiş' });
    expect(within(gecmis).getByText('Onaya gönderildi')).toBeTruthy();
    expect(within(gecmis).getByText(/Deneme Müdür \(Deneme Atölye\)/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Onay kutusuna dön' })[0]?.getAttribute('href')).toBe('/portal/yeni/approvals');
  });

  it('olmayan onayı bulunamadı diye gösterir', async () => {
    sunucuKur(SATINALMACI_KISI, onayDeposu());
    ac('/portal/yeni/approvals?id=yok');
    expect(await screen.findByText('Onay kaydı bulunamadı.', {}, { timeout: 5000 })).toBeTruthy();
  });
});
