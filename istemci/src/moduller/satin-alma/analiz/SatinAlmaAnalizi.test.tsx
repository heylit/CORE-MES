import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SatinAlmaAnaliziCevabi, SatinAlmaTedarikcisi, SatinAlmaTuketimMalzemesi } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { api } from '../../../ortak/veri/api.ts';
import {
  bantDisiOrani, bayesMetni, guvenlikMetni, harcamaAltMetni, isaretliBirimTl, isaretliTl, isaretliYuzde, karneMetni, oncekiMetni, sapmaAltMetni, sureMetni, sureOzetiMetni, tahminMetni, tlMetni,
  tutarAltMetni, yuzdeMetni,
} from './kurallar.ts';
import { SatinAlmaAnalizi } from './SatinAlmaAnalizi.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma rapor (2151).
const TEDARIKCI: SatinAlmaTedarikcisi = {
  firmaId: 1, ad: 'Deneme tedarik', siparisSatiri: 12,
  karne: { teslimToplam: 4, zamanindaOran: 75, kalitePuani: null, puan: null, sinif: null, yetersizVeri: true },
  zamanindaBayes: { ortalama: 66.7, alt90: 41.2 },
  gecikme: { teslim: 4, gecKalan: 1, ortalamaGun: 1.5, yuzde80Gun: 3, enCokGun: 6 },
  tedarikSuresi: { ornek: 3, ortancaGun: null, yuzde80Gun: null, teklifOrtancaGun: null },
};
const MALZEME: SatinAlmaTuketimMalzemesi = {
  malzemeNo: 7, ad: 'Deneme çubuk', gecmisAy: 9, seri: Array.from({ length: 24 }, (_, i) => (i < 15 ? null : 10)),
  degiskenlik: null, xyz: null, tahminAylik: null, tedarikSuresiGun: null, guvenlikStogu: null,
};
const RAPOR: SatinAlmaAnaliziCevabi = {
  hesaplanan: '2026-11-04T09:00:00.000Z',
  tedarikciler: [TEDARIKCI],
  sureGereken: 5,
  firmasizSatir: 2,
  harcama: { basTarih: '2025-11-05', bitTarih: '2026-11-04', toplamTl: 4900, kalemSayisi: 2, siniflar: { A: 1, B: 0, C: 1 },
    kalemler: [{ anahtar: 'a', ad: 'Deneme çubuk', tutarTl: 4800, pay: 98, sinif: 'A' }, { anahtar: 'b', ad: 'Deneme sarf', tutarTl: 100, pay: 2, sinif: 'C' }], kursuzSatir: 1 },
  fiyatDegisimleri: [{
    katalogId: '00000000-0000-4000-8000-000000000001', ad: 'Deneme çubuk', paraBirimi: 'EUR', birim: 'adet',
    onceki: { tarih: '2026-03-02', birimFiyat: 10, kur: 30 }, son: { tarih: '2026-06-01', birimFiyat: 10, kur: 36 },
    degisimTl: 60, fiyatEtkisiTl: 0, kurEtkisiTl: 60, degisimYuzde: 20,
  }],
  tuketim: { stokBagi: true, aylar: Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2024, 10 + i, 1)).toISOString().slice(0, 7)), gereken: 12, malzemeler: [MALZEME] },
  donem: { bas: '2025-11-05', bit: '2026-11-04', oncekiBas: '2024-11-05', oncekiBit: '2025-11-04' },
  oncekiHarcamaTl: null,
  asamaGereken: 5,
  asamaSureleri: {
    tumu: {
      asamalar: [
        { asama: 'teklif-istegi', ornek: 6, ortancaGun: 1, yuzde80Gun: 3 }, { asama: 'teklif', ornek: 6, ortancaGun: 4, yuzde80Gun: 7 },
        { asama: 'karar', ornek: 6, ortancaGun: 2, yuzde80Gun: 4 }, { asama: 'onay', ornek: 6, ortancaGun: 5, yuzde80Gun: 9 },
        { asama: 'siparis', ornek: 6, ortancaGun: 1, yuzde80Gun: 2 }, { asama: 'ilk-teslim', ornek: 2, ortancaGun: null, yuzde80Gun: null },
        { asama: 'tam-teslim', ornek: 0, ortancaGun: null, yuzde80Gun: null },
      ],
      toplam: { ornek: 2, ortancaGun: null, yuzde80Gun: null }, darbogaz: 'onay', hataliAralik: 1,
    },
    oncekiToplam: { ornek: 0, ortancaGun: null, yuzde80Gun: null },
    kirilimlar: [{ tur: 'kategori', anahtar: 'Hammadde', ad: 'Hammadde', ozet: {
      asamalar: [], toplam: { ornek: 2, ortancaGun: null, yuzde80Gun: null }, darbogaz: null, hataliAralik: 0 } }],
  },
  tasarruf: {
    fiyatFarki: { simdi: { tutarTl: -300, ornek: 1, kursuz: 0, kurEtkisiTl: 120 }, onceki: { tutarTl: null, ornek: 0, kursuz: 0, kurEtkisiTl: null } },
    kacinilan: { simdi: { tutarTl: 40, ornek: 1, kursuz: 2, kurEtkisiTl: null }, onceki: { tutarTl: null, ornek: 0, kursuz: 0, kurEtkisiTl: null } },
  },
  fiyatSapmasi: {
    esikYuzde: 10,
    donem: { simdi: { satir: 4, toplamTl: 660, bantDisi: 1, endeksYok: 3 }, onceki: { satir: 0, toplamTl: null, bantDisi: 0, endeksYok: 0 } },
    kalemler: [{ katalogId: '00000000-0000-4000-8000-000000000001', ad: 'Deneme çubuk', siparisTarihi: '2026-06-01', paraBirimi: 'EUR', birim: 'adet',
      hedef: 10, fiili: 12, farkYuzde: 20, sapmaTl: 660, kurEtkisiTl: 300, bant: 'ustunde' }],
  },
  kuralDisi: {
    enAzTeklif: 3,
    donem: {
      simdi: { azTeklif: { siparis: 4, tutarTl: 4500 }, talepOncesi: { siparis: 0, tutarTl: 0 }, payYuzde: 50 },
      onceki: { azTeklif: { siparis: 0, tutarTl: 0 }, talepOncesi: { siparis: 0, tutarTl: 0 }, payYuzde: null },
    },
  },
};
const sayfa = (adres = '/satin-alma/analiz') => render(
  <MemoryRouter initialEntries={[adres]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SatinAlmaAnalizi /></QueryClientProvider></MemoryRouter>);

describe('satın alma analizi (2151)', () => {
  it('metinler: yetersiz veri sayısıyla yazılır, sıfır uydurulmaz', () => {
    expect(karneMetni(TEDARIKCI)).toBe('%75 (yetersiz veri: 4 teslim)');
    expect(karneMetni({ ...TEDARIKCI, karne: null })).toBe('Teslim kaydı yok');
    expect(bayesMetni(TEDARIKCI)).toBe('%66,7, en az %41,2');
    expect(bayesMetni({ ...TEDARIKCI, zamanindaBayes: null })).toBe('-');
    expect(sureMetni(TEDARIKCI, 5)).toBe('Yetersiz veri: 3 teslim, 5 gerekir');
    expect(sureMetni({ ...TEDARIKCI, tedarikSuresi: { ornek: 6, ortancaGun: 12, yuzde80Gun: 20, teklifOrtancaGun: 10 } }, 5)).toBe('12 gün, %80 20 gün (teklif 10 gün)');
    expect(tahminMetni(MALZEME, 12)).toBe('Yetersiz veri: 9 ay, 12 gerekir');
    expect(tahminMetni({ ...MALZEME, gecmisAy: 0 }, 12)).toBe('Stok hareketi yok');
    expect(guvenlikMetni({ ...MALZEME, tahminAylik: 5 })).toBe('Tedarik süresi bilinmiyor');
    expect(tlMetni(null)).toBe('-');
    expect(harcamaAltMetni(RAPOR.harcama)).toContain('Kuru girilmemiş 1 satır sayılmadı');
    expect(harcamaAltMetni({ ...RAPOR.harcama, toplamTl: null, kursuzSatir: 0 })).toBe('Son 12 ayda sipariş yok.');
  });

  it('2471 metinleri: yetersiz veri örnekle, önceki dönem yoksa yazılmaz, endeks yokluğu sayılır', () => {
    expect(sureOzetiMetni({ ornek: 2, ortancaGun: null, yuzde80Gun: null }, 5)).toBe('Yetersiz veri: 2 örnek, 5 gerekir');
    expect(sureOzetiMetni({ ornek: 0, ortancaGun: null, yuzde80Gun: null }, 5)).toBe('Örnek yok');
    expect(sureOzetiMetni({ ornek: 6, ortancaGun: 4, yuzde80Gun: 7 }, 5)).toBe('4 gün, P80 7 gün');
    expect(oncekiMetni(null, '1 satır')).toBe('1 satır');
    expect(tutarAltMetni(RAPOR.tasarruf.kacinilan.simdi, 'satır', RAPOR.tasarruf.kacinilan.onceki)).toBe('1 satır, kuru girilmemiş 2');
    expect(tutarAltMetni(RAPOR.tasarruf.fiyatFarki.simdi, 'satır', RAPOR.tasarruf.fiyatFarki.onceki)).toBe('1 satır, kur etkisi ayrıca +120 ₺');
    expect(sapmaAltMetni(RAPOR.fiyatSapmasi.donem.simdi)).toBe('4 satır, bant dışı 1 · ₺ kalemde endeks yok: 3');
    expect(bantDisiOrani(RAPOR.fiyatSapmasi.donem.onceki)).toBeNull();
    // Arayüz ön bakışı: TL simgesi, eksi yüzdede işaret önde, tutar tam lira, birim farkı kuruşlu.
    expect(tlMetni(4900)).toBe('4.900 ₺');
    expect(yuzdeMetni(-7.9)).toBe('-%7,9');
    expect(isaretliYuzde(-7.9)).toBe('-%7,9');
    expect(isaretliYuzde(20)).toBe('+%20');
    expect(isaretliTl(-9882.4)).toBe('-9.882 ₺');
    expect(isaretliTl(17383.04)).toBe('+17.383 ₺');
    expect(isaretliBirimTl(-6868.8)).toBe('-6.868,80 ₺');
    expect(isaretliTl(0.2)).toBe('0 ₺');
  });

  it('sayfa: özet varsayılan sekme; darboğaz ve kıyas', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(RAPOR as never);
    sayfa();
    expect(await screen.findByText('Kural dışı alım (vekil)')).toBeTruthy();
    expect(screen.getByText(/Darboğaz: Karar → son onay, ortanca 5 gün/)).toBeTruthy();
    expect(screen.getByText(/Enflasyon endeksi olmadığından 3 ₺ satırın/)).toBeTruthy();
    expect(screen.getByText('%50')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/satin-alma-analiz');
  });

  it('sayfa: harcama, fiyat, tedarik ve tüketim sekmeleri adresten açılır', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(RAPOR as never);
    sayfa('/satin-alma/analiz?sekme=tedarik');
    expect(await screen.findByText('Tedarikçi başarımı')).toBeTruthy();
    expect(screen.getAllByText('Deneme tedarik').length).toBeGreaterThan(0);
    expect(screen.getAllByText('%75 (yetersiz veri: 4 teslim)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Karar → son onay (darboğaz)').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/En az teklif sayısının altında karar \(ayar: 3\)/).length).toBeGreaterThan(0);
    cleanup();
    sayfa('/satin-alma/analiz?sekme=fiyat');
    expect((await screen.findAllByText('+60,00 ₺ (+%20)')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hedefin üstünde').length).toBeGreaterThan(0);
    cleanup();
    sayfa('/satin-alma/analiz?sekme=harcama');
    expect(await screen.findByText(/Firmaya bağlı olmayan 2 sipariş satırı/)).toBeTruthy();
    cleanup();
    sayfa('/satin-alma/analiz?sekme=tuketim');
    expect((await screen.findAllByText('Yetersiz veri: 9 ay, 12 gerekir')).length).toBeGreaterThan(0);
  });
});
