import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { DurumCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { ReceteRotaYeni } from './ReceteRotaYeni.tsx';

// Yeni Reçete ve Rota ekranı testlerinin ortak kurulumu (R1-R3 de kullanır). Kullanıcılar ve kayıtlar uydurmadır.
const kisi = (id: number, islemler: string[]): Kullanici => ({ id, ad: `Deneme ${id}`, islemler: islemler as Kullanici['islemler'] });
export const KAPI = 'kisiler.rol-yonet';
export const YONETICI = kisi(1, [KAPI, 'sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz', 'rota.yaz', 'rota.onayla', 'uretim-emirleri.yaz',
  'stok.statu-degistir', 'stok.sayim', 'istasyonlar.yaz', 'kisiler.yaz', 'finans.maliyet-oku']);
export const OKUYAN = kisi(2, [KAPI, 'sayfa.recete-rota', 'recete-rota.oku']);
export const SAYFASIZ = kisi(3, [KAPI]);
export const KAPISIZ = kisi(4, ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz']);

export const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
export interface Istek { yontem: string; yol: string; govde: unknown }

// En küçük bağlı durum: bir mamul, bir operasyon, bir iş merkezi, istasyon ve makine, bir taslak emir.
export function ornekDurum(): DurumCevabi {
  return {
    items: [{ id: '11', kayitNo: 11, code: 'MM-0001', name: 'Örnek mil', type: 'mamul', unit: 'adet', cost: null, stock: 4, min: null,
      aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }],
    units: [{ kod: 'adet', aktif: true }],
    opdefs: [{ id: '21', code: 'TOR', abbr: 'T', name: 'Tornalama', group: 'talasli', groupName: 'Talaşlı', stationId: '31', setup: 30, cycle: 5, aktif: true }],
    wcs: [{ id: '41', code: 'IM1', name: 'Talaşlı imalat', week: null, aktif: true }],
    stations: [{ id: '31', code: 'TZ1', name: 'Torna 1', wcId: '41', eff: null, opPer: null, count: 1, cost: null, aktif: true }],
    machines: [{ id: '51', code: 'M1', name: 'Torna makinesi', stationId: '31', status: 'aktif', aktif: true }],
    people: [],
    routes: {},
    routeRevs: [],
    fasonFirms: [],
    cal: { shifts: [], holidays: [] },
    emirler: {
      orders: [{ id: '61', kayitNo: 61, no: 'UE-0001', itemId: '11', qty: 10, start: null, due: '2026-11-02', priority: 2, note: null, rev: null,
        status: 'taslak', created: 0, doneAt: null, tur: 'seri', parentId: null, kol: null, birlestigiId: null, surum: 1 }],
      opStatus: {}, opProg: {},
    },
    calisanAdimlar: [],
    adimAdetleri: {},
    maliyet: null,
    settings: { rule: 'oncelik', dir: 'ileri', buffer: 0, freezeDays: 0, peopleLimit: false, planDrafts: false },
    statuses: [],
    moves: [],
    malzemeKesildi: false,
  };
}

export interface SunucuSecenegi {
  durum?: DurumCevabi | (() => Response);
  kayitlar?: KayitlarCevabi['kayitlar'];
  // Plan motorunun yerleşimi okunamaz (yetki ya da hata).
  motorYok?: boolean;
  yazmalar?: Record<string, (govde: unknown) => Response>;
}

// Okuma uçları örnek veriyle cevaplanır; sahiplerin kaynak okumaları 404 döner (köprü o koleksiyonu null bırakır). Yazmalar
// `yazmalar` tablosundan (yoksa 404). İstekler sırasıyla kaydedilir.
export function sunucuKur(kullanici: Kullanici, s: SunucuSecenegi = {}) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const tam = adres.replace('/api', '');
    const yol = tam.split('?')[0] ?? tam;
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) as unknown : undefined;
    istekler.push({ yontem, yol, govde });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET') {
      if (yol === '/recete-rota/durum') return typeof s.durum === 'function' ? s.durum() : json(200, s.durum ?? ornekDurum());
      if (yol === '/recete-rota/kayitlar') return json(200, { kayitlar: s.kayitlar ?? [] });
      if (yol === '/plan/motor-yerlesimi') {
        return s.motorYok ? json(403, { kod: 'YETKISIZ', mesaj: 'Yetkiniz yok.' })
          : json(200, { hesaplanma: '2026-10-23T08:00:00.000Z', ayar: { kural: 'oncelik', yon: 'ileri', tamponGun: 0 }, yerlesimler: [], yerlesmeyen: [],
            ekranYerlesimi: {}, uyarilar: [] });
      }
    }
    const isle = s.yazmalar?.[`${yontem} ${yol}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

export function rrAc(adres = '/recete-rota/yeni') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Routes>
            <Route path="/recete-rota/yeni" element={<ReceteRotaYeni />} />
            <Route path="/recete-rota/yeni/:bolum" element={<ReceteRotaYeni />} />
            <Route path="*" element={<p>Başka sayfa</p>} />
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return istemci;
}
