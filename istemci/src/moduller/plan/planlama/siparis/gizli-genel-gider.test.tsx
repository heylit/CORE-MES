import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { genelGiderOrani, maliyetBaglami, siparisMaliyeti } from '../maliyet/kurallar.ts';
import { ornekCalisma } from '../maliyet/test-verisi.ts';
import { saatiSabitle } from '../test-saati.ts';
import { KarTablosu } from './KarTablosu.tsx';
import { kayitliPlan } from './kurallar.ts';

saatiSabitle(() => ornekCalisma());
afterEach(cleanup);

// Sunucu oranın gizli olduğu ayda genelGider null ve genelGiderGizli true yazar (2668 a).
const gizliAy = () => ornekCalisma({ D: { planTL: { genelGider: null, genelGiderGizli: true }, maliyetSis: { kip: 'tek', kalemler: [] } } });
const acikAy = () => ornekCalisma({ D: { planTL: { genelGider: 120 }, maliyetSis: { kip: 'tek', kalemler: [] } } });

describe('gizli genel gider (2674, 2677 b)', () => {
  it('gizli ayda oran 0 sayılır, bilinmez sayılmaz; sipariş maliyeti gizli işaretlidir', () => {
    const c = gizliAy();
    const b = maliyetBaglami(c); const s = c.D.siparisler[0];
    if (!b || !s) throw new Error('bağlam yok');
    expect(genelGiderOrani(c.D, b.G, 'T1')).toBe(0);
    const m = siparisMaliyeti(b, s);
    expect(m?.gg).toBe(0);
    expect(m?.ggGizli).toBe(true);
  });

  it('açık ayda (alan yok) eski davranış: tek oran kullanılır, gizli işareti yok', () => {
    const c = acikAy();
    const b = maliyetBaglami(c); const s = c.D.siparisler[0];
    if (!b || !s) throw new Error('bağlam yok');
    expect(genelGiderOrani(c.D, b.G, 'T1')).toBe(120);
    expect(siparisMaliyeti(b, s)?.ggGizli).toBe(false);
  });

  it('kâr tablosunda kâr oranı, net kâr ve kâr göstergeleri "gizli" yazar; maliyet genel gider hariç der', () => {
    const c = gizliAy();
    render(<BildirimSaglayici><KarTablosu c={c} p={kayitliPlan(c)} fg komut={null} /></BildirimSaglayici>);
    const tablo = screen.getByRole('table', { name: 'Siparişler: maliyet ve kâr' });
    const satir = within(tablo).getAllByRole('row')[1];
    if (!satir) throw new Error('satır yok');
    expect(within(satir).getAllByText('gizli').length).toBe(2);
    expect(within(satir).getByText('genel gider gizli')).toBeTruthy();
    expect(screen.getByText(/genel gider hariç \(gizli\)/)).toBeTruthy();
    expect(screen.getAllByText('gizli').length).toBeGreaterThanOrEqual(4);
  });

  it('açık ayda kâr tablosu "gizli" yazmaz', () => {
    const c = acikAy();
    render(<BildirimSaglayici><KarTablosu c={c} p={kayitliPlan(c)} fg komut={null} /></BildirimSaglayici>);
    expect(screen.queryByText('gizli')).toBeNull();
  });
});
