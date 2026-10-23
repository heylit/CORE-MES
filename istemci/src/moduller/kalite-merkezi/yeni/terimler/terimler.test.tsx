import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { kmAc, MUHENDIS, YONETICI } from '../test-ortak.tsx';
import { TERIMLER, terimAra } from './sozluk.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Terimler', () => {
  it('arama terimde ve açıklamada Türkçe küçük harfle yapılır; sonuç alfabetiktir', () => {
    expect(terimAra('')).toHaveLength(Object.keys(TERIMLER).length);
    expect(terimAra('İZLENEBİLİRLİK').map(([k]) => k)).toEqual(['İzlenebilirlik']);
    expect(terimAra('malzeme inceleme').map(([k]) => k)).toEqual(['MRB']);
    const adlar = terimAra('').map(([k]) => k);
    expect(adlar).toEqual([...adlar].sort((a, b) => a.localeCompare(b, 'tr')));
  });

  it('ekranda arama listeyi süzer', async () => {
    kmAc('terimler', MUHENDIS);
    fireEvent.change(await screen.findByLabelText('Terim ara'), { target: { value: 'Cpk' } });
    expect(screen.getByText('Cpk')).toBeTruthy();
    expect(screen.queryByText('AQL')).toBeNull();
  });

  it('açıklamaları gizleme ayarı yalnız yöneticide; ayar terimKapali ile yazılır', async () => {
    kmAc('terimler', MUHENDIS);
    await screen.findByLabelText('Terim ara');
    expect(screen.queryByRole('button', { name: 'Terimler: diğer işlemler' })).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    const s = kmAc('terimler', YONETICI);
    fireEvent.click(await screen.findByRole('button', { name: 'Terimler: diğer işlemler' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ekranlarda gizle' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => JSON.stringify(y.govde).includes('"terimKapali":true'))).toBe(true); });
    expect(await screen.findByText('Ekranlardaki terim açıklamaları kapatıldı')).toBeTruthy();
  });

  it('kapalıyken menü "Açıklamaları aç" der', async () => {
    kmAc('terimler', YONETICI, { settings: [{ _id: 'genel', terimKapali: true }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Terimler: diğer işlemler' }));
    expect(await screen.findByRole('menuitem', { name: 'Açıklamaları aç' })).toBeTruthy();
  });
});
