import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RotaAkisi, type RotaAkisiAdimi } from './RotaAkisi.tsx';

// 3136 a: emrin bütün adımları yan yana; bu adım işaretli, başlıkta biten adım sayısı ve toplam gidişat. Veriler uydurmadır.
const ADIMLAR: RotaAkisiAdimi[] = [
  { anahtar: '51-10', opNo: 10, ad: 'Testere kesim', statu: 'bitti', yuzde: 100, bu: false },
  { anahtar: '52-20', opNo: 20, ad: 'CNC torna', statu: 'uretimde', yuzde: 45, bu: true },
  { anahtar: '53-30', opNo: 30, ad: 'Kaplama', statu: 'siparis', yuzde: 0, bu: false },
];
afterEach(cleanup);

describe('Rota akışı (3136 a)', () => {
  it('başlıkta biten adım ve ortalama gidişat; her adım statüsüyle, bu adım işaretli', () => {
    render(<RotaAkisi adimlar={ADIMLAR} ac={() => undefined} />);
    const bolum = screen.getByRole('region', { name: 'Rota: 1/3 adım bitti, toplam yüzde 48' });
    expect(within(bolum).getByRole('button').textContent).toBe('Rota1/3 adım bitti%48');
    const l = within(bolum).getAllByRole('listitem');
    expect(l.map((x) => x.getAttribute('title'))).toEqual(['OP 10 · Testere kesim · Bitti · %100', 'OP 20 · CNC torna · Üretimde · %45', 'OP 30 · Kaplama · Sipariş bekliyor · %0']);
    expect(l.map((x) => x.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(l[1]?.textContent).toContain('Bu adım');
  });

  it('anlık durum başlıkta ve yalnız bu adımın kartında; başlığa dokununca açar', () => {
    let acildi = 0;
    render(<RotaAkisi adimlar={ADIMLAR} ac={() => { acildi += 1; }} canli={<i>Çalışıyor</i>} />);
    const l = screen.getAllByRole('listitem');
    expect(l.map((x) => x.hasAttribute('data-canli'))).toEqual([false, true, false]);
    expect(screen.getAllByText('Çalışıyor')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button'));
    expect(acildi).toBe(1);
    // Büyük karta dokunmak da açar (başlık dar ekranda 20 px yüksek kalır).
    fireEvent.click(l[2]!);
    expect(acildi).toBe(2);
  });

  it('adım yoksa çizilmez', () => {
    expect(render(<RotaAkisi adimlar={[]} ac={() => undefined} />).container.firstChild).toBeNull();
  });
});
