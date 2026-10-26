import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api } from '../../../../../ortak/veri/api.ts';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../../gorunumler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { PlanlamaMotoru } from '../../motor/index.tsx';
import { derle, girdiKur, planOku, plandanBitenler } from '../../motor/kurallar.ts';
import { ornekCalisma } from '../../motor/ornek.ts';
import type { Bolge } from '../../motor/harita/kurallar.ts';
import {
  agYakinlari, bitisFarki, diz, dunyaKutusu, etkiAgi, KART_ANAHTARI, kartAc, kartDegistir, kartKapat, kartKucult, kartlarOku, kartlarYaz, KREF,
  kuyrukGrubu, planKarti, siparisSatirlari, yerlestir, type KartKaydi,
} from './kurallar.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* yok */ } });

const BOLGE: Bolge[] = [{ g: 'a', x: 0, y: 0, w: 400, h: 300, n: 2, ms: ['T1', 'T2'] }];
const olcu = () => 360;
const kesisir = (a: KartKaydi, b: KartKaydi) => {
  const x = dunyaKutusu(a, 360), y = dunyaKutusu(b, 360);
  return x.x < y.x + y.w && y.x < x.x + x.w && x.y < y.y + y.h && y.y < x.y + x.h;
};
const veri = () => {
  const c = ornekCalisma(); const p = planOku(c); if (!p) throw new Error('plan yok');
  return { c, p, cx: derle(girdiKur(c, plandanBitenler(c, p))) };
};

describe('Kart hesapları', () => {
  it('kayıt okunur, bozuk ve yinelenen kart atılır; aç öne getirir, kapat, değiştir ve küçült', () => {
    expect(kartlarOku('bozuk')).toEqual([]);
    expect(kartlarOku(JSON.stringify({ l: [{ tur: 'plan', x: 1, y: 2, kucuk: true }, { tur: 'plan' }, { tur: 'yok' }, { tur: 'etki', x: 'a' }] })))
      .toEqual([{ tur: 'plan', x: 1, y: 2, kucuk: true }, { tur: 'etki', x: null, y: null, kucuk: false }]);
    let l = kartAc(kartAc([], 'plan'), 'siparis');
    expect(l.map((k) => k.tur)).toEqual(['plan', 'siparis']);
    l = kartAc(kartKucult(l, 'plan'), 'plan');
    expect(l.map((k) => [k.tur, k.kucuk])).toEqual([['siparis', false], ['plan', false]]);
    expect(kartKapat(l, 'plan').map((k) => k.tur)).toEqual(['siparis']);
    expect(kartDegistir(l, 'etki').map((k) => k.tur)).toEqual(['siparis', 'plan', 'etki']);
    expect(kartDegistir(l, 'plan').map((k) => k.tur)).toEqual(['siparis']);
    expect(kartlarOku(kartlarYaz(l))).toEqual(l);
  });

  it('yeri olmayan kart atölyenin sağındaki şeride oturur, üst üste gelmez; diz sütun sütun dizer', () => {
    const l = yerlestir(kartAc(kartAc([], 'plan'), 'siparis'), olcu, BOLGE);
    const [a, b] = l as [KartKaydi, KartKaydi];
    expect(a.x).toBeGreaterThan(410);
    expect(kesisir(a, b)).toBe(false);
    const d = diz([...l, { tur: 'etki', x: -900, y: -900, kucuk: false }], olcu, BOLGE);
    expect(d.every((k) => (k.x ?? 0) > 410)).toBe(true);
    for (let i = 0; i < d.length; i++) for (let j = i + 1; j < d.length; j++) expect(kesisir(d[i] as KartKaydi, d[j] as KartKaydi)).toBe(false);
    expect(dunyaKutusu({ tur: 'plan', x: 0, y: 0, kucuk: true }, 360).h).toBe(48 / KREF);
  });

  it('plan kartı, siparişler, kuyruk grubu ve etki ağı plandan çıkar', () => {
    const { c, p, cx } = veri();
    const k = planKarti(c, p, cx);
    expect(k).toMatchObject({ late: p.ozet.late, n: p.ozet.n });
    const l = siparisSatirlari(c, p, cx, 'hepsi', 'termin', {});
    expect(l.length).toBe(c.D.siparisler.filter((s) => !s.havuz && p.J[s.id]).length);
    expect(l.map((x) => x.due ?? Infinity)).toEqual([...l.map((x) => x.due ?? Infinity)].sort((a, b) => a - b));
    expect(siparisSatirlari(c, p, cx, 'gec', 'gecikme', {}).every((x) => x.gec)).toBe(true);
    const ilk = l[0]; if (!ilk) throw new Error('sipariş yok');
    const op = Object.values(p.ops).find((r) => r.job === ilk.id && Number.isFinite(r.C)); if (!op) throw new Error('iş yok');
    const canli = Object.fromEntries(Object.values(p.ops).filter((r) => r.job === ilk.id).map((r) => [r.id, { m: r.m, S: r.S, C: r.id === op.id ? r.C - 3 : r.C, job: r.job }]));
    const f = bitisFarki(p, canli);
    expect(Object.keys(f)).toEqual(Object.keys(f).filter((j) => j === ilk.id));
    expect(siparisSatirlari(c, p, cx, 'degisen', 'gecikme', f).map((x) => x.id)).toEqual(Object.keys(f));
    const g = kuyrukGrubu(c, p, { adim: op.id, tezgah: null }, null);
    expect(g).toBe(c.D.tezgahlar.find((m) => m.id === op.m)?.grup);
    const ag = etkiAgi(c, p, cx);
    if (ag) {
      expect(ag.bag.every((b) => [...ag.tur, ...ag.kaynak, ...ag.is].some((d) => d.n === b.a) && [...ag.kaynak, ...ag.is].some((d) => d.n === b.b))).toBe(true);
      const t = ag.tur[0]; if (t) expect(agYakinlari(ag, t.n).bag.size).toBeGreaterThan(0);
    }
  });
});

