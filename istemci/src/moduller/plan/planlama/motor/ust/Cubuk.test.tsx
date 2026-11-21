import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CALISMA_ACILINCA } from '../ortak.tsx';
import { OLAY_YOK, OlayAcBaglami } from '../../gorunumler.ts';
import { Cubuk, UFUK_BILGISI, UFUK_BILGISI_ANAHTARI } from './Cubuk.tsx';
import type { NabizDurumu } from './nabiz.ts';

afterEach(() => { cleanup(); });

// 3308-2 a: şerit tek satırdır; durum ışığı, nabız sayıları ve olay sayısı. Dokununca plan nabzı ve olaylar açılır.
const nabiz = (late: number, dar = 40): NabizDurumu => ({
  donemYazi: '16.11 - 22.11', etiket: 'bu hafta', ref: { tur: 'onceki', ad: 'Önceki sürüm', kayit: null } as NabizDurumu['ref'], surum: 1,
  cur: { zam: 90, late, wT: 0, dar, suH: 0, deg: 0 }, kar: null, ozet: { metin: '', ton: '' }, egri: {}, gecBekleyen: 0,
});
const ciz = (o: { plan?: boolean; planYaz?: boolean; n?: NabizDurumu | null; acik?: boolean; nabizAc?: (x: boolean) => void; olaylar?: Record<string, unknown>[]; refSec?: (v: 'onceki' | 'sabit') => void; sabitle?: () => void }) => render(
  <Cubuk plan={o.plan ?? true} guncel planYaz={o.planYaz ?? true} nabiz={o.n ?? null} nabizAcik={o.acik ?? false} nabizAc={o.nabizAc ?? (() => {})}
    ozeteGit={() => {}} refSec={o.refSec ?? null} sabitle={o.sabitle ?? null} sabitAd={null} olaylar={o.olaylar ?? []} />,
);
const cubuk = () => within(screen.getByRole('toolbar', { name: 'Plan çubuğu' }));
const isik = () => cubuk().getByRole('button', { name: /^Plan nabzı/ });

