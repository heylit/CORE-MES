import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { PlanlamaAtolyesi } from '../index.tsx';
import { ornekCalisma } from '../ornek.ts';
import { saatiSabitle } from '../../test-saati.ts';

// 2729 b: sabah brifingi çizelgeyi örtmeyen, katlı başlayan şerittir; özeti üst çubuktadır, gün temizse çıkmaz. Esc katlar; satırlar tam emir no yazar (2693 a).
saatiSabitle(() => ornekCalisma());
const BRIF = 'tmi:planlama:brif';
beforeEach(() => { localStorage.removeItem(BRIF); });
afterEach(cleanup);

type Oz = Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'>;
function Iskelet(oz: Oz) {
  const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
  return <PlanlamaAtolyesi {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={() => undefined} secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />;
}
function ac(c: PlanlamaCalismasi) {
  const komut = { degistir: vi.fn(() => true), geriAl: vi.fn(), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: vi.fn(), kaydet: vi.fn(async () => 1) } as unknown as CalismaKomutu;
  const depo = {
    ben: { kisi: { id: 1, ad: 'Deneme' }, yazabilir: true }, durum: null, planSurumu: { planSurumu: 1, sonCanliyaAlma: null }, senaryolar: null,
    receteRotaKaydi: { orders: c.D.siparisler.map((s) => ({ id: s.id, no: `DN-${s.id}-26-11` })) },
  } as unknown as PlanlamaDeposu;
  const oz: Oz = { depo, calisma: c, komut, git: vi.fn(), yenile: vi.fn(), istek: null, yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.studyo']) };
  render(<MemoryRouter><BildirimSaglayici><Iskelet {...oz} /></BildirimSaglayici></MemoryRouter>);
}
const brif = () => screen.queryByRole('region', { name: 'Sabah brifingi' });

const dugme = () => screen.queryByRole('button', { name: /brifing/ });

describe('sabah brifingi şeridi (2729 b)', () => {
  it('katlı başlar; üst çubuktaki düğme açar, şerit üst çubuğun altında akışta durur, gövdenin içinde değildir', () => {
    ac(ornekCalisma());
    expect(brif()).toBeNull();
    const d = dugme();
    if (!d) throw new Error('brifing düğmesi yok');
    expect(d.closest('.tc-pym-tp-ust')).toBeTruthy();
    expect(d.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(d);
    const b = brif();
    expect(d.getAttribute('aria-expanded')).toBe('true');
    expect(b?.previousElementSibling?.classList.contains('tc-pym-tp-ust')).toBe(true);
    expect(b?.closest('.tc-pym-tp-govde')).toBeNull();
    fireEvent.click(d);
    expect(brif()).toBeNull();
  });

  it('Esc şeridi katlar', () => {
    ac(ornekCalisma());
    fireEvent.click(dugme()!);
    expect(brif()).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(brif()).toBeNull();
  });

  it('gün temizse düğme de şerit de çıkmaz', () => {
    const c = ornekCalisma();
    ac({ ...c, D: { ...c.D, siparisler: [] } });
    expect(dugme()).toBeNull();
    expect(brif()).toBeNull();
  });

  it('satırlar sipariş kimliğini değil tam emir noyu yazar', () => {
    ac(ornekCalisma());
    fireEvent.click(dugme()!);
    const b = brif();
    if (!b) throw new Error('brifing yok');
    const metin = within(b).getAllByRole('button').map((x) => x.textContent ?? '').join(' | ');
    expect(metin).toMatch(/DN-\S+-26-11/);
  });
});
