import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { KmYenilePenceresi } from './KmYenilePenceresi.tsx';
import type { Pkg } from './tipler.ts';

// 3795: toplu "Kalite Merkezi'nden yenile" penceresi: önizleme, elle girilmiş plan onayı, yayındakinin atlanması. Veri uydurmadır.
const durum = vi.hoisted(() => ({ okuyabilir: true, sorgular: [] as unknown[] }));
vi.mock('../../../../ortak/veri/yetki.ts', () => ({ useYetki: () => ({ hazir: true, var: () => durum.okuyabilir }) }));
vi.mock('../../../kalite-merkezi/disari.ts', async (o) => ({ ...(await o<object>()), useStudyoParcalari: () => durum.sorgular }));

afterEach(() => { cleanup(); durum.okuyabilir = true; durum.sorgular = []; });

const balon = (id: number, no: number) => ({ id, no, nominal: '47', tolerans: '±0,4', alt: '46.6', ust: '47.4', alet: null, siklik: null, kritik: false, yontem: null, olcuAletiGerekir: false, tur: null, sayfa: null, x: null, y: null, yaziKutusu: null, surum: 1 });
const RESIM = { id: 1, malzemeNo: 5, tur: 'resim', merkezBelgeId: 2, ozet: 'a', ad: 'ORN resim', revizyon: 'B', aktif: true, surum: 1, eklendi: '2026-01-01T00:00:00Z', balonlar: [balon(7, 1), balon(8, 2)] };
const ESKI = [1, 2, 3, 4].map((id) => ({ id, nom: '4.7', min: 4.6, max: 4.8 }));
const paket = (id: string, ek: object = {}) => ({ id, no: 'ORN-' + id, op: 'Op 10', malzemeNo: 5, plan: ESKI, files: [], status: 'draft', tmi: { opNo: 10 }, ...ek }) as unknown as Pkg;
const veri = (resimler: unknown[]) => ({ isPending: false, isError: false, data: { resimler } });

describe('3795 toplu Kalite Merkezi yenileme penceresi', () => {
  it('önizleme satır sayısını ve değişen ölçüleri gösterir; elle girilmiş plan onaysız değişmez; yayındaki atlanır', async () => {
    durum.sorgular = [veri([RESIM])];
    const uygula = vi.fn(async (l: readonly unknown[]) => ({ doldu: l.length, hatalar: [] }));
    render(<KmYenilePenceresi
      hedefler={[paket('a'), paket('b', { otoKaynak: { plan: { kaynak: 'el' } } }), paket('c', { status: 'published' }), paket('d', { plan: [{ id: 1, nom: '47', min: 46.6, max: 47.4, kmBalon: 7 }] })]}
      kapat={() => undefined} uygula={uygula} />);
    const hazir = screen.getByRole('region', { name: 'Yenilenecek' });
    expect(hazir.textContent).toContain('ORN-a · Op 10 ← ORN resim Rev B');
    expect(hazir.textContent).toContain('4 satır → 2 satır · 4 ölçü değişir');
    fireEvent.click(within(hazir).getByText(/4 satır → 2 satır/));
    expect(hazir.textContent).toContain('1 4.7 [4.6 … 4.8] → 47 [46.6 … 47.4]');
    expect(hazir.textContent).toContain('3 4.7 [4.6 … 4.8] → kalkar');
    const atla = screen.getByRole('region', { name: 'Atlanacak' }).textContent;
    expect(atla).toContain('ORN-c · Op 10 · yayında');
    expect(atla).toContain('ORN-d · Op 10 · zaten Kalite Merkezi’ne bağlı');
    expect(screen.getByRole('region', { name: 'Elle girilmiş plan' }).textContent).toContain('ORN-b');
    fireEvent.click(screen.getByRole('button', { name: '1 paketin planını değiştir' }));
    await waitFor(() => expect(uygula).toHaveBeenCalledTimes(1));
    expect((uygula.mock.calls[0]![0] as { hedef: Pkg }[]).map((x) => x.hedef.id)).toEqual(['a']);
  });

  it('elle girilmiş plan kutu işaretlenince listeye girer', async () => {
    durum.sorgular = [veri([RESIM])];
    const uygula = vi.fn(async (l: readonly unknown[]) => ({ doldu: l.length, hatalar: [] }));
    render(<KmYenilePenceresi hedefler={[paket('b', { otoKaynak: { plan: { kaynak: 'el' } } })]} kapat={() => undefined} uygula={uygula} />);
    expect((screen.getByRole('button', { name: 'Elle girilmiş planlar için onay verin' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Elle girilmiş 1 planı da değiştir/ }));
    fireEvent.click(screen.getByRole('button', { name: '1 paketin planını değiştir' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1 paket yenilendi'));
    expect((uygula.mock.calls[0]![0] as { hedef: Pkg }[]).map((x) => x.hedef.id)).toEqual(['b']);
  });

  it('balonlu resim yoksa ya da birden çoksa paket atlanır ve nedeni yazılır', () => {
    durum.sorgular = [veri([])];
    render(<KmYenilePenceresi hedefler={[paket('a')]} kapat={() => undefined} uygula={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Atlanacak' }).textContent).toContain('parçanın Kalite Merkezi’nde resmi yok');
    cleanup();
    durum.sorgular = [veri([RESIM, { ...RESIM, id: 2 }])];
    render(<KmYenilePenceresi hedefler={[paket('a')]} kapat={() => undefined} uygula={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Atlanacak' }).textContent).toContain('balonlu 2 resim var, önce resmi seçin');
  });
});
