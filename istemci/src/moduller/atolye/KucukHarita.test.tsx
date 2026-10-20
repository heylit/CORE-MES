import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { KucukHarita } from './KucukHarita.tsx';

const yerlesim = (id: number, kod: string, gecisler: YerlesimCevabi['gecisler'] = []): YerlesimCevabi => ({
  salon: {
    id, kod, ad: kod, genislik: '20.00', derinlik: '10.00', hucreBoyu: '5.00', surum: 1, fabrika: { x: '0', z: '0', donus: '0' }, giris: null,
    kaydeden: { id: 1, ad: 'Deneme' }, kaydedildi: '2026-10-12T00:00:00Z', sutunlar: [], satirlar: [],
  },
  istasyonYerleri: [], makineYerleri: [], raflar: [], alanlar: [], duvarlar: [], gecisler,
});

const bolumler = [
  { yerlesim: yerlesim(1, 'TORNA', [{ id: 7, tur: 'kepenk', kenar: 'sag', ofset: '0', genislik: '4' }]), konum: { x: 0, z: 0, donus: 0 } },
  { yerlesim: yerlesim(2, 'DEPO'), konum: { x: 25, z: 0, donus: 0 } },
];

afterEach(cleanup);

describe('küçük harita', () => {
  it('bölümleri, geçişi ve bakılan yeri çizer; içinde olunan bölümü söyler; kapanır ve açılır', () => {
    const { container } = render(<KucukHarita bolumler={bolumler} yer={{ x: 30, z: 5, yon: 0, yuruyus: true }} git={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Küçük harita: DEPO bölümündesiniz' })).toBeTruthy();
    expect(screen.getByText('TORNA')).toBeTruthy();
    expect(container.querySelectorAll('.tc-kh-bolum')).toHaveLength(2);
    // Kepenk TORNA'nın sağ duvarında (x 20), ortada 4 m.
    const gecis = container.querySelector('.tc-kh-gecis');
    expect([gecis?.getAttribute('x1'), gecis?.getAttribute('y1'), gecis?.getAttribute('y2')]).toEqual(['20', '3', '7']);
    expect(container.querySelector('.tc-kh-yer')?.getAttribute('transform')).toBe('translate(30 5) rotate(0)');
    // Bölümler kutusu (0..45 x 0..10) ve pay: görünüm kutusu payla genişler.
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('-2.7 -2.7 50.4 15.4');

    fireEvent.click(screen.getByRole('button', { name: 'Küçük haritayı kapat' }));
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Küçük haritayı aç' }));
    expect(screen.getByRole('img', { name: 'Küçük harita: DEPO bölümündesiniz' })).toBeTruthy();
  });

  it('bölüm yoksa çizilmez', () => {
    const { container } = render(<KucukHarita bolumler={[]} yer={null} git={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
