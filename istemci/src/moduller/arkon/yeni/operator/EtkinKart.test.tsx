import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RefakatKarti } from '../../../../../../arkon/web/src/data/refakat-karti.ts';
import { EtkinKart } from './Parcalar.tsx';
import type { Is } from './tipler.ts';

afterEach(cleanup);

const kart: RefakatKarti = {
  id: 120, uretimEmriId: 3, etiket: 'UE-000003-P1', lotNo: 'ORN-LOT-1', malzemeKod: 'ORN-HM-1', malzemeAd: 'ORN Çubuk', birim: 'adet', verilen: '30',
  istasyondaSatirVar: true, sayilan: 12, sinir: 29, adet: 30, dagilim: { adet: 30, saglam: 12, hurda: 1, islemde: 17 },
};
const is = { kart: 120 } as Is;

describe('etkin refakat kartı (3337-3 a)', () => {
  it('adetli kartta toplam sabit dağılımı yazar (sayılan / sınır yerine); dağılımı olmayan eski kartta sayılan / sınır kalır', () => {
    render(<EtkinKart is={is} kartlar={[kart]} />);
    expect(screen.getByRole('status').textContent).toContain('Kart 30 · sağlam 12 · hurda 1 · işlemde 17');
    expect(screen.getByRole('status').textContent).not.toContain('12 / 29');
    cleanup();
    render(<EtkinKart is={is} kartlar={[{ ...kart, adet: null, dagilim: null }]} />);
    expect(screen.getByRole('status').textContent).not.toContain('sağlam');
    expect(screen.getByRole('status').textContent).toContain('12 / 29');
  });
});
