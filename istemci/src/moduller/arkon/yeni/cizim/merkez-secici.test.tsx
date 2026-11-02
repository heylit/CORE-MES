import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ArkonBaglamiKaynagi, type ArkonBaglami } from '../veri/baglam.ts';
import type { MerkezBelgesi } from '../veri/depo.ts';
import { MerkezSecici } from './Merkez.tsx';

// Çizim Merkezi seçicisi: paketin malzemesine bağlı olmayan resim sorulmadan eklenmez. Belge adları uydurmadır.
afterEach(cleanup);

const belge = (id: number, ad: string, malzemeninMi?: boolean): MerkezBelgesi =>
  ({ id, ad, tur: 'teknik-resim', harf: 'A', tip: 'pdf', dosyaAdi: `${ad}.pdf`, ozet: 'a'.repeat(64), ...(malzemeninMi === undefined ? {} : { malzemeninMi }) });

function kur(malzeme: number | null) {
  const merkezBelgeleri = vi.fn(() => Promise.resolve([belge(1, 'Deneme kendi', true), belge(2, 'Deneme baska', false)]));
  const sec = vi.fn(() => Promise.resolve());
  render(
    <ArkonBaglamiKaynagi.Provider value={{ depo: { Server: { merkezBelgeleri } } } as unknown as ArkonBaglami}>
      <MerkezSecici sec={sec} kapat={() => {}} malzeme={malzeme} />
    </ArkonBaglamiKaynagi.Provider>,
  );
  return { merkezBelgeleri, sec };
}

describe('Çizim Merkezi seçicisi ve parçanın malzemesi', () => {
  it('malzemeye bağlı resim doğrudan eklenir; bağlı olmayan önce sorulur, Vazgeç eklemez, Yine de ekle ekler', async () => {
    const { merkezBelgeleri, sec } = kur(7);
    fireEvent.click(await screen.findByRole('button', { name: /Deneme kendi/ }, { timeout: 2000 }));
    expect(merkezBelgeleri).toHaveBeenCalledWith('', 7);
    expect(sec).toHaveBeenCalledTimes(1);
    const baska = screen.getByRole('button', { name: /Deneme baska/ }) as HTMLButtonElement;
    await waitFor(() => { expect(baska.disabled).toBe(false); });
    expect(baska.textContent).toContain('bu parçanın malzemesine bağlı değil');
    fireEvent.click(baska);
    const soru = await screen.findByRole('dialog', { name: 'Bu resim bu parçanın değil' });
    fireEvent.click(within(soru).getByRole('button', { name: 'Vazgeç' }));
    expect(sec).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Deneme baska/ }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Bu resim bu parçanın değil' })).getByRole('button', { name: 'Yine de ekle' }));
    expect(sec).toHaveBeenCalledTimes(2);
  });
});
