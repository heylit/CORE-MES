import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GeometriAnalizCevabi, GeometriHamCevabi, GeometriModelListeCevabi, GeometriSureCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { rotalar } from './rotalar.tsx';

// Süre kartı (3278 D): kalibresiz aralık ve kalemler, ISO seçimi (kaydedilmez), ham önizlemesi, rotadaki talaşlı adımlar (yalnız okuma).
vi.mock('./Goruntu3B.tsx', () => ({
  default: ({ onizleme }: { onizleme?: { etiket: string } | null }) => (
    <>
      <div>görüntü</div>
      {onizleme ? <div>{`önizleme: ${onizleme.etiket}`}</div> : null}
    </>
  ),
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
function sunucuKur(yollar: Record<string, () => Response>) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const anahtar = `${secenek?.method ?? 'GET'} ${adres.replace('/api', '')}`;
    istekler.push(anahtar);
    const isle = yollar[anahtar];
    return isle ? isle() : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={['/geometri/sure?rev=41']}>
          <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const LISTE: GeometriModelListeCevabi = {
  satirlar: [{ malzemeNo: 7, malzemeKodu: 'ORN-FLANS-01', malzemeAdi: 'Örnek flanş', belgeId: 3, belgeAdi: 'Model flans.step', revizyonId: 41, harf: 'B', revKodu: 'B', dosyaTuru: 'step', durum: 'bitti', hataMetni: null }],
  toplam: 1, sayfa: 1, sayfaBoyu: 50,
};
const ANALIZ: GeometriAnalizCevabi = {
  revizyonId: 41, belgeId: 3, dosyaTuru: 'step', durum: 'bitti',
  is: { durum: 'bitti', denemeSayisi: 1, hataMetni: null, olusturma: '2026-11-15T09:00:00+03:00', baslama: '2026-11-15T09:00:01+03:00', bitis: '2026-11-15T09:00:02+03:00', surum: 3 },
  analiz: {
    motor: 'occt-import-js@0.0.23', kutu: { x: 80, y: 60, z: 25 }, obb: { a: 80, b: 60, c: 25, cap: 103, yon: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    hacimMm3: 82400, alanMm2: 21400, govdeSayisi: 1, kapali: true, ucgenSayisi: 84, hesapSuresiMs: 200, hesapZamani: '2026-11-15T09:00:02+03:00', yuzler: null,
  },
};
const HAM: GeometriHamCevabi = {
  revizyonId: 41, payMm: 2, payKaynagi: 'ayar', enAz: { a: 84, b: 64, c: 29 }, kaliteler: ['S235'], neden: null, kesmeMm: 3, donel: null, formlar: [], rotaMalzemesi: null,
  oneriler: [{
    malzemeNo: 90, kod: 'ORN-LAMA-90x30', ad: 'Örnek lama', kalite: 'S235', form: 'lama', olcu: { a: 90, b: 30, l: 6000 }, aile: null, kaliteKodu: null,
    yogunluk: null, kesimBoyuMm: 70, hamHacimMm3: 189000, kesimEnMm: null, eksen: 'a' as const,
  }],
};
const SURE: GeometriSureCevabi = {
  revizyonId: 41, oneri: true, kalibre: false, iso: 'P', isoKaynagi: 'varsayilan', payMm: 2, payKaynagi: 'ayar', hamKaynagi: 'stok', hamKodu: 'ORN-LAMA-90x30',
  sinif: null, sinifIso: null, kc: { degerNmm2: 1950, kc1: null, mc: null, hmMm: null, kaynak: 'iso' }, tezgah: { gucKw: 7.5, kaynak: 'varsayilan', makineKod: null }, hamFormu: 'lama',
  hamHacimMm3: 189000, parcaHacimMm3: 82400, talasMm3: 106600,
  kalemler: [
    { kalem: 'kaba', altDk: 0.5, ustDk: 1.8, adet: null },
    { kalem: 'finis', altDk: 2.7, ustDk: 10.7, adet: null },
    { kalem: 'delik', altDk: 0.9, ustDk: 1.9, adet: 8 },
  ],
  altDk: 4.1, ortaDk: 7.7, ustDk: 14.4, ozellikOkundu: true, neden: null,
  rota: {
    durum: 'bagli', islemToplamDk: 6, olcumToplamDk: 11.8, eksik: true,
    adimlar: [
      { opNo: 20, ad: 'Freze 1. bağlama', islemDk: 6, olcumOrtancaDk: 11.8, olcumAdedi: 5 },
      { opNo: 30, ad: 'Freze 2. bağlama', islemDk: null, olcumOrtancaDk: null, olcumAdedi: 0 },
    ],
  },
};
const temel = (sure: (iso: string) => Response) => ({
  'GET /geometri/modeller?sayfa=1': () => json(200, LISTE),
  'GET /geometri/analizler/41': () => json(200, ANALIZ),
  'GET /geometri/modeller/41/dosya': () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
  'GET /geometri/ham-onerisi/41': () => json(200, HAM),
  'GET /geometri/sure-tahmini/41': () => sure('P'),
  'GET /geometri/sure-tahmini/41?iso=N': () => sure('N'),
  'GET /oturum': () => json(200, { kullanici: { id: 9, kullaniciAdi: 'deneme', adSoyad: 'Deneme', roller: [], islemler: [] } }),
});
const kart = async () => (await screen.findByRole('heading', { name: 'Kaba süre (öneri)' })).closest('section') as HTMLElement;

describe('3D Atölyesi süre kartı (3278 D)', () => {
  it('aralık, olası değer, kalemler ve ham; önizlemede ham; rotadaki talaşlı adımlar ve toplamlar; ISO değişince yeniden sorar', async () => {
    const istekler = sunucuKur(temel((iso) => json(200, iso === 'P' ? SURE : { ...SURE, iso: 'N', isoKaynagi: 'istek', altDk: 1.9, ortaDk: 3.4, ustDk: 6.1 })));
    ac();
    const k = await kart();
    expect(within(k).getByText('Kalibresiz')).toBeTruthy();
    expect(await within(k).findByText('4 – 14 dk')).toBeTruthy();
    expect(within(k).getByText('olası ≈ 7,7 dk / parça')).toBeTruthy();
    expect(within(k).getByText('Kaba (talaş 106,6 cm³)')).toBeTruthy();
    expect(within(k).getByText('Finiş (yüzey 214 cm²)')).toBeTruthy();
    expect(within(k).getByText('Delik (8 adet)')).toBeTruthy();
    expect(within(k).getByText('2,7 – 10,7 dk')).toBeTruthy();
    const ham = await within(k).findByRole('link', { name: 'ORN-LAMA-90x30 · Lama / kare 90 x 30 x 6.000 mm, kesim 70 mm' });
    expect(ham.getAttribute('href')).toBe('/geometri/ham?rev=41');
    expect(within(k).getByText((_, e) => e?.tagName === 'DD' && e.textContent === '106,6 cm³ · %56')).toBeTruthy();
    expect(await screen.findByText('önizleme: Lama / kare 90 x 30 x 6.000 mm, talaş aradaki hacim (yaklaşık)')).toBeTruthy();
    const rota = within(k).getByRole('region', { name: 'Rotadaki talaşlı adımlar' });
    expect(within(rota).getByText('OP20 Freze 1. bağlama')).toBeTruthy();
    expect(within(rota).getByText('süre yok')).toBeTruthy();
    expect(within(rota).getByText('11,8 dk (5)')).toBeTruthy();
    expect(within(rota).getByText('İşlem süresi girilmemiş adım toplama katılmadı.')).toBeTruthy();
    expect(within(rota).getByText('11,8 dk · eksik (1 / 2)')).toBeTruthy();
    expect(within(rota).getByText('Ölçüm toplamı yalnız ölçülen adımlarındır; rota toplamıyla karşılaştırılmaz.')).toBeTruthy();
    expect(within(k).getByText('Malzeme grubu (ISO) · malzeme seçilmedi, Çelik varsayıldı')).toBeTruthy();
    expect(within(k).getByText('iş mili 7,5 kW (varsayılan; rotada talaşlı tezgâh yok)')).toBeTruthy();
    expect(within(k).getByText(/P grubunun ortalaması/)).toBeTruthy();
    expect(within(k).getByRole('button', { name: 'P · Çelik' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(k).getByRole('button', { name: 'N · Alüminyum' }));
    expect(await within(k).findByText('1,9 – 6,1 dk')).toBeTruthy();
    expect(istekler).toContain('GET /geometri/sure-tahmini/41?iso=N');
    expect(istekler.some((i) => i.startsWith('POST'))).toBe(false);
  });

  it('3321-2: malzeme rotadaki hammaddeden; ham o kaliteyle, süre sınıfla sorulur; ISO kaliteden, elle değişir ve geri alınır; tezgâh demirbaştan', async () => {
    const C45: GeometriSureCevabi = {
      ...SURE, isoKaynagi: 'sinif', sinif: 'metal/islah', sinifIso: 'P', kc: { degerNmm2: 3302, kc1: 1900, mc: 0.24, hmMm: 0.1, kaynak: 'kienzle' },
      tezgah: { gucKw: 11, kaynak: 'demirbas', makineKod: 'ORN-CNC-02' },
    };
    const rotali = { ...HAM, rotaMalzemesi: { malzemeNo: 12, kod: 'ORN-HM-0012', kalite: 'C45', aile: 'metal', sinif: null, kaliteKodu: 'C45', opNo: 20 } };
    const istekler = sunucuKur({
      ...temel(() => json(200, SURE)),
      'GET /geometri/ham-onerisi/41': () => json(200, rotali),
      'GET /geometri/ham-onerisi/41?kalite=C45': () => json(200, rotali),
      'GET /geometri/sure-tahmini/41?kalite=C45&sinif=metal%2Fislah': () => json(200, C45),
      'GET /geometri/sure-tahmini/41?kalite=C45&sinif=metal%2Fislah&iso=M': () => json(200, { ...C45, iso: 'M', isoKaynagi: 'istek', kc: { degerNmm2: 1970, kc1: null, mc: null, hmMm: null, kaynak: 'iso' } }),
    });
    ac();
    const k = await kart();
    // İlk süre isteği iki adımlı ham sorgusunu ve Malzemeler kalite tablosunun yüklenmesini bekler (koşu yükünde 1 sn'yi aşabiliyor).
    expect(await within(k).findByText('Malzeme grubu (ISO) · C45 kalitesinden', undefined, { timeout: 5000 })).toBeTruthy();
    expect(within(k).getByRole('link', { name: 'C45' }).getAttribute('href')).toBe('/geometri/ham?rev=41');
    expect(within(k).getByText(/Islah.*rotadaki hammaddeden/)).toBeTruthy();
    expect(within(k).getByText('ORN-CNC-02 · iş mili 11 kW (demirbaş kartından)')).toBeTruthy();
    expect(within(k).getByText(/kc ≈ 3.302 N\/mm²/)).toBeTruthy();
    expect(within(k).getByText(/Kienzle: kc1 1.900 N\/mm², mc 0,24, talaş kalınlığı 0,1 mm/)).toBeTruthy();
    expect(istekler).not.toContain('GET /geometri/sure-tahmini/41');
    fireEvent.click(within(k).getByRole('button', { name: 'M · Paslanmaz' }));
    expect(await within(k).findByText('Malzeme grubu (ISO) · elle seçildi (kaliteden: P)')).toBeTruthy();
    expect(within(k).getByText(/M grubunun ortalaması/)).toBeTruthy();
    fireEvent.click(within(k).getByRole('button', { name: 'Kaliteden al (P)' }));
    expect(await within(k).findByText('Malzeme grubu (ISO) · C45 kalitesinden')).toBeTruthy();
  });

  it('neden varsa süre yazılmaz, ham ve rota yine görünür; yürürlükte rota yoksa söyler; tanıma yoksa delik notu', async () => {
    sunucuKur(temel(() => json(200, {
      ...SURE, neden: 'talas-yok', talasMm3: null, kalemler: [], altDk: null, ortaDk: null, ustDk: null, parcaHacimMm3: 200000,
      rota: { durum: 'rota-yok', adimlar: [], islemToplamDk: null, olcumToplamDk: null, eksik: false },
    })));
    ac();
    const k = await kart();
    expect(await within(k).findByText('Parça hamdan küçük değil; talaş yok, süre hesaplanmaz.')).toBeTruthy();
    expect(within(k).queryByText(/olası/)).toBeNull();
    expect(within(k).getByText('Yürürlükte rota yok.')).toBeTruthy();
    expect(within(k).getByText('189 cm³')).toBeTruthy();
  });

  it('rota bağlı değilse rota bölümü yok; kutu hamında önizleme yok, en az ham yazılır', async () => {
    sunucuKur(temel(() => json(200, {
      ...SURE, hamKaynagi: 'kutu', hamKodu: null, hamHacimMm3: 155904, kesimEnMm: null, eksen: 'a' as const, talasMm3: 73504, ozellikOkundu: false, kalemler: SURE.kalemler.slice(0, 2),
      rota: { durum: 'rota-bagli-degil', adimlar: [], islemToplamDk: null, olcumToplamDk: null, eksik: false },
    })));
    ac();
    const k = await kart();
    expect(await within(k).findByRole('link', { name: 'En az ham (kutu + pay): 84 x 64 x 29 mm' })).toBeTruthy();
    expect(within(k).getByText('Özellikler henüz okunmadı; delik süresi yok.')).toBeTruthy();
    expect(within(k).queryByRole('region', { name: 'Rotadaki talaşlı adımlar' })).toBeNull();
    await waitFor(() => expect(screen.queryByText(/^önizleme:/)).toBeNull());
  });
});
