import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GeometriKalibrasyonCevabi, GeometriSureKatsayisi } from '#paylasilan/sozlesme/geometri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { asamaSatirlari, egriNoktalari, grupAdi, kalibreMetni, katsayiSatirlari, logEksen, olcumFarki } from './kalibrasyon.ts';
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
  gruplar: { malzeme, tezgah: 'ORN-CNC-02', islem: 'Frezeleme', geometri: 'prizmatik' }, disarida, disaridaNedeni: null,
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
    expect(within(carpan).getByText('Ortanca hata: başlangıç %33, düzeltilmiş %19.')).toBeTruthy();
  });

  it('yalnız okuyan kişide "Dışarıda bırak" yok; 5 parçadan az ise kalibresiz söylenir', async () => {
    sunucuKur({
      'GET /oturum': oturum(['sayfa.geometri', 'geometri.oku']),
      'GET /geometri/kalibrasyon': () => json(200, { ...KAL, asama: 'kalibresiz', n: 3, carpan: null, hataYuzde: null, aralik: null, gruplar: [], parcalar: KAL.parcalar.slice(0, 3) }),
    });
    ac();
    const egri = (await screen.findByRole('heading', { name: 'Kalibrasyon eğrisi' })).closest('section') as HTMLElement;
    expect(within(egri).getByText(/Ölçümle düzeltme 5 ölçülmüş parçadan sonra başlar; şimdi 3 parça, ölçümü eksik 4 parça\./)).toBeTruthy();
    fireEvent.click(within(egri).getByRole('button', { name: /^ORN-MIL-01:/ }));
    expect(within(egri).queryByRole('button', { name: 'Dışarıda bırak' })).toBeNull();
    expect(screen.getByText('Henüz çarpan yok; tahmin başlangıç katsayılarıyla.')).toBeTruthy();
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

// 3363: başlangıç katsayıları sekmesi.
const kat = (anahtar: string, deger: number, ek: Partial<GeometriSureKatsayisi> = {}): GeometriSureKatsayisi => ({
  anahtar, tur: anahtar.split('.')[0] as GeometriSureKatsayisi['tur'], deger, yerlesik: deger, iso: null, kaynak: 'kaynakli', dayanak: 'ORN dayanak', elle: null, ...ek,
});
const KATSAYILAR: GeometriSureKatsayisi[] = [
  kat('malzeme.kaba.metal/titanyum', 1.77, { iso: 'S', dayanak: 'Ti-6Al-4V işlenebilirlik %20' }),
  kat('malzeme.finis.metal/titanyum', 1.22, { iso: 'S', dayanak: 'Ti-6Al-4V işlenebilirlik %20' }),
  kat('malzeme.kaba.metal/aluminyum', 0.7, { iso: 'N', yerlesik: 0.58, elle: { deger: 0.7, not: 'ORN not', kisi: 'ORN-Kişi', zaman: '2026-11-17T06:00:00+03:00' } }),
  kat('malzeme.finis.metal/aluminyum', 0.75, { iso: 'N' }),
  kat('yuzey.3.2', 1), kat('yuzey.1.6', 1.41),
  kat('tolerans.genel', 1, { kaynak: 'tahmin' }), kat('tolerans.hassas', 1.1, { kaynak: 'tahmin' }),
  kat('kesme.pay', 0.7),
];

describe('Başlangıç katsayıları (3363)', () => {
  it('satırlar: malzeme sınıfı kaba ve finişle tek satır; elle değişen satır elle; ölçüm farkı yalnız %25 üstünde', () => {
    const s = katsayiSatirlari(KATSAYILAR, ['malzeme'], new Map([['metal/titanyum', 'Titanyum']]));
    expect(s.map((x) => [x.baslik, x.kaynak, x.katsayilar.length])).toEqual([['Titanyum', 'kaynakli', 2], ['metal/aluminyum', 'elle', 2]]);
    const g = [{ tur: 'malzeme' as const, anahtar: 'S', n: 9, carpan: 0.62, hataYuzde: 20, azVeri: true }, { tur: 'malzeme' as const, anahtar: 'N', n: 9, carpan: 1.1, hataYuzde: 10, azVeri: true }];
    expect(olcumFarki(s[0]!, g)?.yeni).toEqual([{ anahtar: 'malzeme.kaba.metal/titanyum', deger: 1.1 }, { anahtar: 'malzeme.finis.metal/titanyum', deger: 0.76 }]);
    expect(olcumFarki(s[1]!, g)).toBeNull();
    expect(katsayiSatirlari(KATSAYILAR, ['yuzey', 'tolerans'], new Map()).map((x) => [x.baslik, x.kaynak])).toEqual([['Yüzey (finiş)', 'kaynakli'], ['Tolerans (finiş, delik)', 'tahmin']]);
  });

  it('sekme: tablolar ve kaynak rozeti; düzenle ve kaydet satırın değerlerini yazar; elle satırda yerleşiğe dön; okuyan düğme görmez', async () => {
    const yazilan: unknown[] = [];
    const istekler = sunucuKur({
      'GET /oturum': oturum(['sayfa.geometri', 'geometri.oku', 'geometri.kalibrasyon']),
      'GET /geometri/kalibrasyon': () => json(200, { ...KAL, gruplar: [{ tur: 'malzeme', anahtar: 'S', n: 9, carpan: 0.62, hataYuzde: 20, azVeri: true }] }),
      'GET /geometri/sure-katsayilari': () => json(200, { katsayilar: KATSAYILAR }),
      'POST /geometri/sure-katsayilari/yaz': (g) => { yazilan.push(g); return json(200, { katsayilar: KATSAYILAR }); },
      'POST /geometri/sure-katsayilari/yerlesige-don': (g) => { yazilan.push(g); return json(200, { katsayilar: KATSAYILAR }); },
    });
    ac();
    fireEvent.click(await screen.findByRole('tab', { name: /Başlangıç katsayıları/ }));
    const malzeme = (await screen.findByRole('heading', { name: 'Malzeme' })).closest('section') as HTMLElement;
    expect(within(malzeme).getByRole('row', { name: /Ölçüm farklı: S · Süper alaşım ×0,62 \(9 parça\)/ })).toBeTruthy();
    fireEvent.click(within(malzeme).getByRole('button', { name: /Bu çarpanla güncelle/ }));
    await vi.waitFor(() => { expect(yazilan).toHaveLength(1); });
    expect(yazilan[0]).toEqual({ degerler: [{ anahtar: 'malzeme.kaba.metal/titanyum', deger: 1.1 }, { anahtar: 'malzeme.finis.metal/titanyum', deger: 0.76 }], not: 'Ölçümle güncellendi: S · Süper alaşım ×0,62, 9 parça' });
    fireEvent.click(within(malzeme).getByRole('button', { name: /: yerleşiğe dön$/ }));
    await vi.waitFor(() => { expect(yazilan).toHaveLength(2); });
    expect(yazilan[1]).toEqual({ anahtarlar: ['malzeme.kaba.metal/aluminyum'] });
    const tasarim = screen.getByRole('heading', { name: 'Tasarım' }).closest('section') as HTMLElement;
    fireEvent.click(within(tasarim).getByRole('button', { name: 'Tolerans (finiş, delik): düzenle' }));
    fireEvent.change(within(tasarim).getByLabelText('Hassas ±0,05'), { target: { value: '1,2' } });
    fireEvent.click(within(tasarim).getByRole('button', { name: 'Kaydet' }));
    await vi.waitFor(() => { expect(yazilan).toHaveLength(3); });
    expect(yazilan[2]).toEqual({ degerler: [{ anahtar: 'tolerans.hassas', deger: 1.2 }], not: null });
    expect(istekler.filter((x) => x.startsWith('POST'))).toHaveLength(3);
  });

  it('yalnız okuyan kişi tabloyu ve ölçüm farkını görür; düzenleme ve "Bu çarpanla güncelle" düğmesi yok', async () => {
    sunucuKur({
      'GET /oturum': oturum(['sayfa.geometri', 'geometri.oku']),
      'GET /geometri/kalibrasyon': () => json(200, { ...KAL, gruplar: [{ tur: 'malzeme', anahtar: 'S', n: 9, carpan: 0.62, hataYuzde: 20, azVeri: true }] }),
      'GET /geometri/sure-katsayilari': () => json(200, { katsayilar: KATSAYILAR }),
    });
    ac();
    fireEvent.click(await screen.findByRole('tab', { name: /Başlangıç katsayıları/ }));
    const malzeme = (await screen.findByRole('heading', { name: 'Malzeme' })).closest('section') as HTMLElement;
    expect(within(malzeme).getAllByText('Elle').length).toBeGreaterThan(0);
    expect(within(malzeme).getByRole('row', { name: /Ölçüm farklı: S · Süper alaşım ×0,62 \(9 parça\)/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /düzenle$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bu çarpanla güncelle/ })).toBeNull();
  });
});

