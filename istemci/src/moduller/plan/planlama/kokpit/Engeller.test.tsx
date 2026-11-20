import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Engeller } from './Engeller.tsx';
import { DUZELTME_YERLERI, type EngelGrubu } from './engeller.ts';

const izin = { islemler: new Set<string>(['sayfa.recete-rota']) };
afterEach(() => { cleanup(); });

// Satırlar uydurmadır.
const GRUPLAR: EngelGrubu[] = [{
  tur: 'sure', ad: 'Süre sığmıyor', engeller: [{
    tur: 'sure', anahtar: 'adim:2.20', emir: '2', baslik: 'ORN-2 · ORN-Flanş · 50 adet · 1. Freze',
    neOldu: 'Adım plana girmedi; sonraki 2 adım bunu bekliyor.', neden: 'İş 1.170 sa sürüyor.', neYapmali: 'Çevrim süresini kontrol edin.', duzelt: DUZELTME_YERLERI.sure,
  }],
}, {
  tur: 'dolu', ad: 'Tezgâh dolu', engeller: [{ tur: 'dolu', anahtar: 'adim:3.10', emir: null, baslik: 'ORN-3', neOldu: 'Adım plana girmedi.', neden: null, neYapmali: 'Ek mesai açın.', duzelt: DUZELTME_YERLERI.dolu }],
}];
function Adres() { return <output data-adres="">{useLocation().pathname}</output>; }
function ciz(gruplar = GRUPLAR) {
  const f = { emirGoster: vi.fn(), mesaiAc: vi.fn(), kapat: vi.fn() };
  render(<MemoryRouter initialEntries={['/plan']}><Routes><Route path="*" element={<><Engeller gruplar={gruplar} ozet={{ toplam: 4, metin: '4 adım plana girmedi' }} ufukSonu="16.02" acabilir={(i) => izin.islemler.has(i)} {...f} /><Adres /></>} /></Routes></MemoryRouter>);
  return f;
}

describe('Engeller paneli', () => {
  it('grup başlığı ve sayısı, satırda ne oldu, neden ve ne yapmalı yazar; başlıkta özet ve planlama süresinin sonu', () => {
    ciz();
    expect(screen.getByText('4 adım plana girmedi · plan 16.02 tarihine kadar')).toBeTruthy();
    const satir = document.querySelector('[data-engel="adim:2.20"]');
    expect(satir?.textContent).toContain('Ne olduAdım plana girmedi; sonraki 2 adım bunu bekliyor.');
    expect(satir?.textContent).toContain('Nedenİş 1.170 sa sürüyor.');
    expect(satir?.textContent).toContain('Ne yapmalıÇevrim süresini kontrol edin.');
    expect(document.querySelector('[data-engel="adim:3.10"]')?.textContent).not.toContain('Neden');
    expect(document.querySelector('[data-engel-grubu="sure"]')?.getAttribute('data-ton')).toBe('hata');
  });

  it('düzeltme düğmesi sayfaya gider; yetkisi olmayan sayfa düğme olmaz, adı ve kime başvurulacağı yazar', () => {
    ciz();
    expect(screen.queryByRole('button', { name: 'Vardiya takvimini aç' })).toBeNull();
    expect(screen.getByText('Bu düzeltme Vardiyalar sayfasında yapılır; açma yetkiniz yok, planlama sorumlusuna başvurun.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Süreleri aç' }));
    expect(document.querySelector('[data-adres]')?.textContent).toBe('/recete-rota/sureler');
  });

  it('Ek mesai aç Kokpit paneline, Emri göster emre gider; emirsiz satırda Emri göster yok', () => {
    const f = ciz();
    fireEvent.click(screen.getByRole('button', { name: 'Ek mesai aç' }));
    expect(f.mesaiAc).toHaveBeenCalledOnce();
    const dugmeler = screen.getAllByRole('button', { name: 'Emri göster' });
    expect(dugmeler).toHaveLength(1);
    fireEvent.click(dugmeler[0]!);
    expect(f.emirGoster).toHaveBeenCalledWith('2');
  });

  it('engel yoksa bunu söyler', () => {
    ciz([]);
    expect(screen.getByText('Son planda engel yok: bütün adımlar planda.')).toBeTruthy();
  });
});
