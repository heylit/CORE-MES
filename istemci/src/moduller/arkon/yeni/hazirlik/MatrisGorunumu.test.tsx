import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import type { Pkg } from './tipler.ts';

// 3606: Hazırlık sayfasında Kartlar | Liste | Matris. Emir 7: OP 10 paketli ve CNC eksik (durur), OP 20 paketli ve hazır (çizim muaf), OP 30 paketsiz.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const TESIS = { wcs: [{ id: 'TAL', name: 'ORN merkez' }], sts: [{ id: 'ORN-IST', name: 'ORN tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const paket = (id: string, opNo: number, isEmriId: number): Pkg => ({
  id, no: 'ORN-UE-M', opType: 'cnc', st: {}, partNo: 'ORN-P', part: 'ORN parça', rev: 'A', op: `Op ${String(opNo)}`, machine: 'ORN-IST', target: 40, cycle: 30,
  due: '', priority: 'normal', material: '', note: '', files: [], primary: null, plan: [], steps: [], status: 'published', version: 1, dirty: false,
  createdAt: 1, updatedAt: 2, by: 'ORN', publishedAt: 2, tmi: { emirId: 7, isEmriId, opNo },
} as Pkg);
const ie = (isEmriId: number, opNo: number, ad: string, cnc: string) => ({ isEmriId, opNo, ad, bitti: false, maddeler: [{ madde: 'cnc', durum: cnc }] });
const mad = (madde: string, durum: string) => ({ madde, durum, muafTutulur: false, isEmriDuzeyi: madde === 'cnc' });

function kur() {
  const a = paket('tmi-ie-m1', 10, 1), b = paket('tmi-ie-m2', 20, 2);
  sunucuKur(YONETICI, {
    belgeler: { pkgs: [a, b].map((p) => ({ kimlik: p.id, surum: 1, govde: p })), kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] },
    uclar: { 'GET /adimli-emirler/hazirlik-ozeti': { emirler: [{ emirId: 7, hazirlik: {
      maddeler: [mad('cnc', 'eksik'), mad('cizim', 'muaf'), mad('makine', 'tamam')], muafiyetler: [],
      isEmirleri: [ie(1, 10, 'Torna', 'eksik'), ie(2, 20, 'Freze', 'tamam'), ie(3, 30, 'Taşlama', 'eksik')],
    } }] } },
  });
  arkonAc('/arkon/hazirlik');
}
const matrisAc = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Matris' }, { timeout: 10000 }));
  return screen.findByRole('table', {}, { timeout: 10000 });
};

describe('3606 Matris görünümü', () => {
  it('satır iş: paketli iki iş ve paketsiz açık iş; durum yazılı, hücre simgesi adlı', async () => {
    kur();
    const t = await matrisAc();
    expect(await within(t).findByText('Durur · Paket yok', undefined, { timeout: 10000 })).toBeTruthy();
    expect(within(t).getByRole('button', { name: 'ORN-UE-M Op 10 CNC kurulumu: Eksik' })).toBeTruthy();
    expect(within(t).getAllByRole('button', { name: /Çizim revizyonu: Muaf/ })).toHaveLength(2);
    expect(within(t).getAllByText('Durur')).toHaveLength(1);
    expect(within(t).getByText('Hazır · M')).toBeTruthy();
    // Paketsiz işte dokunulacak düğme yok: yalnız okunur simge.
    expect(within(t).getByRole('img', { name: /Op 30 · Taşlama CNC kurulumu: Eksik/ })).toBeTruthy();
  }, 40000);

  it('süzgeçler: Durur ve Paket yok iş satırlarını daraltır; eksik madde seçimi', async () => {
    kur();
    const t = await matrisAc();
    await within(t).findByText('Durur · Paket yok', undefined, { timeout: 10000 });
    fireEvent.click(screen.getByRole('button', { name: /^Paket yok \d/ }));
    expect(within(t).getAllByRole('row')).toHaveLength(1 + 1);
    expect(within(t).getByText('Durur · Paket yok')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Paket yok \d/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Eksik madde' }), { target: { value: 'cnc' } });
    expect(within(t).getAllByRole('row')).toHaveLength(1 + 2);
  }, 40000);

  it('hücreye dokununca paket ayrıntısı Terminale gönder sekmesinde açılır', async () => {
    kur();
    const t = await matrisAc();
    fireEvent.click(await within(t).findByRole('button', { name: 'ORN-UE-M Op 10 CNC kurulumu: Eksik' }, { timeout: 10000 }));
    const duzen = await screen.findByRole('region', { name: 'İş paketi' }, { timeout: 10000 });
    expect(within(duzen).getByRole('button', { name: /Terminale gönder/ }).getAttribute('aria-current')).toBe('step');
    // Ayrıntı kapanınca odak tıklanan hücreye döner.
    fireEvent.click(within(duzen).getByRole('button', { name: 'Paketler' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ORN-UE-M Op 10 CNC kurulumu: Eksik' })));
  }, 40000);
});
