import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { kmAc, MUAYENECI, OKUYAN, type SunucuSecenegi } from '../yeni/test-ortak.tsx';

// Uydurma deneme verisi: bir malzeme kartı, iki iş emri, bir resim ve bir model.
const KART = { malzemeNo: 7, kod: 'DNM-07', ad: 'Deneme gövde', aktif: true };
const resim = (o: Partial<KmResim>): KmResim => ({
  id: 1, malzemeNo: 7, tur: 'resim', merkezBelgeId: 11, ozet: 'a'.repeat(64), ad: 'Deneme resim', revizyon: 'B', aktif: true, surum: 1,
  eklendi: '2026-10-20T08:00:00.000Z', balonlar: [], ...o,
});
const PARCA: KmStudyoParcaCevabi = {
  resimler: [resim({}), resim({ id: 2, tur: 'model', ad: 'Deneme model', revizyon: null }), resim({ id: 3, ad: 'Eski resim', aktif: false })],
  numunePlanlari: [{ opNo: 10, surum: 1, kurallar: [{ kimlik: 'k1', ne: 'ilk', kim: ['kalite'], balonlar: 'hepsi', kapi: true }] }],
};
const SECENEK: SunucuSecenegi = {
  parcalar: [KART],
  emirler: [
    { kimlik: 'ue-5', no: 'UE-5', tip: 'İş emri', acik: false, parcaNo: 'DNM-07', parcaAdi: null, miktar: 10, termin: null, firmaId: null, firmaAd: null },
    { kimlik: 'ue-6', no: 'UE-6', tip: 'İş emri', acik: true, parcaNo: 'DNM-07', parcaAdi: null, miktar: 10, termin: null, firmaId: null, firmaAd: null },
    { kimlik: 'sa-6', no: 'SA-6', tip: 'Satınalma siparişi', acik: true, parcaNo: 'DNM-07', parcaAdi: null, miktar: 10, termin: null, firmaId: null, firmaAd: null },
  ],
  studyo: {
    parcalar: { 7: PARCA },
    numuneler: {
      6: [{ id: 1, uretimEmriId: 6, opNo: 10, balonlar: [1, 2], kritik: true, neden: 'İlk parça', parcaSayisi: 1, isteyen: 'Deneme', istendi: '2026-10-26T07:00:00.000Z', durum: 'bekliyor', karar: null, olcumler: [] }],
    },
  },
};

describe('Resim ve modeller stüdyosu (597 a)', () => {
  it('parça seçilmeden boş durum ve parça seçici gösterir', async () => {
    kmAc('resimler', OKUYAN, {}, SECENEK);
    expect(await screen.findByRole('region', { name: 'Teknik resim' })).toBeTruthy();
    expect(screen.getAllByText('Parça seçin').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Parça seç' }));
    fireEvent.click(await screen.findByText('DNM-07'));
    expect(await screen.findByText('Deneme gövde')).toBeTruthy();
  });

  it('parçanın etkin resim ve modelleri, numune planı ve açık iş emrinin numuneleri listelenir; sipariş satırı emir değildir', async () => {
    const { fetch } = kmAc('resimler?parca=7', MUAYENECI, {}, SECENEK);
    const sol = await screen.findByRole('complementary', { name: 'Parça ve resimler' });
    expect(await within(sol).findByRole('button', { name: /Deneme resim/ })).toBeTruthy();
    expect(within(sol).getByRole('button', { name: /Deneme model/ })).toBeTruthy();
    expect(within(sol).queryByText('Eski resim')).toBeNull();
    const emir = within(sol).getByLabelText('Ölçümleri gösterilen emir');
    expect((emir as HTMLSelectElement).value).toBe('ue-6');
    expect(within(emir).queryByText(/SA-6/)).toBeNull();
    const sag = screen.getByRole('complementary', { name: 'Numune planı ve numuneler' });
    expect(within(sag).getByText('İlk parça · Kalite · tüm balonlar · kalite kararı bekler')).toBeTruthy();
    expect(await within(sag).findByText('Bekliyor')).toBeTruthy();
    expect(fetch.mock.calls.some(([a]) => a === '/api/kalite-merkezi/studyo/emirler/6/olcumler')).toBe(true);
    fireEvent.change(emir, { target: { value: 'ue-5' } });
    expect(await within(sag).findByText('Bu emirde numune isteği yok.')).toBeTruthy();
  });

  it('açılışta yazma isteği gitmez', async () => {
    const { fetch } = kmAc('resimler?parca=7', MUAYENECI, {}, SECENEK);
    await screen.findByRole('button', { name: /Deneme resim/ });
    expect(fetch.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method && (i as RequestInit).method !== 'GET')).toBe(false);
  });
});
