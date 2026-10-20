import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { YalitilmisCerceve, yalitimOnBetigi } from './index.ts';
import { temaStili, type YalitimIzni } from './YalitilmisCerceve.tsx';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const SAYFA = '<!doctype html><html><head><title>x</title></head><body></body></html>';

// Tarayıcının teslim ettiği ileti: köken ve kaynak pencereyi tarayıcı yazar, gönderen değiştiremez.
function ilet(veri: unknown, koken: string, kaynak: Window) {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: veri, origin: koken, source: kaynak })); });
}

const cerceve = () => screen.getByTitle('Örnek') as HTMLIFrameElement;
const izinler = () => (cerceve().getAttribute('sandbox') ?? 'YOK').split(' ');

describe('YalitilmisCerceve', () => {
  it('izin verilmezse yalnız betik çalışır; istenen izinler ve yetenekler eklenir, aynı köken ve üst gezinme hiç verilmez', () => {
    const { rerender } = render(<YalitilmisCerceve baslik="Örnek" sayfa={SAYFA} />);
    expect(cerceve().getAttribute('sandbox')).toBe('allow-scripts');
    expect(cerceve().hasAttribute('allow')).toBe(false);
    expect(cerceve().getAttribute('srcdoc')).toBe(SAYFA);

    rerender(
      <YalitilmisCerceve baslik="Örnek" ad="ornek" sinif="tc-ornek" sayfa={SAYFA} izinler={['allow-downloads', 'allow-modals']} yetenekler={['camera', 'clipboard-write']} />,
    );
    expect(izinler()).toEqual(['allow-scripts', 'allow-downloads', 'allow-modals']);
    expect(izinler()).not.toContain('allow-same-origin');
    expect(izinler().filter((i) => i.startsWith('allow-top-navigation'))).toEqual([]);
    expect(cerceve().getAttribute('allow')).toBe('camera; clipboard-write');
    expect(cerceve().getAttribute('name')).toBe('ornek');
    expect(cerceve().className).toBe('tc-ornek');
  });

  it('kendi çerçevesinden gelen iletiyi işler; yanıt o çerçeveye gider', () => {
    const iletiGeldi = vi.fn((veri: unknown, yanitla: (ileti: unknown) => void) => { yanitla({ yanki: veri }); });
    render(<YalitilmisCerceve baslik="Örnek" sayfa={SAYFA} iletiGeldi={iletiGeldi} />);
    const pencere = cerceve().contentWindow as Window;
    const gonderilen = vi.spyOn(pencere, 'postMessage').mockImplementation(() => undefined);

    ilet({ tip: 'selam' }, 'null', pencere);

    expect(iletiGeldi).toHaveBeenCalledTimes(1);
    expect(iletiGeldi.mock.calls[0]![0]).toEqual({ tip: 'selam' });
    // Opak kökene adresle gönderilemez: hedef '*' olur, alıcı kaynak pencereyle sabitlenir.
    expect(gonderilen.mock.calls).toEqual([[{ yanki: { tip: 'selam' } }, '*']]);
  });

  it('başka pencereden ya da yalıtılmamış kökenden gelen aynı biçimli ileti yok sayılır', () => {
    const iletiGeldi = vi.fn();
    render(<YalitilmisCerceve baslik="Örnek" sayfa={SAYFA} iletiGeldi={iletiGeldi} />);
    const pencere = cerceve().contentWindow as Window;
    const baska = document.createElement('iframe');
    document.body.append(baska);

    ilet({ tip: 'selam' }, 'null', pencere);
    expect(iletiGeldi).toHaveBeenCalledTimes(1);

    ilet({ tip: 'selam' }, 'null', baska.contentWindow as Window);
    ilet({ tip: 'selam' }, 'null', window);
    // Köken "null" değilse çerçeve yalıtılmamıştır (kısıtlama düşmüş ya da içerik değişmiş): köprü kapalı kalır.
    ilet({ tip: 'selam' }, window.location.origin, pencere);
    expect(iletiGeldi).toHaveBeenCalledTimes(1);
  });

  it('işleyici değişince yeni işleyici çağrılır; çerçeve kalkınca dinlenmez', () => {
    const ilk = vi.fn();
    const ikinci = vi.fn();
    const { rerender, unmount } = render(<YalitilmisCerceve baslik="Örnek" sayfa={SAYFA} iletiGeldi={ilk} />);
    const pencere = cerceve().contentWindow as Window;
    rerender(<YalitilmisCerceve baslik="Örnek" sayfa={SAYFA} iletiGeldi={ikinci} />);
    ilet({ tip: 'selam' }, 'null', pencere);
    expect(ilk).not.toHaveBeenCalled();
    expect(ikinci).toHaveBeenCalledTimes(1);
    unmount();
    ilet({ tip: 'selam' }, 'null', pencere);
    expect(ikinci).toHaveBeenCalledTimes(1);
  });
});

