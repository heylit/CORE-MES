import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OLAY_YOK, OlayAcBaglami, studyoAdresi, studyoIstegiOku } from '../gorunumler.ts';
import { Cubuk } from './ust/Cubuk.tsx';

afterEach(() => { cleanup(); });

// 2171: sunucusu hazır pasif düğmelerin bağlanması. Olay ekle atölyenin olay formunu açar (yeni form yok).
const cubuk = (planYaz = true) => (
  <Cubuk plan guncel planYaz={planYaz} nabiz={null} nabizAcik={false} nabizAc={() => undefined} etkin="plan" planaGit={null}
    studyo={() => undefined} ozeteGit={() => undefined} refSec={null} sabitle={null} sabitAd={null} />
);

describe('stüdyo olay isteği', () => {
  it('adres ve okuma aynı isteği taşır; bilinmeyen olay türü okunmaz', () => {
    const adres = studyoAdresi({ tur: 'olay', v: 'malzeme' });
    expect(adres.endsWith('?istek=olay&v=malzeme')).toBe(true);
    expect(studyoIstegiOku(new URLSearchParams('istek=olay&v=malzeme'))).toEqual({ tur: 'olay', v: 'malzeme' });
    expect(studyoIstegiOku(new URLSearchParams('istek=olay&v=yangin'))).toBeNull();
    expect(studyoIstegiOku(new URLSearchParams('istek=tez&v=T1'))).toEqual({ tur: 'tez', v: 'T1' });
  });
});

describe('plan çubuğu Olay ekle', () => {
  it('tahta bağlamı verince düğme açık, basınca arıza türüyle olay formunu ister (izinli)', () => {
    const ac = vi.fn();
    render(<OlayAcBaglami.Provider value={ac}>{cubuk()}</OlayAcBaglami.Provider>);
    const d = screen.getByRole('button', { name: 'Olay ekle' });
    expect(d.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(d);
    expect(ac).toHaveBeenCalledWith('ariza');
  });

  it('bağlam yoksa (tahta dışı, atölye açılamaz) yerinde pasif, nedeni ipucunda, istek gitmez (reddedilen)', () => {
    render(cubuk());
    const d = screen.getByRole('button', { name: 'Olay ekle' });
    expect(d.getAttribute('aria-disabled')).toBe('true');
    expect(d.getAttribute('title')).toContain(OLAY_YOK);
  });

  it('plan yazamayana düğme hiç çizilmez', () => {
    render(<OlayAcBaglami.Provider value={vi.fn()}>{cubuk(false)}</OlayAcBaglami.Provider>);
    expect(screen.queryByRole('button', { name: 'Olay ekle' })).toBeNull();
  });
});
