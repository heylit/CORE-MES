import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { Sayfalama, Tablo, type Sutun } from './index.ts';
import type { Siralama } from '../veri/liste-durumu.ts';

const dugme = (ad: string) => screen.getByRole('button', { name: ad });
const pasifMi = (ad: string) => dugme(ad).getAttribute('aria-disabled') === 'true';
const ozet = () => within(screen.getByRole('navigation', { name: 'Sayfalar' })).getByRole('status').textContent;

describe('Sayfalama', () => {
  it('ortadaki sayfada ozeti yazar ve dort dugme de hedef sayfayi bildirir', () => {
    const degistir = vi.fn();
    render(<Sayfalama sayfa={2} sayfaBoyu={50} toplam={120} degistir={degistir} />);
    expect(ozet()).toBe('120 kayıttan 51–100');
    expect(screen.getByText('2 / 3')).toBeTruthy();
    for (const ad of ['İlk sayfa', 'Önceki sayfa', 'Sonraki sayfa', 'Son sayfa']) {
      expect(pasifMi(ad)).toBe(false);
      fireEvent.click(dugme(ad));
    }
    expect(degistir.mock.calls.map((c) => c[0] as number)).toEqual([1, 1, 3, 3]);
  });

  it('ilk sayfada geri, son sayfada ileri dugmeleri pasiftir ve basilinca sayfa degismez', () => {
    const degistir = vi.fn();
    const { rerender } = render(<Sayfalama sayfa={1} sayfaBoyu={50} toplam={120} degistir={degistir} />);
    expect(['İlk sayfa', 'Önceki sayfa', 'Sonraki sayfa', 'Son sayfa'].map(pasifMi)).toEqual([true, true, false, false]);
    fireEvent.click(dugme('İlk sayfa'));
    fireEvent.click(dugme('Önceki sayfa'));
    expect(degistir).not.toHaveBeenCalled();

    rerender(<Sayfalama sayfa={3} sayfaBoyu={50} toplam={120} degistir={degistir} />);
    expect(ozet()).toBe('120 kayıttan 101–120');
    expect(['İlk sayfa', 'Önceki sayfa', 'Sonraki sayfa', 'Son sayfa'].map(pasifMi)).toEqual([false, false, true, true]);
    fireEvent.click(dugme('Sonraki sayfa'));
    fireEvent.click(dugme('Son sayfa'));
    expect(degistir).not.toHaveBeenCalled();
  });

  it('sinira gelince basilan dugme odagini yitirmez', () => {
    function Ornek() {
      const [sayfa, sayfaYaz] = useState(2);
      return <Sayfalama sayfa={sayfa} sayfaBoyu={50} toplam={120} degistir={sayfaYaz} />;
    }
    render(<Ornek />);
    dugme('Sonraki sayfa').focus();
    fireEvent.click(dugme('Sonraki sayfa'));
    expect(pasifMi('Sonraki sayfa')).toBe(true);
    expect(document.activeElement).toBe(dugme('Sonraki sayfa'));
  });

  it('toplam bilinmiyorsa yalniz onceki ve sonraki vardir; eksik dolu sayfa son sayfadir', () => {
    const degistir = vi.fn();
    const { rerender } = render(<Sayfalama sayfa={2} sayfaBoyu={50} toplam={null} satirSayisi={50} degistir={degistir} />);
    expect(screen.getAllByRole('button').map((d) => d.getAttribute('aria-label'))).toEqual(['Önceki sayfa', 'Sonraki sayfa']);
    expect(ozet()).toBe('Kayıt 51–100');
    expect(screen.getByText('Sayfa 2')).toBeTruthy();
    expect(pasifMi('Sonraki sayfa')).toBe(false);
    fireEvent.click(dugme('Sonraki sayfa'));
    expect(degistir.mock.calls).toEqual([[3]]);

    rerender(<Sayfalama sayfa={2} sayfaBoyu={50} toplam={null} satirSayisi={20} degistir={degistir} />);
    expect(ozet()).toBe('Kayıt 51–70');
    expect(pasifMi('Sonraki sayfa')).toBe(true);
    expect(pasifMi('Önceki sayfa')).toBe(false);
  });

  it('tek sayfada yalniz ozet yazar; kayit yoksa hic cizilmez', () => {
    const { rerender } = render(<Sayfalama sayfa={1} sayfaBoyu={50} toplam={7} degistir={() => {}} />);
    expect(ozet()).toBe('7 kayıttan 1–7');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    rerender(<Sayfalama sayfa={1} sayfaBoyu={50} toplam={0} degistir={() => {}} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('gecersiz sayfa ve sayfa boyu en kucuk gecerli degere cekilir', () => {
    const { rerender } = render(<Sayfalama sayfa={0} sayfaBoyu={50} toplam={120} degistir={() => {}} />);
    expect(ozet()).toBe('120 kayıttan 1–50');
    expect(screen.getByText('1 / 3')).toBeTruthy();
    rerender(<Sayfalama sayfa={2} sayfaBoyu={0} toplam={3} degistir={() => {}} />);
    expect(ozet()).toBe('3 kayıttan 2–2');
    expect(screen.getByText('2 / 3')).toBeTruthy();
    rerender(<Sayfalama sayfa={Number.NaN} sayfaBoyu={Number.NaN} toplam={null} satirSayisi={1} degistir={() => {}} />);
    expect(ozet()).toBe('Kayıt 1–1');
  });

  it('sonuc daralip sayfa bosta kalinca onceki dugmesi son dolu sayfaya goturur', () => {
    const degistir = vi.fn();
    render(<Sayfalama sayfa={9} sayfaBoyu={50} toplam={120} degistir={degistir} />);
    expect(ozet()).toBe('120 kayıt');
    fireEvent.click(dugme('Önceki sayfa'));
    expect(degistir.mock.calls).toEqual([[3]]);
  });
});

interface Satir { no: number; ad: string; adet: number }
const SATIRLAR: Satir[] = [{ no: 1, ad: 'A', adet: 3 }, { no: 2, ad: 'B', adet: 5 }];
const SUTUNLAR: Sutun<Satir>[] = [
  { anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad, sirala: true },
  { anahtar: 'adet', baslik: 'Adet', hucre: (s) => s.adet, sirala: true },
  { anahtar: 'no', baslik: 'No', hucre: (s) => s.no },
];
const basliklar = () => screen.getAllByRole('columnheader');
const siralar = () => basliklar().map((b) => b.getAttribute('aria-sort'));

function SiraliTablo({ bildir }: { bildir?: (s: Siralama | null) => void }) {
  const [siralama, siralamaYaz] = useState<Siralama | null>(null);
  return (
    <Tablo
      etiket="Liste" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no}
      siralama={siralama} siralamaDegistir={(s) => { siralamaYaz(s); bildir?.(s); }}
    />
  );
}

function kartKipi() {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 300);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => 600);
}

