import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { AdimDurumuTerminalCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmrinAdimlari } from './EmrinAdimlari.tsx';

// 2893-3 b: operatör emrin adımlarını statüyle okur; kendi adımı işaretli, elle yazılan statü "Elle" ile; bekleten talep/sipariş no ve termin. Veriler uydurmadır.
const V: AdimDurumuTerminalCevabi = {
  emirId: 5,
  adimlar: [
    { isEmriId: 51, opNo: 10, ad: 'Testere kesim', statu: 'bitti', elle: false, yuzde: 100, nedenler: [], tedarik: [] },
    { isEmriId: 52, opNo: 20, ad: 'CNC torna', statu: 'uretimde', elle: false, yuzde: 45, nedenler: [], tedarik: [] },
    { isEmriId: 53, opNo: 30, ad: 'Kaplama', statu: 'siparis', elle: true, yuzde: 0, nedenler: ['Önceki adım bitmedi'], tedarik: [
      { asama: 'talep', fason: true, talepNo: 'ST-2099-004', siparisNo: null, termin: null },
      { asama: 'siparis', fason: false, talepNo: 'ST-2099-002', siparisNo: 'SP-2099-001', termin: '2099-03-01' },
    ] },
  ],
};
afterEach(cleanup);

describe('Üretim Terminali emrin adımları (2893-3 b)', () => {
  it('ilk adım üstte; kendi adımı işaretli; elle statü işaretli; yazma düğmesi yok', () => {
    render(<EmrinAdimlari v={V} isEmriId={52} />);
    const l = within(screen.getByRole('region', { name: 'Emrin adımları' })).getAllByRole('listitem');
    expect(l.map((x) => x.textContent)).toEqual(['OP 10Testere kesimBitti', 'OP 20CNC torna · bu adımÜretimde', 'OP 30KaplamaElleFason talebi ST-2099-004 · Sipariş SP-2099-001 · termin 01.03.2099Sipariş bekliyor']);
    expect(l[1]?.getAttribute('aria-current')).toBe('step');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('veri yoksa bölüm çizilmez', () => {
    render(<EmrinAdimlari v={null} isEmriId={52} />);
    expect(screen.queryByRole('region', { name: 'Emrin adımları' })).toBeNull();
  });
});
