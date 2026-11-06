import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SayiKarti } from './SayiKarti.tsx';

afterEach(cleanup);

function Adres() {
  return <output data-testid="adres">{useLocation().pathname}</output>;
}
const ciz = (ozellik: Partial<Parameters<typeof SayiKarti>[0]>) =>
  render(
    <MemoryRouter>
      <SayiKarti baslik="Düşük stok" simge="box" sayi={4} {...ozellik} />
      <Adres />
    </MemoryRouter>,
  );

describe('SayiKarti', () => {
  it('yolu olan kart baglantidir; adi baslik, sayi ve alt metindir; tiklayinca sayfaya gider', () => {
    ciz({ sayi: 1234, altMetin: 'En az miktarın altında', yol: '/stok' });
    const bag = screen.getByRole('link');
    expect(bag.textContent).toBe('Düşük stok1.234En az miktarın altında');
    fireEvent.click(bag);
    expect(screen.getByTestId('adres').textContent).toBe('/stok');
  });

  it('ton yalniz sayi sifirdan buyukken gorunur', () => {
    const { container } = ciz({ ton: 'uyari' });
    expect(container.querySelector('[data-ton]')?.getAttribute('data-ton')).toBe('uyari');
    cleanup();
    const sifir = ciz({ ton: 'uyari', sayi: 0 });
    expect(sifir.container.querySelector('[data-ton]')).toBeNull();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('reddedilen: veri yoksa sifir yazmaz, "Veri yok" der; yuklenirken mesgul, hatada "Alınamadı" der ve tonsuzdur', () => {
    ciz({ sayi: null, ton: 'hata' });
    expect(screen.getByText('Veri yok')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    cleanup();

    const yuklenen = ciz({ sayi: undefined });
    expect(yuklenen.container.querySelector('[aria-busy="true"]')).not.toBeNull();
    cleanup();

    const hatali = ciz({ hata: true, ton: 'hata' });
    expect(screen.getByText('Alınamadı')).toBeTruthy();
    expect(hatali.container.querySelector('[data-ton]')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('sayi buyuk ve sayisal isaretli; sayiyla baslayan ozet sayi ve kucuk birim olarak ayrilir, metni degismez', () => {
    const sayili = ciz({ sayi: 1234 });
    expect(sayili.container.querySelector('.tc-sayi-deger')?.hasAttribute('data-sayisal')).toBe(true);
    cleanup();
    const birimli = ciz({ sayi: undefined, metin: '12,5 sa' });
    const deger = birimli.container.querySelector('.tc-sayi-deger') as HTMLElement;
    expect(screen.getByText('12,5 sa')).toBeTruthy();
    expect(deger.hasAttribute('data-sayisal')).toBe(true);
    expect(deger.querySelector('.tc-sayi-birim')?.textContent).toBe(' sa');
    expect(deger.querySelector('.tc-sayi-birim')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('para birimiyle baslayan tutar sayisaldir', () => {
    const tutar = ciz({ sayi: undefined, metin: '₺1.044.000' });
    expect(tutar.container.querySelector('.tc-sayi-deger')?.hasAttribute('data-sayisal')).toBe(true);
  });

  it('reddedilen: yazi ozeti ve uzun cumle bolunmez, sayisal isaret almaz', () => {
    const yazi = ciz({ sayi: undefined, metin: 'Akşam' });
    expect(yazi.container.querySelector('.tc-sayi-deger')?.hasAttribute('data-sayisal')).toBe(false);
    cleanup();
    const cumle = ciz({ sayi: undefined, metin: '3 makine bekliyor' });
    expect(cumle.container.querySelector('.tc-sayi-birim')).toBeNull();
    expect(cumle.container.querySelector('.tc-sayi-deger')?.textContent).toBe('3 makine bekliyor');
  });

  it('veri yokken tire ekran okuyucuya gizlidir; okunan ad "Veri yok"tur', () => {
    ciz({ sayi: null, yol: '/stok' });
    expect(screen.getByRole('link').getAttribute('href')).toBe('/stok');
    expect(document.querySelector('.tc-sayi-tire')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.tc-sayi-deger')?.hasAttribute('data-sayisal')).toBe(false);
  });
});
