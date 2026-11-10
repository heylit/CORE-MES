import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { genelGiderOrani, maliyetBaglami, siparisMaliyeti } from '../maliyet/kurallar.ts';
import { ornekCalisma } from '../maliyet/test-verisi.ts';
import { maliyetIsisi } from '../maliyet/Maliyetler.tsx';
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
    expect(genelGiderOrani(c.D)).toBe(0);
    const m = siparisMaliyeti(b, s);
    expect(m?.gg).toBe(0);
    expect(m?.ggGizli).toBe(true);
  });

  it('açık ayda (alan yok) eski davranış: tek oran kullanılır, gizli işareti yok', () => {
    const c = acikAy();
    const b = maliyetBaglami(c); const s = c.D.siparisler[0];
    if (!b || !s) throw new Error('bağlam yok');
    expect(genelGiderOrani(c.D)).toBe(120);
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

  it('kalem kipinde de gizli ayda tezgâh oranı 0 sayılır (2668 a, Maliyet M3)', () => {
    const ms = { kip: 'kalem', kalemler: [{ id: 'K1', ad: 'Kira', tur: 'kira', aylik: 3000, anahtar: 'esit', kapsam: '' }], tez: { T1: { bedel: 120000, omur: 10 }, T2: { bedel: 60000, omur: 10 } } };
    const c = ornekCalisma({ D: { planTL: { genelGider: null, genelGiderGizli: true }, maliyetSis: ms } });
    const b = maliyetBaglami(c); const s = c.D.siparisler[0];
    if (!b || !s) throw new Error('bağlam yok');
    expect(b.G.tez.some((z) => (z.oran ?? 0) > 0)).toBe(true);
    expect(genelGiderOrani(c.D)).toBe(0);
    const m = siparisMaliyeti(b, s);
    expect(m?.gg).toBe(0);
    expect(m?.ggGizli).toBe(true);
  });

  it('gizli ayda fiyat önerisi yoktur; toplu yazma pasif (Maliyet M1)', () => {
    const c = gizliAy();
    render(<BildirimSaglayici><KarTablosu c={c} p={kayitliPlan(c)} fg komut={null} /></BildirimSaglayici>);
    expect(screen.getAllByText('Fiyat önerisi yok: genel gider oranı gizli').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Uygula/ })).toBeNull();
    expect((screen.getByRole('button', { name: /Fiyatsızlara önerilen fiyatı yaz/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('maliyet ısı tablosunda genel gider ve kâr hücresi "gizli", toplam genel gider hariç (Maliyet M2)', () => {
    const c = gizliAy();
    const b = maliyetBaglami(c);
    if (!b) throw new Error('bağlam yok');
    const V = maliyetIsisi(b);
    if (!('satirlar' in V)) throw new Error('ısı yok');
    const r = V.satirlar[0];
    expect(r?.h.gg?.v).toBe('gizli');
    expect(r?.h.kar?.v).toBe('gizli');
    expect(r?.alt).toContain('genel gider hariç');
    expect(V.ust?.metin).toContain('Kâr gizli');
  });
});
