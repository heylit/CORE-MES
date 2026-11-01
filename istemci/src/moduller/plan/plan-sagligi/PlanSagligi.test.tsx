import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PlanSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { api } from '../../../ortak/veri/api.ts';
import { egilimNoktalari, ogrenmeMetni, olcumYok, saatMetni, tablolarGorunur, yuzdeMetni } from './kurallar.ts';
import { PlanSagligi } from './PlanSagligi.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma rapor (1478).
const haftalar = Array.from({ length: 8 }, (_, i) => ({ baslangic: `2026-09-${String(10 + i).padStart(2, '0')}`, bitis: `2026-09-${String(16 + i).padStart(2, '0')}` }));
const bosEgilim = Array<number | null>(8).fill(null);
const RAPOR: PlanSagligiCevabi = {
  hesaplanan: '2026-11-01T09:00:00.000Z', haftalar,
  termin: { yuzde: 75, emir: 4, gecKalan: 1, ortancaGecikmeGun: 2, egilim: [...bosEgilim.slice(0, 7), 75] },
  soz: { ortancaKaymaSaat: 36, kayanEmir: 1, izlenenEmir: 2, egilim: bosEgilim },
  tutarlilik: { yuzde: 12.5, yakinDegisen: 1, canliyaAlma: 2, egilim: bosEgilim },
  uyum: { yuzde: null, olculenAdim: 0, tezgahDisi: 0, siraDisi: 0, kaymaDisi: 0, egilim: bosEgilim },
  veri: { eksikKonu: 2, okunamayanKonu: 0, sonOlcum: '2026-10-31T09:00:00.000Z', yerlesmeyenIs: 1, vardiyasizIs: 0, gelirsizEmir: 3 },
  kayanEmirler: [{
    uretimEmriId: 7, emirNo: 'E-7', termin: '2026-11-10', ilkTahmin: '2026-11-05T10:00:00.000Z', sonTahmin: '2026-11-06T22:00:00.000Z', kaymaSaat: 36, degisim: 2,
    gecmis: [{ zaman: '2026-10-27T09:00:00.000Z', tahminiBitis: '2026-11-05T10:00:00.000Z' }, { zaman: '2026-10-31T09:00:00.000Z', tahminiBitis: null }],
  }],
  sapanSureler: [],
  ogrenme: { durum: 'kapali', ogrenilenAdim: 1, satirlar: [{ malzemeId: 4, malzemeKodu: 'M-4', opNo: 20, ornek: 5, oran: 1.25, dagilim: 0.1 }] },
};

function ciz(roller: string[]) {
  vi.spyOn(api, 'get').mockImplementation((yol: string) => Promise.resolve(
    yol === '/oturum' ? { kullanici: { id: 1, ad: 'Deneme', islemler: ['plan.planlama-oku'], roller } } : RAPOR,
  ) as never);
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlanSagligi /></QueryClientProvider></MemoryRouter>);
}

describe('plan sağlığı', () => {
  it('biçimler: boş değer "Veri yok", kayma işaretli, eğilimde ölçülemeyen hafta atlanır', () => {
    expect(yuzdeMetni(null)).toBe('Veri yok');
    expect(yuzdeMetni(12.5)).toBe('%12,5');
    expect(saatMetni(36)).toBe('+36 saat');
    expect(saatMetni(-72)).toBe('-3 gün');
    expect(saatMetni(null)).toBe('Veri yok');
    expect(egilimNoktalari(RAPOR, RAPOR.termin.egilim)).toEqual([{ etiket: '17.09 haftası', deger: 75 }]);
    expect(olcumYok(RAPOR)).toBe(false);
    expect(olcumYok({ ...RAPOR, veri: { ...RAPOR.veri, sonOlcum: null }, soz: { ...RAPOR.soz, izlenenEmir: 0 } })).toBe(true);
  });

  it('yalnız müdür rolü tabloları görmez; planlama ya da ek rol taşıyan görür', () => {
    expect(tablolarGorunur(['mudur'])).toBe(false);
    expect(tablolarGorunur(['mudur', 'planlama_proje'])).toBe(true);
    expect(tablolarGorunur(['planlama_proje'])).toBe(true);
    expect(tablolarGorunur(undefined)).toBe(true);
  });

  it('planlama kartları ve kayan emirler tablosunu görür', async () => {
    ciz(['planlama_proje']);
    expect(await screen.findByText('E-7')).toBeTruthy();
    expect(screen.getAllByText('Termin güvenilirliği').length).toBeGreaterThan(0);
    expect(screen.getAllByText('%75').length).toBeGreaterThan(0);
    expect(screen.getByText('Veri eksikleri')).toBeTruthy();
    expect(screen.getByText(/yerleşmedi$/)).toBeTruthy();
  });

  it('müdür yalnız kartları görür', async () => {
    ciz(['mudur']);
    expect((await screen.findAllByText('Plan tutarlılığı')).length).toBeGreaterThan(0);
    expect(screen.queryByText('En çok kayan emirler')).toBeNull();
    expect(screen.queryByText('M-4')).toBeNull();
  });

  it('1714: öğrenme kapalıyken de öğrenilenler görünür (gölge dönem); açıkken motorun kullandığı yazılır', async () => {
    expect(ogrenmeMetni(RAPOR.ogrenme)).toMatch(/kapalı: motor kullanmıyor/);
    expect(ogrenmeMetni({ ...RAPOR.ogrenme, durum: 'acik' })).toMatch(/açık: motor bu adımların tamponunu/);
    expect(ogrenmeMetni({ durum: 'kapali', ogrenilenAdim: 0, satirlar: [] })).toMatch(/^En az üç örneği olan adım henüz yok/);
    ciz(['planlama_proje']);
    expect(await screen.findByText('M-4')).toBeTruthy();
    expect(screen.getByText('±0,1')).toBeTruthy();
  });
});
