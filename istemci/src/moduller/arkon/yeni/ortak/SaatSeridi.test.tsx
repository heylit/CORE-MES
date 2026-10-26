import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI } from '../test-ortak.tsx';

// Üst bant TMI ortak tasarımıyla başlar: Arkon markası (çizgili işaret, "Üretim Hazırlık") çizilmez; sayfa rozeti ve saat kalır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe('Arkon üst bandı', () => {
  it('marka ve ayraç yok; sayfa rozeti ve saat var', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/cizim');
    const rozet = await screen.findByRole('heading', { level: 2 }, { timeout: 10000 });
    const bant = rozet.closest('header.tc-ay-bant');
    expect(bant).toBeTruthy();
    expect(bant!.querySelector('.tc-ay-marka, .tc-ay-isaret, .tc-ay-ayrac')).toBeNull();
    expect(bant!.firstElementChild).toBe(rozet);
    expect(bant!.querySelector('.tc-ay-saat')).toBeTruthy();
  });
});
