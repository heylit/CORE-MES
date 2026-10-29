import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CncModel, Tezgah as SunucuTezgahi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { ApiHatasi } from '../../../../ortak/veri/api.ts';
import { tezgahlariKur } from '../secici.ts';

// Makine, aparat ve belge adları uydurmadır.
vi.mock('../sahne/gl.ts', () => ({ onbellekSil: vi.fn() }));
const ag = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../../ortak/veri/api.ts', async (asil) => ({ ...await asil<object>(), api: { get: ag.get, post: ag.post } }));
const model = vi.hoisted(() => ({ kur: vi.fn(), guncelle: vi.fn() }));
vi.mock('../sahne/glb-yukle.ts', async (asil) => ({
  ...await asil<object>(), modelListesiniKur: model.kur, modelGuncelle: model.guncelle, modelDurumu: () => null,
}));

const { ModellerSekmesi } = await import('./ModellerSekmesi.tsx');

const makine = (makineId: number, kod: string, aktif = true): SunucuTezgahi => ({ makineId, kod, ad: `Deneme ${kod}`, istasyonId: null, aktif, ayar: null, surum: 0 });
const BELGE = { belgeId: 11, ad: 'Deneme tezgah', harf: 'B', ozet: 'o1', dosyaTuru: 'step' as const };
const BAGLI: CncModel = { id: 1, hedef: { tur: 'makine', makineId: 4 }, belge: BELGE, surum: 2 };

function sunucu(modeller: CncModel[], belgeler = [BELGE]): void {
  ag.get.mockImplementation((yol: string) => Promise.resolve(yol === '/cnc-kurulum/modeller' ? { modeller } : { belgeler }));
}
afterEach(cleanup);
beforeEach(() => { ag.get.mockReset(); ag.post.mockReset(); model.kur.mockReset(); model.guncelle.mockReset(); tezgahlariKur(null); });

describe('3B modeller sekmesi (1212 a)', () => {
  it('makineler ve aparatlar listelenir; bağlı model seçili görünür; seçim sunucuya sürümle gider ve sahneye bildirilir', async () => {
    tezgahlariKur([makine(4, 'Y-01'), makine(5, 'Z-01'), makine(6, 'P-01', false)]);
    sunucu([BAGLI]);
    const yeni: CncModel = { id: 7, hedef: { tur: 'makine', makineId: 5 }, belge: BELGE, surum: 1 };
    ag.post.mockResolvedValue({ model: yeni });
    render(<ModellerSekmesi yazabilir />);
    const y = await screen.findByLabelText<HTMLSelectElement>('Y-01 · Deneme Y-01 modeli');
    expect(y.value).toBe('11');
    expect(model.kur).toHaveBeenCalledWith([BAGLI]);
    expect(screen.queryByText('P-01 · Deneme P-01')).toBeNull();
    expect(screen.getByText('Hassas Mengene 125 mm')).toBeTruthy();
    const z = screen.getByLabelText<HTMLSelectElement>('Z-01 · Deneme Z-01 modeli');
    fireEvent.change(z, { target: { value: '11' } });
    await waitFor(() => { expect(model.guncelle).toHaveBeenCalledWith(yeni); });
    expect(ag.post).toHaveBeenCalledWith('/cnc-kurulum/modeller/bagla', { hedef: { tur: 'makine', makineId: 5 }, belgeId: 11, beklenenSurum: 0 });
    fireEvent.change(y, { target: { value: '' } });
    await waitFor(() => { expect(ag.post).toHaveBeenLastCalledWith('/cnc-kurulum/modeller/bagla', { hedef: { tur: 'makine', makineId: 4 }, belgeId: null, beklenenSurum: 2 }); });
  });

  it('sunucu reddederse ileti görünür; okuyan kişi seçici görmez, model adını okur; liste yoksa uyarı çıkar', async () => {
    tezgahlariKur([makine(4, 'Y-01')]);
    sunucu([BAGLI]);
    ag.post.mockRejectedValueOnce(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Kayıt siz açtıktan sonra değişti.' }));
    render(<ModellerSekmesi yazabilir />);
    fireEvent.change(await screen.findByLabelText('Y-01 · Deneme Y-01 modeli'), { target: { value: '' } });
    expect((await screen.findByRole('alert')).textContent).toContain('Kayıt siz açtıktan sonra değişti.');
    cleanup();
    ag.get.mockClear();
    render(<ModellerSekmesi yazabilir={false} />);
    const satir = (await screen.findByText('Y-01 · Deneme Y-01')).closest('tr') as HTMLElement;
    expect(within(satir).getByText('Deneme tezgah · Rev. B · STEP')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(ag.get).not.toHaveBeenCalledWith('/cnc-kurulum/model-secenekleri');
    cleanup();
    tezgahlariKur(null);
    render(<ModellerSekmesi yazabilir />);
    expect((await screen.findByText(/yalnız aparatlara model bağlanır/)).getAttribute('role')).toBe('status');
  });
});
