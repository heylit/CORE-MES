import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { PlanlamaAtolyesi } from '../index.tsx';
import { ornekCalisma } from '../ornek.ts';
import { saatiSabitle } from '../../test-saati.ts';

// 2734: sürüklerken pano ya da sayfa kaydırıcısı dikey kayınca çubuk imlecin altında kalır (--dy kayma kadar artar).
saatiSabitle(() => ornekCalisma());
const BRIF = 'tmi:planlama:brif';
const gun = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
beforeEach(() => { localStorage.setItem(BRIF, gun()); });
afterEach(cleanup);
if (typeof window.PointerEvent === 'undefined') {
  class IsaretciOlayi extends MouseEvent {
    readonly pointerId: number;
    constructor(tur: string, o: PointerEventInit = {}) { super(tur, o); this.pointerId = o.pointerId ?? 0; }
  }
  window.PointerEvent = IsaretciOlayi as unknown as typeof PointerEvent;
}

type Oz = Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'>;
function Iskelet(oz: Oz) {
  const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
  return <PlanlamaAtolyesi {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={() => undefined} secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />;
}
// scrollTop jsdom'da ölçüsüzdür: kaydırma elle verilir.
function kaydirilabilir(el: HTMLElement, boy: number): { top: number } {
  const d = { top: 0 };
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => d.top, set: (v: number) => { d.top = v; } });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => boy * 2 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => boy });
  return d;
}

describe('sürüklerken dikey kayma (2734)', () => {
  it('pano ve sayfa kaydırıcısı kayınca --dy kayma kadar artar', () => {
    const c = ornekCalisma();
    const komut = { degistir: vi.fn(() => true), geriAl: vi.fn(), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: vi.fn(), kaydet: vi.fn(async () => 1) } as unknown as CalismaKomutu;
    const depo = { ben: { kisi: { id: 1, ad: 'Deneme' }, yazabilir: true }, durum: null, planSurumu: { planSurumu: 1, sonCanliyaAlma: null }, senaryolar: null } as unknown as PlanlamaDeposu;
    const oz: Oz = { depo, calisma: c, komut, git: vi.fn(), yenile: vi.fn(), istek: null, yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.studyo']) };
    const { container } = render(<MemoryRouter><BildirimSaglayici><div data-test-kaydirici="" style={{ overflowY: 'auto' }}><Iskelet {...oz} /></div></BildirimSaglayici></MemoryRouter>);
    const dis = kaydirilabilir(container.querySelector<HTMLElement>('[data-test-kaydirici]')!, 500);
    const pn = kaydirilabilir(container.querySelector<HTMLElement>('.tc-pym-tp-pano')!, 400);
    const cubuk = document.querySelector<HTMLElement>('[data-id="2.40"]')!;
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(cubuk, { clientX: 100, clientY: 40, pointerId: 1 });
    expect(cubuk.style.getPropertyValue('--dy')).toBe('30px');
    pn.top = 25; dis.top = 70;
    fireEvent.pointerMove(cubuk, { clientX: 100, clientY: 40, pointerId: 1 });
    expect(cubuk.style.getPropertyValue('--dy')).toBe('125px');
    fireEvent.pointerCancel(cubuk, { pointerId: 1 });
  });
});
