import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaSecimi } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';

// Kart 3681: bölünmüş adımın payları Kokpit tahtasında görünür (A). Veri uydurmadır (ORN-); sunucu çağrısı yoktur.
saatiSabitle(ornekCalisma);
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

const DEPO = { durum: null, planSurumu: null, senaryolar: null, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
function komutKur(): CalismaKomutu {
  return { degistir: vi.fn(() => false), geriAl: vi.fn(() => true), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: () => true, yinele: vi.fn(() => true), yinelenebilir: () => false, kaydet: () => Promise.resolve(4) };
}
function bolunmusCalisma(n = 2): PlanlamaCalismasi {
  const c = structuredClone(ornekCalisma());
  const plan = c.plan as unknown as { ops: Record<string, Record<string, unknown>> };
  const a = plan.ops['2.20']!;
  const diger = c.D.tezgahlar.map((t) => t.id).find((t) => t !== a['m'])!;
  a['pay'] = { no: 1, n, asil: '2.20', adet: 15, elle: 1, sayilan: 5 };
  for (let no = 2; no <= n; no++) plan.ops[`2.20~${String(no)}`] = { ...a, m: diger, pay: { no, n, asil: '2.20', adet: 15, elle: 1 } };
  return c;
}
function ac(secim: PlanlamaSecimi = BOS_SECIM, sec = vi.fn(), payAdedi = 2) {
  render(
    <MemoryRouter initialEntries={['/']}><BildirimSaglayici>
      <Kokpit
        depo={DEPO} calisma={bolunmusCalisma(payAdedi)} komut={komutKur()} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={secim} sec={sec}
      />
    </BildirimSaglayici></MemoryRouter>,
  );
  return sec;
}
const cubuklar = (id: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`button[data-is^="${id}"]`)].filter((b) => b.dataset['is'] === id || b.dataset['is']?.startsWith(`${id}~`));

