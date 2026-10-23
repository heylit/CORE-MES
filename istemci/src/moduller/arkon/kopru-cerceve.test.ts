import { describe, expect, it, vi } from 'vitest';
import { kopruKaydet, kopruSec } from './ArkonCercevesi.tsx';

// Soru 138 b: kalıcı Üretim Terminali çerçevesi yaşarken başka Arkon çerçevesi (Kuyruk, Arkon MES) kalkınca terminalin köprüsü silinmez;
// yeniden yüklenen terminal kendi köprüsüne bağlanır, Arkon kendi şeridiyle ve TMI bağlantısı olmadan açılmaz.
type Pencere = Window & typeof globalThis;
const ustKur = (): Window => {
  const ust = {} as Window;
  (ust as { parent: Window }).parent = ust;
  return ust;
};
const cerceveKur = () => ({ current: document.createElement('iframe') });
const pencereKur = (cerceve: HTMLIFrameElement, ust: Window): Pencere => ({ frameElement: cerceve, parent: ust }) as unknown as Pencere;

describe('Arkon köprüsü çerçeve başınadır', () => {
  it('çağrı, çağıran pencerenin çerçevesine gider; son kurulan çerçeveye değil', () => {
    const ust = ustKur();
    const terminal = cerceveKur(), kuyruk = cerceveKur();
    const terminaleBagla = vi.fn(), kuyrugaBagla = vi.fn();
    const kaldirT = kopruKaydet({ cerceve: terminal, bagla: terminaleBagla }, ust);
    const kaldirK = kopruKaydet({ cerceve: kuyruk, bagla: kuyrugaBagla }, ust);
    const pencere = pencereKur(terminal.current, ust);
    ust.__tmiArkonBagla?.(pencere);
    expect(terminaleBagla).toHaveBeenCalledWith(pencere);
    expect(kuyrugaBagla).not.toHaveBeenCalled();
    kaldirK();
    kaldirT();
  });

  it('bir çerçeve kalkınca öteki çerçevenin köprüsü kalır; yeniden yüklenen terminal bağlanır', () => {
    const ust = ustKur();
    const terminal = cerceveKur(), kuyruk = cerceveKur();
    const terminaleBagla = vi.fn();
    const kaldirT = kopruKaydet({ cerceve: terminal, bagla: terminaleBagla }, ust);
    const kaldirK = kopruKaydet({ cerceve: kuyruk, bagla: vi.fn() }, ust);
    kaldirK();
    expect(typeof ust.__tmiArkonBagla).toBe('function');
    ust.__tmiArkonBagla?.(pencereKur(terminal.current, ust));
    expect(terminaleBagla).toHaveBeenCalledTimes(1);
    kaldirT();
    expect(ust.__tmiArkonBagla).toBeUndefined();
  });

  it('önizleme gibi iç içe çerçeve, üstteki TMI çerçevesinin köprüsünü bulur', () => {
    const ust = ustKur();
    const terminal = cerceveKur(), kuyruk = cerceveKur();
    const kaldirT = kopruKaydet({ cerceve: terminal, bagla: vi.fn() }, ust);
    const kaldirK = kopruKaydet({ cerceve: kuyruk, bagla: vi.fn() }, ust);
    const arkon = pencereKur(terminal.current, ust);
    const onizleme = pencereKur(document.createElement('iframe'), arkon);
    expect(kopruSec(onizleme, ust)?.cerceve).toBe(terminal);
    kaldirK();
    kaldirT();
  });

  it('çerçevesi tanınmayan pencere son kurulan köprüye düşer; köprü yoksa null', () => {
    const ust = ustKur();
    expect(kopruSec({} as Window, ust)).toBeNull();
    const terminal = cerceveKur();
    const kaldir = kopruKaydet({ cerceve: terminal, bagla: vi.fn() }, ust);
    expect(kopruSec({} as Window, ust)?.cerceve).toBe(terminal);
    kaldir();
  });
});
