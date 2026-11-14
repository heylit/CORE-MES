import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirProjeSecimi } from './EmirProjeSecimi.tsx';

const SECENEK = {
  projeZorunlu: true,
  rotasizAcik: false,
  projeler: [{
    id: 5, kod: 'ORN-PRJ-1', ad: 'Deneme projesi',
    satirlar: [{ id: 51, siparisNo: 'SS-2026-0001', satirNo: 1, adet: '100.000', termin: '2030-02-01', partiler: [{ id: 9, emirTuru: 'fai', adet: '10.000' }, { id: 10, emirTuru: 'seri', adet: '90.000' }] }],
  }],
} satisfies AcilisSecenekleri;

afterEach(cleanup);

describe('Emir açarken parti seçimi (3244 b)', () => {
  it('tek satırın partileri listelenir; parti seçilince satır ve parti döner, seçilmezse partisiz', () => {
    const bitir = vi.fn();
    render(<EmirProjeSecimi secenekler={SECENEK} bitir={bitir} />);
    expect(screen.getByText('10 FAI')).toBeTruthy();
    expect(screen.getByText('90 Seri')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Emri aç/ }));
    expect(bitir).toHaveBeenLastCalledWith({ projeId: 5, siparisSatiriId: null });
    fireEvent.click(screen.getByRole('radio', { name: /10 FAI/ }));
    fireEvent.click(screen.getByRole('button', { name: /Emri aç/ }));
    expect(bitir).toHaveBeenLastCalledWith({ projeId: 5, siparisSatiriId: 51, parti: { id: 9, emirTuru: 'fai' } });
  });

  it('partisiz satırda üretim çeşidi sorulmaz', () => {
    const partisiz = { ...SECENEK, projeler: [{ ...SECENEK.projeler[0]!, satirlar: [{ ...SECENEK.projeler[0]!.satirlar[0]!, partiler: [] }] }] } satisfies AcilisSecenekleri;
    render(<EmirProjeSecimi secenekler={partisiz} bitir={vi.fn()} />);
    expect(screen.queryByText('Üretim çeşidi')).toBeNull();
  });
});
