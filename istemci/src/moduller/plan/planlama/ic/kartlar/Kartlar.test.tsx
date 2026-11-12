import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api } from '../../../../../ortak/veri/api.ts';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { PlanlamaMotoru } from '../../motor/index.tsx';
import { derle, girdiKur, planOku, plandanBitenler, simdiSaati } from '../../motor/kurallar.ts';
import { gunBaslayanlar, gunNumarasi } from '../../motor/cizelge/kurallar.ts';
import { ornekCalisma } from '../../motor/ornek.ts';
import type { Bolge } from '../../motor/harita/kurallar.ts';
import { SENARYOLAR } from '../gecmis/test-senaryo.ts';
import {
  agYakinlari, bitisFarki, canliOlcu, diz, dunyaKutusu, etkiAgi, gecisTuru, KART_ANAHTARI, kartAc, kartDegistir, kartKapat, kartKucult, kartlarOku, kartlarYaz, KREF,
  kuyrukGrubu, planKarti, rotaUrunu, siparisSatirlari, simdikiOlcu, yerlestir, type KartKaydi,
} from './kurallar.ts';

import { saatiSabitle } from '../../test-saati.ts';

saatiSabitle(() => ornekCalisma());

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

  it('göstergeler iki planda aynı hesapla çıkar; aynı plan fark vermez, canlıda ayar ve doluluk yok; rota geçişi ve ürünü', () => {
    const { c, p, cx } = veri();
    const s = simdikiOlcu(c, p, cx);
    expect(s.late).toBe(c.D.siparisler.filter((x) => { const due = cx.jobs[x.id]?.due; const C = Math.max(...Object.values(p.ops).filter((r) => r.job === x.id && Number.isFinite(r.C)).map((r) => r.C));
      return !x.havuz && due != null && Number.isFinite(C) && C - due > 0.05; }).length);
    const ayni = Object.fromEntries(Object.values(p.ops).filter((r) => Number.isFinite(r.S)).map((r) => [r.id, { m: r.m, S: r.S, C: r.C, job: r.job }]));
    const a = canliOlcu(c, p, cx, ayni);
    expect([a.wT, a.late, a.Cmax, a.fas]).toEqual([s.wT, s.late, s.Cmax, s.fas]);
    expect([a.suH, a.suN, a.dol, a.dar]).toEqual([null, null, null, null]);
    const u = { id: 'U', rota: [{ k: '10' }, { k: '20', bag: [['10', 'o']] }, { k: '30', bag: [] }, { k: '40', bag: [['30', 'b']] }] };
    expect([0, 1, 2, 3].map((i) => gecisTuru(u, i))).toEqual(['b', 'o', 'x', 'b']);
    const ilk = c.D.siparisler[1]; if (!ilk) throw new Error('sipariş yok');
    expect(rotaUrunu(c, ilk.id, null)?.id).toBe(ilk.urun);
    expect(rotaUrunu(c, ilk.id, c.D.urunler[0]?.id ?? null)?.id).toBe(c.D.urunler[0]?.id);
  });
});

