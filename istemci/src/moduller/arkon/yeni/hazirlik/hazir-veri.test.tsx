import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import type { Pkg } from './tipler.ts';

// Kart #731 A2: Hazırlık yayında PDF sayfasının okumasını pakete koyar; terminal sayfayı yeniden okumaz. Okuma ortak çizimdedir
// (pdf-hazir.test.ts); burada yalnız yayının onu çağırıp sonucu pakete koyduğu sınanır. Paket uydurmadır, bayt sentetiktir.
const pdf = vi.hoisted(() => ({ hazirla: vi.fn(async () => ({ 'pdf:sahte#1': { w: 4, h: 2, png: {} } })) }));
vi.mock('../../../../ortak/cizim/pdf-hazir.ts', async (asil) => ({ ...(await asil<object>()), pdfHazirla: pdf.hazirla }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const BAYT = [37, 80, 68, 70, 1, 2, 3];
const PAKET = {
  id: 'tmi-ue-7', no: 'IE-DENEME-1', opType: 'cnc', st: {}, partNo: 'DN-1', part: 'Deneme parça', rev: 'A', op: 'Op 10 · Torna', machine: 'IST-1',
  target: 20, cycle: 30, due: '', priority: 'normal', material: '', note: '',
  files: [{ kind: 'pdf', name: 'deneme.pdf', size: BAYT.length, bytes: { $ta: 'u8', b: btoa(String.fromCharCode(...BAYT)) } }], primary: 'deneme.pdf',
  plan: [{ id: 1, nom: 'Ø20', tol: '±0.1', min: 19.9, max: 20.1, tool: 'Kumpas', freq: 'İlk parça' }], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
  status: 'draft', version: 0, dirty: true, createdAt: 1, updatedAt: 2, by: 'Deneme',
};
const TESIS = { wcs: [{ id: 'TAL', name: 'Deneme merkez' }], sts: [{ id: 'IST-1', name: 'Deneme tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const paketYazimi = (l: Istek[]) => l.filter((i) => i.yol === `/arkon/belgeler/pkgs/${PAKET.id}/yaz`).map((i) => (i.govde as { govde: Pkg }).govde);

describe('Hazırlık yayını PDF hazır verisi (731 A2)', () => {
  it('yayında PDF ilk sayfası okunur ve okuması paketin hazır verisine girer', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    arkonAc('/arkon/hazirlik');
    const d = await screen.findByRole('region', { name: 'İş paketi' }, { timeout: 10000 });
    fireEvent.click(within(d).getByRole('button', { name: /Yayınla/ }));
    fireEvent.click(await within(d).findByRole('button', { name: /Operatöre gönder/ }));
    await waitFor(() => { expect(paketYazimi(istekler).some((p) => p.status === 'published')).toBe(true); }, { timeout: 10000 });
    const yayin = paketYazimi(istekler).find((p) => p.status === 'published')!;
    expect(yayin.derived).toEqual({ 'pdf:sahte#1': { w: 4, h: 2, png: {} } });
    expect(pdf.hazirla).toHaveBeenCalledWith(new Uint8Array(BAYT), 1, yayin.readCfg);
  }, 40000);
});
