import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { YAZAN, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('3476-2 açıklamaya sığmayan seçimler', () => {
  test('özet adımı sınıra sığmayan seçimleri satır satır söyler', async () => {
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler/yeni?sablon=sys-7075');
    await screen.findAllByRole('heading', { name: /Form|Özet ve kayıt/ });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Adımlar' })).getByRole('button', { name: /Özet ve kayıt/ }));
    const uyari = (await screen.findByText('Açıklamaya sığmayan seçimler')).parentElement!;
    const maddeler = [...uyari.querySelectorAll('li')].map((x) => x.textContent);
    expect(maddeler).toEqual(['Açıklama 3: EN 10204 3.1 AS9100, UT ASTM E2375 Sınıf A']);
    expect(uyari.textContent).toMatch(/Malzeme ayarları > Ad, açıklama ve zorunlu alanlar/);
  });
});
