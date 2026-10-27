import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmMerkezBelgesi, KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { kmAc, MUAYENECI, MUHENDIS, OKUYAN, type SunucuSecenegi } from '../yeni/test-ortak.tsx';

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
  it('parça seçilmeden liste gelir (799); satır stüdyoyu açar, parça seçici stüdyoda kalır', async () => {
    kmAc('resimler', OKUYAN, {}, { ...SECENEK, studyo: { ...SECENEK.studyo, ozetler: [{ malzemeNo: 7, resim: 1, model: 1, balon: 0, numunePlani: 1 }] } });
    const tablo = await screen.findByRole('table', { name: 'Resim ve modeller' });
    fireEvent.click(await within(tablo).findByText('DNM-07'));
    expect(await screen.findByRole('region', { name: 'Teknik resim' })).toBeTruthy();
    expect(await screen.findByText('Deneme gövde')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Parça değiştir' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
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

  // Resim alma seçicisi ve resim alma/kaldırma cevapları ortak deneme sunucusunun üstüne konur (ötekiler ona gider).
  const BELGE: KmMerkezBelgesi = { id: 41, ad: 'Merkez flanş', harf: 'C', tur: 'resim', bicim: 'pdf', ozet: 'b'.repeat(64) };
  function merkezliAc(k = MUHENDIS) {
    const acilan = kmAc('resimler?parca=7', k, {}, SECENEK);
    const asil = acilan.fetch.getMockImplementation()!;
    const cevap = (govde: unknown) => Promise.resolve(new Response(JSON.stringify(govde), { status: 200 }));
    acilan.fetch.mockImplementation((adres: string, istek?: RequestInit) => {
      if (adres.startsWith('/api/kalite-merkezi/studyo/merkez-belgeleri')) { void asil(adres, istek); return cevap({ belgeler: [BELGE] }); }
      if (adres === '/api/kalite-merkezi/studyo/resimler/al') { void asil(adres, istek); return cevap({ resim: resim({ id: 9, ad: 'Merkez flanş', merkezBelgeId: 41 }) }); }
      if (adres === '/api/kalite-merkezi/studyo/resimler/1/kaldir') { void asil(adres, istek); return cevap({ resim: resim({ aktif: false, surum: 2 }) }); }
      return asil(adres, istek);
    });
    return acilan;
  }

  it('onaylayan belge merkezinden resim alır: seçici yayındakileri listeler, seçilen belge yayındaki harfle alınır ve listeye girer', async () => {
    const { yazmalar } = merkezliAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Belge merkezinden al' }));
    const pencere = await screen.findByRole('dialog', { name: 'Belge merkezinden resim al' });
    fireEvent.click(await within(pencere).findByRole('button', { name: /^Merkez flanş/ }));
    await waitFor(() => { expect(yazmalar.some((y) => y.yol === '/kalite-merkezi/studyo/resimler/al')).toBe(true); });
    expect(yazmalar.find((y) => y.yol === '/kalite-merkezi/studyo/resimler/al')?.govde).toEqual({ malzemeNo: 7, merkezBelgeId: 41, revizyon: 'C' });
    const sol = screen.getByRole('complementary', { name: 'Parça ve resimler' });
    expect(await within(sol).findByRole('button', { name: 'Merkez flanş resmini kaldır' })).toBeTruthy();
  });

  it('onaylayan resmi onayla kaldırır; sürüm gider, resim listeden düşer', async () => {
    const { yazmalar } = merkezliAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme resim resmini kaldır' }));
    const pencere = await screen.findByRole('dialog', { name: 'Resmi parçadan kaldır' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => { expect(yazmalar.find((y) => y.yol === '/kalite-merkezi/studyo/resimler/1/kaldir')?.govde).toEqual({ surum: 1 }); });
    const sol = screen.getByRole('complementary', { name: 'Parça ve resimler' });
    await waitFor(() => { expect(within(sol).queryByRole('button', { name: /^Deneme resim/ })).toBeNull(); });
  });

  it('onayı olmayan resim alamaz ve kaldıramaz', async () => {
    merkezliAc(MUAYENECI);
    await screen.findByRole('button', { name: /Deneme resim/ });
    expect(screen.queryByRole('button', { name: 'Belge merkezinden al' })).toBeNull();
    expect(screen.queryByRole('button', { name: /resmini kaldır/ })).toBeNull();
    vi.unstubAllGlobals();
  });
});
