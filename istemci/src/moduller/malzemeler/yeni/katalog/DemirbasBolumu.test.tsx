import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { MakineSabitKiymetleriCevabi } from '#paylasilan/sozlesme/finans.ts';
import type { DemirbasMakineSecenekleriCevabi, DemirbasTeknikCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { json, sunucuKur, yeniIstemci, YAZAN, OKUYAN } from '../test-ortak.tsx';
import { DemirbasBolumu, kiymetGovdesi, type govdeKur } from './DemirbasBolumu.tsx';

// Makine adları ve tutarlar uydurmadır.
const MAKINE = { id: 4, kod: 'DM-01', ad: 'Deneme tezgah', aktif: true };
const TEKNIK: DemirbasTeknikCevabi = {
  teknik: {
    surum: 2, makine: MAKINE, guncelleme: '2026-11-01T10:00:00.000Z', ozellikler: [{ ad: 'Palet sayısı', deger: '2', birim: null }],
    alanlar: {
      tezgahTuru: 'dik_isleme', eksenSayisi: 3, xKursuMm: 1020, yKursuMm: 510, zKursuMm: 510, tablaEnMm: null, tablaBoyMm: null, tablaYukuKg: 800,
      azamiDevir: 12000, isMiliGucuKw: 18.5, isMiliKonigi: 'BT40', takimCebi: 24, tornalamaCapiMm: null, tornalamaBoyuMm: null, cubukGecisCapiMm: null,
      konumlamaHassasiyetiMm: null, calismaTuketimiKwh: 11.2, beklemeTuketimiKwh: null,
    },
  },
};
const MAKINELER: DemirbasMakineSecenekleriCevabi = { makineler: [{ ...MAKINE, bagliKart: 'k1' }, { id: 5, kod: 'DM-02', ad: 'Başka tezgah', aktif: true, bagliKart: 'k9' }] };
const KIYMETLER: MakineSabitKiymetleriCevabi = {
  sabitKiymetler: [{
    id: 31, ad: 'Deneme tezgah', makineKodu: 'DM-01', makineId: 4, paraBirimi: 'TRY', bedel: '120000.00', kur: '1.000000', alisTarihi: '2024-11-15',
    omurAy: 120, yontem: 'normal', kalintiDegeri: '0.00', devirTarihi: null, devirBirikmisTl: null, pasifTarihi: null, aciklama: null, surum: 1,
    olusturma: '2026-11-01T10:00:00.000Z', bedelTl: '120000.00', buAyTl: '1000.00', birikmisTl: '25000.00', netTl: '95000.00',
  }],
};
const FINANSCI: Kullanici = { ...YAZAN, id: 21, islemler: [...YAZAN.islemler, 'finans.oku', 'finans.yonet'] };

function ac(kullanici: Kullanici, yazar: boolean, yollar: Parameters<typeof sunucuKur>[1] = {}) {
  const istekler = sunucuKur(kullanici, {
    'GET /malzeme-katalogu-kartlari/k1/demirbas-teknik': () => json(200, TEKNIK),
    'GET /malzeme-demirbas-makineleri': () => json(200, MAKINELER),
    'GET /finans/sabit-kiymetler/makine/4': () => json(200, KIYMETLER),
    ...yollar,
  });
  render(<QueryClientProvider client={yeniIstemci()}><DemirbasBolumu kimlik="k1" yazar={yazar} /></QueryClientProvider>);
  return istekler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Demirbaş bölümü (1595)', () => {
  it('teknik alanları ve özellikleri gösterir; yazar okunan sürümle, boş alanı null göndererek kaydeder', async () => {
    const istekler = ac(YAZAN, true, { 'POST /malzeme-katalogu-kartlari/k1/demirbas-teknik/kaydet': () => json(200, TEKNIK) });
    expect(await screen.findByLabelText('X kursu (mm)')).toHaveProperty('value', '1020');
    expect(screen.getByLabelText('Özellik 1')).toHaveProperty('value', 'Palet sayısı');
    // Başka karta bağlı makine seçilemez.
    await waitFor(() => expect(screen.getByRole('option', { name: 'DM-01 - Deneme tezgah' })).toBeTruthy());
    expect(screen.queryByRole('option', { name: 'DM-02 - Başka tezgah' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Azami devir (dev/dk)'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('X kursu (mm)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Teknik bilgiyi kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const govde = istekler.find((i) => i.yontem === 'POST')!.govde as ReturnType<typeof govdeKur>;
    expect(govde.surum).toBe(2);
    expect(govde.makineId).toBe(4);
    expect(govde.alanlar.azamiDevir).toBe(15000);
    expect(govde.alanlar.xKursuMm).toBeNull();
    expect(govde.ozellikler).toEqual([{ ad: 'Palet sayısı', deger: '2', birim: null }]);
  });

  it('finans yetkisi yoksa fiyat ve amortisman bölümü çizilmez, finans ucu çağrılmaz (1599 a)', async () => {
    const istekler = ac(OKUYAN, false);
    await screen.findByLabelText('X kursu (mm)');
    expect(screen.getByLabelText('X kursu (mm)')).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: /Teknik bilgiyi kaydet/ })).toBeNull();
    expect(screen.queryByText('Fiyat ve amortisman')).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/finans/'))).toBe(false);
    expect(istekler.some((i) => i.yol === '/malzeme-demirbas-makineleri')).toBe(false);
  });

  it('finansçı makinenin kıymetini birikmiş ve net değerle görür; düzeltme sürümle güncelleme ucuna gider', async () => {
    const istekler = ac(FINANSCI, true, { 'POST /finans/sabit-kiymetler/31/guncelle': () => json(200, { sabitKiymet: KIYMETLER.sabitKiymetler[0] }) });
    expect(await screen.findByText('Fiyat ve amortisman')).toBeTruthy();
    expect(await screen.findByText(/95\.000,00 TL/)).toBeTruthy();
    expect(screen.getByText(/25\.000,00 TL/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Düzelt/ }));
    fireEvent.change(screen.getByLabelText(/Bedel/), { target: { value: '130000' } });
    fireEvent.click(screen.getByRole('button', { name: /Düzeltmeyi kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/finans/sabit-kiymetler/31/guncelle')).toBe(true));
    const govde = istekler.find((i) => i.yol === '/finans/sabit-kiymetler/31/guncelle')!.govde as Record<string, unknown>;
    expect(govde).toMatchObject({ bedel: 130000, makineId: 4, surum: 1, kur: null, yontem: 'normal' });
  });

  it('makine bağlı değilse amortisman bölümü önce makineyi bağlamayı söyler', async () => {
    ac(FINANSCI, true, { 'GET /malzeme-katalogu-kartlari/k1/demirbas-teknik': () => json(200, { teknik: null }) });
    expect(await screen.findByText(/Önce teknik bölümde makineyi bağlayın/)).toBeTruthy();
    expect(screen.getByText('Girilmemiş')).toBeTruthy();
  });

  it('kıymet gövdesi: TRY\'de kur gitmez, boş devir null olur', () => {
    const g = kiymetGovdesi({
      ad: 'X', bedel: '1000', paraBirimi: 'try', kur: '35', alisTarihi: '2026-01-01', omurAy: '60', yontem: 'azalan', kalintiDegeri: '', devirTarihi: '', devirBirikmisTl: '',
    }, 4);
    expect(g).toEqual({ ad: 'X', makineId: 4, paraBirimi: 'TRY', bedel: 1000, kur: null, alisTarihi: '2026-01-01', omurAy: 60, yontem: 'azalan', kalintiDegeri: 0, devirTarihi: null, devirBirikmisTl: null });
  });
});
