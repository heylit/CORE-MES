import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KmTopluPenceresi } from './KmTopluPenceresi.tsx';
import type { Pkg } from './tipler.ts';

// Toplu "Kalite Merkezi'nden doldur" penceresi: kurallar km-cizim.test.ts'te; burada pencere durumları (hazır, sonuç, kısmi hata, yetkisiz). Veri uydurmadır.
const durum = vi.hoisted(() => ({ okuyabilir: true, sorgular: [] as unknown[] }));
vi.mock('../../../../ortak/veri/yetki.ts', () => ({ useYetki: () => ({ hazir: true, var: () => durum.okuyabilir }) }));
vi.mock('../../../kalite-merkezi/disari.ts', () => ({ useStudyoParcalari: () => durum.sorgular }));

afterEach(() => { cleanup(); durum.okuyabilir = true; durum.sorgular = []; });

const BALON = { id: 7, no: 1, nominal: 'Ø12', tolerans: null, alt: null, ust: null, alet: null, siklik: null, kritik: false, yontem: null, olcuAletiGerekir: false, tur: null, sayfa: null, x: null, y: null, yaziKutusu: null, surum: 1 };
const RESIM = { id: 1, malzemeNo: 5, tur: 'resim', merkezBelgeId: 2, ozet: 'a', ad: 'ORN resim', revizyon: 'B', aktif: true, surum: 1, eklendi: '2026-01-01T00:00:00Z', balonlar: [BALON] };
const paket = (id: string, ek: object = {}) => ({ id, no: 'ORN-' + id, op: 'Op 10', malzemeNo: 5, plan: [], files: [], status: 'draft', ...ek }) as unknown as Pkg;
const veri = (resimler: unknown[]) => ({ isPending: false, isError: false, data: { resimler } });

describe('3701 toplu Kalite Merkezi doldurma penceresi', () => {
  it('doldurulacak ve atlanacak paketler nedenleriyle listelenir; sonuç ve kısmi hata pencerede kalır', async () => {
    durum.sorgular = [veri([RESIM])];
    const uygula = vi.fn(async () => ({ doldu: 1, hatalar: [{ paket: 'ORN-b · Op 10', neden: 'resim dosyası alınamadı' }] }));
    render(<KmTopluPenceresi hedefler={[paket('a'), paket('b'), paket('c', { plan: [{ id: 1 }] })]} kapat={() => undefined} uygula={uygula} />);
    expect(screen.getByRole('region', { name: 'Doldurulacak' }).textContent).toContain('ORN-a');
    expect(screen.getByRole('region', { name: 'Atlanacak' }).textContent).toContain('kontrol planı dolu');
    fireEvent.click(screen.getByRole('button', { name: '2 paketi doldur' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1 paket doldu, 1 paket doldurulamadı'));
    expect(screen.getByRole('status').textContent).toContain('resim dosyası alınamadı');
    expect(uygula).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /paketi doldur/ })).toBeNull();
  });

  it('yayındaki paket toplu dolumda atlanır ve nedeni söylenir', () => {
    durum.sorgular = [veri([RESIM])];
    render(<KmTopluPenceresi hedefler={[paket('a', { status: 'published' })]} kapat={() => undefined} uygula={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Atlanacak' }).textContent).toContain('yayında; önce geri çekin');
  });

  it('okuma yetkisi yoksa doldurma kapalıdır ve nedeni yazılır', () => {
    durum.okuyabilir = false;
    render(<KmTopluPenceresi hedefler={[paket('a')]} kapat={() => undefined} uygula={vi.fn()} />);
    expect(screen.getByText(/okuma yetkin yok/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Doldurulacak paket yok' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('birden çok balonlu resim varsa paket atlanır ve resim seçilmesi söylenir', () => {
    durum.sorgular = [veri([RESIM, { ...RESIM, id: 2 }])];
    render(<KmTopluPenceresi hedefler={[paket('a')]} kapat={() => undefined} uygula={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Atlanacak' }).textContent).toContain('balonlu 2 resim var, önce resmi seçin');
  });
});
