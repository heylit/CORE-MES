import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { VardiyaPenceresi } from './Pencereler.tsx';
import type { VardiyaOzeti } from './kurallar.ts';

afterEach(() => { cleanup(); });

const ozet = (ek: Partial<VardiyaOzeti>): VardiyaOzeti => ({
  title: 'Vardiya özeti', machine: 'ORN-1', good: 0, scrap: 0, best: '—', std: 60, mOk: 0, mNok: 0,
  stopMin: 0, stops: 0, topReason: null, calls: 0, callAvg: '', goal: 0, headline: '', ...ek,
});
const ac = (o: VardiyaOzeti) => render(<VardiyaPenceresi ozet={o} vardiyaEtiketi="Vardiya" kapat={() => {}} devret={() => {}} />);

describe('Vardiya özeti', () => {
  it('veri yokken kalite, ölçüm ve ekip hedefi uydurulmaz', () => {
    const { baseElement } = ac(ozet({}));
    const metin = baseElement.textContent ?? '';
    expect(metin).not.toContain('%100');
    expect(metin).not.toContain('%0');
    expect(metin).not.toContain('— sn');
    expect(metin).toContain('ölçüm yok');
  });
  it('veri varken oranları gösterir', () => {
    const { baseElement } = ac(ozet({ good: 9, scrap: 1, best: 42, mOk: 2, goal: 18 }));
    const metin = baseElement.textContent ?? '';
    expect(metin).toContain('%90.0');
    expect(metin).toContain('42 sn');
    expect(metin).toContain('2/2');
    expect(metin).toContain('%50');
  });
});
