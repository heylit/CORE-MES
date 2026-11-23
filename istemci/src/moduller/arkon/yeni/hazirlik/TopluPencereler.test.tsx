import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';
import { topluDoldurmaPlani } from './TopluPencereler.tsx';
import type { Pkg } from './tipler.ts';

// 3362: Üretim Hazırlık takip tablosundan toplu terminale gönderme ve benzer paketten doldurma, yazmaya kadar.
// Arkon deposu dosya içinde paylaşılır: her test kendi kimlikleriyle. Adlar ve sayılar uydurmadır (ORN-).

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const TESIS = { wcs: [{ id: 'TAL', name: 'ORN merkez' }], sts: [{ id: 'ORN-IST', name: 'ORN tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const PLAN = [{ id: 1, nom: '10', lsl: 9.9, usl: 10.1, freq: 'İlk parça', crit: true }];
const paket = (id: string, no: string, opNo: number, isEmriId: number, ek: Partial<Pkg> = {}): Pkg => ({
  id, no, opType: 'cnc', st: {}, partNo: 'ORN-P', part: 'ORN parça', rev: 'B', op: `Op ${String(opNo)}`, machine: 'ORN-IST', target: 40, cycle: 30,
  due: '', priority: 'normal', material: '', note: '', files: [], primary: 'r.pdf', plan: PLAN, steps: [{ id: 's1', t: 'Bağla', d: '', r: false }],
  status: 'draft', version: 0, dirty: true, createdAt: 1, updatedAt: 2, by: 'ORN', malzemeNo: 7, tmi: { emirId: 7, isEmriId, opNo }, ...ek,
} as Pkg);
function kur(d: Deneme, paketler: Pkg[], belgeler: { kimlik: string; surum: number; govde: unknown }[] = []) {
  belgeler.push(...paketler.map((p) => ({ kimlik: p.id, surum: 1, govde: p as unknown })));
  const istekler = sunucuKur(d, {
    belgeler: {
      pkgs: belgeler,
      kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }],
    },
    uclar: { 'GET /adimli-emirler/hazirlik-ozeti': { emirler: [] } },
  });
  arkonAc('/arkon/hazirlik');
  return istekler;
}
const yazim = (l: Istek[], id: string) => l.filter((i) => i.yol === `/arkon/belgeler/pkgs/${id}/yaz`).map((i) => (i.govde as { govde: Pkg }).govde);
const tablo = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Liste' }, { timeout: 10000 }));
  return screen.findByRole('table', { name: 'Hazırlık takip tablosu' }, { timeout: 10000 });
};

describe('3362-1 toplu terminale gönder', () => {
  it('emir kutusu gönderilebilirleri seçer; uyarı kutusu işaretlenmeden gitmez; eksik paket yazılmaz', async () => {
    const a = paket('tmi-ie-T1', 'ORN-UE-T', 10, 11);
    const b = paket('tmi-ie-T2', 'ORN-UE-T', 20, 12, { plan: [] });
    const c = paket('tmi-ie-T3', 'ORN-UE-T', 30, 13, { primary: null });
    const istekler = kur(YONETICI, [a, b, c]);
    const t = await tablo();
    fireEvent.click(within(t).getByRole('checkbox', { name: 'ORN-UE-T işlerinin hepsini seç' }));
    fireEvent.click(screen.getByRole('button', { name: '3 işi terminale gönder' }));
    const p = await screen.findByRole('dialog', { name: 'Terminale gönder · 3 iş seçildi' });
    expect(within(p).getByRole('region', { name: 'Gönderilemez' }).textContent).toContain('Op 30');
    const uyari = within(p).getByRole('region', { name: 'Onayınız gerekiyor' });
    expect(within(p).getByRole('button', { name: '1 işi gönder' })).toBeTruthy();
    fireEvent.click(within(uyari).getByRole('checkbox'));
    fireEvent.click(within(p).getByRole('button', { name: '2 işi gönder' }));
    await waitFor(() => {
      expect(yazim(istekler, a.id).some((x) => x.status === 'published' && !x.dirty)).toBe(true);
      expect(yazim(istekler, b.id).some((x) => x.status === 'published' && (x.history?.at(-1) as Record<string, unknown> | undefined)?.['planYok'] === true)).toBe(true);
    }, { timeout: 10000 });
    expect(yazim(istekler, c.id)).toEqual([]);
    expect(await screen.findByText(/2 iş terminale gönderildi/, undefined, { timeout: 10000 })).toBeTruthy();
  }, 40000);

  it('vazgeçince hiçbir paket yazılmaz', async () => {
    const a = paket('tmi-ie-V1', 'ORN-UE-V', 10, 21);
    const istekler = kur(YONETICI, [a]);
    const t = await tablo();
    fireEvent.click(within(t).getByRole('checkbox', { name: /Op 10 seç/ }));
    fireEvent.click(screen.getByRole('button', { name: '1 işi terminale gönder' }));
    const p = await screen.findByRole('dialog', { name: 'Terminale gönder · 1 iş seçildi' });
    fireEvent.click(within(p).getByRole('button', { name: 'Vazgeç' }));
    await new Promise((r) => { setTimeout(r, 300); });
    expect(yazim(istekler, a.id)).toEqual([]);
  }, 40000);
});

