import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AranabilirSecim } from './AranabilirSecim.tsx';

afterEach(() => { cleanup(); });

const SECENEKLER = [
  { deger: '1', baslik: 'IS-1 Deneme Torna', grup: 'IM-1 Deneme' },
  { deger: '2', baslik: 'IS-2 Deneme Freze', grup: 'IM-1 Deneme' },
];

// Liste taşanı kesen tablonun içinde değil body'de çizilir (kart 2094); dışarı basma ve seçim yine çalışır.
describe('AranabilirSecim acilir listesi (kart 2094)', () => {
  const kur = () => {
    const sec = vi.fn();
    render(<div className="tc-ist-tablo"><AranabilirSecim etiket="M-1 istasyonu" secenekler={SECENEKLER} deger="1" bos="İstasyonsuz" sec={sec} /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'M-1 istasyonu' }));
    return sec;
  };

  it('liste tablonun dışında, body altında açılır; içinden seçim yapılır', () => {
    const sec = kur();
    const liste = screen.getByRole('listbox', { name: 'M-1 istasyonu' });
    expect(liste.closest('.tc-ist-tablo')).toBeNull();
    expect(liste.closest('.tc-acilir-katman')?.parentElement).toBe(document.body);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'IS-2 Deneme Freze' }));
    fireEvent.click(screen.getByRole('option', { name: 'IS-2 Deneme Freze' }));
    expect(sec).toHaveBeenCalledWith('2');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('listenin içine basmak kapatmaz, dışarı basmak kapatır; seçim değişmez', () => {
    const sec = kur();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'M-1 istasyonu ara' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(sec).not.toHaveBeenCalled();
  });

  it('Tab listeyi kapatır ve odağı açan düğmeye verir; Escape de kapatır', () => {
    const sec = kur();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'M-1 istasyonu ara' }), { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'M-1 istasyonu' }));
    fireEvent.click(screen.getByRole('button', { name: 'M-1 istasyonu' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'M-1 istasyonu ara' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(sec).not.toHaveBeenCalled();
  });
});
