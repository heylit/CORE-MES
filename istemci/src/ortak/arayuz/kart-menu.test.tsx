import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Dugme, Kart, Menu, Pencere, Rozet, Tablo, type MenuOgesi, type Sutun } from './index.ts';

describe('Kart basligi', () => {
  it('yalniz metin baslikta ikinci duzey baslik ve sag icerik cizer', () => {
    render(<Kart baslik="Liste" sag={<Dugme>Ekle</Dugme>}>içerik</Kart>);
    const baslik = screen.getByRole('heading', { level: 2, name: 'Liste' });
    expect(within(baslik.closest('header') as HTMLElement).getByRole('button', { name: 'Ekle' })).toBeTruthy();
  });

  it('baslik eki basligin yaninda cizilir ama basligin adina karismaz', () => {
    render(
      <Kart baslik="Emir" baslikEki={<><span className="mono">ORN-0001</span><Rozet>Açık</Rozet></>} sag={<Dugme>İptal et</Dugme>}>
        içerik
      </Kart>,
    );
    const baslik = screen.getByRole('heading', { level: 2 });
    expect(baslik.textContent).toBe('Emir');
    const ust = within(baslik.closest('header') as HTMLElement);
    expect(ust.getByText('ORN-0001')).toBeTruthy();
    expect(ust.getByText('Açık')).toBeTruthy();
    expect(ust.getByRole('button', { name: 'İptal et' })).toBeTruthy();
  });

  it('simge verilmezse baslikta ikon yoktur; verilirse ikon cizilir, basligin adi degismez', () => {
    const { unmount } = render(<Kart baslik="Liste">içerik</Kart>);
    expect(screen.getByRole('heading', { level: 2, name: 'Liste' }).querySelector('svg')).toBeNull();
    unmount();
    render(<Kart baslik="Liste" simge="scan">içerik</Kart>);
    const baslik = screen.getByRole('heading', { level: 2, name: 'Liste' });
    expect(baslik.textContent).toBe('Liste');
    expect(baslik.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('basliksiz kartta da ek cizilir; hicbiri yoksa ust bolum olmaz', () => {
    const { container, rerender } = render(<Kart baslikEki={<Rozet>Taslak</Rozet>}>içerik</Kart>);
    expect(within(container.querySelector('header') as HTMLElement).getByText('Taslak')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    rerender(<Kart>içerik</Kart>);
    expect(screen.getByText('içerik')).toBeTruthy();
    expect(container.querySelector('header')).toBeNull();
  });
});

function ogeler(ek: Partial<Record<'duzenle' | 'parola' | 'sil', Partial<MenuOgesi>>> = {}) {
  const secilen = { duzenle: vi.fn(), parola: vi.fn(), sil: vi.fn() };
  const liste: MenuOgesi[] = [
    { anahtar: 'duzenle', baslik: 'Düzenle', simge: 'edit', sec: secilen.duzenle, ...ek.duzenle },
    { anahtar: 'parola', baslik: 'Parolayı sıfırla', simge: 'lock', sec: secilen.parola, ...ek.parola },
    { anahtar: 'sil', baslik: 'Sil', simge: 'trash', ton: 'tehlike', sec: secilen.sil, ...ek.sil },
  ];
  return { liste, secilen };
}
const dugme = () => screen.getByRole('button', { name: 'Kişi işlemleri' });
const oge = (ad: string) => screen.getByRole('menuitem', { name: ad });
const tus = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });

describe('Menu', () => {
  it('kapaliyken menu yoktur; dugmeyle acilir, odak ilk ogeye duser', () => {
    const { liste } = ogeler();
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(dugme().getAttribute('aria-haspopup')).toBe('menu');
    expect(dugme().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(dugme());
    expect(screen.getByRole('menu', { name: 'Kişi işlemleri' })).toBeTruthy();
    expect(dugme().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('menuitem').map((o) => o.textContent)).toEqual(['Düzenle', 'Parolayı sıfırla', 'Sil']);
    expect(document.activeElement).toBe(oge('Düzenle'));
  });

  it('ok tuslari ogeler arasinda dolasir ve uclardan sarar; Home ve End uca gider', () => {
    const { liste } = ogeler();
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    fireEvent.click(dugme());
    tus('ArrowDown');
    expect(document.activeElement).toBe(oge('Parolayı sıfırla'));
    tus('ArrowDown');
    tus('ArrowDown');
    expect(document.activeElement).toBe(oge('Düzenle'));
    tus('ArrowUp');
    expect(document.activeElement).toBe(oge('Sil'));
    tus('Home');
    expect(document.activeElement).toBe(oge('Düzenle'));
    tus('End');
    expect(document.activeElement).toBe(oge('Sil'));
  });

  it('dugmede asagi ok ilk ogeden, yukari ok son ogeden acar', () => {
    const { liste } = ogeler();
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    dugme().focus();
    tus('ArrowUp');
    expect(document.activeElement).toBe(oge('Sil'));
    tus('Escape');
    tus('ArrowDown');
    expect(document.activeElement).toBe(oge('Düzenle'));
  });

  it('secilen ogenin islemi bir kez calisir, menu kapanir, odak dugmeye doner', () => {
    const { liste, secilen } = ogeler();
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    fireEvent.click(dugme());
    fireEvent.click(oge('Parolayı sıfırla'));
    expect(secilen.parola).toHaveBeenCalledTimes(1);
    expect(secilen.duzenle).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(dugme());
  });

  it('Esc ve Tab islem yapmadan kapatir ve odagi dugmeye verir', () => {
    const { liste, secilen } = ogeler();
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    for (const kapatan of ['Escape', 'Tab']) {
      fireEvent.click(dugme());
      expect(screen.getByRole('menu')).toBeTruthy();
      tus(kapatan);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(dugme());
    }
    expect(secilen.duzenle).not.toHaveBeenCalled();
  });

  it('pencere icindeki menu pencerenin icine cizilir; Esc once menuyu, sonra pencereyi kapatir', () => {
    const { liste } = ogeler();
    const kapat = vi.fn();
    render(<Pencere acik kapat={kapat} baslik="Kişi"><Menu etiket="Kişi işlemleri" ogeler={liste} /></Pencere>);
    fireEvent.click(dugme());
    expect(within(screen.getByRole('dialog')).getByRole('menu')).toBeTruthy();
    tus('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(kapat).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(dugme());
    tus('Escape');
    expect(kapat).toHaveBeenCalledTimes(1);
  });

  it('pencere icindeki tek ogeli menude Tab ve Shift+Tab menuyu kapatir, odak menu dugmesinde kalir', () => {
    const tek: MenuOgesi[] = [{ anahtar: 'duzenle', baslik: 'Düzenle', sec: vi.fn() }];
    const kapat = vi.fn();
    render(<Pencere acik kapat={kapat} baslik="Kişi"><Menu etiket="Kişi işlemleri" ogeler={tek} /></Pencere>);
    for (const shiftKey of [false, true]) {
      fireEvent.click(dugme());
      expect(document.activeElement).toBe(oge('Düzenle'));
      fireEvent.keyDown(oge('Düzenle'), { key: 'Tab', shiftKey });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(dugme());
    }
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(kapat).not.toHaveBeenCalled();
  });

  it('pencere disindaki menu govdeye cizilir', () => {
    const { liste } = ogeler();
    const { container } = render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    fireEvent.click(dugme());
    expect(screen.getByRole('menu').parentElement).toBe(document.body);
    expect(container.contains(screen.getByRole('menu'))).toBe(false);
  });

  it('acik menude dugmeye yeniden basinca kapanir', () => {
    const { liste } = ogeler();
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    fireEvent.click(dugme());
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(dugme());
    fireEvent.click(dugme());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('basis olayi gelmeden ikinci menu acilinca ilki kapanir; kapaninca odak kendi dugmesine doner', () => {
    const { liste } = ogeler();
    render(<><Menu etiket="Birinci" ogeler={liste} /><Menu etiket="İkinci" ogeler={liste} /></>);
    const ikinci = screen.getByRole('button', { name: 'İkinci' });
    fireEvent.click(screen.getByRole('button', { name: 'Birinci' }));
    expect(screen.getByRole('menu', { name: 'Birinci' })).toBeTruthy();
    fireEvent.click(ikinci);
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.getByRole('menu', { name: 'İkinci' })).toBeTruthy();
    tus('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(ikinci);
  });

  it('basili tutulan Enter ve Bosluk tekrari ogeyi etkinlestirmez; ilk basis etkinlestirir', () => {
    const { liste } = ogeler();
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    fireEvent.click(dugme());
    // Düğmenin etkinleşmesi tuşun varsayılan davranışıdır: engellenmişse olay false döner.
    for (const key of ['Enter', ' ']) {
      expect(fireEvent.keyDown(oge('Düzenle'), { key, repeat: true })).toBe(false);
      expect(fireEvent.keyDown(oge('Düzenle'), { key })).toBe(true);
    }
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('disariya basinca kapanir; menunun icine basinca acik kalir', () => {
    const { liste } = ogeler();
    render(<><Menu etiket="Kişi işlemleri" ogeler={liste} /><p>dışarısı</p></>);
    fireEvent.click(dugme());
    fireEvent.pointerDown(screen.getByRole('menu'));
    fireEvent.pointerDown(oge('Sil'));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(screen.getByText('dışarısı'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('pasif oge nedeniyle okunur, odaklanir ama secilemez; menu acik kalir', () => {
    const { liste, secilen } = ogeler({ sil: { pasif: true, pasifNedeni: 'Açık emri olan kişi silinemez.' } });
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    fireEvent.click(dugme());
    const sil = oge('Sil');
    expect(sil.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(sil.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Açık emri olan kişi silinemez.');
    expect(oge('Düzenle').getAttribute('aria-disabled')).toBeNull();
    tus('End');
    expect(document.activeElement).toBe(sil);
    fireEvent.click(sil);
    expect(secilen.sil).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('yikici oge isaretlenir, digerleri isaretlenmez', () => {
    const { liste } = ogeler();
    render(<Menu etiket="Kişi işlemleri" ogeler={liste} />);
    fireEvent.click(dugme());
    expect(oge('Sil').classList.contains('tc-menu-oge-tehlike')).toBe(true);
    expect(oge('Düzenle').classList.contains('tc-menu-oge-tehlike')).toBe(false);
  });

  it('ogesi olmayan menu dugme cizmez; pasif menu acilmaz', () => {
    const { liste } = ogeler();
    const { rerender } = render(<Menu etiket="Kişi işlemleri" ogeler={liste} pasif />);
    fireEvent.click(dugme());
    expect(screen.queryByRole('menu')).toBeNull();
    rerender(<Menu etiket="Kişi işlemleri" ogeler={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('secilebilir tablo satirinda dugme ve oge satirin secimini tetiklemez', () => {
    interface Kisi { id: number; ad: string }
    const { liste, secilen } = ogeler();
    const satirSec = vi.fn();
    const sutunlar: Sutun<Kisi>[] = [
      { anahtar: 'ad', baslik: 'Ad', hucre: (k) => k.ad },
      { anahtar: 'islem', baslik: 'İşlem', hucre: () => <Menu etiket="Kişi işlemleri" ogeler={liste} /> },
    ];
    render(<Tablo etiket="Kişiler" sutunlar={sutunlar} satirlar={[{ id: 1, ad: 'Örnek Kişi' }]} satirAnahtari={(k) => k.id} satirSec={satirSec} />);
    fireEvent.click(screen.getByText('Örnek Kişi'));
    expect(satirSec).toHaveBeenCalledTimes(1);
    fireEvent.click(dugme());
    fireEvent.click(oge('Düzenle'));
    expect(secilen.duzenle).toHaveBeenCalledTimes(1);
    expect(satirSec).toHaveBeenCalledTimes(1);
  });
});
