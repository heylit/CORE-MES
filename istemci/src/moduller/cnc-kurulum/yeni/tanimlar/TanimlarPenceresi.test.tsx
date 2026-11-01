import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { state } from '../depo.ts';
import { defaults } from '../durum.ts';
import type { Tezgah as SunucuTezgahi, TezgahAyari } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { dirtyUsage, tezgahlariKur } from '../secici.ts';

vi.mock('../sahne/gl.ts', () => ({ onbellekSil: () => undefined }));
vi.mock('../depo.ts', async (asil) => ({ ...await asil<object>(), save: vi.fn() }));
const yetki = vi.hoisted(() => ({ yazabilir: true }));
const sunucu = vi.hoisted(() => ({ yaz: vi.fn() }));
vi.mock('../veri.ts', () => ({ useCncYetkisi: () => yetki, tezgahAyarYaz: sunucu.yaz }));

const { TanimlarPenceresi } = await import('./TanimlarPenceresi.tsx');

function sifirla(): void {
  for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
  Object.assign(state, defaults());
  tezgahlariKur(null);
  dirtyUsage();
}
// Makine adları uydurmadır.
const makine = (makineId: number, kod: string, ayar: TezgahAyari | null): SunucuTezgahi =>
  ({ makineId, kod, ad: `Deneme ${kod}`, istasyonId: null, aktif: true, ayar, surum: ayar ? 1 : 0 });
afterEach(cleanup);
beforeEach(() => { sifirla(); yetki.yazabilir = true; sunucu.yaz.mockReset(); });

describe('Tanımlar penceresi', () => {
  it('1137 a: yeni tezgâh eklenmez; kayıttaki özel tezgâh salt okunurdur; liste yoksa gömülü listenin uyarısı görünür', () => {
    state.customMachines.push({ id: 'um_1', name: 'Elle eklenen', type: 'mill', ctrl: 'iso', taper: 'BT40', pockets: 20, rpm: 8000, kind: 'm_vmc' });
    render(<TanimlarPenceresi sekme="mach" kapat={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Yeni tezgâh' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('gömülü tezgâh listesini kullanıyor');
    const satir = screen.getByText('Elle eklenen').closest('tr') as HTMLElement;
    expect(satir.querySelector('button')).toBeNull();
  });

  it('1091 a: makineler İstasyonlar\'dan gelir; ayarı eksik olan işaretlenir, düzenlenen ayar sunucuya yazılır', async () => {
    tezgahlariKur([makine(4, 'Y-01', { tur: 'mill', kontrol: 'iso', konik: 'BT40', cepSayisi: 24, devir: 10000, isMiliDevri: null, canliTakim: false, canliDevir: null, elle: null, modelTuru: 'm_vmc' }), makine(5, 'Z-01', null)]);
    state.customMachines.push({ id: 'um_1', name: 'Elle eklenen', type: 'mill', ctrl: 'iso', taper: 'BT40', pockets: 20, rpm: 8000, kind: 'm_vmc' });
    sunucu.yaz.mockImplementation(async (t: SunucuTezgahi, ayar: TezgahAyari) => ({ ...t, ayar, surum: t.surum + 1 }));
    render(<TanimlarPenceresi sekme="mach" kapat={() => undefined} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('note').textContent).toContain('Elle eklenen');
    const z = screen.getByText('Deneme Z-01').closest('tr') as HTMLElement;
    expect(within(z).getByText('ayarı eksik')).toBeTruthy();
    fireEvent.click(within(z).getByRole('button', { name: 'Düzenle' }));
    expect(screen.queryByLabelText('Ad')).toBeNull();
    fireEvent.change(screen.getByLabelText('Magazin cep sayısı'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Maks. devir (takım mili)'), { target: { value: '12000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull(); });
    expect(sunucu.yaz).toHaveBeenCalledWith(expect.objectContaining({ makineId: 5, surum: 0 }), expect.objectContaining({ cepSayisi: 30, devir: 12000 }));
    expect(within(screen.getByText('Deneme Z-01').closest('tr') as HTMLElement).queryByText('ayarı eksik')).toBeNull();
  });

  it('sunucu ayarı reddederse ileti formda kalır', async () => {
    tezgahlariKur([makine(5, 'Z-01', null)]);
    sunucu.yaz.mockRejectedValueOnce(new Error('Kayıt siz açtıktan sonra değişti.'));
    render(<TanimlarPenceresi sekme="mach" kapat={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
    fireEvent.change(screen.getByLabelText('Magazin cep sayısı'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Maks. devir (takım mili)'), { target: { value: '12000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Kayıt siz açtıktan sonra değişti.');
  });

  it('yazamayan kişide ekleme, düzenleme ve silme gizli; numara alanı salt okunur', () => {
    yetki.yazabilir = false;
    render(<TanimlarPenceresi sekme="mach" kapat={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Yeni tezgâh' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    const no = screen.getAllByLabelText(/tezgâh no$/)[0] as HTMLInputElement;
    expect(no.readOnly).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'İş Malzemeleri' }));
    expect(screen.queryByRole('button', { name: 'Yeni malzeme' })).toBeNull();
  });

  it('Oto-CAM kalktığı için Hazırlık süreleri sekmesi yoktur (1399)', () => {
    render(<TanimlarPenceresi sekme="mach" kapat={() => undefined} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual(['Tezgâhlar', 'İş Malzemeleri', '3B modeller']);
  });
});
