import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SAYFALAR, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { Kabuk } from './Kabuk.tsx';

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Stok Merkezi',
  simge: 'box',
  gruplar: [
    { maddeler: [
      { anahtar: 'is', baslik: 'İş kutusu', yol: '/stok', simge: 'dash', islem: 'ornek.oku' },
      { anahtar: 'okut', baslik: 'Okut', yol: '/stok/okut', simge: 'scan', islem: 'ornek.oku' },
    ] },
  ],
};

// Kayıt araması sunucuya gider; palet görünüşü sayfa ve menü sonuçlarıyla ölçülür.
const SAYFALAR_ARAMASIZ = SAYFALAR.map((s) => {
  const { aramaUcu: _uc, ...kalan } = s as Sayfa & { aramaUcu?: string };
  return kalan;
}) as readonly Sayfa[];

function ciz() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Kabuk sayfalar={SAYFALAR_ARAMASIZ} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['ornek.oku']} ikinciMenuler={[MENU]}>
        <p>İçerik</p>
      </Kabuk>
    </MemoryRouter>,
  );
}

const ust = () => within(screen.getByRole('banner'));
const kutu = () => ust().getByRole('combobox', { name: 'Sayfa ya da menü ara' });
const yaz = (metin: string) => { fireEvent.focus(kutu()); fireEvent.change(kutu(), { target: { value: metin } }); };
const onizleme = () => screen.getByRole('complementary', { name: 'Önizleme' });

afterEach(() => { cleanup(); });

describe('Genel arama paleti', () => {
  it('eşleşen parça işaretlenir; Türkçe harf ve büyük-küçük farkı işareti bozmaz, satırın metni değişmez', () => {
    ciz();
    yaz('okut');
    const satir = screen.getByRole('option', { name: 'Stok Merkezi › Okut' });
    expect(satir.textContent).toBe('Stok Merkezi › Okut');
    expect(Array.from(satir.querySelectorAll('mark'), (m) => m.textContent)).toEqual(['Okut']);
    yaz('is kut');
    const kok = screen.getAllByRole('option')[0]!;
    expect(kok.querySelectorAll('mark')).toHaveLength(0);
    yaz('MERKEZ ok');
    expect(Array.from(screen.getByRole('option', { name: 'Stok Merkezi › Okut' }).querySelectorAll('mark'), (m) => m.textContent))
      .toEqual(['ok', 'Merkez', 'Ok']);
  });

  it('ok tuşu seçimi taşır ve önizleme seçili sonucu gösterir', () => {
    ciz();
    yaz('stok');
    expect(within(onizleme()).getByText('Stok Merkezi')).toBeTruthy();
    expect(within(onizleme()).getByText('Sayfa')).toBeTruthy();
    expect(within(onizleme()).getByText('/stok')).toBeTruthy();
    fireEvent.keyDown(kutu(), { key: 'ArrowDown' });
    const secili = screen.getAllByRole('option')[1]!;
    expect(secili.getAttribute('aria-selected')).toBe('true');
    expect(kutu().getAttribute('aria-activedescendant')).toBe(secili.id);
    expect(within(onizleme()).getByText('Okut')).toBeTruthy();
    expect(within(onizleme()).getByText('Menü maddesi')).toBeTruthy();
    expect(within(onizleme()).getByText('/stok/okut')).toBeTruthy();
    expect(within(onizleme()).queryByText('/stok')).toBeNull();
    fireEvent.keyDown(kutu(), { key: 'ArrowUp' });
    expect(within(onizleme()).getByText('/stok')).toBeTruthy();
  });

  it('Esc paleti kapatır: perde, önizleme ve sonuçlar gider; kutu boşalır', () => {
    const { container } = ciz();
    yaz('okut');
    expect(container.querySelector('.tc-arama[data-acik]')).not.toBeNull();
    expect(container.querySelector('.tc-arama-perde')).not.toBeNull();
    fireEvent.keyDown(kutu(), { key: 'Escape' });
    expect(container.querySelector('.tc-arama[data-acik]')).toBeNull();
    expect(container.querySelector('.tc-arama-perde')).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Önizleme' })).toBeNull();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect((kutu() as HTMLInputElement).value).toBe('');
  });

  it('reddedilen: perdeye tıklamak paleti kapatır, sonuca gitmez', () => {
    const { container } = ciz();
    yaz('okut');
    fireEvent.mouseDown(container.querySelector('.tc-arama-perde')!);
    expect(container.querySelector('.tc-arama[data-acik]')).toBeNull();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('İçerik')).toBeTruthy();
  });
});