describe('Tablo: siralama ve sayfalama', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('siralanabilir basliga basinca artan, azalan, sirasiz diye doner; baska sutun artandan baslar', () => {
    const bildir = vi.fn();
    render(<SiraliTablo bildir={bildir} />);
    expect(siralar()).toEqual(['none', 'none', null]);
    expect(within(basliklar()[2] as HTMLElement).queryByRole('button')).toBeNull();

    fireEvent.click(dugme('Ad'));
    expect(siralar()).toEqual(['ascending', 'none', null]);
    fireEvent.click(dugme('Ad'));
    expect(siralar()).toEqual(['descending', 'none', null]);
    fireEvent.click(dugme('Adet'));
    expect(siralar()).toEqual(['none', 'ascending', null]);
    fireEvent.click(dugme('Adet'));
    fireEvent.click(dugme('Adet'));
    expect(siralar()).toEqual(['none', 'none', null]);
    expect(bildir.mock.calls.map((c) => c[0] as Siralama | null)).toEqual([
      { alan: 'ad', yon: 'artan' }, { alan: 'ad', yon: 'azalan' }, { alan: 'adet', yon: 'artan' }, { alan: 'adet', yon: 'azalan' }, null,
    ]);
  });

  it('siralama bildirimi verilmeyen tabloda baslik dugme olmaz', () => {
    render(<Tablo etiket="Liste" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no} />);
    expect(basliklar().map((b) => b.textContent)).toEqual(['Ad', 'Adet', 'No']);
    expect(siralar()).toEqual([null, null, null]);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('kart kipinde siralama dugmeleri kartlarin ustune tasinir, baslikta dugme kalmaz', () => {
    kartKipi();
    const bildir = vi.fn();
    render(<SiraliTablo bildir={bildir} />);
    expect((screen.getByRole('table').parentElement as HTMLElement).getAttribute('data-kip')).toBe('kart');
    const grup = screen.getByRole('group', { name: 'Sıralama' });
    expect(within(screen.getByRole('table')).queryAllByRole('button')).toHaveLength(0);
    expect(within(grup).getAllByRole('button').map((d) => d.getAttribute('aria-label'))).toEqual(['Ad: sıralı değil', 'Adet: sıralı değil']);

    fireEvent.click(within(grup).getByRole('button', { name: 'Ad: sıralı değil' }));
    expect(bildir.mock.calls).toEqual([[{ alan: 'ad', yon: 'artan' }]]);
    expect(within(grup).getByRole('button', { name: 'Ad: artan sıralı' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('sayfalama verilince tablonun altina cizilir ve kart kipinde de calisir', () => {
    kartKipi();
    const degistir = vi.fn();
    render(
      <Tablo
        etiket="Liste" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no}
        sayfalama={{ sayfa: 1, sayfaBoyu: 2, toplam: 5, degistir }}
      />,
    );
    expect((screen.getByRole('table').parentElement as HTMLElement).getAttribute('data-kip')).toBe('kart');
    expect(ozet()).toBe('5 kayıttan 1–2');
    fireEvent.click(dugme('Sonraki sayfa'));
    expect(degistir.mock.calls).toEqual([[2]]);
  });

  it('toplam bilinmiyorken son sayfayi gelen satir sayisindan anlar; bos sayfada geri donulebilir', () => {
    const degistir = vi.fn();
    const ortak = { etiket: 'Liste', sutunlar: SUTUNLAR, satirAnahtari: (s: Satir) => s.no };
    const { rerender } = render(<Tablo {...ortak} satirlar={SATIRLAR} sayfalama={{ sayfa: 1, sayfaBoyu: 2, toplam: null, degistir }} />);
    expect(pasifMi('Sonraki sayfa')).toBe(false);
    rerender(<Tablo {...ortak} satirlar={SATIRLAR.slice(0, 1)} sayfalama={{ sayfa: 2, sayfaBoyu: 2, toplam: null, degistir }} />);
    expect(pasifMi('Sonraki sayfa')).toBe(true);

    rerender(<Tablo {...ortak} satirlar={[]} bosMesaj="Kayıt yok" sayfalama={{ sayfa: 3, sayfaBoyu: 2, toplam: null, degistir }} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Kayıt yok')).toBeTruthy();
    fireEvent.click(dugme('Önceki sayfa'));
    expect(degistir.mock.calls).toEqual([[2]]);

    rerender(<Tablo {...ortak} satirlar={[]} bosMesaj="Kayıt yok" sayfalama={{ sayfa: 1, sayfaBoyu: 2, toplam: null, degistir }} />);
    expect(screen.getByText('Kayıt yok')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('sayfa degisince liste basi ekranin ustunde kaldiysa gorunur yere alinir, gorunuyorsa kaydirilmaz', () => {
    const kaydir = vi.fn();
    const ust = { deger: -400 };
    render(
      <Tablo
        etiket="Liste" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no}
        sayfalama={{ sayfa: 1, sayfaBoyu: 2, toplam: 5, degistir: () => {} }}
      />,
    );
    const kap = screen.getByRole('table').parentElement as HTMLElement;
    kap.scrollIntoView = kaydir;
    vi.spyOn(kap, 'getBoundingClientRect').mockImplementation(() => ({ top: ust.deger }) as DOMRect);
    fireEvent.click(dugme('Sonraki sayfa'));
    expect(kaydir).toHaveBeenCalledTimes(1);
    ust.deger = 120;
    fireEvent.click(dugme('Sonraki sayfa'));
    expect(kaydir).toHaveBeenCalledTimes(1);
  });

  it('mesgulken tablo beklendigini bildirir', () => {
    const ortak = { etiket: 'Liste', sutunlar: SUTUNLAR, satirlar: SATIRLAR, satirAnahtari: (s: Satir) => s.no };
    const { rerender } = render(<Tablo {...ortak} mesgul />);
    const kap = screen.getByRole('table').parentElement as HTMLElement;
    expect(kap.getAttribute('aria-busy')).toBe('true');
    rerender(<Tablo {...ortak} />);
    expect(kap.hasAttribute('aria-busy')).toBe(false);
  });
});
