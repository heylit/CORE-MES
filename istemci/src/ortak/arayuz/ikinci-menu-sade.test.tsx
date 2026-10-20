import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import { cihazTercihiYaz, cihazTercihleriniSifirla } from '../veri/cihaz-tercihi.ts';
import { Kabuk } from './Kabuk.tsx';

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Örnek Modül',
  simge: 'cube',
  sade: { tercih: 'ornek-depocu', maddeler: ['okut', 'sepet'] },
  gruplar: [
    { maddeler: [
      { anahtar: 'ana', baslik: 'Genel', yol: '/stok', simge: 'list', islem: 'ornek.oku' },
      { anahtar: 'okut', baslik: 'Okut', yol: '/stok/okut', simge: 'scan', islem: 'ornek.oku' },
      { anahtar: 'sepet', baslik: 'Sepet', yol: '/stok/sepet', simge: 'box', islem: 'ornek.sepet' },
    ] },
    { baslik: 'Sistem', maddeler: [{ anahtar: 'ayar', baslik: 'Ayarlar', yol: '/stok/ayar', simge: 'tool', islem: 'ornek.oku' }] },
  ],
};

function ciz(islemler: string[] = ['ornek.oku', 'ornek.sepet']) {
  render(
    <MemoryRouter initialEntries={['/stok']}>
      <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler} ikinciMenuler={[MENU]}>
        <p>icerik</p>
      </Kabuk>
    </MemoryRouter>,
  );
}

const maddeler = () => within(screen.getByRole('navigation', { name: 'Örnek Modül menüsü' })).getAllByRole('link').map((a) => a.textContent?.trim());

beforeEach(() => { localStorage.clear(); cihazTercihleriniSifirla(); });

describe('İkinci menü sade görünüm', () => {
  it('tercih kapalıyken bütün maddeler görünür', () => {
    ciz();
    expect(maddeler()).toEqual(['Genel', 'Okut', 'Sepet', 'Ayarlar']);
  });

  it('tercih açıkken yalnız sade maddeler görünür; tercih değişince menü hemen değişir', () => {
    ciz();
    act(() => { cihazTercihiYaz('ornek-depocu', true); });
    expect(maddeler()).toEqual(['Okut', 'Sepet']);
    act(() => { cihazTercihiYaz('ornek-depocu', false); });
    expect(maddeler()).toEqual(['Genel', 'Okut', 'Sepet', 'Ayarlar']);
  });

  it('sade görünüm yetkiyi genişletmez: işlemi olmayan sade madde görünmez', () => {
    cihazTercihiYaz('ornek-depocu', true);
    ciz(['ornek.oku']);
    expect(maddeler()).toEqual(['Okut']);
  });

  it('yetkisi hiçbir sade maddeye yetmeyen kişi tam menüyü görür (menüsüz kalmaz)', () => {
    cihazTercihiYaz('ornek-depocu', true);
    render(
      <MemoryRouter initialEntries={['/stok']}>
        <Kabuk sayfalar={SAYFALAR} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={['ornek.oku']}
          ikinciMenuler={[{ ...MENU, sade: { tercih: 'ornek-depocu', maddeler: ['sepet'] } }]}>
          <p>icerik</p>
        </Kabuk>
      </MemoryRouter>,
    );
    expect(maddeler()).toEqual(['Genel', 'Okut', 'Ayarlar']);
  });

  it('başka modülün tercihi bu menüyü sadeleştirmez', () => {
    cihazTercihiYaz('baska-depocu', true);
    ciz();
    expect(maddeler()).toEqual(['Genel', 'Okut', 'Sepet', 'Ayarlar']);
  });
});
