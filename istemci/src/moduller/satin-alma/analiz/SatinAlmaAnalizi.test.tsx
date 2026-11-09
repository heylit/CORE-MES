import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../../ortak/veri/api.ts';
import {
  bantDisiOrani, bayesMetni, kategoriAdi, teklifAltMetni, yogunlasmaMetni, guvenlikMetni, harcamaAltMetni, isaretliBirimTl, isaretliTl, isaretliYuzde, karneMetni, oncekiMetni, sapmaAltMetni, sureMetni, sureOzetiMetni, tahminMetni, tlMetni,
  tutarAltMetni, yuzdeMetni,
} from './kurallar.ts';
import { SatinAlmaAnalizi } from './SatinAlmaAnalizi.tsx';
import { MALZEME, RAPOR, TEDARIKCI } from './deneme-analizi.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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

  it('2477 metinleri: kategorisiz kalem adlandırılır, harcama ve talep yoksa pay ve ortanca yazılmaz', () => {
    expect(kategoriAdi('')).toBe('Kategorisiz');
    expect(yogunlasmaMetni(RAPOR.harcamaDagilimi)).toBe('En büyük tedarikçi %98, ilk üç %100.');
    expect(yogunlasmaMetni({ ...RAPOR.harcamaDagilimi, ilkBirPay: null, ilkUcPay: null })).toBe('Dönemde harcama yok.');
    expect(teklifAltMetni({ talep: 0, ortanca: null, hedefAlti: 0 }, 3)).toBe('Son 12 ayda siparişe dönen talep yok.');
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
    expect(screen.getByText('Tek kaynak riski')).toBeTruthy();
    expect(screen.getByText('ortanca, 5 talep · en az 3 teklifin altında 3')).toBeTruthy();
    cleanup();
    sayfa('/satin-alma/analiz?sekme=fiyat');
    expect((await screen.findAllByText('+60,00 ₺ (+%20)')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hedefin üstünde').length).toBeGreaterThan(0);
    cleanup();
    sayfa('/satin-alma/analiz?sekme=harcama');
    expect(await screen.findByText(/Firmaya bağlı olmayan 2 sipariş satırı/)).toBeTruthy();
    expect(screen.getByText('Aylık harcama')).toBeTruthy();
    expect(screen.getByText(/En büyük tedarikçi %98, ilk üç %100/)).toBeTruthy();
    cleanup();
    sayfa('/satin-alma/analiz?sekme=tuketim');
    expect((await screen.findAllByText('Yetersiz veri: 9 ay, 12 gerekir')).length).toBeGreaterThan(0);
  });
});
