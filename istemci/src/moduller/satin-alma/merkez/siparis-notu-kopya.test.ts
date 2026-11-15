import { afterEach, describe, expect, it, vi } from 'vitest';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S } from './store.ts';
import './ui.ts';

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('3279 a sipariş notu', () => {
  it('"Metni kopyala" alanın değiştirilmiş halini kopyalar, ilk metni değil', async () => {
    S.ready = true;
    const yaz = vi.fn(async (_metin: string) => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: yaz } });
    document.body.innerHTML = `<div data-sa-merkez><div id="gres"></div><div id="modal-root">
      <textarea id="po-out">Kalite şartı: ORN ilk şart</textarea>
      <button data-act="po-copy">Metni kopyala</button></div></div>`;
    document.querySelector<HTMLTextAreaElement>('#po-out')!.value = 'Kalite şartı: ORN düzeltilmiş şart';
    document.querySelector<HTMLButtonElement>('[data-act="po-copy"]')!.click();
    await vi.waitFor(() => expect(yaz).toHaveBeenCalled());
    expect(yaz).toHaveBeenCalledWith('Kalite şartı: ORN düzeltilmiş şart');
  });
});
