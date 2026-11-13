import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from './Bildirim.tsx';
import { KodDegisimPenceresi, kodDegisimMetni, type KoduDegisenYer } from './KodDegisimPenceresi.tsx';

afterEach(cleanup);

const yerler = (n: number): KoduDegisenYer[] =>
  Array.from({ length: n }, (_, i) => ({ konumId: i + 1, eskiKod: `ORN-A-${i + 1}`, yeniKod: `ORN-B-${i + 1}`, satirSayisi: i === 0 ? 2 : 0 }));
const ac = (degisenler: KoduDegisenYer[], etiketMerkezi = true) => render(
  <MemoryRouter><BildirimSaglayici><KodDegisimPenceresi degisenler={degisenler} kapat={() => {}} etiketMerkezi={etiketMerkezi} /></BildirimSaglayici></MemoryRouter>,
);

// 3135 a: Etiket Merkezi bir kerede 200 konum açar; fazlası parçalı düğmelerle yeni sekmede açılır, liste ilk 60 satırdır.
describe('KodDegisimPenceresi (3135 a)', () => {
  it('200 ve altı tek düğme, aynı sekmede', () => {
    ac(yerler(200));
    const p = screen.getByRole('dialog', { name: 'Konum kodu değişti' });
    const l = within(p).getAllByRole('link', { name: /Etiketleri bas/ });
    expect(l).toHaveLength(1);
    expect(l[0]!.getAttribute('target')).toBeNull();
    expect(l[0]!.getAttribute('href')!.split('id=')[1]!.split(',')).toHaveLength(200);
    expect(within(p).getByText('ve 140 konum daha.')).toBeTruthy();
  });
  it('200 üstü parçalı, her parça yeni sekmede; ilk parça birincil', () => {
    ac(yerler(250));
    const p = screen.getByRole('dialog', { name: 'Konum kodu değişti' });
    const l = within(p).getAllByRole('link');
    expect(l.map((a) => a.textContent)).toEqual(['Etiketleri bas (1-200)', 'Etiketleri bas (201-250)']);
    expect(l.every((a) => a.getAttribute('target') === '_blank' && a.getAttribute('rel') === 'noopener')).toBe(true);
    expect(l[1]!.getAttribute('href')).toBe(`/etiket-merkezi?tur=konum&id=${Array.from({ length: 50 }, (_, i) => i + 201).join(',')}`);
    expect(within(p).getByText(/her parça yeni sekmede açılır, bu pencere açık kalır/)).toBeTruthy();
  });
  it('Etiket Merkezi olmayan listeyi kopyalar; kopya metni bütün listedir (60 sınırı yok)', () => {
    ac(yerler(70), false);
    const p = screen.getByRole('dialog', { name: 'Konum kodu değişti' });
    expect(within(p).queryByRole('link')).toBeNull();
    expect(within(p).getByRole('button', { name: 'Listeyi kopyala' })).toBeTruthy();
    expect(kodDegisimMetni(yerler(70)).split('\n')).toHaveLength(70);
    expect(within(p).getByText(/Bunlardan 1 konumda stok var/)).toBeTruthy();
  });
  it('3168: ek uyarı verilince ilk satır tehlike uyarısıdır (eski etiket başka gözü gösterir); verilmezse bugünkü metin', () => {
    render(
      <MemoryRouter><BildirimSaglayici><KodDegisimPenceresi degisenler={yerler(3)} kapat={() => {}} etiketMerkezi
        ekUyari="Eski etiketler başka gözü gösterir; okutmayın." /></BildirimSaglayici></MemoryRouter>,
    );
    const p = screen.getByRole('dialog', { name: 'Konum kodu değişti' });
    expect(within(p).getByRole('alert').textContent).toBe('3 gözün kodu değişti. Eski etiketler başka gözü gösterir; okutmayın.');
    expect(within(p).queryByText(/eski etiketler artık okunmaz/)).toBeNull();
  });
});
