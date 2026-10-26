import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaAltEkrani, type PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { derle, girdiKur, planOku } from '../../motor/kurallar.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { ekipSonOku } from '../hesap/kurallar.ts';
import { calismaKur, OKUYAN, PLANCI } from '../veri/test-veri.tsx';
import { AkisAgi } from './index.tsx';
import { atolyeOzeti, atolyeSahnesi, baglar, bul, ilkKamera, izdus, kararSahnesi, KISIT_HATTI, tezgahAni, uretimSahnesi, type Konum } from './kurallar.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Uydurma ekip kaydı: bir alınan, bir alınmayan ek mesai ve kapalı CP-SAT kararı.
const EKIP_SON = {
  adim: {}, lb: 4, ms: 5200, zaman: null, bas: 12, wT: 7, gecti: true, basamak: [], iz: [],
  kararlar: [
    { id: 'mesai:T1', ad: 'Ek mesai T1', tur: 'mesai', durum: 'alinmadi', dW: -0.5, neden: '' },
    { id: 'cpsat', ad: 'CP-SAT önerisi', tur: 'cpsat', durum: 'yok', dW: null, neden: '' },
    { id: 'mesai:T2', ad: 'Ek mesai T2', tur: 'mesai', durum: 'alindi', dW: 3, neden: '' },
  ],
  J: { S1: [5, 2], S2: [0, 0] },
};
const ekipli = () => calismaKur((c) => { (c as unknown as Record<string, unknown>).ekipSon = structuredClone(EKIP_SON); });
const kur = (c: PlanlamaCalismasi) => { const p = planOku(c); return { p, cx: derle(girdiKur(c)) }; };

describe('Akış ağı sahneleri', () => {
  it('karar akışı: beş katman, kısıt hattı çözücülere gücüyle bağlanır; alınan karar plana gider', () => {
    const c = ekipli(); const { p } = kur(c); const s = kararSahnesi(ekipSonOku(c), p);
    const say = [0, 1, 2, 3, 4].map((k) => s.N.filter((n) => n.katman === k).length);
    expect(say).toEqual([10, KISIT_HATTI.length, 3, 3, 3]);
    expect(s.N.filter((n) => n.katman === 3).map((n) => n.id)).toEqual(['d:mesai:T2', 'd:mesai:T1', 'd:cpsat']);
    expect(s.ix['p:plan']?.alt).toBe('Ağırlıklı gecikme 7 sa · alt sınır 4 sa');
    expect(baglar(s, 'k:ayarci').git.map((n) => n.id)).toEqual(['c:motor']);
    expect(s.E.filter((e) => e.a === 'k:ayar').map((e) => [e.b, e.tur, e.not])).toEqual([['c:motor', 'tam', 'tam'], ['c:cerceve', 'yaklasik', 'gevşek (sınır geçerli kalsın)'], ['c:sinir', 'yaklasik', 'gevşek (sınır geçerli kalsın)']]);
    expect(baglar(s, 'd:cpsat').gel.map((n) => n.id)).toEqual(['c:motor']);
    expect(baglar(s, 'p:plan').gel.map((n) => n.id)).toEqual(['d:mesai:T2', 'c:sinir']);
    expect(baglar(s, 'p:plan').git.map((n) => n.ad)).toEqual(['S1', 'S2']);
    const yok = kararSahnesi(null, p);
    expect([yok.ix['d:yok']?.ad, yok.ix['p:plan']?.alt, yok.ix['s:S1']?.alt]).toEqual(['Ekip henüz çalışmadı', 'Ağırlıklı gecikme 5 sa', 'Gecikme 3 sa']);
    expect(kararSahnesi(null, null).ix['p:plan']?.alt).toBe('Plan yok');
  });

  it('zaman ağı: fason düşer, rota bağı çizilir; plan yoksa boş', () => {
    const c = calismaKur(); const { p, cx } = kur(c); const s = uretimSahnesi(c.D, p, cx);
    expect([s.bos, s.say]).toEqual([false, { is: 3, tez: 2, sip: 2 }]);
    expect(s.E.map((e) => [e.a, e.b])).toEqual([['o:S1.10', 'o:S1.20']]);
    expect(s.ix['o:S1.20']?.alt).toMatch(/^T2 · .* → .* · sipariş 3 sa gecikiyor$/);
    expect(uretimSahnesi(c.D, null, cx).bos).toBe(true);
  });

  it('atölye akışı: tezgâhlar rota sırasıyla, fason sonda; akış yayları ve t anı', () => {
    const c = calismaKur(); const { p, cx } = kur(c); const s = atolyeSahnesi(c.D, p, cx);
    expect(s.N.map((n) => [n.id, n.tur, n.grup])).toEqual([['t:T1', 'tezgah', 'Torna'], ['t:T2', 'tezgah', 'Freze'], ['t:@F1', 'fason', '@F1']]);
    expect(s.E.map((e) => [e.a, e.b, e.n])).toEqual([['t:T1', 't:T2', 1], ['t:T1', 't:@F1', 1]]);
    const at = s.at; if (!at) throw new Error('atölye');
    expect(tezgahAni(at, 'T1', 10).simdi?.id).toBe('S1.10');
    expect(tezgahAni(at, 'T1', 10).sira.map((r) => r.id)).toEqual(['S2.10']);
    expect(atolyeOzeti(c.D, s, 10)).toMatch(/· 1 tezgâh çalışıyor · 2 iş 24 saat içinde sırada · 0 parti tezgâhlar arasında$/);
  });

  it('izdüşüm ve en yakın düğüm', () => {
    const k = ilkKamera('karar');
    const [x, y] = izdus(k, [0, 0, 0], 600, 400);
    expect([x, y]).toEqual([300, 200]);
    const c = calismaKur(); const { p } = kur(c); const s = kararSahnesi(null, p);
    const yer = new Map<string, Konum>(s.N.map((n) => [n.id, { q: izdus(k, n.p, 600, 400), r: 6 }]));
    const q = yer.get('c:motor')?.q ?? [0, 0];
    expect(bul(s.N, yer, q[0] + 2, q[1] - 1)?.id).toBe('c:motor');
    expect(bul(s.N, yer, -100, -100)).toBeNull();
  });
});

