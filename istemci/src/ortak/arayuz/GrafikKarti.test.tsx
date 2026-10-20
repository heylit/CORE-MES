import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GrafikKarti } from './GrafikKarti.tsx';

const HAFTA = [{ etiket: 'Pzt', deger: 4 }, { etiket: 'Sal', deger: 0 }, { etiket: 'Çar', deger: 8.5 }];
const ciz = (ozellik: Partial<Parameters<typeof GrafikKarti>[0]> = {}) => render(
  <MemoryRouter><GrafikKarti baslik="Üretilen" simge="gauge" tur="cubuk" noktalar={HAFTA} birim="adet" {...ozellik} /></MemoryRouter>,
);

afterEach(cleanup);

describe('GrafikKarti', () => {
  it('cubuk: her nokta icin bir hedef, sifir olmayan her deger icin bir cubuk; ozet verilmezse ust deger yazmaz, uc etiketler yazar, degerler gizli tabloda', () => {
    const { container } = ciz();
    expect(container.querySelectorAll('.tc-grafik-hedef')).toHaveLength(3);
    expect(container.querySelectorAll('.tc-grafik-cubuk')).toHaveLength(2);
    expect(container.querySelector('.tc-grafik-son')).toBeNull();
    expect(container.querySelector('.tc-grafik-eksen')?.textContent).toBe('PztÇar');
    const tablo = screen.getByRole('table', { name: 'Üretilen' });
    expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['Pzt4 adet', 'Sal0 adet', 'Çar8,5 adet']);
    expect([...container.querySelectorAll('title')].map((t) => t.textContent)).toEqual(['Pzt: 4 adet', 'Sal: 0 adet', 'Çar: 8,5 adet']);
  });

  it('egri: tek cizgi, nokta basina bir hedef; en buyuk deger ustte, sifir tabanda; son deger ustte yazar, yuzde onde', () => {
    const { container } = ciz({ tur: 'egri', birim: '%' });
    expect(container.querySelector('.tc-grafik-son')?.textContent).toBe('%8,5');
    const cizgi = container.querySelector('polyline.tc-grafik-egri');
    const noktalar = cizgi?.getAttribute('points')?.split(' ').map((p) => Number(p.split(',')[1]));
    expect(noktalar).toEqual([96 - (4 / 8.5) * 88, 96, 8]);
    expect(container.querySelectorAll('.tc-grafik-hedef')).toHaveLength(3);
  });

  it('yukleniyor, veri yok ve hata cizim yerine yazi gosterir; sifir uydurulmaz', () => {
    const durum = (o: Partial<Parameters<typeof GrafikKarti>[0]>) => {
      const { container, unmount } = ciz(o);
      const sonuc = { yazi: container.querySelector('.tc-grafik-durum')?.textContent, svg: container.querySelector('.tc-grafik-cizim') !== null, mesgul: container.firstElementChild?.getAttribute('aria-busy') };
      unmount();
      return sonuc;
    };
    expect(durum({ noktalar: undefined })).toEqual({ yazi: '…', svg: false, mesgul: 'true' });
    expect(durum({ noktalar: null })).toEqual({ yazi: 'Veri yok', svg: false, mesgul: null });
    expect(durum({ noktalar: [] })).toEqual({ yazi: 'Veri yok', svg: false, mesgul: null });
    expect(durum({ hata: true })).toEqual({ yazi: 'Alınamadı', svg: false, mesgul: null });
  });

  it('verilen ozet ust degerin yerine gecer; yol verilince kartin tamami o sayfaya gider', () => {
    const { container } = ciz({ yol: '/plan', ozet: '12,5 adet' });
    expect(container.querySelector('.tc-grafik-son')?.textContent).toBe('12,5 adet');
    expect(screen.getByRole('link').getAttribute('href')).toBe('/plan');
  });
});
