import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';
import type { Pkg } from './tipler.ts';

// 3111: takip tablosu. Emir 7'nin üç adımı: OP 10 yayında ve başlamamış, OP 20 yayında ve çalışıyor, OP 30'un paketi yok.
// Arkon deposu dosya içinde paylaşılır: her test kendi kimlikleriyle. Adlar ve sayılar uydurmadır (ORN-).

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const TESIS = { wcs: [{ id: 'TAL', name: 'ORN merkez' }], sts: [{ id: 'ORN-IST', name: 'ORN tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const paket = (id: string, no: string, opNo: number, isEmriId: number): Pkg => ({
  id, no, opType: 'cnc', st: {}, partNo: 'ORN-P', part: 'ORN parça', rev: 'A', op: `Op ${String(opNo)}`, machine: 'ORN-IST', target: 40, cycle: 30,
  due: '', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], status: 'published', version: 1, dirty: false,
  createdAt: 1, updatedAt: 2, by: 'ORN', publishedAt: 2, tmi: { emirId: 7, isEmriId, opNo },
} as Pkg);
function kur(d: Deneme, ek: string, perms?: unknown) {
  const a = paket(`tmi-ie-${ek}1`, `ORN-UE-${ek}`, 10, 1), b = paket(`tmi-ie-${ek}2`, `ORN-UE-${ek}`, 20, 2);
  const istekler = sunucuKur(d, {
    belgeler: {
      pkgs: [a, b].map((p) => ({ kimlik: p.id, surum: 1, govde: p })),
      results: [{ kimlik: b.id, surum: 1, govde: { id: b.id, no: b.no, state: 'running', good: 12, scrap: 1, meas: {}, pins: [], at: 1_700_000_000_000 } }],
      kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, ...(perms ? [{ kimlik: 'perms', surum: 1, govde: { v: perms } }] : [])],
    },
    uclar: {
      'GET /adimli-emirler/hazirlik-ozeti': { emirler: [{ emirId: 7, hazirlik: { maddeler: [], muafiyetler: [], isEmirleri: [
        { isEmriId: 1, opNo: 10, ad: 'Torna', bitti: false, maddeler: [] }, { isEmriId: 2, opNo: 20, ad: 'Freze', bitti: false, maddeler: [] },
        { isEmriId: 3, opNo: 30, ad: 'Taşlama', bitti: false, maddeler: [] },
      ] } }] },
    },
  });
  arkonAc('/arkon/hazirlik');
  return { istekler, a, b };
}
const yazim = (l: Istek[], id: string) => l.filter((i) => i.yol === `/arkon/belgeler/pkgs/${id}/yaz`).map((i) => (i.govde as { govde: Pkg }).govde);
const tablo = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Tablo' }, { timeout: 10000 }));
  return screen.findByRole('table', { name: 'Hazırlık takip tablosu' }, { timeout: 10000 });
};

describe('3111 Hazırlık takip tablosu', () => {
  it('emrin adımları sırasıyla; paketsiz adım satır; ilerleme emir başında', async () => {
    kur(YONETICI, 'A');
    const t = await tablo();
    expect(within(t).getByText('ORN-UE-A')).toBeTruthy();
    expect(await within(t).findByText('0/3 adım tamamlandı', undefined, { timeout: 10000 })).toBeTruthy();
    expect(within(t).getByText('Paket yok')).toBeTruthy();
    expect(within(t).getByText('Çalışıyor')).toBeTruthy();
  }, 40000);

  it('toplu geri çekme yalnız başlamamış yayındaki işte; onaydan sonra taslağa yazılır, çalışan iş değişmez', async () => {
    const { istekler, a, b } = kur(YONETICI, 'B');
    const t = await tablo();
    const kutuA = within(t).getByRole('checkbox', { name: /Op 10 seç/ });
    const kutuB = within(t).getByRole('checkbox', { name: /Op 20 seç/ });
    expect(kutuB.matches(':disabled')).toBe(true);
    fireEvent.click(kutuA);
    fireEvent.click(screen.getByRole('button', { name: '1 işi operatörden geri çek' }));
    const p = await screen.findByRole('dialog', { name: 'Operatörden geri çek' });
    expect(yazim(istekler, a.id)).toEqual([]);
    fireEvent.click(within(p).getByRole('button', { name: 'Geri çek' }));
    await waitFor(() => { expect(yazim(istekler, a.id).some((x) => x.status === 'draft' && x.dirty)).toBe(true); }, { timeout: 10000 });
    expect(yazim(istekler, b.id)).toEqual([]);
  }, 40000);

  it('çalışan iş tek tek çekilir ve pencere başladığını söyler; vazgeçince yazma gitmez', async () => {
    const { istekler, b } = kur(YONETICI, 'C');
    const t = await tablo();
    fireEvent.click(within(t).getByRole('button', { name: /Op 20 operatörden geri çek/ }));
    const p = await screen.findByRole('dialog', { name: 'Operatörden geri çek' });
    expect(within(p).getByText(/başlamış durumda/)).toBeTruthy();
    fireEvent.click(within(p).getByRole('button', { name: 'Vazgeç' }));
    await new Promise((r) => { setTimeout(r, 300); });
    expect(yazim(istekler, b.id)).toEqual([]);
  }, 40000);

  it('yayın yetkisi olmayan kişi tabloyu görür; seçim kutusu ve geri çekme düğmesi yok', async () => {
    const HAZIRLIKCI: Deneme = { rol: 'prep', kullanici: { ...YONETICI.kullanici, id: 4, ad: 'ORN Hazirlikci' } };
    kur(HAZIRLIKCI, 'D', { prep: ['page.op', 'page.prep'] });
    const t = await tablo();
    expect(within(t).getAllByText('ORN-UE-D').length).toBeGreaterThan(0);
    expect(within(t).queryByRole('checkbox')).toBeNull();
    expect(within(t).queryByRole('button', { name: /geri çek/ })).toBeNull();
  }, 40000);
});
