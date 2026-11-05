import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { PATLATMA_KATI } from './gorunum.ts';
import { PatlatmaCubugu, patlatmaKur } from './Goruntu3B.tsx';

// Model okuyucu wasm ithal eder; bu testte model okunmaz.
vi.mock('../belge-merkezi/disari.ts', () => ({ birak: vi.fn(), modelOku: vi.fn() }));
afterEach(cleanup);

// Sentetik montaj: merkezde taban, sağda pim; pim iç içe bir düğümde (glTF gibi) iki kat büyütülmüş.
function model() {
  const ic = new Group();
  const taban = new Mesh(new BoxGeometry(20, 20, 4), new MeshBasicMaterial());
  const pim = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  pim.position.set(5, 0, 0);
  const ara = new Group();
  ara.scale.setScalar(2);
  ara.add(pim);
  ic.add(taban, ara);
  return { ic, taban, pim };
}

describe('patlatmaKur (2139)', () => {
  it('her katı parça, merkezden dışa, ebeveyninin koordinatında kayar', () => {
    const { ic, taban, pim } = model();
    const p = patlatmaKur(ic);
    expect(p.parcalar).toHaveLength(2);
    // Model kutusu x: -10..12 (pim dünyada 10'da, yarı boyu 2) -> merkez 1.
    expect(p.merkez.x).toBeCloseTo(1);
    const t = p.parcalar.find((x) => x.ag === taban)!, q = p.parcalar.find((x) => x.ag === pim)!;
    expect(t.birim.x).toBeCloseTo(-1 * PATLATMA_KATI);
    // Pim merkezi iç grupta 10; kayma (10 - 1) x kat, ara düğüm 2 kat büyük olduğu için ebeveyninde yarısı.
    expect(q.birim.x).toBeCloseTo((9 * PATLATMA_KATI) / 2);
    expect(q.ilk.x).toBe(5);
  });
});

describe('PatlatmaCubugu (2139)', () => {
  it('kaydırıcı oranı yazar; Topla yalnız patlatılmışken açık, sıfıra çeker', () => {
    const yaz = vi.fn();
    const { rerender } = render(<PatlatmaCubugu oran={0} oranYaz={yaz} />);
    expect((screen.getByRole('button', { name: /Topla/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Patlatma'), { target: { value: '60' } });
    expect(yaz).toHaveBeenLastCalledWith(60);
    rerender(<PatlatmaCubugu oran={60} oranYaz={yaz} />);
    expect(screen.getByText('%60').tagName).toBe('OUTPUT');
    expect((screen.getByRole('button', { name: /Topla/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Topla/ }));
    expect(yaz).toHaveBeenLastCalledWith(0);
  });
});
