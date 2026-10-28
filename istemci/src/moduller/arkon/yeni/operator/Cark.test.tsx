import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { IsEylemi, IsOnizKarti, MakineEylemi, MakineKarti, TerminalCarki, type CarkMakinesi, type CarkSeridi } from './Cark.tsx';
import { bosIs } from './kurallar.ts';
import type { Is } from './tipler.ts';

afterEach(() => { cleanup(); });

const is = (no: string, state: Is['state'], ek: Partial<Is> = {}): Is => ({ ...bosIs({ l: 'Deneme' }), empty: false, no, part: `Parça ${no}`, op: 'Op 20', state, target: 10, good: 2, ...ek });
const ISLER = [is('UE-1', 'running', { due: '27 Eki' }), is('UE-2', 'queued'), is('UE-3', 'paused', { urgent: true })];
const MAKINELER: CarkMakinesi[] = [
  { id: 'M-1', ad: 'Makine 1', secili: true, plan: true, kilit: null },
  { id: 'M-2', ad: 'Makine 2', secili: false, plan: false, kilit: null },
  { id: 'M-3', ad: 'Makine 3', secili: false, plan: false, kilit: 'Başka işe ayrılmış: UE-9 op 10' },
];

// Terminalin kurduğu biçimde: bakılan iş dışarıda tutulur, geçiş ve makine seçimi yalnız eylem düğmesiyle olur.
function Deneme({ gecilen, secilen, engel = null, isler = ISLER }: { gecilen: number[]; secilen: string[]; engel?: string | null; isler?: readonly Is[] }) {
  const [bak, bakYaz] = useState(0);
  const [mak, makYaz] = useState(0);
  const seritler: CarkSeridi[] = [
    {
      anahtar: 'is', ad: 'İşler', simge: 'list', sayi: isler.length, etkin: 0, bak, bakYaz,
      ciz: (i) => <IsOnizKarti is={isler[i] ?? bosIs({ l: 'Deneme' })} siradaki={i === 1} ekranda={i === 0} makine={i === 0 ? 'M-1' : null} />,
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
    expect(getByText('Ekranda')).toBeTruthy();
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

  it('888 c: sürükleme sahnenin dışında bırakılsa da sayılır; işaretçi yürüyünce sahneye bağlanır, yerinde dokunuşta bağlanmaz', () => {
    // jsdom'un PointerEvent'i yok; MouseEvent işaretçi kimliğini taşımaz, kimlikli küçük bir alt sınıf verilir.
    class Isaretci extends MouseEvent {
      readonly pointerId: number;
      constructor(tur: string, ek: MouseEventInit & { pointerId?: number } = {}) { super(tur, ek); this.pointerId = ek.pointerId ?? 0; }
    }
    const eskiOlay = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
    Object.defineProperty(window, 'PointerEvent', { value: Isaretci, configurable: true });
    const bagli = new Set<number>();
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const eski = { set: proto['setPointerCapture'], has: proto['hasPointerCapture'] };
    proto['setPointerCapture'] = (id: number) => { bagli.add(id); };
    proto['hasPointerCapture'] = (id: number) => bagli.has(id);
    try {
      const { getByRole, getByText, container } = render(<Deneme gecilen={[]} secilen={[]} />);
      const sahne = getByRole('group', { name: 'İşler' });
      fireEvent.pointerDown(sahne, { clientX: 200, pointerId: 1 });
      fireEvent.pointerMove(sahne, { clientX: 196, pointerId: 1 });
      expect(bagli.size).toBe(0);
      fireEvent.pointerMove(sahne, { clientX: 150, pointerId: 1 });
      expect(bagli.has(1)).toBe(true);
      // Yakalanan işaretçinin bırakılışı sahnenin dışında olsa da sahneye gelir.
      fireEvent.pointerUp(sahne, { clientX: -300, pointerId: 1 });
      expect(getByText(/Önizleme/)).toBeTruthy();
      expect(container.querySelector('[data-fark="0"]')!.textContent).toContain('UE-2');
    } finally {
      proto['setPointerCapture'] = eski.set;
      proto['hasPointerCapture'] = eski.has;
      if (eskiOlay) Object.defineProperty(window, 'PointerEvent', eskiOlay); else Reflect.deleteProperty(window, 'PointerEvent');
    }
  });

  it('888 a: tek işte ok, sıra ve ipucu yok; kart tek başına durur, sürükleme bir şey yapmaz', () => {
    if (!('PointerEvent' in window)) Object.defineProperty(window, 'PointerEvent', { value: MouseEvent, configurable: true });
    const { getByRole, queryByRole, queryByText, getByText, container } = render(<Deneme gecilen={[]} secilen={[]} isler={[ISLER[0]!]} />);
    expect(getByRole('button', { name: /İşler · 1/ })).toBeTruthy();
    expect(queryByRole('button', { name: 'Sonraki: işler' })).toBeNull();
    expect(queryByRole('button', { name: 'Önceki: işler' })).toBeNull();
    expect(queryByText('1 / 1')).toBeNull();
    expect(container.querySelector('.tc-ay1-tcark-ipucu')).toBeNull();
    expect([...container.querySelectorAll('.tc-ay1-tcark-oge')].map((x) => x.getAttribute('data-fark'))).toEqual(['0']);
    const sahne = getByRole('group', { name: 'İşler' });
    fireEvent.pointerDown(sahne, { clientX: 200 });
    fireEvent.pointerUp(sahne, { clientX: 100 });
    expect(getByText(/Ekranda · sayaç/)).toBeTruthy();
    // Makine şeridinde öğe çok: oklar orada durur.
    fireEvent.click(getByRole('button', { name: /Makineler · 3/ }));
    expect(getByRole('button', { name: 'Sonraki: makineler' })).toBeTruthy();
    expect(getByText('1 / 3')).toBeTruthy();
  });

  it('888 a: iş yokken şerit 0 sayar; ekrandaki boş iş tek kart olarak durur', () => {
    const { getByRole, queryByRole, container } = render(<Deneme gecilen={[]} secilen={[]} isler={[]} />);
    expect(getByRole('button', { name: /İşler · 0/ })).toBeTruthy();
    expect(queryByRole('button', { name: 'Sonraki: işler' })).toBeNull();
    expect(container.querySelectorAll('.tc-ay1-tcark-oge')).toHaveLength(1);
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

  it('828 a: ekrandaki iş kısa kartla ortada; komşular arkada üst üste çizilir, ötesi çizilmez', () => {
    const { container, getByText } = render(<Deneme gecilen={[]} secilen={[]} />);
    const orta = container.querySelector('[data-fark="0"]')!;
    expect(orta.textContent).toContain('Ekranda');
    expect(orta.textContent).toContain('2 / 10 adet · Termin 27 Eki');
    expect(orta.textContent).toContain('Makine: M-1');
    expect(orta.querySelector('progress')!.getAttribute('value')).toBe('0.2');
    expect([...container.querySelectorAll('.tc-ay1-tcark-oge')].map((x) => x.getAttribute('data-fark'))).toEqual(['0', '1', '2']);
    expect(getByText(/yalnız bakar/, { selector: '.tc-ay1-tcark-ipucu' })).toBeTruthy();
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
