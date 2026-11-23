import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PurchaseRequest, RequestItem } from '../merkez/tipler.ts';
import { MalzemeSeridi, kalemKisaOzeti } from './MalzemeSeridi.tsx';

// 3593: talebin başında kalemin malzeme özellikleri ve işaretli alternatif kartları; çok kalemde kalem seçilir.
const kalem = (id: string, ek: Partial<RequestItem> = {}): RequestItem => ({ id, name: `ORN kalem ${id}`, spec: '', qty: 12, unit: 'boy', ...ek });
const MALZEME = {
  kalite: '6082', durum: 'T6', islem: 'yok', olcu: 'Ø40 × 3000', aciklama: null,
  ayrinti: [{ ad: 'Form', deger: 'Yuvarlak çubuk' }, { ad: 'Yüzey', deger: 'Ham' }, { ad: 'Kalite', deger: '6082' }],
};
const talep = (items: RequestItem[]) => ({ id: 't1', no: 'ORN-TAL-1', items } as unknown as PurchaseRequest);
afterEach(cleanup);

describe('3593: malzeme şeridi', () => {
  it('özellikler (tekrarsız) ve alternatif özeti; kaldırılan kart notlu', () => {
    render(<MalzemeSeridi r={talep([kalem('1', { materialId: 'm1', malzeme: MALZEME, alternatifler: [
      { setId: 5, ad: 'ORN AK-1', tur: 'tam', ozet: '6082 ya da 6061 · Ø 40–45 (−0/+5)' }, { setId: null, ad: 'ORN AK-2', tur: 'sartli', ozet: 'T651' },
    ] })])} />);
    const s = screen.getByRole('region', { name: 'Kalemin malzemesi ve alternatifleri' });
    expect(within(s).getAllByText('6082')).toHaveLength(1);
    expect(within(s).getByText('Yuvarlak çubuk')).toBeTruthy();
    expect(within(s).getByText(/6082 ya da 6061 · Ø 40–45/)).toBeTruthy();
    expect(within(s).getByText(/kart kaldırıldı/)).toBeTruthy();
    expect(within(s).getByRole('button', { name: 'Tümü (6)' }).getAttribute('aria-expanded')).toBe('false');
    expect(kalemKisaOzeti(kalem('1', { malzeme: MALZEME }))).toBe('6082 · T6 · Ø40 × 3000');
  });

  it('çok kalemde kalem seçici; işaretsiz kartlı kalem kabul sınırıyla gider yazar, kartsız kalemde alternatif satırı yok', () => {
    render(<MalzemeSeridi r={talep([kalem('1', { materialId: 'm1', malzeme: MALZEME }), kalem('2')])} />);
    expect(screen.getByText(/İşaretli alternatif kartı yok/)).toBeTruthy();
    expect(screen.getByText(/\+1 kalem: ORN kalem 2/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kalem seç'), { target: { value: '1' } });
    expect(screen.getByText('Kartsız kalem; özellik yok.')).toBeTruthy();
    expect(screen.queryByText('Kabul edilen alternatifler')).toBeNull();
  });
});
