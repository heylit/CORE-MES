import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CizgiGrafikKarti, CubukGrafikKarti, MakineDurumuKarti, YatayCubukKarti, guzelTavan } from './grafikler.tsx';
import { GostergeSeridi } from './GostergeSeridi.tsx';

afterEach(cleanup);
const ciz = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('grafik kabugu (kart 1773)', () => {
  it('yuklenirken, alinamayinca ve veri yokken cizmez; sifir uydurmaz', () => {
    ciz(<CubukGrafikKarti baslik="Üretim" simge="chart" yuklendi={false} etiketler={[]} seriler={[]} />);
    expect(screen.getByRole('status').textContent).toBe('Yükleniyor…');
    cleanup();
    ciz(<CubukGrafikKarti baslik="Üretim" simge="chart" hata yuklendi etiketler={['01.11']} seriler={[{ ad: 'Sağlam', degerler: [3] }]} />);
    expect(screen.getByRole('alert').textContent).toBe('Alınamadı');
    cleanup();
    ciz(<CubukGrafikKarti baslik="Üretim" simge="chart" yuklendi etiketler={['01.11', '02.11']} seriler={[{ ad: 'Sağlam', degerler: [null, null] }]} />);
    expect(screen.getByRole('status').textContent).toBe('Veri yok');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('cubuk: yigili seriler lejantla, okuma satiri son gunle baslar, ok tusu gezdirir; tablo her degeri yazar', () => {
    ciz(<CubukGrafikKarti baslik="Üretim" simge="chart" yuklendi etiketler={['30.10', '31.10', '01.11']}
      seriler={[{ ad: 'Sağlam', degerler: [10, null, 30] }, { ad: 'Hurda', degerler: [1, null, 2] }]} />);
    expect(within(screen.getByRole('list', { name: 'Seriler' })).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Sağlam', 'Hurda']);
    const okuma = () => document.querySelector('.tc-gp-okuma')?.textContent;
    expect(okuma()).toContain('01.11');
    expect(okuma()).toContain('30 Sağlam');
    fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowLeft' });
    expect(okuma()).toContain('veri yok Sağlam');
    fireEvent.click(screen.getByRole('button', { name: /Tablo/ }));
    const satirlar = within(screen.getByRole('table')).getAllByRole('row').map((r) => r.textContent);
    expect(satirlar).toEqual(['SağlamHurda', '30.10101', '31.10--', '01.11302']);
  });

  it('cizgi: bos gun cizgiyi boler; son deger dogrudan etiketlenir', () => {
    ciz(<CizgiGrafikKarti baslik="Hurda oranı" simge="target" yuklendi etiketler={['a', 'b', 'c', 'd']} bicim={(n) => `%${n}`}
      seriler={[{ ad: 'Hurda oranı', degerler: [2, null, 3, 4] }]} />);
    const yol = document.querySelector('path.tc-gp-cizgi')?.getAttribute('d') ?? '';
    expect(yol.match(/M/g)?.length).toBe(2);
    expect(document.querySelector('.tc-gp-dogrudan')?.textContent).toBe('%4');
  });

  it('yatay cubuk buyukten kucuge siralar; istenirse verilen sirayi korur ve satir baglantisi verir', () => {
    ciz(<YatayCubukKarti baslik="Duruş" simge="clock" yuklendi satirlar={[{ etiket: 'Ayar', deger: 5 }, { etiket: 'Arıza', deger: 50, yol: '/x' }]} />);
    expect(screen.getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Arıza50', 'Ayar5']);
    expect(screen.getByRole('link', { name: 'Arıza' }).getAttribute('href')).toBe('/x');
    cleanup();
    ciz(<YatayCubukKarti baslik="Termin" simge="truck" yuklendi siralama={false} satirlar={[{ etiket: 'Gecikmiş', deger: 1 }, { etiket: '0-3 gün', deger: 9 }]} />);
    expect(screen.getAllByRole('listitem').map((l) => l.textContent)).toEqual(['Gecikmiş1', '0-3 gün9']);
  });

  it('makine durumu simge ve yaziyla; sayilar okuma satirinda', () => {
    ciz(<MakineDurumuKarti baslik="Makineler" simge="cpu" yuklendi makineler={[
      { anahtar: '1', kod: 'T-01', ad: 'Torna', ton: 'ariza', aciklama: 'Mil arızası' },
      { anahtar: '2', kod: 'T-02', ad: 'Torna', ton: 'calisiyor', aciklama: null },
    ]} />);
    const kutular = screen.getAllByRole('listitem');
    expect(kutular[0]?.textContent).toBe('T-01ArızalıMil arızası');
    expect(kutular[1]?.getAttribute('data-ton')).toBe('calisiyor');
    expect(document.querySelector('.tc-gp-okuma')?.textContent).toBe('1 arızalı1 çalışabilir');
  });

  it('eksen tavani okunur basamaga yuvarlanir', () => {
    expect([0, 7, 38, 120, 410].map(guzelTavan)).toEqual([1, 10, 50, 200, 500]);
  });
});

describe('GostergeSeridi', () => {
  it('dagilim olcusunu almaz; veri yoksa sifir yazmaz', () => {
    render(<GostergeSeridi olcular={[
      { anahtar: 'a', ad: 'Sağlam', deger: 12, birim: 'adet', kiyas: { etiket: 'dün', deger: 20, iyiYon: 'artis' }, plan: null, seri: [1, 2], dagilim: [] },
      { anahtar: 'b', ad: 'Hurda', deger: null, birim: 'adet', kiyas: null, plan: null, seri: [], dagilim: [] },
      { anahtar: 'c', ad: 'Duruş', deger: null, birim: 'dk', kiyas: null, plan: null, seri: [], dagilim: [{ etiket: 'Arıza', deger: 3 }] },
    ]} />);
    const kutular = screen.getAllByRole('listitem');
    expect(kutular).toHaveLength(2);
    expect(within(kutular[0]!).getByText('dün 20 adet').getAttribute('data-yon')).toBe('kotu');
    expect(within(kutular[1]!).getByText('Veri yok')).toBeTruthy();
  });
});
