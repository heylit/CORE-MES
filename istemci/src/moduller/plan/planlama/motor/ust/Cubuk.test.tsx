import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CALISMA_ACILINCA } from '../ortak.tsx';
import { OLAY_YOK, OlayAcBaglami } from '../../gorunumler.ts';
import { Cubuk } from './Cubuk.tsx';
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

  it('yuva verilince iki öğe bağlanır; rozet yoktur; toplu düğme "Veri değişikliklerini uygula (2)" ve ikincildir, basınca uygular', () => {
    const satir = vi.fn(), alt = vi.fn(), uygula = vi.fn();
    yuvali({ satir, alt }, uygula);
    expect(satir.mock.calls.at(-1)?.[0]).toBeInstanceOf(HTMLElement);
    expect(alt.mock.calls.at(-1)?.[0]).toBeInstanceOf(HTMLElement);
    // Satır yuvası çubuğun içinde, alt yuva çubuğun dışında (altında) durur.
    const cubukEl = screen.getByRole('toolbar', { name: 'Plan çubuğu' });
    expect(cubukEl.contains(satir.mock.calls.at(-1)?.[0] as HTMLElement)).toBe(true);
    expect(cubukEl.contains(alt.mock.calls.at(-1)?.[0] as HTMLElement)).toBe(false);
    expect(cubuk().queryByText('Veri değişti')).toBeNull();
    const d = cubuk().getByRole('button', { name: 'Veri değişikliklerini uygula' });
    expect(d.querySelector('[data-uzun]')?.textContent).toBe('Veri değişikliklerini uygula (2)');
    // Orta genişlikte görünen kısa ad ekran okuyucuya ikinci kez okunmaz.
    expect(d.querySelector('[data-kisa]')?.textContent).toBe('Veriyi uygula (2)');
    expect(d.querySelector('[data-kisa]')?.getAttribute('aria-hidden')).toBe('true');
    expect(d.classList.contains('tc-dugme-birincil')).toBe(false);
    fireEvent.click(d);
    expect(uygula).toHaveBeenCalledTimes(1);
  });

  it('yuva verilmeyince şerit eskisi gibidir: "Veri değişti" rozeti ve birincil "Veri değişikliklerini uygula (2)"', () => {
    yuvali(null);
    expect(cubuk().getByText('Veri değişti')).toBeTruthy();
    const d = cubuk().getByRole('button', { name: 'Veri değişikliklerini uygula' });
    expect(d.textContent).toBe('Veri değişikliklerini uygula (2)');
    expect(d.classList.contains('tc-dugme-birincil')).toBe(true);
    expect(document.querySelector('.tc-pym-sb-yuva, .tc-pym-sb-alt-yuva')).toBeNull();
  });

  it('plan yokken yuva verilse de "Plan yok" rozeti kalır', () => {
    render(<Cubuk plan={false} guncel={false} planYaz nabiz={null} nabizAcik={false} nabizAc={() => {}} ozeteGit={() => {}} refSec={null} sabitle={null} sabitAd={null} yuva={{ satir: () => {}, alt: () => {} }} />);
    expect(cubuk().getByText('Plan yok')).toBeTruthy();
  });
});
