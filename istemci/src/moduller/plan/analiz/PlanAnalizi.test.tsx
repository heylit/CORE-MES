import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PlanAnaliziCevabi } from '#paylasilan/sozlesme/plan-analiz.ts';
import { api } from '../../../ortak/veri/api.ts';
import { darbogazMetni, doluluk, egilimMetni, haftaEtiketi, hucreAciklamasi, saatMetni, yuzdeMetni } from './kurallar.ts';
import { PlanAnalizi } from './PlanAnalizi.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma rapor (2151).
const haftalar = Array.from({ length: 16 }, (_, i) => {
  const bas = new Date(Date.UTC(2026, 8, 7 + i * 7)).toISOString().slice(0, 10);
  return { baslangic: bas, bitis: new Date(Date.UTC(2026, 8, 13 + i * 7)).toISOString().slice(0, 10), ileri: i >= 8 };
});
const bos = { kapasiteDk: 600, yukDk: 0, oran: 0 };
const RAPOR: PlanAnaliziCevabi = {
  hesaplanan: '2026-11-04T09:00:00.000Z', haftalar,
  istasyonlar: [
    { istasyonId: 1, ad: 'Torna', makine: 2, takvimsizMakine: 1, hucreler: [
      ...Array.from({ length: 7 }, () => bos), { kapasiteDk: 600, yukDk: 660, oran: 110 },
      { kapasiteDk: 600, yukDk: 540, oran: 90 }, ...Array.from({ length: 7 }, () => bos)] },
    { istasyonId: 2, ad: 'Freze', makine: 1, takvimsizMakine: 1, hucreler: Array.from({ length: 16 }, () => ({ kapasiteDk: null, yukDk: 0, oran: null })) },
  ],
  darbogaz: { istasyonId: 1, ad: 'Torna', oran: 22.5 },
  kisiYukuDk: 90,
  zamaninda: { noktalar: [{ zaman: '2026-10-30T09:00:00.000Z', yuzde: 80, ewma: 80 }], ornek: 1, gereken: 20, uyari: null },
};

describe('planlama analizi (2151)', () => {
  it('biçimler ve doluluk eşikleri; kapasite yoksa boş, sıfır uydurulmaz', () => {
    expect(yuzdeMetni(null)).toBe('Veri yok');
    expect(saatMetni(90)).toBe('1,5 saat');
    expect(haftaEtiketi('2026-11-02')).toBe('02.11');
    expect(doluluk({ kapasiteDk: null, yukDk: 0, oran: null })).toBe('bos');
    expect(doluluk({ kapasiteDk: 100, yukDk: 84, oran: 84 })).toBe('rahat');
    expect(doluluk({ kapasiteDk: 100, yukDk: 85, oran: 85 })).toBe('dar');
    expect(doluluk({ kapasiteDk: 100, yukDk: 101, oran: 101 })).toBe('tasmis');
    expect(hucreAciklamasi({ kapasiteDk: null, yukDk: 0, oran: null }, true)).toContain('kapasite bilinmiyor');
    expect(hucreAciklamasi({ kapasiteDk: 600, yukDk: 300, oran: 50 }, true)).toBe('Planlı 5 saat / çalışma 10 saat');
  });

  it('darboğaz metni: dolu istasyon, yük yok ve takvim yok ayrılır', () => {
    expect(darbogazMetni(RAPOR)).toBe('Önümüzdeki 4 haftada %22,5 dolu: en yüklü istasyon.');
    expect(darbogazMetni({ ...RAPOR, darbogaz: null })).toContain('tezgâh yükü yok');
    expect(darbogazMetni({ ...RAPOR, darbogaz: null, istasyonlar: [RAPOR.istasyonlar[1]!] })).toBe('Çalışma takvimi olan tezgâh yok.');
  });

  it('eğilim metni: ölçüm yok, yetersiz veri, uyarı yönü', () => {
    const z = RAPOR.zamaninda;
    expect(egilimMetni({ ...z, noktalar: [], ornek: 0 })).toContain('henüz yok');
    expect(egilimMetni(z)).toContain('Yetersiz veri: 1 ölçüm var, uyarı için 20');
    expect(egilimMetni({ ...z, ornek: 25, uyari: 'dusus' })).toContain('Belirgin düşüş');
    expect(egilimMetni({ ...z, ornek: 25, uyari: null })).toContain('olağan');
  });

  it('sayfa: darboğaz, kişi yükü, doluluk tablosunda yüzde ve takvimsiz tezgâh notu', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(RAPOR as never);
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PlanAnalizi /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.getByText('Torna (1/2 takvimsiz)')).toBeTruthy();
    expect(screen.getByText('%110').getAttribute('data-doluluk')).toBe('tasmis');
    expect(screen.getByText('%90').getAttribute('data-doluluk')).toBe('dar');
    expect(screen.getByText('1,5 saat')).toBeTruthy();
    expect(screen.getAllByText(/Yetersiz veri/).length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith('/plan/analiz');
  });
});
