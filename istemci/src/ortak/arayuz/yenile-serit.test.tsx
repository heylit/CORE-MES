import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Tablo, type Sutun } from './Tablo.tsx';
import { Yenile, gecenMetni, type YenilenenSorgu } from './Yenile.tsx';

interface Satir { no: number; ad: string; ton: 'tamam' | 'uyari' | 'hata' | 'pasif' | 'bilgi' }
const SUTUNLAR: readonly Sutun<Satir>[] = [{ anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad }];
const SATIRLAR: Satir[] = [
  { no: 1, ad: 'ORN-A', ton: 'tamam' }, { no: 2, ad: 'ORN-B', ton: 'uyari' }, { no: 3, ad: 'ORN-C', ton: 'pasif' }, { no: 4, ad: 'ORN-D', ton: 'bilgi' },
];

function telefonOlsun(telefon: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: telefon && q.includes('max-width: 767px'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const sorgu = (ek: Partial<YenilenenSorgu> = {}): YenilenenSorgu => ({ refetch: vi.fn(() => Promise.resolve()), isFetching: false, isError: false, dataUpdatedAt: Date.now() - 125_000, ...ek });

describe('kart sol durum şeridi (kart 3676)', () => {
  it('şerit rozet tonundan gelir; ton olduğu gibi, geniş ekranda yoktur', () => {
    telefonOlsun(true);
    const { container, unmount } = render(<MemoryRouter><Tablo etiket="Liste" kip="kayit" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no} serit={(s) => s.ton} /></MemoryRouter>);
    expect([...container.querySelectorAll('tbody tr')].map((t) => t.getAttribute('data-serit'))).toEqual(['tamam', 'uyari', 'pasif', 'bilgi']);
    unmount();
    telefonOlsun(false);
    const genis = render(<MemoryRouter><Tablo etiket="Liste" kip="kayit" sutunlar={SUTUNLAR} satirlar={SATIRLAR} satirAnahtari={(s) => s.no} serit={(s) => s.ton} /></MemoryRouter>);
    expect(genis.container.querySelectorAll('tr[data-serit]').length).toBe(0);
  });
});

describe('yenile (kart 3676)', () => {
  it('geçen süre metni', () => {
    expect(gecenMetni(3_000)).toBe('şimdi');
    expect(gecenMetni(30_000)).toBe('30 sn önce');
    expect(gecenMetni(125_000)).toBe('2 dk önce');
    expect(gecenMetni(3 * 3_600_000)).toBe('3 sa önce');
  });

  it('telefonda güncellenme zamanını yazar, düğme yeniler; geniş ekranda çizilmez', () => {
    telefonOlsun(true);
    const q = sorgu();
    const { unmount } = render(<Yenile sorgu={q} />);
    expect(screen.getByRole('status').textContent).toBe('Güncellendi: 2 dk önce');
    fireEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    expect(q.refetch).toHaveBeenCalledTimes(1);
    unmount();
    telefonOlsun(false);
    const genis = render(<Yenile sorgu={q} />);
    expect(genis.container.firstChild).toBeNull();
  });

  it('yenilenirken düğme kapalı ve meşgul; ikinci dokunuş sorguyu tekrar çağırmaz', () => {
    telefonOlsun(true);
    const q = sorgu({ isFetching: true });
    render(<Yenile sorgu={q} />);
    const dugme = screen.getByRole('button', { name: 'Yenile' });
    expect(dugme.getAttribute('aria-busy')).toBe('true');
    expect((dugme as HTMLButtonElement).disabled).toBe(true);
  });

  it('yenilenemezse eski liste kalır: zaman son başarılı güncellemeyi söyler, Tekrar dene aynı satırda; veri hiç gelmediyse uyarı yok', () => {
    telefonOlsun(true);
    const q = sorgu({ isError: true });
    const { unmount } = render(<Yenile sorgu={q} />);
    expect(screen.getByRole('alert').textContent).toBe('Güncellenemedi. Son güncelleme: 2 dk önce');
    expect(screen.queryByText(/^Güncellendi/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(q.refetch).toHaveBeenCalledTimes(1);
    unmount();
    render(<Yenile sorgu={sorgu({ isError: true, dataUpdatedAt: 0 })} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('süre metni dakika geçtikçe kendiliğinden güncellenir ve canlı bölgedir', () => {
    telefonOlsun(true);
    vi.useFakeTimers();
    const baslangic = Date.now();
    render(<Yenile sorgu={sorgu({ dataUpdatedAt: baslangic })} />);
    const durum = screen.getByRole('status');
    expect(durum.getAttribute('aria-live')).toBe('polite');
    expect(durum.textContent).toBe('Güncellendi: şimdi');
    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    expect(durum.textContent).toBe('Güncellendi: 3 dk önce');
  });

  it('aşağı çekme: en üstteyken 80 pikseli aşınca yeniler, altında yenilemez', () => {
    telefonOlsun(true);
    const q = sorgu();
    const { container } = render(<div className="tc-kabuk-icerik"><Yenile sorgu={q} /><p>içerik</p></div>);
    const hedef = container.querySelector('p') as HTMLElement;
    const cek = (px: number) => {
      fireEvent.touchStart(hedef, { touches: [{ clientY: 100 }] });
      fireEvent.touchMove(hedef, { touches: [{ clientY: 100 + px }] });
      fireEvent.touchEnd(hedef);
    };
    act(() => { cek(40); });
    expect(q.refetch).not.toHaveBeenCalled();
    act(() => { cek(110); });
    expect(q.refetch).toHaveBeenCalledTimes(1);
  });

  it('birden çok liste olan sayfada düğme adı listeyi söyler', () => {
    telefonOlsun(true);
    render(<><Yenile sorgu={sorgu()} ad="Toplama listeleri" /><Yenile sorgu={sorgu()} ad="Malzeme istekleri" /></>);
    expect(screen.getByRole('button', { name: 'Yenile: Toplama listeleri' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yenile: Malzeme istekleri' })).toBeTruthy();
  });
});