describe('plan şeridinin durum ışığı', () => {
  it('geciken yoksa yeşil, bir iki gecikende ya da darboğaz yüzde 95 üstündeyse sarı, üç ve üstü gecikende kırmızı', () => {
    for (const [late, dar, beklenen] of [[0, 40, 'iyi'], [1, 40, 'dikkat'], [0, 96, 'dikkat'], [3, 40, 'sorun']] as const) {
      ciz({ n: nabiz(late, dar) });
      expect(isik().getAttribute('data-isik')).toBe(beklenen);
      cleanup();
    }
  });

  it('plan yokken ışık sönüktür ve şerit açılmaz (reddedilen)', () => {
    const ac = vi.fn();
    ciz({ plan: false, nabizAc: ac });
    expect(isik().getAttribute('data-isik')).toBe('yok');
    expect((isik() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(isik());
    expect(ac).not.toHaveBeenCalled();
  });

  it('ışığa basınca şerit açılır, açıkken basınca kapanır', () => {
    const ac = vi.fn();
    ciz({ n: nabiz(0), nabizAc: ac });
    fireEvent.click(isik());
    expect(ac).toHaveBeenLastCalledWith(true);
    cleanup();
    ciz({ n: nabiz(0), acik: true, nabizAc: ac });
    ac.mockClear();
    // Işığa dokunmak "dışarı dokunuş" sayılmaz: yoksa önce kapanır, tıklama yeniden açar.
    fireEvent.pointerDown(isik());
    expect(ac).not.toHaveBeenCalled();
    fireEvent.click(isik());
    expect(ac).toHaveBeenLastCalledWith(false);
  });

  it('şeritte ekran sekmeleri ve "Plan iyileştirme ara" yoktur', () => {
    ciz({ n: nabiz(1) });
    for (const ad of ['Stüdyo', 'Veri', 'Geçmiş', 'Plan iyileştirme ara']) expect(cubuk().queryByRole('button', { name: ad })).toBeNull();
  });
});

describe('açık şeritte olaylar', () => {
  const OLAYLAR = [{ tip: 'ariza', m: 'ORN-T1', saat: 8 }, { tip: 'malzeme', kod: 'ORN-M1', gun: 2 }];

  it('olay sayısı kapalı şeritte, son olaylar açık şeritte yazar', () => {
    ciz({ n: nabiz(0), acik: true, olaylar: OLAYLAR });
    expect(cubuk().getByRole('button', { name: /2\s*olay/ })).toBeTruthy();
    const panel = within(screen.getByRole('region', { name: 'Plan nabzı' }));
    expect(panel.getByText('Olaylar (2)')).toBeTruthy();
    expect(panel.getByText('Arıza')).toBeTruthy();
    expect(panel.getByText('ORN-M1 · 2 gün')).toBeTruthy();
  });

  it('Olay ekle bağlam verince arıza türüyle formu ister (izinli)', () => {
    const ac = vi.fn();
    render(<OlayAcBaglami.Provider value={ac}>
      <Cubuk plan guncel planYaz nabiz={nabiz(0)} nabizAcik nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null} />
    </OlayAcBaglami.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Olay ekle' }));
    expect(ac).toHaveBeenCalledWith('ariza');
  });

  it('bağlam yoksa Olay ekle pasif ve nedeni ipucunda; plan yazamayana hiç çizilmez (reddedilen)', () => {
    ciz({ n: nabiz(0), acik: true });
    const d = screen.getByRole('button', { name: 'Olay ekle' });
    expect(d.getAttribute('aria-disabled')).toBe('true');
    expect(d.getAttribute('title')).toContain(OLAY_YOK);
    cleanup();
    ciz({ n: nabiz(0), acik: true, planYaz: false });
    expect(screen.queryByRole('button', { name: 'Olay ekle' })).toBeNull();
  });
});

describe('plan yokken Planı kur', () => {
  it('çalışma yokken pasif; nedeni çalışmadır, görünür notta yazar', () => {
    ciz({ plan: false });
    const d = cubuk().getByRole('button', { name: 'Planı kur' });
    expect(d.getAttribute('aria-disabled')).toBe('true');
    expect(d.getAttribute('title')).toContain(CALISMA_ACILINCA);
    expect(cubuk().getByText('Çalışma açılınca')).toBeTruthy();
  });
});

describe('açık şeritte nabız referansı', () => {
  it('yazamayan kişide Referans kutusu ve sabitleme kapalıdır (reddedilen); yazabilende seçim çalışmaya gider (izinli)', () => {
    ciz({ n: nabiz(0), acik: true, planYaz: false });
    const panel = () => within(screen.getByRole('region', { name: 'Plan nabzı' }));
    expect((panel().getByLabelText('Referans') as HTMLSelectElement).disabled).toBe(true);
    expect((panel().getByRole('button', { name: /^Şu anki planı referans al/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const refSec = vi.fn(); const sabitle = vi.fn();
    ciz({ n: nabiz(0), acik: true, refSec, sabitle });
    expect((panel().getByLabelText('Referans') as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(panel().getByLabelText('Referans'), { target: { value: 'sabit' } });
    expect(refSec).toHaveBeenCalledWith('sabit');
    fireEvent.click(panel().getByRole('button', { name: /^Şu anki planı referans al/ }));
    expect(sabitle).toHaveBeenCalledTimes(1);
  });
});

// 3317 a: Kokpit şeride kendi özetini çizer. Yuva verilince plan durumu rozeti çizilmez (durumu sayfa söyler), toplu düğme veri
// değişikliklerini adıyla söyler ve ikincildir; yuva verilmeyen sayfalarda şerit eskisi gibidir.
describe('plan şeridinde sayfa yuvaları (3317)', () => {
  const uygulayici = (uygula = vi.fn()) => ({ uygula, suruyor: false, say: 2 });
  const yuvali = (yuva: { satir: (el: HTMLElement | null) => void; alt: (el: HTMLElement | null) => void } | null, uygula = vi.fn()) => render(
    <Cubuk plan guncel={false} planYaz nabiz={nabiz(0)} nabizAcik={false} nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null}
      bekleyenUygula={uygulayici(uygula)} yuva={yuva} />,
  );

  it('yuva verilince iki öğe bağlanır; rozet yoktur; toplu düğme "Planı güncelle (2)" ve ikincildir, basınca uygular', () => {
    const satir = vi.fn(), alt = vi.fn(), uygula = vi.fn();
    yuvali({ satir, alt }, uygula);
    expect(satir.mock.calls.at(-1)?.[0]).toBeInstanceOf(HTMLElement);
    expect(alt.mock.calls.at(-1)?.[0]).toBeInstanceOf(HTMLElement);
    // Satır yuvası çubuğun içinde, alt yuva çubuğun dışında (altında) durur.
    const cubukEl = screen.getByRole('toolbar', { name: 'Plan çubuğu' });
    expect(cubukEl.contains(satir.mock.calls.at(-1)?.[0] as HTMLElement)).toBe(true);
    expect(cubukEl.contains(alt.mock.calls.at(-1)?.[0] as HTMLElement)).toBe(false);
    expect(cubuk().queryByText('Veri değişti')).toBeNull();
    const d = cubuk().getByRole('button', { name: 'Planı güncelle' });
    // 3504 b: ad hiçbir genişlikte kısalmaz; tek ad vardır.
    expect(d.textContent).toBe('Planı güncelle (2)');
    expect(d.querySelector('[data-kisa], [data-uzun]')).toBeNull();
    expect(d.classList.contains('tc-dugme-birincil')).toBe(false);
    fireEvent.click(d);
    expect(uygula).toHaveBeenCalledTimes(1);
  });

  it('yuva verilmeyince şerit eskisi gibidir: "Veri değişti" rozeti ve birincil "Planı güncelle (2)"', () => {
    yuvali(null);
    expect(cubuk().getByText('Veri değişti')).toBeTruthy();
    const d = cubuk().getByRole('button', { name: 'Planı güncelle' });
    expect(d.textContent).toBe('Planı güncelle (2)');
    expect(d.classList.contains('tc-dugme-birincil')).toBe(true);
    expect(document.querySelector('.tc-pym-sb-yuva, .tc-pym-sb-alt-yuva')).toBeNull();
  });

  it('plan yokken yuva verilse de "Plan yok" rozeti kalır', () => {
    render(<Cubuk plan={false} guncel={false} planYaz nabiz={null} nabizAcik={false} nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null} yuva={{ satir: () => {}, alt: () => {} }} />);
    expect(cubuk().getByText('Plan yok')).toBeTruthy();
  });
  it('3486: uygulama sürerken toplu düğme döner ve "Güncelleniyor" der', () => {
    render(
      <Cubuk plan guncel={false} planYaz nabiz={nabiz(0)} nabizAcik={false} nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null}
        bekleyenUygula={{ uygula: vi.fn(), suruyor: true, say: 2 }} yuva={null} />,
    );
    const d = screen.getByText('Güncelleniyor').closest('button')!;
    expect(d.getAttribute('aria-busy')).toBe('true');
    expect(d.querySelector('.tc-dugme-doner')).not.toBeNull();
  });

  // 3504 b: plan varken şeritte "Plan nasıl çalışır" düğmesi durur; basınca beş açıklama açılır, Esc kapatır. Plan yokken düğme yoktur.
  it('Plan nasıl çalışır kutusu düğmeyle açılır, Esc ile kapanır; plan yokken düğme yoktur', () => {
    yuvali(null);
    const d = cubuk().getByRole('button', { name: 'Plan nasıl çalışır' });
    expect(d.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(d);
    expect(d.getAttribute('aria-expanded')).toBe('true');
    const kutu = screen.getByRole('region', { name: 'Plan nasıl çalışır' });
    expect([...kutu.querySelectorAll('dt')].map((x) => x.textContent)).toEqual(['Bir iş uzarsa ya da adet artarsa', 'Bir iş erken biterse', 'Başladı, yerinde kalır', 'Elle taşıdım ya da yerleştirdim', 'Sıra da değişsin']);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Plan nasıl çalışır' })).toBeNull();
    cleanup();
    render(<Cubuk plan={false} guncel={false} planYaz nabiz={null} nabizAcik={false} nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null} />);
    expect(screen.queryByRole('button', { name: 'Plan nasıl çalışır' })).toBeNull();
  });
});

// Plan hesabı büyük veride yarım dakikayı geçiyor; şerit ilk saniyelerden sonra geçen süreyi ve üst sınırı yazar, bitince kalkar.
describe('plan şeridinde hesap süresi', () => {
  afterEach(() => { vi.useRealTimers(); });
  const ciz2 = (suruyor: boolean) => (
    <Cubuk plan guncel={false} planYaz nabiz={nabiz(0)} nabizAcik={false} nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null}
      bekleyenUygula={{ uygula: vi.fn(), suruyor, say: 2 }} yuva={null} />
  );
  it('güncelleme sürerken ilk 3 saniye yalnız düğme döner, sonra geçen saniye ve "bir dakikaya kadar" yazar; bitince yazı kalkar', () => {
    vi.useFakeTimers();
    const { rerender } = render(ciz2(true));
    const sure = () => document.querySelector('.tc-pym-sb-sure');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(sure()).toBeNull();
    // Eşik tam 3 saniyedir.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(sure()?.textContent).toMatch(/^3 sn/);
    act(() => { vi.advanceTimersByTime(9000); });
    expect(sure()?.textContent).toBe('12 sn · büyük planda bir dakikaya kadar sürebilir');
    // Canlı bölgede yalnız sabit yazı; saniye aria-hidden (ekran okuyucu her saniye okumasın).
    expect(sure()?.querySelector('[role="status"]')?.textContent).toBe('büyük planda bir dakikaya kadar sürebilir');
    expect(sure()?.querySelector('[aria-hidden="true"]')?.textContent).toBe('12 sn · ');
    // Dıştaki kap canlı bölge değildir (iç içe canlı bölge saniyeyi okuturdu).
    expect(sure()?.getAttribute('role')).toBeNull();
    expect(sure()?.getAttribute('aria-live')).toBeNull();
    rerender(ciz2(false));
    expect(sure()).toBeNull();
    // Sayaç bitince durur.
    expect(vi.getTimerCount()).toBe(0);
    // Yeni hesap sıfırdan sayar.
    rerender(ciz2(true));
    expect(sure()).toBeNull();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(sure()?.textContent).toMatch(/^4 sn/);
  });
  it('ilk plan kurulurken de (plan yok) süre yazılır', () => {
    vi.useFakeTimers();
    render(<Cubuk plan={false} guncel={false} planYaz nabiz={null} nabizAcik={false} nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null}
      planKur={{ kur: vi.fn(), suruyor: true }} />);
    act(() => { vi.advanceTimersByTime(7000); });
    expect(document.querySelector('.tc-pym-sb-sure')?.textContent).toBe('7 sn · büyük planda bir dakikaya kadar sürebilir');
  });
});

// 3501 a / 3506: takvim uzayınca gecikme sayıları artar; şerit bunu bir kez söyler, Anladım deyince bu tarayıcıda bir daha çıkmaz.
describe('plan şeridinde tek seferlik takvim bilgisi', () => {
  afterEach(() => { localStorage.removeItem(UFUK_BILGISI_ANAHTARI); });
  it('plan varken bilgi çıkar; Anladım kapatır ve yeniden açılışta çıkmaz; plan yokken çıkmaz', () => {
    localStorage.removeItem(UFUK_BILGISI_ANAHTARI);
    ciz({});
    const not = screen.getByRole('note');
    expect(not.textContent).toContain(UFUK_BILGISI);
    fireEvent.click(within(not).getByRole('button', { name: 'Anladım' }));
    expect(screen.queryByRole('note')).toBeNull();
    cleanup();
    ciz({});
    expect(screen.queryByRole('note')).toBeNull();
    localStorage.removeItem(UFUK_BILGISI_ANAHTARI);
    cleanup();
    ciz({ plan: false });
    expect(screen.queryByRole('note')).toBeNull();
  });
});

// 3537 a: planı kurmayan sayfada (Malzeme satın alma planı, Sevk takvimi) şerit birincil taşımaz; Planı kur ve Planı güncelle yerine Kokpit'e götürür.
describe('Kokpit\'e götüren şerit', () => {
  it('plan yokken "Kokpit\'te planı kur", plan eskiyken "Kokpit\'te planı güncelle"; ikisi de ikincil, güncelken düğme yok', () => {
    const git = vi.fn();
    const kur = { kur: vi.fn(), suruyor: false };
    const uyg = { uygula: vi.fn(), suruyor: false, say: 2 };
    const ciz3 = (plan: boolean, guncel: boolean) => (
      <Cubuk plan={plan} guncel={guncel} planYaz nabiz={plan ? nabiz(0) : null} nabizAcik={false} nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null}
        sabitAd={null} planKur={kur} bekleyenUygula={uyg} kokpiteGit={git} />
    );
    const { rerender } = render(ciz3(false, false));
    expect(document.querySelectorAll('.tc-dugme-birincil')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Planı kur' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Kokpit'te planı kur" }));
    expect(git).toHaveBeenCalledTimes(1);
    expect(kur.kur).not.toHaveBeenCalled();
    rerender(ciz3(true, false));
    expect(screen.queryByRole('button', { name: /^Planı güncelle/ })).toBeNull();
    expect(screen.getByRole('button', { name: "Kokpit'te planı güncelle" })).toBeTruthy();
    expect(document.querySelectorAll('.tc-dugme-birincil')).toHaveLength(0);
    rerender(ciz3(true, true));
    expect(screen.queryByRole('button', { name: /Kokpit'te planı/ })).toBeNull();
  });
});
