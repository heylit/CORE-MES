import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { KAPISIZ, OKUYAN, YONETICI, kmAc } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kalite Merkezi yeni ekran kabuğu', () => {
  it('kapı işlemi olmayana hazırlanıyor iletisini gösterir', async () => {
    kmAc('', KAPISIZ);
    expect(await screen.findByText('Bu ekran hazırlanıyor')).toBeTruthy();
  });

  it('bölüm sekmelerini ve yazana Yeni menüsünü gösterir', async () => {
    kmAc('', YONETICI);
    expect(await screen.findByRole('tab', { name: /Uygunsuzluk/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yeni/ })).toBeTruthy();
  });

  it('yalnız okuyana Yeni menüsü çıkmaz', async () => {
    kmAc('', OKUYAN);
    await screen.findByRole('tab', { name: /Uygunsuzluk/ });
    expect(screen.queryByRole('button', { name: /Yeni/ })).toBeNull();
  });

  it('bilinmeyen görünümde iletiyi gösterir', async () => {
    kmAc('olmayan', YONETICI);
    expect(await screen.findByText('Böyle bir görünüm yok.')).toBeTruthy();
  });

  it('eski çerçevede kalan bölüm eski yola gider (217 b)', async () => {
    kmAc('', YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: /Resim ve modeller/ }));
    expect(await screen.findByText('eski ekran')).toBeTruthy();
  });

  it('bölüm değişince alt sekmeleri gösterir', async () => {
    kmAc('', YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: /Kaynaklar/ }));
    expect(await screen.findByRole('tab', { name: /Tedarikçiler/ })).toBeTruthy();
  });
});
