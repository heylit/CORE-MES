import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { derle, girdiKur, planOku, plandanBitenler } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { ListeDuzeni } from './ListeDuzeni.tsx';
import { modelKur } from './kurallar.ts';
import { siraKartlari } from './yerlestirme.ts';

afterEach(() => { cleanup(); });

// Örnek çalışma uydurmadır: iki emir (ORN-2 geç, ORN-3 riskli); 2.20 süren iştir.
function kur(ek: { w?: Record<string, unknown>; gercek?: Record<string, unknown> } = {}) {
  const c0 = ornekCalisma();
  const c = { ...c0, w: { ...c0.w, ...ek.w }, ...(ek.gercek ? { gercek: ek.gercek } : {}) } as typeof c0;
  const p = planOku(c), m = modelKur(c, p, derle(girdiKur(c, plandanBitenler(c, p))), (id) => `ORN-${id}`);
  return { m, p, kartlar: siraKartlari(m) };
}
const zaman = (t: number): string => `01.01 ${String(Math.round(t))}`;
function ciz(x: ReturnType<typeof kur>, acik: string | null, ek: Partial<Parameters<typeof ListeDuzeni>[0]> = {}) {
  const ac = vi.fn(), planla = vi.fn(), yenidenPlanla = vi.fn();
  render(<ListeDuzeni m={x.m} p={x.p} kartlar={x.kartlar} acik={acik} ac={ac} zaman={zaman} mesgul={false} planla={planla} yenidenPlanla={yenidenPlanla} hamle={null} surum={4} tahta={<div data-test-tahta="" />} {...ek} />);
  return { ac, planla, yenidenPlanla };
}

describe('Kokpit liste düzeni (3414 b)', () => {
  it('her sipariş tek satırdır: durumu ve tek düğmesi; düğme satırı açar, açık satırda Kapat yazar', () => {
    const x = kur();
    const { ac } = ciz(x, null);
    const satirlar = [...document.querySelectorAll<HTMLElement>('.tc-pyq-ld-satir')];
    expect(satirlar.map((s) => s.dataset.kart).sort()).toEqual(['2', '3']);
    const gec = satirlar.find((s) => s.dataset.kart === '2') as HTMLElement;
    expect(gec.textContent).toContain('ORN-2');
    expect(gec.textContent).toMatch(/ geç/);
    fireEvent.click(within(gec).getByRole('button', { name: 'Düzelt' }));
    expect(ac).toHaveBeenCalledWith('2');
    expect(document.querySelector('.tc-pyq-ld-ayrinti')).toBeNull();
  });

  it('açık satır sonucu ve nedenini, adımları ve tahtayı gösterir; Planla yeniden dizmeyi çağırır', () => {
    const x = kur();
    const { ac, yenidenPlanla } = ciz(x, '2');
    const durum = screen.getByRole('status');
    expect(durum.querySelector('b')?.textContent).not.toBe('');
    expect(durum.textContent).toContain('Neden:');
    const adimlar = within(screen.getByRole('list', { name: 'Adımlar' })).getAllByRole('listitem');
    expect(adimlar.length).toBe(x.m.emirler.find((e) => e.id === '2')?.adimlar.length);
    expect(document.querySelector('[data-test-tahta]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Planla' }));
    expect(yenidenPlanla).toHaveBeenCalledWith(x.kartlar.find((k) => k.kok === '2'));
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(ac).toHaveBeenCalledWith(null);
  });

  it('yazamayan kişide satır açılır, plan değiştiren düğme çıkmaz', () => {
    ciz(kur(), '2', { planla: null, yenidenPlanla: null });
    expect(screen.queryByRole('button', { name: 'Planla' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Adımlar' })).toBeTruthy();
  });

  it('durdurulup taşınan, sahada süren adımın altında "terminalde durdurulmayı bekliyor" yazar (3414-7 a)', () => {
    ciz(kur({ w: { durdurulan: { '2.20': 1 } }, gercek: { '2.20': { m: '3', S: 138.5, A: 10, n: 4 } } }), '2');
    expect(document.querySelector('[data-durdurma-bekliyor="2.20"]')?.textContent).toBe('terminalde durdurulmayı bekliyor; canlıda eski yerinde');
    cleanup();
    ciz(kur(), '2');
    expect(document.querySelector('[data-durdurma-bekliyor]')).toBeNull();
  });

  it('süzgeçle eşleşen sipariş yoksa bunu söyler', () => {
    ciz({ ...kur(), kartlar: [] }, null);
    expect(screen.getByText('Bu süzgeçle eşleşen sipariş ya da emir yok.')).toBeTruthy();
  });
});
