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

// 2726: sabah brifingi gövdenin içinde durur (üst çubuk iki satıra kaysa da Kapat örtülmez), Esc kapatır; satırlar tam emir no yazar (2693 a).
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

describe('sabah brifingi (2726)', () => {
  it('çizelge gövdesinin içinde açılır, üst çubuğun kardeşi değildir', () => {
    ac(ornekCalisma());
    const b = brif();
    expect(b?.parentElement?.classList.contains('tc-pym-tp-govde')).toBe(true);
  });

  it('Esc brifingi kapatır', () => {
    ac(ornekCalisma());
    expect(brif()).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(brif()).toBeNull();
  });

  it('satırlar sipariş kimliğini değil tam emir noyu yazar', () => {
    const c = ornekCalisma();
    ac(c);
    const b = brif();
    if (!b) throw new Error('brifing yok');
    const metin = within(b).getAllByRole('button').map((x) => x.textContent ?? '').join(' | ');
    expect(metin).toMatch(/DN-\S+-26-11/);
  });
});