// Tuvali sahte 2B bağlamla açar: çizim komutları boş geçer, renk okuması sabit döner; boy 600x400; hareket azaltılmış (kendiliğinden dönmez).
function tuvalKur() {
  const bos = () => undefined;
  const g = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: [10, 20, 30, 255] }) : bos),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => g as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  // jsdom'da PointerEvent yok; konum taşıyan fare olayı yerine geçer.
  class Isaretci extends MouseEvent { pointerId: number; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerId = i.pointerId ?? 0; } }
  vi.stubGlobal('PointerEvent', Isaretci);
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener: bos, removeEventListener: bos }));
}
function ac(c: PlanlamaCalismasi, islemler = PLANCI) {
  const git = vi.fn(); const sec = vi.fn(); const altSec = vi.fn<(a: PlanlamaAltEkrani) => void>();
  const o: PlanlamaEkranOzellikleri = {
    depo: { durum: null } as unknown as PlanlamaDeposu, calisma: c, komut: null, yetki: yetkiKur(islemler, { yazabilir: true }), git, yenile: () => undefined,
    olcek: ACILIS_OLCEGI, olcekSec: () => undefined, kaydir: () => undefined, secim: BOS_SECIM, sec, altSec,
  };
  render(<BildirimSaglayici><AkisAgi o={o} c={c} /></BildirimSaglayici>);
  return { git, sec, altSec };
}
const tuval = () => screen.getByRole('img', { name: /Sürükleyerek döndürün/ });
const dokun = async (id: string, kip: 'karar' | 'atolye', c: PlanlamaCalismasi) => {
  const { p, cx } = kur(c); const s = kip === 'karar' ? kararSahnesi(ekipSonOku(c), p) : atolyeSahnesi(c.D, p, cx);
  const n = s.ix[id]; if (!n) throw new Error(id);
  const [x, y] = izdus(ilkKamera(kip), n.p, 600, 400);
  // Çizim bir karede olur; konumlar ondan sonra bilinir.
  await new Promise((r) => { requestAnimationFrame(() => r(null)); });
  fireEvent.pointerDown(tuval(), { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(tuval(), { clientX: x, clientY: y, pointerId: 1 });
};

describe('Akış ağı ekranı', () => {
  beforeEach(tuvalKur);

  it('karar akışı: tur katmanları anlatır; düğüme basmak bağlarını açar, sipariş tahtada, kısıt Kısıtlar\'da', async () => {
    const c = ekipli(); const { git, sec, altSec } = ac(c);
    expect(screen.getByRole('tab', { name: /Karar akışı/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Kendiliğinden döndür' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Akışı adım adım göster' }));
    expect(screen.getByRole('status').textContent).toMatch(/^1 \/ 5Veri/);
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki adım' }));
    expect(screen.getByRole('status').textContent).toMatch(/^2 \/ 5Kısıtlar/);
    fireEvent.click(screen.getByRole('button', { name: 'Turu bitir' }));
    expect(screen.queryByRole('status')).toBeNull();
    const detay = screen.getByRole('complementary', { name: 'Seçili düğüm' });
    expect(detay.textContent).toMatch(/^Bir düğüme tıklayın/);
    await dokun('p:plan', 'karar', c);
    await waitFor(() => { expect(within(detay).getByText('Plan')).toBeTruthy(); });
    expect(within(detay).getByText('Beslendiği (2)')).toBeTruthy();
    fireEvent.click(within(detay).getByRole('button', { name: 'S1' }));
    fireEvent.click(within(detay).getByRole('button', { name: 'Tahtada göster' }));
    expect([sec.mock.calls[0]?.[0], git.mock.calls[0]?.[0]]).toEqual([{ siparis: 'S1', adim: null, tezgah: null }, 'plan']);
    await dokun('k:fai', 'karar', c);
    await waitFor(() => { expect(within(detay).getByText('İlk parça onayı')).toBeTruthy(); });
    fireEvent.click(within(detay).getByRole('button', { name: 'Kısıtlar' }));
    expect(altSec).toHaveBeenCalledWith({ ekran: 'veri', bolum: 'kisitlar' });
    fireEvent.click(within(detay).getByRole('button', { name: 'Seçimi kaldır' }));
    expect(detay.textContent).toMatch(/^Bir düğüme tıklayın/);
  });

  it('atölye akışı: zaman çubuğu ve özet; tezgâha basmak sırasını açar, tezgâhı tahtada gösterir', async () => {
    const c = calismaKur(); const { sec, git } = ac(c);
    fireEvent.click(screen.getByRole('tab', { name: /Atölye akışı/ }));
    const r = screen.getByRole('slider', { name: 'Plan saati' });
    fireEvent.change(r, { target: { value: '10' } });
    expect(screen.getByRole('status').textContent).toMatch(/1 tezgâh çalışıyor/);
    expect(screen.getByRole('button', { name: 'Planı oynat' })).toBeTruthy();
    await dokun('t:T1', 'atolye', c);
    const detay = screen.getByRole('complementary', { name: 'Seçili düğüm' });
    await waitFor(() => { expect(within(detay).getByText('T1')).toBeTruthy(); });
    expect(within(detay).getAllByRole('listitem').map((l) => l.querySelector('b')?.textContent)).toEqual(['S1', 'S2']);
    expect(within(detay).getByText('şimdi')).toBeTruthy();
    fireEvent.click(within(detay).getByRole('button', { name: 'Tahtada göster' }));
    expect([sec.mock.calls[0]?.[0], git.mock.calls[0]?.[0]]).toEqual([{ tezgah: 'T1', adim: null, siparis: null }, 'plan']);
  });

  it('zaman ağı: özet sayıları; plan yoksa boş not', () => {
    ac(calismaKur());
    fireEvent.click(screen.getByRole('tab', { name: /Zaman ağı/ }));
    expect(screen.getByText(/3 işlem, 2 tezgâh, 2 sipariş\./)).toBeTruthy();
    cleanup();
    ac(calismaKur((x) => { (x as unknown as Record<string, unknown>).plan = null; }));
    fireEvent.click(screen.getByRole('tab', { name: /Zaman ağı/ }));
    expect(screen.getByText('Plan yok. Önce bir plan çözün.')).toBeTruthy();
  });

  it('her rolde aynı görünüm: okuyan da yazan da aynı sekmeleri, düğmeleri ve bağları görür', async () => {
    const gor = async (islemler: string[]) => {
      const c = ekipli(); ac(c, islemler);
      await dokun('p:plan', 'karar', c);
      await waitFor(() => { expect(screen.getByText('Beslendiği (2)')).toBeTruthy(); });
      const l = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent).concat(screen.getAllByRole('tab').map((t) => t.textContent));
      cleanup(); return l;
    };
    const yazan = await gor(PLANCI); const okuyan = await gor(OKUYAN);
    expect(okuyan).toEqual(yazan);
    expect(yazan).toEqual(expect.arrayContaining(['S1', 'Seçimi kaldır', 'Akışı adım adım göster']));
  });
});