describe('3362-1 Test bakışı ekleri', () => {
  it('T1: pencere açıkken değişen ya da yeni uyarı alan paket yazılmaz, atlandı sayılır', async () => {
    const a = paket('tmi-ie-W1', 'ORN-UE-W', 10, 41), b = paket('tmi-ie-W2', 'ORN-UE-W', 20, 42), c = paket('tmi-ie-W3', 'ORN-UE-W', 30, 43);
    const belgeler: { kimlik: string; surum: number; govde: unknown }[] = [];
    const istekler = kur(YONETICI, [a, b, c], belgeler);
    const t = await tablo();
    fireEvent.click(within(t).getByRole('checkbox', { name: 'ORN-UE-W işlerinin hepsini seç' }));
    fireEvent.click(screen.getByRole('button', { name: '3 işi terminale gönder' }));
    const p = await screen.findByRole('dialog', { name: 'Terminale gönder · 3 iş seçildi' });
    belgeler[1] = { kimlik: b.id, surum: 2, govde: { ...b, updatedAt: 99 } };
    belgeler[2] = { kimlik: c.id, surum: 2, govde: { ...c, plan: [] } };
    fireEvent.click(within(p).getByRole('button', { name: '3 işi gönder' }));
    expect(await screen.findByText(/1 iş terminale gönderildi · 2 iş atlandı/, undefined, { timeout: 10000 })).toBeTruthy();
    expect(yazim(istekler, a.id).length).toBeGreaterThan(0);
    expect(yazim(istekler, b.id)).toEqual([]);
    expect(yazim(istekler, c.id)).toEqual([]);
  }, 40000);

  it('T4: "Kalanları durdur" sonrası kalan paketler yazılmaz', async () => {
    const l = [1, 2, 3].map((i) => paket(`tmi-ie-Z${String(i)}`, 'ORN-UE-Z', i * 10, 50 + i));
    const istekler = kur(YONETICI, l);
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', async (adres: string, ayar?: RequestInit) => {
      if (String(adres).endsWith('/yaz')) await new Promise((r) => { setTimeout(r, 400); });
      return asil(adres, ayar);
    });
    const t = await tablo();
    fireEvent.click(within(t).getByRole('checkbox', { name: 'ORN-UE-Z işlerinin hepsini seç' }));
    fireEvent.click(screen.getByRole('button', { name: '3 işi terminale gönder' }));
    const p = await screen.findByRole('dialog', { name: 'Terminale gönder · 3 iş seçildi' });
    fireEvent.click(within(p).getByRole('button', { name: '3 işi gönder' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kalanları durdur' }, { timeout: 10000 }));
    expect(await screen.findByText(/1 iş terminale gönderildi · 2 iş atlandı/, undefined, { timeout: 10000 })).toBeTruthy();
    expect(yazim(istekler, l[1]!.id)).toEqual([]);
    expect(yazim(istekler, l[2]!.id)).toEqual([]);
  }, 40000);
});

describe('3362-2 benzer paketten al', () => {
  it('T2: toplu doldurmada dolu taslak (adımlı ya da yalnız numuneli) ve taslak olmayan atlanır', () => {
    const kaynak = paket('k', 'ORN-UE-K', 20, 70, { status: 'published', dirty: false, publishedAt: 5 });
    const bos = paket('b', 'ORN-UE-K2', 20, 71, { steps: [] });
    const adimli = paket('a', 'ORN-UE-K3', 20, 72);
    const numuneli = paket('n', 'ORN-UE-K4', 20, 73, { steps: [], samp: [{ when: 'first', who: ['q'], items: 'all' }] });
    const yayinda = paket('y', 'ORN-UE-K5', 20, 74, { steps: [], status: 'published' });
    const plan = topluDoldurmaPlani([bos, adimli, numuneli, yayinda], [kaynak, bos, adimli, numuneli, yayinda]);
    expect(plan.map((x) => [x.hedef.id, x.kaynak?.id ?? null])).toEqual([['b', 'k'], ['a', null], ['n', null], ['y', null]]);
  });

  const kaynak = paket('tmi-ie-B1', 'ORN-UE-B0', 20, 31, {
    status: 'published', dirty: false, publishedAt: 5, steps: [{ id: 'k1', t: 'Sık', d: '', r: true }, { id: 'k2', t: 'Ölç', d: '', r: false }] as unknown as Pkg['steps'],
    approval: { ok: true, by: 'ORN Kalite', at: 6 }, files: [{ name: 'r.pdf', kind: 'pdf' }] as Pkg['files'],
  });
  const hedef = paket('tmi-ie-B2', 'ORN-UE-B1', 20, 32, { rev: 'C', steps: [], plan: [], primary: null, updatedAt: 9 });

  it('boş taslakta şerit çıkar; revizyon farkında resim ve plan kilitli; alınan alanlar yazılır, onay taşınmaz', async () => {
    const istekler = kur(YONETICI, [kaynak, hedef]);
    // En son güncellenen paket (hedef) açılışta seçilidir.
    const serit = await screen.findByRole('note', undefined, { timeout: 10000 });
    expect(serit.textContent).toContain('Rev B');
    fireEvent.click(within(serit).getByRole('button', { name: 'Benzer paketten al' }));
    const p = await screen.findByRole('dialog', { name: 'Benzer paketten al' });
    expect(within(p).getByRole('checkbox', { name: /Kontrol planı/ }).matches(':disabled')).toBe(true);
    expect(within(p).getByRole('checkbox', { name: /Resim ve dokümanlar/ }).matches(':disabled')).toBe(true);
    fireEvent.click(within(p).getByRole('button', { name: /alanı al$/ }));
    await waitFor(() => { expect(yazim(istekler, hedef.id).some((x) => x.steps.length === 2)).toBe(true); }, { timeout: 10000 });
    const son = yazim(istekler, hedef.id).at(-1)!;
    expect(son.approval ?? null).toBeNull();
    expect(son.files).toEqual([]);
    expect(son.status).toBe('draft');
  }, 40000);
});
