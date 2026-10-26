import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../gorunumler.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { canliPlani, degisenler, farkOzeti } from './fark.ts';
import { PlanlamaMotoru } from './index.tsx';
import { planOku, type OkunanPlan } from './kurallar.ts';
import { ornekCalisma } from './ornek.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const plan = () => { const p = planOku(ornekCalisma()); if (!p) throw new Error('plan yok'); return p; };
const yerlesen = (p: OkunanPlan) => Object.values(p.ops).filter((r) => Number.isFinite(r.S));
const ayni = (p: OkunanPlan) => Object.fromEntries(yerlesen(p).map((r) => [r.id, { m: r.m, S: r.S, C: r.C, job: r.job }]));

describe('Önceki planla fark hesapları', () => {
  it('aynı plan fark vermez; çeyrek saatten az kayma sayılmaz, çoğu ve tezgâh değişimi sayılır; canlıda olmayan iş değişmiş sayılır', () => {
    const p = plan();
    const [a, b, d] = yerlesen(p);
    if (!a || !b || !d) throw new Error('üç iş gerek');
    expect(farkOzeti(p, ayni(p))).toEqual({ is: 0, tez: 0, sip: 0 });
    const c = ayni(p);
    c[a.id] = { ...a, S: a.S + 0.2 };
    expect(degisenler(p, c).size).toBe(0);
    c[a.id] = { ...a, S: a.S + 0.5 };
    c[b.id] = { ...b, m: `${b.m}-baska` };
    delete c[d.id];
    expect([...degisenler(p, c)].sort()).toEqual([a.id, b.id, d.id].sort());
    const f = farkOzeti(p, c);
    expect(f.is).toBe(3);
    expect(f.tez).toBe(new Set([a.m, b.m, d.m]).size);
    expect(f.sip).toBe(new Set([a.job, b.job, d.job]).size);
  });

  it('karşılaştırma planı canlıdaki yerleri alır, canlıda olmayan iş yerleşmemiş olur; tahtadaki plan değişmez', () => {
    const p = plan();
    const [a, b] = yerlesen(p);
    if (!a || !b) throw new Error('iki iş gerek');
    const q = canliPlani(p, { [a.id]: { m: 'T9', S: 1, C: 2, job: a.job } });
    expect(q.ops[a.id]).toMatchObject({ m: 'T9', S: 1, C: 2 });
    expect(Number.isNaN(q.ops[b.id]?.S)).toBe(true);
    expect(p.ops[a.id]?.m).toBe(a.m);
  });
});

const DEPO = { durum: null } as unknown as PlanlamaDeposu;
function Iskelet(oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'>) {
  const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
  return <PlanlamaMotoru {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={() => undefined} secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />;
}
function ac(yaz = true) {
  render(<BildirimSaglayici><Iskelet depo={DEPO} calisma={ornekCalisma()} komut={null} git={vi.fn()} yenile={vi.fn()}
    yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])], { yazabilir: yaz })} /></BildirimSaglayici>);
}
const farkSec = () => {
  fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Önceki planla fark/ }));
};
const iso = (t: number) => new Date(Date.UTC(2026, 9, 19) - 3 * 3_600_000 + t * 3_600_000).toISOString();
const canliCevabi = () => {
  const [a] = yerlesen(plan());
  if (!a) throw new Error('iş yok');
  return { planSurumu: 3, isler: [{ k: a.id, anahtar: 'E|10', isEmriId: 1, uretimEmriId: 1, taban: null, canli: { kaynak: { tur: 'makine', id: 7 }, baslangic: iso(a.S), bitis: iso(a.C), parcalar: [] } }] };
};

describe('Önceki planla fark ekranda', () => {
  it('Başka menüsünden açılır: okunurken, retde, canlı yokken ve varken söyler; kapatılır; çalışmaya yazmaz', async () => {
    let cevap: Promise<unknown> = new Promise(() => undefined);
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.endsWith('/taban-ve-canli') ? cevap : Promise.reject(new Error('yok')))) as never);
    ac();
    expect(screen.queryByText(/Son canlı plan/)).toBeNull();
    farkSec();
    expect(screen.getByText('Son canlı plan okunuyor.')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/recete-rota/planlama-calismasi/taban-ve-canli');
    fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
    expect(screen.getByRole('menuitemcheckbox', { name: /Önceki planla fark/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Farkı kapat' }));
    expect(screen.queryByText(/Son canlı plan/)).toBeNull();
    cleanup();
    cevap = Promise.reject(new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Plan okuma yetkisi gerekir.' }));
    ac(); farkSec();
    await waitFor(() => expect(screen.getByText('Plan okuma yetkisi gerekir.')).toBeTruthy());
    cleanup();
    cevap = Promise.resolve({ planSurumu: 0, isler: [] });
    ac(); farkSec();
    await waitFor(() => expect(screen.getByText(/Henüz canlıya alınmış plan yok/)).toBeTruthy());
    cleanup();
    cevap = Promise.resolve(canliCevabi());
    ac(); farkSec();
    const durum = await screen.findByText(/^Son canlı plan ile: \d+ iş yer değişti, \d+ tezgâh, \d+ sipariş\./);
    expect(within(durum.parentElement as HTMLElement).getByRole('button', { name: 'Farkı kapat' })).toBeTruthy();
  });

  it('her rolde aynı görünüm: okuyan da yazan da aynı fark satırını ve menü maddesini görür', async () => {
    vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.endsWith('/taban-ve-canli') ? Promise.resolve(canliCevabi()) : Promise.reject(new Error('yok')))) as never);
    const gor = async (yaz: boolean) => {
      ac(yaz); farkSec();
      const s = (await screen.findByText(/^Son canlı plan ile:/)).textContent;
      fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
      const m = screen.getByRole('menuitemcheckbox', { name: /Önceki planla fark/ });
      const l = [s, m.getAttribute('aria-checked'), m.getAttribute('aria-disabled')];
      cleanup(); return l;
    };
    expect(await gor(false)).toEqual(await gor(true));
  });
});
