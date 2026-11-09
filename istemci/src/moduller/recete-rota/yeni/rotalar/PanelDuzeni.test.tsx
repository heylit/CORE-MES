import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

const bolumAc = async () => {
  sunucuKur(YONETICI, { durum: () => json(200, rotaDurumu()) });
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
  await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
  return bolge;
};
const govde = (bolge: HTMLElement) => bolge.querySelector('.tc-rr1-body') as HTMLElement;

describe('Sabit düzen ve daraltılabilir düzenleme paneli (B-2482-R5)', () => {
  it('panel yalnız düğmeyle daralır; seçim paneli açmaz, şerit seçili adımı gösterir; şeride dokununca açılır ve tercih yazılır', async () => {
    const bolge = await bolumAc();
    const dugme = within(bolge).getByRole('button', { name: 'Düzenleme paneli' });
    expect(dugme.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(dugme);
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(true);
    expect(localStorage.getItem('tc-rr1-duzen-paneli-dar')).toBe('1');
    expect(within(bolge).getByRole('button', { name: 'Düzenleme panelini aç: Seçim yok' })).toBeTruthy();

    fireEvent.click(within(bolge).getByRole('button', { name: 'OP 10 Tornalama' }));
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(true);
    fireEvent.click(within(bolge).getByRole('button', { name: 'Düzenleme panelini aç: OP 10 Tornalama' }));
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(false);
    expect(localStorage.getItem('tc-rr1-duzen-paneli-dar')).toBe('');
    expect(within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' })).toBeTruthy();
  });

  it('daraltma tercihi yeniden açılışta korunur', async () => {
    localStorage.setItem('tc-rr1-duzen-paneli-dar', '1');
    const bolge = await bolumAc();
    expect(govde(bolge).classList.contains('tc-rr1-dar')).toBe(true);
    expect(within(bolge).queryByRole('separator', { name: 'Düzenleme paneli genişliği' })).toBeNull();
  });

  it('kenar tutamağı genişliği değiştirir, gövdenin yüzde 60ını aşmaz, hatırlanır; Home varsayılana döner', async () => {
    // jsdom'da PointerEvent yok; fare olayı clientX'i taşır.
    if (typeof window.PointerEvent === 'undefined') {
      vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId: number; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerId = i.pointerId ?? 0; } });
    }
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 440 } as DOMRect);
    const bolge = await bolumAc();
    const kenar = within(bolge).getByRole('separator', { name: 'Düzenleme paneli genişliği' });
    fireEvent.keyDown(kenar, { key: 'ArrowLeft' });
    expect(govde(bolge).style.getPropertyValue('--tc-rr1-panel')).toBe('472px');
    expect(localStorage.getItem('tc-rr1-duzen-paneli-genis')).toBe('472');
    fireEvent.pointerDown(kenar, { button: 0, clientX: 800, pointerId: 1 });
    fireEvent.pointerMove(kenar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(kenar, { clientX: 100, pointerId: 1 });
    expect(govde(bolge).style.getPropertyValue('--tc-rr1-panel')).toBe('600px');
    expect(localStorage.getItem('tc-rr1-duzen-paneli-genis')).toBe('600');
    fireEvent.keyDown(kenar, { key: 'Home' });
    expect(govde(bolge).style.getPropertyValue('--tc-rr1-panel')).toBe('');
    expect(localStorage.getItem('tc-rr1-duzen-paneli-genis')).toBe('');
  });
});