const DEPO = { durum: null } as unknown as PlanlamaDeposu;
function Iskelet(oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'>) {
  const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
  return <PlanlamaMotoru {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={() => undefined} secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />;
}
function ac(yaz = true) {
  vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.endsWith('/taban-ve-canli') ? Promise.resolve({ planSurumu: null, isler: [] }) : Promise.reject(new Error('yok')))) as never);
  render(<BildirimSaglayici><Iskelet depo={DEPO} calisma={ornekCalisma()} komut={null} git={vi.fn()} yenile={vi.fn()}
    yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])], { yazabilir: yaz })} /></BildirimSaglayici>);
}
const menudenAc = (ad: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: ad }));
};
const kart = (ad: string) => screen.getByRole('region', { name: ad });

describe('Tahta kartları', () => {
  it('menüden açılan kart Harita\'ya geçer; Plan, Siparişler, Kuyruklar ve Ne neyi etkiliyor okunur; 1-8 ve Esc kapatır', async () => {
    ac();
    menudenAc(/^Plan/);
    expect(screen.getByRole('region', { name: 'Tezgâh haritası' })).toBeTruthy();
    expect(within(kart('Plan')).getByText('Bütün atölye')).toBeTruthy();
    expect(within(kart('Plan')).getByRole('button', { name: 'Planı toparla' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(kart('Plan')).getByRole('heading', { name: /Dikkat \(\d+\)/ })).toBeTruthy();
    menudenAc(/Siparişler/);
    const t = within(kart('Siparişler')).getByRole('table', { name: 'Siparişler' });
    const n = within(t).getAllByRole('row').length - 1;
    expect(n).toBeGreaterThan(0);
    fireEvent.click(within(kart('Siparişler')).getByRole('button', { name: 'Geç' }));
    expect(within(t).getAllByRole('row').slice(1).every((r) => r.hasAttribute('data-gec') || r.textContent?.includes('Bu süzgeçte sipariş yok.'))).toBe(true);
    fireEvent.click(within(kart('Siparişler')).getByRole('button', { name: 'Bitişi değişen' }));
    await waitFor(() => { expect(within(kart('Siparişler')).getByText(/Henüz canlı plan yok\./)).toBeTruthy(); });
    const ilk = ornekCalisma().D.siparisler[0]?.id ?? '';
    fireEvent.click(within(kart('Siparişler')).getByRole('button', { name: 'Hepsi' }));
    fireEvent.click(within(t).getByRole('button', { name: ilk }));
    expect(within(t).getAllByRole('row').find((r) => r.hasAttribute('data-secili'))?.textContent).toContain(ilk);
    fireEvent.keyDown(window, { key: '3' });
    expect(within(kart('Kuyruklar')).getByRole('group', { name: 'Tezgâh grubu' })).toBeTruthy();
    expect(within(kart('Kuyruklar')).getAllByRole('region', { name: /kuyruğu$/ }).length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: '7' });
    expect(kart('Ne neyi etkiliyor').textContent).toMatch(/bekletiyor|Geç sipariş yok/);
    // Esc önce seçimi bırakır, sonra son açılan kartı kapatır; aynı tuş kartı kapatır.
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Ne neyi etkiliyor' })).toBeNull();
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.queryByRole('region', { name: 'Kuyruklar' })).toBeNull();
    // Küçült gövdeyi gizler; kartlar tarayıcıda kalır.
    fireEvent.click(within(kart('Plan')).getByRole('button', { name: 'Küçült' }));
    expect(within(kart('Plan')).queryByText('Bütün atölye')).toBeNull();
    expect(kartlarOku(localStorage.getItem(KART_ANAHTARI)).map((k) => [k.tur, k.kucuk])).toEqual([['plan', true], ['siparis', false]]);
    fireEvent.click(within(kart('Plan')).getByRole('button', { name: 'Kartı kapat' }));
    expect(screen.queryByRole('region', { name: 'Plan' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Kartları bölgelere diz/ }));
    expect(kart('Siparişler')).toBeTruthy();
  });

  it('her rolde aynı görünüm: okuyan da yazan da aynı kartları, düğmeleri ve satırları görür', () => {
    const gor = (yaz: boolean) => {
      ac(yaz);
      for (const ad of [/^Plan/, /Siparişler/, /Kuyruklar/, /Ne neyi etkiliyor/]) menudenAc(ad);
      const k = document.querySelector('.tc-pyk') as HTMLElement;
      const l = [...within(k).getAllByRole('button'), ...within(k).getAllByRole('row'), ...within(k).getAllByRole('combobox')].map((e) => e.textContent);
      cleanup(); vi.restoreAllMocks(); localStorage.clear(); return l;
    };
    expect(gor(false)).toEqual(gor(true));
  });
});
