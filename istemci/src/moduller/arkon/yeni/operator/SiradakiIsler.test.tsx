import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as ciz0, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { bosIs } from './kurallar.ts';
import { SiradakiIsler } from './SiradakiIsler.tsx';
import type { Is } from './tipler.ts';

afterEach(cleanup);
const render = (e: ReactElement) => ciz0(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{e}</QueryClientProvider>);

// 3338-6 a: istasyonun işleri şeridi. Veriler uydurmadır (ORN-).
const is = (no: string, state: Is['state']): Is => ({ ...bosIs({ l: 'Deneme' }), empty: false, no, part: `ORN parça ${no}`, op: 'Op 20', state, target: 10, good: 2 });
const ISLER = [is('ORN-1', 'done'), is('ORN-2', 'running'), is('ORN-3', 'queued'), is('ORN-4', 'queued')];
const ciz = (bakilan: number, secilen: number[] = []) => render(
  <SiradakiIsler isler={ISLER} ekranda={1} bakilan={bakilan} siradakiMi={(i) => i === 2} yer={() => null} sec={(i) => secilen.push(i)} eylem={bakilan >= 0 ? <span>Önizleme</span> : null} />,
);

describe('Sıradaki işler şeridi (3338-6 a)', () => {
  it('sayaç biten işi saymaz; ekrandaki kart basılı; biten kart soluk, sıradaki işaretli', () => {
    ciz(-1);
    expect(screen.getByText(/iş · 2\/4$/).textContent).toBe('3 iş · 2/4');
    expect(screen.getByRole('button', { name: 'ORN-2 · ekranda' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'ORN-3' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'ORN-1' }).closest('li')!.hasAttribute('data-bitti')).toBe(true);
    expect(screen.getByRole('button', { name: 'ORN-3' }).closest('li')!.hasAttribute('data-bitti')).toBe(false);
    expect(screen.getByRole('button', { name: 'ORN-3' }).textContent).toContain('Sıradaki');
    expect(screen.getByRole('button', { name: 'ORN-4' }).textContent).not.toContain('Sıradaki');
  });

  it('bakılan kart basılı olur, ekrandaki olmaz; dokunuş yalnız seçimi bildirir; eylem şeridin altında', () => {
    const secilen: number[] = [];
    ciz(3, secilen);
    expect(screen.getByRole('button', { name: 'ORN-4' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'ORN-2 · ekranda' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Önizleme')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ORN-3' }));
    expect(secilen).toEqual([2]);
  });
});

// 3714: dar özet kart, bakılan kart genişleyip ayrıntı açar; emir no kartın en altındadır.
describe('Sıradaki işler kartı (3714)', () => {
  const dolu = (no: string, state: Is['state']): Is => ({
    ...is(no, state), due: '2026-12-31', pkg: { proje: 'ORN-PRJ-04', rev: 'C', material: 'ORN-MM-00007 çelik mil' } as unknown as Is['pkg'],
  });
  const liste = [dolu('ORN-1', 'running'), dolu('ORN-2', 'queued')];
  const goster = (bakilan: number) => render(
    <SiradakiIsler isler={liste} ekranda={0} bakilan={bakilan} siradakiMi={(i) => i === 1} yer={() => ({ istasyon: 'TORNA', makine: 'CNC-002', makineAd: 'DMU 50' })} sec={() => undefined} eylem={null} />,
  );

  it('kartın başı parça, proje ve revizyondur; emir no en sonda gelir', () => {
    goster(-1);
    const kart = screen.getByRole('button', { name: 'ORN-2' });
    const metin = kart.textContent ?? '';
    expect(metin.indexOf('ORN parça ORN-2')).toBeLessThan(metin.indexOf('ORN-PRJ-04 · Rev C'));
    expect(metin.indexOf('ORN-PRJ-04 · Rev C')).toBeLessThan(metin.lastIndexOf('ORN-2'));
    expect(metin.endsWith('ORN-2')).toBe(true);
  });

  it('ayrıntı (Op, Malzeme, Termin, Tezgâh) yalnız bakılan kartta açılır; termin gün.ay.yıl yazılır', () => {
    goster(1);
    const acik = screen.getByRole('button', { name: 'ORN-2' }).textContent ?? '';
    for (const e of ['Malzeme', 'Termin', 'Tezgâh', '31.12.2026', 'CNC-002']) expect(acik).toContain(e);
    expect(screen.getByRole('button', { name: 'ORN-1 · ekranda' }).textContent).not.toContain('Malzeme');
  });

  it('sıradaki ve ekrandaki işte tek rozet vardır; durum çipi bakılan kartta yalnız bu rozetler yoksa görünür', () => {
    goster(1);
    const sirada = screen.getByRole('button', { name: 'ORN-2' }).textContent ?? '';
    expect(sirada).toContain('Sıradaki');
    expect(sirada).not.toMatch(/Sırada(?!ki)/);
  });

  it('mamulün resmi emrin paketindeki malzemeNo ile malzeme kartının küçük resminden gelir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ resimler: [{ hedefId: 7, belgeId: 1, revizyonId: 9, harf: 'A', kareSayisi: 1, revUyumu: true }] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const resimli = { ...liste[1]!, pkg: { ...liste[1]!.pkg, malzemeNo: 7 } as unknown as Is['pkg'] };
    ciz0(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SiradakiIsler isler={[liste[0]!, resimli]} ekranda={0} bakilan={-1} siradakiMi={() => false} yer={() => null} sec={() => undefined} eylem={null} />
      </QueryClientProvider>,
    );
    const img = await screen.findByAltText('ORN parça ORN-2', {}, { timeout: 3000 });
    expect(img.getAttribute('src')).toBe('/api/cizimler/kucuk-resim/9/0');
    vi.unstubAllGlobals();
  });
});