describe('YalitilmisCerceve: form izni', () => {
  const POLITIKA = `<meta http-equiv="Content-Security-Policy" content="form-action 'none'">`;
  const MODUL = '<!doctype html><html lang="tr"><head><meta http-equiv="Content-Security-Policy" content="form-action *"></head><body><form></form></body></html>';
  const belge = () => cerceve().getAttribute('srcdoc') ?? '';

  it('istenince izin verilir ve gönderimi kapatan politika belge türünün hemen ardına, modülün kendi politikasından önce konur', () => {
    render(<YalitilmisCerceve baslik="Örnek" sayfa={MODUL} izinler={['allow-forms', 'allow-modals']} />);
    expect(izinler()).toEqual(['allow-scripts', 'allow-forms', 'allow-modals']);
    expect(belge()).toBe(`<!doctype html>${POLITIKA}${MODUL.slice('<!doctype html>'.length)}`);
    // Modülün daha gevşek politikası yerinde kalır; tarayıcı iki politikayı da uygular (gönderim kapalı).
    expect(belge().indexOf(POLITIKA)).toBeLessThan(belge().indexOf('form-action *'));
  });

  it('reddedilen: istenmezse izin de politika da yoktur; sayfa olduğu gibi gider', () => {
    render(<YalitilmisCerceve baslik="Örnek" sayfa={MODUL} izinler={['allow-modals']} />);
    expect(izinler()).not.toContain('allow-forms');
    expect(belge()).toBe(MODUL);
  });

  it.each([
    ['belge türü yok', '<html><head></head><body><form></form></body></html>'],
    ['belge türü başta değil, yorumun içinde', '<!-- <!doctype html> --><html><head></head><body></body></html>'],
  ])('reddedilen: politikanın güvenilir yeri yoksa form izni verilmez (%s)', (_ad, sayfa) => {
    render(<YalitilmisCerceve baslik="Örnek" sayfa={sayfa} izinler={['allow-forms']} />);
    expect(izinler()).toEqual(['allow-scripts']);
    expect(belge()).toBe(sayfa);
  });

  it('reddedilen: aynı köken ve üst gezinme izin olarak istenemez', () => {
    // @ts-expect-error aynı köken çerçeveye oturuma ve sayfaya erişim verir
    const ayniKoken: YalitimIzni = 'allow-same-origin';
    // @ts-expect-error üst gezinme çerçeveye uygulamayı başka adrese götürme yetkisi verir
    const ustGezinme: YalitimIzni = 'allow-top-navigation';
    expect([ayniKoken, ustGezinme]).toHaveLength(2);
  });
});

