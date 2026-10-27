import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { IsEylemi, IsOnizKarti, MakineEylemi, MakineKarti, TerminalCarki, type CarkMakinesi, type CarkSeridi } from './Cark.tsx';
import { bosIs } from './kurallar.ts';
import type { Is } from './tipler.ts';

afterEach(() => { cleanup(); });

const is = (no: string, state: Is['state'], ek: Partial<Is> = {}): Is => ({ ...bosIs({ l: 'Deneme' }), empty: false, no, part: `Parça ${no}`, op: 'Op 20', state, target: 10, good: 2, ...ek });
const ISLER = [is('UE-1', 'running'), is('UE-2', 'queued'), is('UE-3', 'paused', { urgent: true })];
const MAKINELER: CarkMakinesi[] = [
  { id: 'M-1', ad: 'Makine 1', secili: true, plan: true, kilit: null },
  { id: 'M-2', ad: 'Makine 2', secili: false, plan: false, kilit: null },
  { id: 'M-3', ad: 'Makine 3', secili: false, plan: false, kilit: 'Başka işe ayrılmış: UE-9 op 10' },
];

// Terminalin kurduğu biçimde: bakılan iş dışarıda tutulur, geçiş ve makine seçimi yalnız eylem düğmesiyle olur.
function Deneme({ gecilen, secilen, engel = null }: { gecilen: number[]; secilen: string[]; engel?: string | null }) {
  const [bak, bakYaz] = useState(0);
  const [mak, makYaz] = useState(0);
  const seritler: CarkSeridi[] = [
    {
      anahtar: 'is', ad: 'İşler', simge: 'list', sayi: ISLER.length, etkin: 0, bak, bakYaz,
      ciz: (i, merkez) => (merkez && i === 0 ? <p>Ekrandaki iş kartı</p> : <IsOnizKarti is={ISLER[i]!} siradaki={i === 1} />),
      eylem: (i) => <IsEylemi ekranda={i === 0} don={() => bakYaz(0)} gec={() => gecilen.push(i)} />,
    },
    {
      anahtar: 'mak', ad: 'Makineler', simge: 'cpu', sayi: MAKINELER.length, etkin: -1, bak: mak, bakYaz: makYaz,
      ciz: (i) => <MakineKarti makine={MAKINELER[i]!} />,
      eylem: (i) => <MakineEylemi makine={MAKINELER[i]!} engel={engel} ozet="1 makine seçili" degistir={() => secilen.push(MAKINELER[i]!.id)} />,
    },
  ];
  return <TerminalCarki seritler={seritler} />;
}

describe('790: iş ve makine çarkı', () => {
  it('çevirmek yalnız bakar; geçiş yalnız "Bu işe geç" ile', () => {
    const gecilen: number[] = [];
    const { getByRole, queryByRole, getByText, container } = render(<Deneme gecilen={gecilen} secilen={[]} />);
    const sahne = getByRole('group', { name: 'İşler' });
    expect(getByText('Ekrandaki iş kartı')).toBeTruthy();
    expect(getByText(/Ekranda · sayaç ve eylemler bu işe yazılır/)).toBeTruthy();
    expect(queryByRole('button', { name: 'Bu işe geç' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Sonraki: işler' }));
    expect(getByText(/Önizleme · ekrandaki iş değişmez/)).toBeTruthy();
    expect(container.querySelector('.tc-ay1-tcark-konum')!.textContent).toBe('2 / 3');
    fireEvent.keyDown(sahne, { key: 'ArrowRight' });
    expect(getByRole('button', { name: 'Sonraki: işler' })).toHaveProperty('disabled', true);
    expect(gecilen).toEqual([]);
    fireEvent.click(getByRole('button', { name: 'Bu işe geç' }));
    expect(gecilen).toEqual([2]);
  });

  it('Escape ve "Ekrandakine dön" ekrandaki işe döner', () => {
    const { getByRole, getByText, queryByText } = render(<Deneme gecilen={[]} secilen={[]} />);
    const sahne = getByRole('group', { name: 'İşler' });
    fireEvent.keyDown(sahne, { key: 'ArrowRight' });
    fireEvent.keyDown(sahne, { key: 'Escape' });
    expect(queryByText(/Önizleme/)).toBeNull();
    fireEvent.keyDown(sahne, { key: 'ArrowRight' });
    fireEvent.click(getByRole('button', { name: 'Ekrandakine dön' }));
    expect(getByText(/Ekranda · sayaç/)).toBeTruthy();
  });

  it('yana kaydırma bir adım gider', () => {
    // jsdom PointerEvent tanımlamaz; konumlu olay MouseEvent ile verilir.
    if (!('PointerEvent' in window)) Object.defineProperty(window, 'PointerEvent', { value: MouseEvent, configurable: true });
    const { getByRole, getByText } = render(<Deneme gecilen={[]} secilen={[]} />);
    const sahne = getByRole('group', { name: 'İşler' });
    fireEvent.pointerDown(sahne, { clientX: 200 });
    fireEvent.pointerUp(sahne, { clientX: 100 });
    expect(getByText(/Önizleme/)).toBeTruthy();
  });

  it('önizleme kartı durum, sıradaki ve acil etiketini taşır', () => {
    const { getByRole, container } = render(<Deneme gecilen={[]} secilen={[]} />);
    fireEvent.click(getByRole('button', { name: 'Sonraki: işler' }));
    const orta = container.querySelector('[data-fark="0"]')!;
    expect(orta.textContent).toContain('UE-2');
    expect(orta.textContent).toContain('Sıradaki');
    fireEvent.click(getByRole('button', { name: 'Sonraki: işler' }));
    expect(container.querySelector('[data-fark="0"]')!.textContent).toContain('Acil');
  });

  it('makine şeridi: seçim düğmesi, kilitli makine seçilemez', () => {
    const secilen: string[] = [];
    const { getByRole, queryByRole, getByText } = render(<Deneme gecilen={[]} secilen={secilen} />);
    fireEvent.click(getByRole('button', { name: /Makineler · 3/ }));
    expect(getByRole('button', { name: /Makineler · 3/ }).getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: 'Seçimden çıkar' })).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'Sonraki: makineler' }));
    fireEvent.click(getByRole('button', { name: 'Bu makinede çalış' }));
    expect(secilen).toEqual(['M-2']);
    fireEvent.click(getByRole('button', { name: 'Sonraki: makineler' }));
    expect(queryByRole('button', { name: 'Bu makinede çalış' })).toBeNull();
    expect(getByText('Başka işe ayrılmış: UE-9 op 10', { selector: '.tc-ay1-tcark-not' })).toBeTruthy();
  });

  it('çalışan işte makine seçimi kapalıdır; neden yazılır', () => {
    const { getByRole, queryByRole, getByText } = render(<Deneme gecilen={[]} secilen={[]} engel="Çalışan işte makine değişmez" />);
    fireEvent.click(getByRole('button', { name: /Makineler · 3/ }));
    expect(queryByRole('button', { name: 'Seçimden çıkar' })).toBeNull();
    expect(getByText('Çalışan işte makine değişmez')).toBeTruthy();
  });
});
