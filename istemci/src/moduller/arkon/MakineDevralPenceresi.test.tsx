import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MakineDoluRedi } from './baglanti.ts';
import { MakineDevralPenceresi, devralMetni } from './MakineDevralPenceresi.tsx';

const RED: MakineDoluRedi = {
  cid: 'c1', ileti: 'Bu makinede başka biri iş başlatmış.', devralEmirId: 12,
  doluOlan: { kullanimId: 7, makine: { id: 3, ad: 'Torna 1' }, emir: { id: 9, emirNo: 'UE-000009' }, kisi: { id: 4, ad: 'Deneme Operatör' }, baslama: '2026-10-13T10:00:00+03:00' },
};

describe('makine devralma sorusu', () => {
  afterEach(cleanup);

  it('kimin hangi işi başlattığını söyler; onay devralır, vazgeç işi başlatmaz', () => {
    const onayla = vi.fn();
    const vazgec = vi.fn();
    render(<MakineDevralPenceresi red={RED} yukleniyor={false} onayla={onayla} vazgec={vazgec} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Deneme Operatör, Torna 1 makinesinde UE-000009 işini başlattı, önce durdurulmalı.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect([onayla.mock.calls.length, vazgec.mock.calls.length]).toEqual([0, 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Durdur ve başlat' }));
    expect([onayla.mock.calls.length, vazgec.mock.calls.length]).toEqual([1, 1]);
  });

  it('red yokken hiçbir şey çizilmez; makinesiz işte yer istasyondur', () => {
    render(<MakineDevralPenceresi red={null} yukleniyor={false} onayla={vi.fn()} vazgec={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(devralMetni({ ...RED, doluOlan: { ...RED.doluOlan, makine: null } })).toBe('Deneme Operatör, bu istasyonda UE-000009 işini başlattı, önce durdurulmalı.');
  });
});