describe('YalitilmisCerceve: tema eşlemesi', () => {
  const belge = () => cerceve().getAttribute('srcdoc') ?? '';
  const kok = document.documentElement.style;
  afterEach(() => { kok.removeProperty('--bg'); kok.removeProperty('--ink'); });

  it('prototip değişkenine kabuğun o anki tasarım değeri yazılır; karışım prototip değişkenleriyle kalır', () => {
    const oku = (ad: string) => ({ '--bg': ' #101010', '--ink': 'rgb(1, 2, 3)' }[ad] ?? '');
    expect(temaStili({ '--paper': '--bg', '--ink': '--ink', '--good-soft': 'color-mix(in srgb, var(--good) 14%, var(--surface))' }, oku))
      .toBe('<style>:root{--paper:#101010!important;--ink:rgb(1, 2, 3)!important;--good-soft:color-mix(in srgb, var(--good) 14%, var(--surface))!important}</style>');
  });

  it('reddedilen: okunamayan ya da belgeyi bozabilecek değer yazılmaz; hiçbiri kalmazsa stil yoktur', () => {
    const oku = (ad: string) => ({ '--a': '', '--b': 'red}</style><script>', '--c': 'x;--d:y' }[ad] ?? '');
    expect(temaStili({ '--x': '--a', '--y': '--b', '--z': '--c' }, oku)).toBe('');
    expect(temaStili({}, oku)).toBe('');
  });

  it('reddedilen: geçersiz değişken adı ve kalıp dışı karışım kodda hatadır', () => {
    const oku = () => '#000';
    expect(() => temaStili({ ['--a;b' as `--${string}`]: '--bg' }, oku)).toThrow(TypeError);
    expect(() => temaStili({ '--a': '--b}' }, oku)).toThrow(TypeError);
    expect(() => temaStili({ '--a': 'color-mix(in srgb, red 10%, var(--b))' }, oku)).toThrow(TypeError);
  });

  it('stil belge türünün ardına konur; form politikası yine ilk sıradadır', () => {
    kok.setProperty('--bg', '#202020');
    const sayfa = '<!doctype html><html><head><style>:root{--paper:#fff}</style></head><body><form></form></body></html>';
    render(<YalitilmisCerceve baslik="Örnek" sayfa={sayfa} izinler={['allow-forms']} temaEslemesi={{ '--paper': '--bg' }} />);
    const politika = `<meta http-equiv="Content-Security-Policy" content="form-action 'none'">`;
    expect(belge()).toBe(`<!doctype html>${politika}<style>:root{--paper:#202020!important}</style>${sayfa.slice('<!doctype html>'.length)}`);
  });

  it('reddedilen: belge türü yoksa ya da eşleme verilmezse sayfa olduğu gibi gider', () => {
    kok.setProperty('--bg', '#202020');
    const turu = '<html><head></head><body></body></html>';
    const { rerender } = render(<YalitilmisCerceve baslik="Örnek" sayfa={turu} temaEslemesi={{ '--paper': '--bg' }} />);
    expect(belge()).toBe(turu);
    rerender(<YalitilmisCerceve baslik="Örnek" sayfa={SAYFA} />);
    expect(belge()).toBe(SAYFA);
  });
});

describe('yalitimOnBetigi', () => {
  // Betik çerçevenin penceresinde koşar; burada aynı gövde sahte bir pencereyle koşturulur.
  function kos(): { localStorage?: Storage } {
    const govde = /^<script>([\s\S]*)<\/script>$/.exec(yalitimOnBetigi())?.[1];
    expect(govde).toBeDefined();
    const pencere: { localStorage?: Storage } = {};
    new Function('window', govde ?? '')(pencere);
    return pencere;
  }

  it('pencereye bellek içi depo koyar: yazılan okunur, silinir, sayılır; uygulamanın deposuna dokunmaz', () => {
    const depo = kos().localStorage as Storage;
    expect(depo.getItem('mk-units')).toBeNull();
    depo.setItem('mk-units', 'imp');
    depo.setItem('mk-sayi', 7 as unknown as string);
    expect(depo.getItem('mk-units')).toBe('imp');
    expect(depo.getItem('mk-sayi')).toBe('7');
    expect(depo.length).toBe(2);
    expect(depo.key(0)).toBe('mk-units');
    expect(depo.key(5)).toBeNull();
    depo.removeItem('mk-units');
    expect(depo.getItem('mk-units')).toBeNull();
    depo.clear();
    expect(depo.length).toBe(0);
    expect(window.localStorage.getItem('mk-sayi')).toBeNull();
  });

  it('her çerçevenin deposu ayrıdır; nesnenin kendi adları anahtar sanılmaz', () => {
    const bir = kos().localStorage as Storage;
    const iki = kos().localStorage as Storage;
    bir.setItem('mk-taslak', 'a');
    expect(iki.getItem('mk-taslak')).toBeNull();
    expect(bir.getItem('toString')).toBeNull();
    expect(bir.getItem('__proto__')).toBeNull();
  });
});
