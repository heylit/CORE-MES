import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { SIMDI } from '../ornek-veri.ts';
import { ac, sunucuKur } from '../test-ortak.tsx';
import { belgeFormuDogrula, yeniBelge, type BelgeFormu } from './BelgeYukle.tsx';
import { belgeDeposu, KALITECI_KISI, yazmaCevabi } from './test-verisi.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const form = (k: Partial<BelgeFormu> = {}): BelgeFormu => ({ firma: 'p1', tur: 'ISO 9001', no: ' 123 ', duzenleme: '2026-03-01', bitis: '2027-03-01', ...k });

describe('BelgeYukle', () => {
  it('firma tarafının eklediği belgeyi onaylı ve yoksa koşuluyla yazar', async () => {
    vi.useFakeTimers({ now: SIMDI, toFake: ['Date'] });
    const istekler = sunucuKur(KALITECI_KISI, belgeDeposu(), yazmaCevabi);
    ac('/portal/yeni/docs');
    fireEvent.click(await screen.findByRole('button', { name: /Belge ekle/ }, { timeout: 5000 }));
    const pencere = await screen.findByRole('dialog', { name: 'Belge ekle' });
    fireEvent.change(within(pencere).getByLabelText(/^Firma/), { target: { value: 'p1' } });
    fireEvent.change(within(pencere).getByLabelText('Belge türü'), { target: { value: 'KVKK taahhütnamesi' } });
    fireEvent.change(within(pencere).getByLabelText('Belge no'), { target: { value: 'K-1' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.filter((i) => i.yol === '/portal/belge/yaz')).toHaveLength(1); });
    const y = istekler.find((i) => i.yol === '/portal/belge/yaz')?.govde as { yol: string; veri: Record<string, unknown>; beklenenSurum: number | null };
    expect(y.yol).toMatch(/^docs\/dc/);
    expect(y.beklenenSurum).toBeNull();
    expect(y.veri).toMatchObject({ partyId: 'p1', type: 'KVKK taahhütnamesi', no: 'K-1', status: 'approved', u: 'tmi-6', photos: [] });
    expect(await screen.findByText('Belge kaydedildi')).toBeTruthy();
  });

  it('denetim: firma, ileri düzenleme tarihi ve ters bitiş reddedilir', () => {
    expect(belgeFormuDogrula(form(), SIMDI)).toEqual({});
    expect(belgeFormuDogrula(form({ bitis: '' }), SIMDI)).toEqual({});
    expect(belgeFormuDogrula(form({ firma: '' }), SIMDI)).toEqual({ firma: 'Firma seçin.' });
    expect(belgeFormuDogrula(form({ duzenleme: '2026-03-17' }), SIMDI)).toEqual({ duzenleme: 'Düzenleme tarihi bugünden sonra olamaz.' });
    expect(belgeFormuDogrula(form({ bitis: '2026-02-01' }), SIMDI)).toEqual({ bitis: 'Bitiş tarihi düzenleme tarihinden önce olamaz.' });
  });

  it('yeni kayıt: süresiz belgede bitiş alanı yazılmaz, numara kırpılır', () => {
    const b = yeniBelge(form({ bitis: '' }), ['f1'], 'tmi-6', SIMDI);
    expect(b).not.toHaveProperty('expiresAt');
    expect(b).toMatchObject({ no: '123', status: 'approved', photos: ['f1'], history: [{ text: 'ISO 9001 eklendi ve onaylandı', u: 'tmi-6' }] });
  });
});
