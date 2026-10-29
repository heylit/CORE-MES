import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ArkonBaglamiKaynagi, type ArkonBaglami } from '../veri/baglam.ts';
import { bosIs } from './kurallar.ts';
import type { Is } from './tipler.ts';
import { UzakMod, uzakBasliklari } from './UzakMod.tsx';

afterEach(() => { cleanup(); });

// Uzak mod başlıkları: kullanıcının verdiği sıra ve adlar; boş alan yazılmaz. Değerler uydurmadır.
describe('uzakBasliklari', () => {
  const pkg = { partNo: 'DN-1', rev: 'A' } as Parameters<typeof uzakBasliklari>[0]['pkg'];

  it('projesiz pakette üretim emri, op, parça no, parça adı ve revizyonu bu sırayla verir', () => {
    expect(uzakBasliklari({ no: 'UE-DENEME-1', op: 'Op 10 · Torna', part: 'Deneme parça', pkg })).toEqual([
      ['Üretim emri', 'UE-DENEME-1'], ['Op', 'Op 10 · Torna'], ['Parça no', 'DN-1'], ['Parça adı', 'Deneme parça'], ['Rev', 'A'],
    ]);
  });

  it('proje varsa en başa koyar', () => {
    const projeli = { ...pkg, proje: 'Deneme proje' } as typeof pkg;
    expect(uzakBasliklari({ no: 'UE-DENEME-1', op: 'Op 10 · Torna', part: 'Deneme parça', pkg: projeli })[0]).toEqual(['Proje', 'Deneme proje']);
  });

  it('boş, yer tutucu ya da paketsiz alanları atlar', () => {
    expect(uzakBasliklari({ no: '—', op: ' ', part: 'Deneme parça' })).toEqual([['Parça adı', 'Deneme parça']]);
  });
});

// 895 a: uzak mod düzeni. Paket dosyasız: 3B model yüklenmez, bağlamdan yalnız depo istenir.
describe('UzakMod düzeni', () => {
  const pkg = { id: 'pk-deneme', partNo: 'DN-1', rev: 'A', proje: 'Deneme proje', files: [], primary: '' } as unknown as Is['pkg'];
  const is: Is = { ...bosIs({ l: 'Deneme' }), empty: false, no: 'UE-DENEME-1', op: 'Op 10 · Torna', part: 'Deneme parça', state: 'running', good: 7, target: 25, scrap: 2, pkg };
  const ac = (ek: Partial<Is> = {}, uyan = () => {}) => render(
    <ArkonBaglamiKaynagi.Provider value={{ depo: {} } as unknown as ArkonBaglami}>
      <UzakMod is={{ ...is, ...ek }} gorev={null} D={{ due: [], next: null, who: {}, why: {} }} since={null} istasyon="IST-DENEME" uyan={uyan} />
    </ArkonBaglamiKaynagi.Provider>,
  );

  it('iş bilgisi tek satırda: emir, op, parça no, parça adı ve revizyon sırasıyla; proje üst şeritte', () => {
    ac();
    const bilgi = screen.getByRole('region', { name: 'İş bilgisi' });
    expect(within(bilgi).getAllByRole('term').map((x) => x.textContent)).toEqual(['Üretim emri', 'Op', 'Parça no', 'Parça adı', 'Rev']);
    expect(within(bilgi).getAllByRole('definition').map((x) => x.textContent)).toEqual(['UE-DENEME-1', 'Op 10 · Torna', 'DN-1', 'Deneme parça', 'Rev A']);
    expect(within(bilgi).queryByText('Deneme proje')).toBeNull();
    expect(screen.getByTitle('Deneme proje').textContent).toContain('Deneme proje');
  });

  it('projesiz işte üst şeritte proje kutusu çıkmaz', () => {
    ac({ pkg: { ...pkg, proje: '' } as Is['pkg'] });
    expect(screen.queryByText('Proje')).toBeNull();
  });

  it('sayaç kartı üretileni, hedefi, yüzdeyi ve kalanı yazar; hedef yoksa yüzde ve kalan yazılmaz', () => {
    ac();
    const sayac = screen.getByRole('region', { name: 'Sayaç' });
    expect(sayac.querySelector('[data-hane]')?.textContent).toBe('7');
    expect(sayac.querySelector('[data-hane]')?.getAttribute('data-hane')).toBe('1');
    expect(sayac.textContent).toContain('Hedef 25');
    expect(sayac.textContent).toContain('%28');
    expect(sayac.textContent).toContain('18 kaldı');
    cleanup();
    ac({ target: 0 });
    expect(screen.getByRole('region', { name: 'Sayaç' }).textContent).not.toContain('kaldı');
    expect(screen.getByRole('region', { name: 'Sayaç' }).textContent).not.toContain('Hedef');
  });

  it('üst şeritte durum, istasyon; altta hurda ve sıradaki kontrol; dokunuş normal ekrana döner', () => {
    const uyan = vi.fn();
    ac({}, uyan);
    expect(screen.getAllByRole('status')[0]!.textContent).toContain('Çalışıyor');
    expect(screen.getByText('IST-DENEME')).toBeTruthy();
    expect(screen.getByText('Hurda').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('Sıradaki kontrol').nextSibling?.textContent).toBe('—');
    fireEvent.click(screen.getByRole('dialog', { name: 'Uzak mod' }));
    expect(uyan).toHaveBeenCalledTimes(1);
  });
});
