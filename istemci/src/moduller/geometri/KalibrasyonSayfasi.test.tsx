import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GeometriKalibrasyonCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { asamaSatirlari, egriNoktalari, grupAdi, kalibreMetni, logEksen } from './kalibrasyon.ts';
import { rotalar } from './rotalar.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
function sunucuKur(yollar: Record<string, (govde: unknown) => Response>) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const anahtar = `${secenek?.method ?? 'GET'} ${adres.replace('/api', '')}`;
    istekler.push(anahtar);
    const isle = yollar[anahtar];
    return isle ? isle(typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : null) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={['/geometri/kalibrasyon']}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}
const oturum = (islemler: string[]) => () => json(200, { kullanici: { id: 9, kullaniciAdi: 'deneme', adSoyad: 'Deneme', roller: [], islemler } });

const parca = (malzemeNo: number, kod: string, malzeme: string | null, tahminDk: number, olcumDk: number, disarida = false) => ({
  malzemeNo, kod, ad: null, revizyonId: malzemeNo * 10, tahminDk, olcumDk, kalibreDk: tahminDk * 1.3,
  gruplar: { malzeme, tezgah: 'ORN-CNC-02', islem: 'Frezeleme' }, disarida, disaridaNedeni: null,
});
const KAL: GeometriKalibrasyonCevabi = {
  asama: 'grup', esikler: { tek: 5, grup: 20, regresyon: 40 }, n: 21, disarida: 1, olcumuEksik: 4, carpan: 1.31, hataYuzde: 19, kalibresizHataYuzde: 33,
  aralik: { altLn: -0.2, ustLn: 0.25, genis: false }, regresyon: null,
  gruplar: [
    { tur: 'malzeme', anahtar: 'N', n: 6, carpan: 1.24, hataYuzde: 21, azVeri: true },
    { tur: 'malzeme', anahtar: 'P', n: 15, carpan: 1.28, hataYuzde: 16, azVeri: true },
    { tur: 'tezgah', anahtar: 'ORN-CNC-02', n: 21, carpan: 1.22, hataYuzde: 17, azVeri: false },
    { tur: 'islem', anahtar: 'Frezeleme', n: 21, carpan: 1.35, hataYuzde: 18, azVeri: false },
  ],
  parcalar: [parca(1, 'ORN-MIL-01', 'P', 4.1, 5), parca(2, 'ORN-MIL-02', 'P', 8, 11), parca(3, 'ORN-KAP-01', 'N', 2, 2.4), parca(4, 'ORN-MIL-04', 'P', 3, 14, true)],
};

describe('Süre kalibrasyonu sayfası (3321-3)', () => {
  it('eğri, malzeme grubu çipleri, çarpanlar tablosu; noktadan "Dışarıda bırak" yazar ve tablo geri çizilir', async () => {
    const istekler = sunucuKur({
      'GET /oturum': oturum(['sayfa.geometri', 'geometri.oku', 'geometri.kalibrasyon']),
      'GET /geometri/kalibrasyon': () => json(200, KAL),
      'POST /geometri/kalibrasyon/1/disarida-birak': () => json(200, {
        ...KAL, n: 20, disarida: 2, parcalar: KAL.parcalar.map((p) => (p.malzemeNo === 1 ? { ...p, disarida: true } : p)),
      }),
    });
    ac();
    const egri = (await screen.findByRole('heading', { name: 'Kalibrasyon eğrisi' })).closest('section') as HTMLElement;
    expect(within(egri).getByText('21 parça')).toBeTruthy();
    expect(within(egri).getByText('Aşama: Grup ve tezgâh çarpanı')).toBeTruthy();
    expect(within(egri).getAllByRole('button', { name: /^ORN-/ })).toHaveLength(4);
    fireEvent.click(within(egri).getByRole('button', { name: 'N · Alüminyum · 6' }));
    expect(within(egri).getAllByRole('button', { name: /^ORN-/ }).map((b) => b.getAttribute('aria-label'))).toEqual(['ORN-KAP-01: tahmin 2,6 dk, gerçekleşen 2,4 dk']);
    fireEvent.click(within(egri).getByRole('button', { name: 'Düzeltme öncesi' }));
    expect(within(egri).getByRole('button', { name: 'ORN-KAP-01: tahmin 2 dk, gerçekleşen 2,4 dk' })).toBeTruthy();
    fireEvent.click(within(egri).getByRole('button', { name: /^Genel · 21$/ }));
    expect(within(egri).getByRole('button', { name: 'ORN-MIL-04: tahmin 3 dk, gerçekleşen 14 dk, dışarıda' })).toBeTruthy();
    fireEvent.click(within(egri).getByRole('button', { name: /^ORN-MIL-01:/ }));
    fireEvent.click(within(egri).getByRole('button', { name: 'Dışarıda bırak' }));
    expect(await within(egri).findByRole('button', { name: 'Geri al' })).toBeTruthy();
    expect(istekler).toContain('POST /geometri/kalibrasyon/1/disarida-birak');
    fireEvent.click(within(egri).getByRole('button', { name: 'Tablo olarak göster' }));
    expect(within(egri).getAllByRole('row')).toHaveLength(5);
    const carpan = (await screen.findByRole('heading', { name: 'Çarpanlar' })).closest('section') as HTMLElement;
    expect(within(carpan).getAllByRole('row').slice(1).map((r) => r.textContent)).toEqual([
      'GenelGenel · Tüm parçalar20×1,31%19taban', 'MalzemeMalzeme · N · Alüminyum6×1,24%21az veri', 'MalzemeMalzeme · P · Çelik15×1,28%16az veri',
      'TezgâhTezgâh · ORN-CNC-0221×1,22%17kendi eğrisi', 'İşlemİşlem · Frezeleme21×1,35%18kendi eğrisi',
    ]);
    expect(within(carpan).getByText('Ortanca hata: kalibresiz %33, düzeltilmiş %19.')).toBeTruthy();
  });

  it('yalnız okuyan kişide "Dışarıda bırak" yok; 5 parçadan az ise kalibresiz söylenir', async () => {
    sunucuKur({
      'GET /oturum': oturum(['sayfa.geometri', 'geometri.oku']),
      'GET /geometri/kalibrasyon': () => json(200, { ...KAL, asama: 'kalibresiz', n: 3, carpan: null, hataYuzde: null, aralik: null, gruplar: [], parcalar: KAL.parcalar.slice(0, 3) }),
    });
    ac();
    const egri = (await screen.findByRole('heading', { name: 'Kalibrasyon eğrisi' })).closest('section') as HTMLElement;
    expect(within(egri).getByText(/Kalibrasyon 5 ölçülmüş parçadan sonra başlar; şimdi 3 parça, ölçümü eksik 4 parça\./)).toBeTruthy();
    fireEvent.click(within(egri).getByRole('button', { name: /^ORN-MIL-01:/ }));
    expect(within(egri).queryByRole('button', { name: 'Dışarıda bırak' })).toBeNull();
    expect(screen.getByText('Henüz çarpan yok; tahmin kalibresiz.')).toBeTruthy();
  });
});

