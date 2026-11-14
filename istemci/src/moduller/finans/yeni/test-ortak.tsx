import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { SayfaKomutBaglami, type SayfaKomutu, type SayfaKomutYazici } from '../../../ortak/rota/sayfa-komutlari.ts';
import type { FinansHamVerisi } from './donustur.ts';
import { rotalar } from '../rotalar.tsx';
import { ornekHamVeri } from './ornek-ham-veri.ts';
import { LISTELER } from './veri.ts';

// Yeni finans ekranı testlerinin ortak kurulumu (F1-F4 de kullanır). Kullanıcılar uydurmadır.
const kisi = (id: number, islemler: string[]): Kullanici => ({ id, ad: `Deneme ${id}`, islemler: islemler as Kullanici['islemler'] });
// Yeni ekran kapısı (kisiler.rol-yonet) yoktur: hiçbirinde kapı işlemi bulunmaz.
export const YAZAN = kisi(1, ['sayfa.finans', 'finans.oku', 'finans.yaz', 'musteri-tedarikci.oku']);
export const YONETEN = kisi(5, ['sayfa.finans', 'finans.oku', 'finans.yaz', 'finans.iptal', 'finans.cek-yonet', 'finans.hesap-yonet', 'finans.oran-yaz', 'finans.sabit-kiymet', 'finans.maliyet-yaz', 'finans.duzenli-odeme', 'finans.ayar', 'musteri-tedarikci.oku']);
export const OKUYAN = kisi(2, ['sayfa.finans', 'finans.oku', 'musteri-tedarikci.oku']);
export const FIRMACI = kisi(3, ['sayfa.finans', 'musteri-tedarikci.oku']);
// Sayfa işlemi var, hiçbir menü maddesinin işlemi yok.
export const BOLUMSUZ = kisi(4, ['sayfa.finans', 'finans.yaz']);

// Kabuğun tuttuğu son "Bu sayfa" listesi (kaynak başına).
export function komutToplayici(): { yaz: SayfaKomutYazici; liste: (kaynak?: string) => readonly SayfaKomutu[] } {
  const kayit = new Map<string, readonly SayfaKomutu[]>();
  return {
    yaz: (kaynak, komutlar) => { if (komutlar === null) kayit.delete(kaynak); else kayit.set(kaynak, komutlar); },
    liste: (kaynak = 'finans') => kayit.get(kaynak) ?? [],
  };
}

export const ORNEK_KUR_CIFTLERI = [{ paraBirimi: 'EUR', tarih: '2026-10-01', alis: '36.000000', satis: '36.200000', surum: 1 }];
export const ORNEK_ORANLAR = [
  { id: 2, tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-01', yillikYuzde: '42.0000', not: null, olusturma: '2026-10-01T07:00:00.000Z' },
  { id: 1, tur: 'mevduat', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-08-01', yillikYuzde: '35.0000', not: 'stopaj sonrası', olusturma: '2026-08-01T07:00:00.000Z' },
];
const ornekOranOzeti = () => ({
  bugun: '2026-10-20',
  kurlar: ORNEK_KUR_CIFTLERI.map((k) => ({ ...k, oncekiAlis: null, oncekiSatis: null, girenAd: 'Deneme', giris: '2026-10-01T07:00:00.000Z' })),
  faizler: ORNEK_ORANLAR.map(({ id: _id, olusturma, ...f }) => ({ ...f, oncekiYillikYuzde: null, girenAd: 'Deneme', giris: olusturma })),
  sonGiris: null, gecmis: [],
});
export const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
export interface Istek { yontem: string; yol: string; govde: unknown }

// Finansın okuma uçları örnek veriyle cevaplanır; yazmalar `yazmalar` tablosundan (yoksa 404). İstekler sırasıyla kaydedilir.
export function sunucuKur(kullanici: Kullanici, yazmalar: Record<string, (govde: unknown) => Response> = {}, ham: FinansHamVerisi = ornekHamVeri()) {
  const istekler: Istek[] = [];
  const listeler = new Map<string, unknown[]>(Object.entries(LISTELER).map(([ad, yol]) => [yol, ham[ad as keyof typeof LISTELER] as unknown[]]));
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const tam = adres.replace('/api', '');
    const yol = tam.split('?')[0] ?? tam;
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET') {
      const satirlar = listeler.get(yol);
      if (satirlar) return json(200, { satirlar, toplam: satirlar.length, sayfaBoyu: 200 });
      if (yol === '/finans/ayar') return json(200, { ayar: ham.ayar });
      if (yol === '/finans/amortisman') return json(200, { aylar: ham.amortisman });
      if (yol === '/finans/kur-ozeti') return json(200, ham.kurOzeti);
      // 2238: kur çifti ve oran matrisi (değerler uydurmadır).
      if (yol === '/finans/kur-ciftleri') return json(200, { satirlar: ORNEK_KUR_CIFTLERI, toplam: ORNEK_KUR_CIFTLERI.length, sayfaBoyu: 200 });
      if (yol === '/finans/oranlar') return json(200, { satirlar: ORNEK_ORANLAR, toplam: ORNEK_ORANLAR.length, sayfaBoyu: 200 });
      if (yol === '/finans/oran-ozeti') return json(200, ornekOranOzeti());
      if (yol === '/finans/beklenen-odemeler') return json(200, { odemeler: ham.beklenenOdemeler });
      if (yol === '/kurum') return json(200, { ad: ham.sirketAdi ?? '' });
    }
    const isle = yazmalar[`${yontem} ${yol}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

// Uygulamadaki gibi modülün bütün rotaları kurulur (menü adresleri ve deneme adresinin yönlendirmesi); açık adres sayfada yazılır.
function Adres() {
  const { pathname, search } = useLocation();
  return <span hidden data-testid="adres">{pathname + search}</span>;
}
// komutlar: kabuğun yerine Ctrl K "Bu sayfa" listesini toplayan yazıcı (verilmezse komutlar düşer).
export function finansAc(adres = '/finans', komutlar: SayfaKomutYazici | null = null) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <SayfaKomutBaglami.Provider value={komutlar}>
          <MemoryRouter initialEntries={[adres]}>
            <Routes>
              {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
              <Route path="*" element={<p>Başka sayfa</p>} />
            </Routes>
            <Adres />
          </MemoryRouter>
        </SayfaKomutBaglami.Provider>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return istemci;
}
