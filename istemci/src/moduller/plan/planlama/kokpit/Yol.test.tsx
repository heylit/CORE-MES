import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import { Yol } from './Yol.tsx';
import { siraKartlari } from './yerlestirme.ts';

afterEach(() => { cleanup(); });

// Uydurma örnek (ORN-): ORN-1 yarım planlı (ilk adımı planda, ikincisi dışarıda), ORN-2 hiç planlanmamış.
const is = (id: string, m: string, S: number, C: number): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: id, m, S, C, basladi: false, fason: false, kilitli: false, sira: 0 });
const YARIM: KokpitEmri = { id: '1', no: 'ORN-1', urun: 'ORN-Flanş', adet: 8, termin: 60, bitis: null, durum: 'plansiz', gecikme: null, adimlar: [{ id: '1.10', ad: 'Torna', adaylar: ['T1'] }, { id: '1.20', ad: 'Freze', adaylar: ['T2'] }] };
const YENI: KokpitEmri = { id: '2', no: 'ORN-2', urun: 'ORN-Burç', adet: 4, termin: 80, bitis: null, durum: 'plansiz', gecikme: null, adimlar: [{ id: '2.10', ad: 'Torna', adaylar: ['T1'] }] };
const model = (emirler: KokpitEmri[]): KokpitModeli => ({ simdi: 8, tezgahlar: ['T1', 'T2'].map((id) => ({ id, kod: `ORN-${id}`, ad: '', fason: false })), isler: { '1.10': is('1.10', 'T1', 8, 12) }, emirler, bas: 0, son: 336, acik: {}, durus: {} });
function ciz(emirler: KokpitEmri[], kok: string, pd: Parameters<typeof Yol>[0]['pd'] = null) {
  const m = model(emirler), kart = siraKartlari(m).find((k) => k.kok === kok) ?? null;
  const oner = vi.fn(), eksikPlanla = vi.fn();
  render(<Yol m={m} p={null} kart={kart} vurgu zaman={(t) => String(t)} pd={pd} plansiz={emirler.length} taslakVar={false} mesgul={false} oner={oner} eksikPlanla={eksikPlanla} hepsiniPlanla={vi.fn()} yenidenPlanla={vi.fn()} onayaGec={vi.fn()} hamle={vi.fn()} surum={4} />);
  return { oner, eksikPlanla };
}

describe('planlama yolunda yarım planlı emir', () => {
  it('"Sistem önersin" (plana alma) gösterilmez; "Eksik adımları planla" yeniden planlamayı çağırır', () => {
    const { oner, eksikPlanla } = ciz([YARIM], '1');
    expect(screen.queryByRole('button', { name: 'Sistem önersin' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Teslimden geriye' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('ORN-1: 1 adımın planda yeri yok; öteki adımlar planda.');
    const d = screen.getByRole('button', { name: 'Eksik adımları planla' });
    expect(d.className).toContain('tc-dugme-birincil');
    fireEvent.click(d);
    expect(eksikPlanla).toHaveBeenCalledTimes(1);
    expect(oner).not.toHaveBeenCalled();
  });

  it('taslak çubuğu görünürken (Canlıya al birincil) "Eksik adımları planla" ikincildir', () => {
    const m = model([YARIM]), kart = siraKartlari(m).find((k) => k.kok === '1') ?? null;
    render(<Yol m={m} p={null} kart={kart} vurgu zaman={(t) => String(t)} pd={null} plansiz={1} taslakVar mesgul={false} oner={vi.fn()} eksikPlanla={vi.fn()} hepsiniPlanla={vi.fn()} yenidenPlanla={vi.fn()} onayaGec={vi.fn()} hamle={vi.fn()} surum={4} />);
    expect(screen.getByRole('button', { name: 'Eksik adımları planla' }).className).not.toContain('tc-dugme-birincil');
  });

  it('hiç planlanmamış emirde "Sistem önersin" kalır; "Eksik adımları planla" çıkmaz', () => {
    const { oner } = ciz([YENI], '2', { emirNo: 'ORN-2', adim: 1, isaretli: 0, ileriHazir: true, isaretliHazir: false, terminVar: true });
    expect(screen.queryByRole('button', { name: 'Eksik adımları planla' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sistem önersin' }));
    expect(oner).toHaveBeenCalledWith('ileri');
  });
});