describe('kalibrasyon gösterim kuralları (3321-3)', () => {
  it('aşama satırları: geçilen, şimdiki ve kalan parça', () => {
    expect(asamaSatirlari('tek', 12, { tek: 5, grup: 20, regresyon: 40 }).map((s) => [s.durum, s.eksik]))
      .toEqual([['gecti', 0], ['simdi', 0], ['bekliyor', 8], ['bekliyor', 28]]);
    expect(asamaSatirlari('kalibresiz', 0, { tek: 5, grup: 20, regresyon: 40 })[0]?.kosul).toBe('5 parçadan az');
  });
  it('log eksen 1-3-10 basamakları değerleri kapsar; boşta 1-10', () => {
    expect(logEksen([1.4, 22])).toEqual({ alt: 1, ust: 30, isaretler: [1, 3, 10, 30] });
    expect(logEksen([0.4, 2])).toEqual({ alt: 0.3, ust: 3, isaretler: [0.3, 1, 3] });
    expect(logEksen([])).toEqual({ alt: 1, ust: 10, isaretler: [1, 3, 10] });
    expect(logEksen([5, 5])).toEqual({ alt: 3, ust: 10, isaretler: [3, 10] });
  });
  it('eğri noktaları seçili gruptan; sonra kipinde düzeltilmiş tahmin; grup adı ISO adıyla', () => {
    const n = egriNoktalari(KAL.parcalar, { malzeme: 'P', tezgah: null, islem: null }, 'sonra');
    expect(n.map((x) => [x.parca.kod, x.x])).toEqual([['ORN-MIL-01', 4.1 * 1.3], ['ORN-MIL-02', 8 * 1.3], ['ORN-MIL-04', 3 * 1.3]]);
    expect(egriNoktalari(KAL.parcalar, { malzeme: null, tezgah: 'YOK', islem: null }, 'once')).toEqual([]);
    const tornali = [...KAL.parcalar, { ...KAL.parcalar[0]!, malzemeNo: 9, kod: 'ORN-TOR-01', gruplar: { ...KAL.parcalar[0]!.gruplar, islem: 'Tornalama' } }];
    expect(egriNoktalari(tornali, { malzeme: null, tezgah: null, islem: 'Tornalama' }, 'once').map((x) => x.parca.kod)).toEqual(['ORN-TOR-01']);
    expect(egriNoktalari(tornali, { malzeme: null, tezgah: null, islem: 'Frezeleme' }, 'once')).toHaveLength(4);
    expect([grupAdi('malzeme', 'S'), grupAdi('tezgah', 'ORN-CNC-02')]).toEqual(['S · Süper alaşım', 'ORN-CNC-02']);
  });
  it('kalibre aralık cümlesi: 9 parçadan az geniş, değilse %80', () => {
    const k = { asama: 'tek' as const, n: 6, carpan: 1.3, altDk: 1, ortaDk: 2, ustDk: 3, hataYuzde: 10, regresyon: false };
    expect(kalibreMetni({ ...k, genis: true })).toBe('Kalibre aralık: ölçülmüş 6 parçanın hepsi bu aralıkta kaldı (parça az, aralık geniş).');
    expect(kalibreMetni({ ...k, n: 12, genis: false })).toBe("Kalibre aralık: ölçülmüş 12 parçanın %80'i bu aralıkta kaldı.");
  });
});