const DEPO = { durum: null, senaryolar: SENARYOLAR } as unknown as PlanlamaDeposu;
function Iskelet(oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'>) {
  const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
  return <PlanlamaMotoru {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={() => undefined} secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />;
}
function ac(yaz = true, komut: CalismaKomutu | null = null, git = vi.fn()) {
  vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.endsWith('/taban-ve-canli') ? Promise.resolve({ planSurumu: null, isler: [] }) : Promise.reject(new Error('yok')))) as never);
  render(<BildirimSaglayici><Iskelet depo={DEPO} calisma={ornekCalisma()} komut={komut} git={git} yenile={vi.fn()}
    yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])])} /></BildirimSaglayici>);
}
const menudenAc = (ad: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: 'Kartlar' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Kartlar' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Kartları bölgelere diz/ }));
    expect(kart('Siparişler')).toBeTruthy();
  });

  it('Kuyruklar kartında kart aynı sütunda sürüklenip bırakılınca yeni sıra motora önizletilir (2149); okuyanda kart tutulmaz', async () => {
    // Örnekte her tezgâhta tek taşınabilir iş var: 3.20 aynı tezgâha (1) 3.10'dan sonra konur; plan veriyle güncel sayılır.
    const c = structuredClone(ornekCalisma()); if (!c.plan) throw new Error('plan yok');
    const ops = c.plan.ops as Record<string, { m: string; S: number; C: number }>; const o = ops['3.20']!; const d = o.C - o.S;
    Object.assign(o, { m: '1', S: ops['3.10']!.C + 1, C: ops['3.10']!.C + 1 + d });
    const c0 = { ...c, plan: { ...c.plan, dataVer: c.dataVer } } as PlanlamaCalismasi;
    const komut = { degistir: vi.fn(() => true), kaydet: vi.fn(async () => 7) } as unknown as CalismaKomutu;
    const post = vi.spyOn(api, 'post').mockImplementation((() => new Promise(() => undefined)) as never);
    vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.endsWith('/taban-ve-canli') ? Promise.resolve({ planSurumu: null, isler: [] }) : Promise.reject(new Error('yok')))) as never);
    render(<BildirimSaglayici><Iskelet depo={DEPO} calisma={c0} komut={komut} git={vi.fn()} yenile={vi.fn()}
      yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])} /></BildirimSaglayici>);
    menudenAc(/^Plan/);
    fireEvent.keyDown(window, { key: '3' });
    fireEvent.click(within(within(kart('Kuyruklar')).getByRole('group', { name: 'Tezgâh grubu' })).getByRole('button', { name: '1' }));
    const kol = within(kart('Kuyruklar')).getAllByRole('region', { name: /kuyruğu$/ }).find((x) => x.querySelectorAll('li[draggable="true"]').length >= 2);
    if (!kol) throw new Error(`iki taşınabilir işi olan sütun yok: ${kart('Kuyruklar').textContent?.slice(0, 300) ?? ''}`);
    const [a, b] = [...kol.querySelectorAll<HTMLElement>('li[draggable="true"]')];
    const ad = (x: HTMLElement) => x.querySelector('b')?.textContent ?? '';
    const dt = { effectAllowed: '', setData: () => undefined };
    fireEvent.dragStart(b!, { dataTransfer: dt });
    fireEvent.dragOver(a!, { dataTransfer: dt });
    fireEvent.drop(a!, { dataTransfer: dt });
    await waitFor(() => { expect(post).toHaveBeenCalled(); });
    const govde = post.mock.calls[0]?.[1] as { surum: number; istek: { tur: string; tezgah: string; sira: string[] } };
    expect(govde.surum).toBe(7);
    expect(govde.istek.tur).toBe('sira-degistir');
    expect(govde.istek.tezgah).toBe('1');
    expect(govde.istek.sira.filter((x) => x === ad(a!) || x === ad(b!))).toEqual([ad(b!), ad(a!)]);
    cleanup(); try { localStorage.clear(); } catch { /* yok */ }
    ac(false);
    menudenAc(/^Plan/);
    fireEvent.keyDown(window, { key: '3' });
    expect(kart('Kuyruklar').querySelectorAll('li[draggable="true"]')).toHaveLength(0);
  });

  it('Plan kartında Bugünü dondur bugün başlayan işleri gün kilidiyle yazar; komut yoksa pasif', () => {
    const yazilan: PlanlamaCalismasi[] = []; const c0 = ornekCalisma(); const p0 = planOku(c0); if (!p0) throw new Error('plan yok');
    const gNo = gunNumarasi(simdiSaati(c0), 0); const bugun = gunBaslayanlar(p0, gNo).map((r) => r.id);
    const komut = { degistir: vi.fn((_ne: string, fn: (t: PlanlamaCalismasi) => unknown) => { const t = structuredClone(c0); fn(t); yazilan.push(t); return true; }) } as unknown as CalismaKomutu;
    ac(true, komut);
    menudenAc(/^Plan/);
    const d = within(kart('Plan')).getByRole('button', { name: 'Bugünü dondur' });
    if (bugun.length === 0) { expect(d.getAttribute('title')).toContain('Bugün başlayan iş yok.'); return; }
    expect(d.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(d);
    expect(komut.degistir).toHaveBeenCalledWith('Gün donduruldu', expect.any(Function), expect.objectContaining({ planKoru: true }));
    for (const id of bugun) expect((yazilan[0]?.locks[id] as { gun?: number } | undefined)?.gun).toBe(gNo);
  });

  it('Plan kartında Bugünü dondur yazma yetkisi yoksa pasif', () => {
    ac(false);
    menudenAc(/^Plan/);
    expect(within(kart('Plan')).getByRole('button', { name: 'Bugünü dondur' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('Kısıt ve veri anahtarı çalışmaya yazar, motor isteyenler pasif; Hesaplar göstergeleri; Reçete ve Rota ürünü seçer, düzenleme pasif', async () => {
    const yazilan: PlanlamaCalismasi[] = []; const c0 = ornekCalisma();
    const komut = { degistir: vi.fn((_ne: string, fn: (t: PlanlamaCalismasi) => unknown) => { const t = structuredClone(c0); fn(t); yazilan.push(t); return true; }) } as unknown as CalismaKomutu;
    ac(true, komut);
    menudenAc(/Kısıt ve veri/);
    const k = kart('Kısıt ve veri');
    const anahtar = within(k).getAllByRole('switch')[0] as HTMLInputElement;
    expect(anahtar.checked).toBe(true);
    fireEvent.click(anahtar);
    expect(komut.degistir).toHaveBeenCalledWith('Kısıt kapatıldı', expect.any(Function), expect.anything());
    expect(yazilan[0]?.kapali.length).toBe(1);
    expect(within(k).getAllByRole('button', { name: 'Etkisi' }).every((x) => x.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(within(k).getByText('Arıza denemek için haritada bir tezgâh seçin.')).toBeTruthy();
    menudenAc(/Hesaplar/);
    const t = within(kart('Hesaplar')).getByRole('table', { name: 'Göstergeler' });
    expect(within(t).getAllByRole('row').map((r) => r.firstElementChild?.textContent)).toEqual(['Gösterge', 'Ağırlıklı gecikme', 'Geciken sipariş', 'Toplam ayar süresi', 'Ayar sayısı', 'Son iş biter', 'Fason süresi', 'Ortalama doluluk', 'Darboğaz']);
    await waitFor(() => { expect(within(kart('Hesaplar')).getByText(/Henüz karşılaştırılacak canlı plan yok/)).toBeTruthy(); });
    menudenAc(/Reçete ve Rota/);
    const r = kart('Reçete ve Rota'); const u = c0.D.urunler[1]; if (!u) throw new Error('ürün yok');
    fireEvent.change(within(r).getByRole('combobox'), { target: { value: u.id } });
    expect(within(r).getByRole('list', { name: `${u.ad ?? u.id} reçete ve rotası` })).toBeTruthy();
    expect(within(r).getAllByRole('button', { pressed: true }).every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(within(r).getByRole('button', { name: 'Adım ekle' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('Senaryolar açık taslakları canlıya göre farkıyla listeler; karşılaştırma Geçmiş\'e, atölye düğmesi Planlama atölyesine gider', () => {
    const git = vi.fn(); ac(true, null, git);
    fireEvent.keyDown(window, { key: '4' });
    const k = kart('Senaryolar');
    expect(k.textContent).toContain('Canlı plan sürüm 5.');
    const l = within(k).getAllByRole('listitem');
    expect(l.map((x) => x.querySelector('b')?.textContent)).toEqual(['Ek mesaisiz', 'Bakım ileri']);
    expect(l[1]?.querySelector('[data-ton="iyi"]')?.textContent).toBe(' −18 sa');
    expect(l[0]?.querySelector('[data-ton="kotu"]')?.textContent).toBe(' +21 sa');
    fireEvent.click(within(k).getByRole('button', { name: "Stüdyo'da aç" }));
    expect(git).toHaveBeenCalledWith('studio');
    expect(within(k).getByRole('button', { name: 'Yan yana karşılaştır' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('her rolde aynı görünüm: okuyan da yazan da aynı kartları, düğmeleri ve satırları görür', () => {
    const gor = (yaz: boolean) => {
      ac(yaz);
      for (const ad of [/^Plan/, /Siparişler/, /Kuyruklar/, /Senaryolar/, /Kısıt ve veri/, /Hesaplar/, /Ne neyi etkiliyor/, /Reçete ve Rota/]) menudenAc(ad);
      const k = document.querySelector('.tc-pyt') as HTMLElement;
      const l = [...within(k).getAllByRole('button'), ...within(k).getAllByRole('row'), ...within(k).getAllByRole('combobox')].map((e) => e.textContent);
      cleanup(); vi.restoreAllMocks(); localStorage.clear(); return l;
    };
    expect(gor(false)).toEqual(gor(true));
  });
});
