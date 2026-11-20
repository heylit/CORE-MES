import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AramaliSecim } from './AramaliSecim.tsx';

afterEach(() => { cleanup(); });

const SECENEKLER = [
  { deger: '1', baslik: 'ORN-EKIP Deneme', alt: 'IS-1 Deneme torna' },
  { deger: '2', baslik: 'ORN-FRZ Freze', alt: 'IS-2 Deneme freze' },
];
const kur = (deger = '1') => {
  const sec = vi.fn();
  render(<div className="tc-tablo"><AramaliSecim etiket="Deneme" secenekler={SECENEKLER} deger={deger} bos="Yok" sec={sec} /></div>);
  fireEvent.click(screen.getByRole('button', { name: 'Deneme' }));
  return { sec, ara: screen.getByRole('combobox', { name: 'Deneme ara' }), liste: () => within(screen.getByRole('listbox', { name: 'Deneme' })) };
};

describe('AramaliSecim', () => {
  it('liste body altında açılır; yazınca başlık ve alt satırda harf büyüklüğü ve ı/i gözetmeden süzer', () => {
    const { ara, liste } = kur();
    expect(screen.getByRole('listbox').closest('.tc-tablo')).toBeNull();
    expect(liste().getAllByRole('option')).toHaveLength(3);
    fireEvent.change(ara, { target: { value: 'ekip' } });
    expect(liste().getAllByRole('option').map((o) => o.textContent)).toEqual(['ORN-EKIP DenemeIS-1 Deneme torna']);
    fireEvent.change(ara, { target: { value: 'IS-2' } });
    expect(liste().getAllByRole('option').map((o) => o.textContent)).toEqual(['ORN-FRZ FrezeIS-2 Deneme freze']);
  });

  it('ok ve Enter seçer; seçili satırda Enter ya da aynı satır seçimi sec çağırmaz', () => {
    const { sec, ara } = kur();
    fireEvent.keyDown(ara, { key: 'Enter' });
    expect(sec).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Deneme' }));
    const ara2 = screen.getByRole('combobox', { name: 'Deneme ara' });
    fireEvent.keyDown(ara2, { key: 'ArrowDown' });
    fireEvent.keyDown(ara2, { key: 'Enter' });
    expect(sec).toHaveBeenCalledWith('2');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Deneme' }));
  });

  it('ok tuşuyla gezilen satır görünür alana kaydırılır', () => {
    const kaydir = vi.fn();
    Element.prototype.scrollIntoView = kaydir;
    const { ara } = kur();
    kaydir.mockClear();
    fireEvent.keyDown(ara, { key: 'ArrowDown' });
    expect(kaydir).toHaveBeenCalledWith({ block: 'nearest' });
    expect(kaydir.mock.contexts.at(-1)).toBe(screen.getByRole('option', { name: /ORN-FRZ/ }));
  });

  it('boş seçenek yalnız aranmazken görünür; dışarı basmak ve Escape kapatır', () => {
    const { sec, ara, liste } = kur('');
    expect(screen.getByRole('button', { name: 'Deneme' }).textContent).toBe('Yok');
    expect(liste().getAllByRole('option')[0]?.textContent).toBe('Yok');
    fireEvent.change(ara, { target: { value: 'orn' } });
    expect(liste().queryByRole('option', { name: 'Yok' })).toBeNull();
    fireEvent.keyDown(ara, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Deneme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deneme' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(sec).not.toHaveBeenCalled();
  });
});