describe('Kokpit tahtası: bölünmüş adım payları (3681 A)', () => {
  it('her pay kendi çubuğundadır: "1/2 · 15 adet" ve "2/2 · 15 adet" ipucunda yazar, pay simgesi ve sayılan ilerleme çizgisi vardır', () => {
    ac();
    const l = cubuklar('2.20');
    expect(l.map((b) => b.dataset['is'])).toEqual(expect.arrayContaining(['2.20', '2.20~2']));
    const b1 = l.find((b) => b.dataset['is'] === '2.20')!, b2 = l.find((b) => b.dataset['is'] === '2.20~2')!;
    expect(b1.getAttribute('title')).toMatch(/pay 1\/2 · 15 adet · sayılan 5\/15 · elle bölündü/);
    expect(b2.getAttribute('title')).toMatch(/pay 2\/2 · 15 adet · elle bölündü/);
    expect(b1.querySelector('[data-pay-simge]')).not.toBeNull();
    expect(b2.querySelector('[data-pay-simge]')).not.toBeNull();
    expect(b1.querySelector('[data-pay-ilerleme]')).not.toBeNull();
    expect(b2.querySelector('[data-pay-ilerleme]')).toBeNull();
    expect(cubuklar('2.40').every((b) => b.querySelector('[data-pay-simge]') === null)).toBe(true);
  });

  it('adım seçilince tıklanan pay dolu çerçeveli (aria-pressed), kardeş paylar kesikli çerçeveli işaretlenir; bir paya basınca adımın kimliği seçilir', () => {
    const sec = ac({ ...BOS_SECIM, siparis: '2', adim: '2.20' });
    const durum = () => cubuklar('2.20').map((b) => [b.dataset['is'], b.getAttribute('aria-pressed'), b.hasAttribute('data-pay-kardes')]);
    expect(durum()).toEqual([['2.20', 'true', false], ['2.20~2', 'false', true]]);
    fireEvent.click(cubuklar('2.20').find((b) => b.dataset['is'] === '2.20~2')!);
    expect(sec).toHaveBeenCalledWith({ siparis: '2', adim: '2.20' });
    expect(durum()).toEqual([['2.20', 'false', true], ['2.20~2', 'true', false]]);
  });

  it('3730: bölünmüş adım seçiliyken ardıl adıma her paydan ok çizilir; ikinci paya basınca da aynı oklar', () => {
    const oklar = () => [...document.querySelectorAll('.tc-pyq-tahta .tc-pyq-oklar [data-ok]')].map((el) => el.getAttribute('data-ok') ?? '').sort();
    ac({ ...BOS_SECIM, siparis: '2', adim: '2.20' });
    expect(oklar()).toEqual(['2.20>2.30', '2.20~2>2.30']);
    cleanup();
    ac({ ...BOS_SECIM, siparis: '2', adim: '2.20~2' });
    expect(oklar()).toEqual(['2.20>2.30', '2.20~2>2.30']);
  });

  it('telefon listesinde tezgâhtaki pay satırı pay yazısını ve sayılanı taşır; bölünmemiş satırda yoktur', () => {
    ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Tezgâhlar' }));
    const pay = [...document.querySelectorAll<HTMLElement>('.tc-pyq-liste [data-liste-pay]')];
    expect(pay.map((x) => [x.dataset['listePay'], x.textContent])).toEqual(expect.arrayContaining([['2.20', ' · 1/2 · 15 adet'], ['2.20~2', ' · 2/2 · 15 adet']]));
    const satir1 = document.querySelector<HTMLElement>('.tc-pyq-liste [data-liste-satir="2.20"]')!;
    expect(satir1.textContent).toMatch(/sayılan 5\/15/);
    expect(document.querySelector('.tc-pyq-liste [data-liste-satir="2.40"] [data-liste-pay]')).toBeNull();
  });

  it('panoda yetkili kullanıcıya "Bölmeyi yönet" düğmesi çıkar ve bölme penceresini açar; bölünmemiş adımın panosunda düğme yoktur', () => {
    ac({ ...BOS_SECIM, siparis: '2', adim: '2.20' });
    const pano = document.querySelector<HTMLElement>('.tc-pyq-pano[data-kip="secili"]')!;
    const dugme = pano.querySelector<HTMLElement>('[data-bol-yonet]')!;
    expect(dugme.textContent).toBe('Bölmeyi yönet');
    fireEvent.click(dugme);
    expect(screen.getByRole('complementary', { name: 'Planda böl' })).toBeTruthy();
    // Pencere açılınca bilgi panosu kapanır (pano pencerenin onay kutularını örtmesin).
    expect(document.querySelector('.tc-pyq-pano[data-kip="secili"]')).toBeNull();
    cleanup();
    ac({ ...BOS_SECIM, siparis: '2', adim: '2.40' });
    expect(document.querySelector('.tc-pyq-pano [data-bol-yonet]')).toBeNull();
  });

  it('telefon alt sayfası 2. paya basılınca da adımın paylarını ve "Bölmeyi yönet" düğmesini taşır', () => {
    ac({ ...BOS_SECIM, siparis: '2', adim: '2.20~2' });
    const sayfa = document.querySelector<HTMLElement>('.tc-pyq-pano[data-kip="sayfa"]')!;
    expect(sayfa.querySelectorAll('[data-pay-satiri]').length).toBe(2);
    const dugme = sayfa.querySelector<HTMLElement>('[data-bol-yonet]')!;
    fireEvent.click(dugme);
    expect(screen.getByRole('complementary', { name: 'Planda böl' })).toBeTruthy();
  });

  it('Emirler ağacında bölünmüş adımın özet satırına basınca adım seçilir, paylar açılır ve ilk payın çubuğu çizilir', () => {
    const sec = ac(BOS_SECIM, vi.fn());
    const bolum = screen.getByRole('region', { name: 'Emirler' });
    fireEvent.click(bolum.querySelector<HTMLElement>('button[data-agac="2"]')!);
    const satir = bolum.querySelector<HTMLElement>('[data-adim-satiri="2.20"]')!;
    expect(bolum.querySelector('[data-pay-ac="2.20"]')?.getAttribute('aria-expanded')).toBe('false');
    expect(bolum.querySelector('[data-is="2.20"]')).toBeNull();
    fireEvent.click(satir);
    expect(sec).toHaveBeenCalledWith(expect.objectContaining({ siparis: '2', adim: '2.20' }));
    expect(bolum.querySelector('[data-pay-ac="2.20"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(bolum.querySelector('[data-is="2.20"]')).not.toBeNull();
  });

  it('pano payların ilk ikisini yazar, gerisini "+N pay" ile özetler; iki paylı adımda özet satırı yoktur', () => {
    ac({ ...BOS_SECIM, siparis: '2', adim: '2.20' });
    expect(document.querySelectorAll('.tc-pyq-pano[data-kip="secili"] [data-pay-satiri]').length).toBe(2);
    expect(document.querySelector('.tc-pyq-pano [data-pay-daha]')).toBeNull();
    cleanup();
    ac({ ...BOS_SECIM, siparis: '2', adim: '2.20' }, vi.fn(), 4);
    expect(document.querySelectorAll('.tc-pyq-pano[data-kip="secili"] [data-pay-satiri]').length).toBe(2);
    expect(document.querySelector('.tc-pyq-pano [data-pay-daha]')?.textContent).toContain('+2 pay');
  });

  it('telefon emir listesinde bölünmüş adımı olan emir kartı "N paya bölündü" yazar; bölünmemiş emirde yok', () => {
    ac();
    const not = [...document.querySelectorAll<HTMLElement>('.tc-pyq-kart [data-emir-bolme], [data-emir-bolme]')];
    expect(not.map((x) => x.dataset['emirBolme'])).toEqual(['2']);
    expect(not[0]!.textContent).toMatch(/: 2 paya bölündü$/);
  });

  it('bölünmemiş adımın çubuğu eskisi gibidir: pay simgesi, pay yazısı ve kardeş işareti yok', () => {
    ac();
    const b = cubuklar('2.40')[0]!;
    expect(b.getAttribute('title')).not.toMatch(/pay /);
    expect(b.hasAttribute('data-pay')).toBe(false);
    expect(within(document.body).queryAllByText(/pay yukarıda|pay aşağıda/)).toHaveLength(0);
    expect(screen.queryByRole('complementary', { name: 'Planda böl' })).toBeNull();
  });
});
