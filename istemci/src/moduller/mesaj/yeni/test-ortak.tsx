import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { YENI_EKRAN_ISLEMI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalar } from '../rotalar.tsx';
import { BEN, ORNEK_KISILER } from './ornek-veri.ts';

// Parçaların ortak test düzeni: belge deposunu bellekte taklit eden sunucu ve yeni ekranı açan yardımcı.

export const KAPILI: Kullanici = { id: Number(BEN), ad: 'Deneme Yönetici', islemler: ['sayfa.mesaj', 'mesaj.oku', 'mesaj.yaz', YENI_EKRAN_ISLEMI] };
export const KAPISIZ: Kullanici = { id: Number(BEN), ad: 'Deneme Yönetici', islemler: ['sayfa.mesaj', 'mesaj.oku', 'mesaj.yaz', 'mesaj.yonet'] };

// /mesaj/ben cevabı: yazma ve yönetici yetkisi oradan gelir (ekran yalnız gizler).
export const YAZAN = { yazabilir: true, yonetici: false };
export const OKUYAN = { yazabilir: false, yonetici: false };
export const YONETICI = { yazabilir: true, yonetici: true };

type Nesne = Record<string, unknown>;
export interface Yazma { yontem: string; yol: string; govde: Nesne }
export interface SahteSunucu {
  belgeler: Map<string, { veri: Nesne; surum: number }>;
  istekler: string[];
  yazmalar: Yazma[];
  // Başkasının yazmasını taklit eder: belge değişir, damga artar.
  disaridanYaz: (yol: string, veri: Nesne) => void;
  // Verilen yol için sunucu reddi (durum, ileti).
  reddet: (yol: string, durum: number, mesaj: string) => void;
}

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const nesneMi = (v: unknown): v is Nesne => v !== null && typeof v === 'object' && !Array.isArray(v);
function birlestir(hedef: Nesne, yama: Nesne): Nesne {
  const sonuc: Nesne = { ...hedef };
  for (const [k, v] of Object.entries(yama)) {
    const eski = sonuc[k];
    sonuc[k] = nesneMi(v) && nesneMi(eski) ? birlestir(eski, v) : v;
  }
  return sonuc;
}
const ust = (yol: string) => yol.split('/').slice(0, -1).join('/');
const son = (yol: string) => yol.split('/').pop() ?? '';

interface SunucuSecenegi {
  kullanici?: Kullanici;
  ben?: { yazabilir: boolean; yonetici: boolean };
  belgeler?: Record<string, Nesne>;
  kisiler?: { id: number; ad: string }[];
  // Başka uçlar (siparisler gibi) için cevap; null: 404.
  diger?: (yontem: string, yol: string, govde: unknown) => Response | null;
}

export function sunucuKur(s: SunucuSecenegi = {}): SahteSunucu {
  const kullanici = s.kullanici ?? KAPILI;
  const ben = s.ben ?? YONETICI;
  const belgeler = new Map(Object.entries(s.belgeler ?? {}).map(([yol, veri]) => [yol, { veri, surum: 1 }]));
  const istekler: string[] = [];
  const yazmalar: Yazma[] = [];
  const retler = new Map<string, { durum: number; mesaj: string }>();
  let damga = 1;
  const belgeCevabi = (yol: string) => {
    const b = belgeler.get(yol);
    return b ? { yol, kimlik: son(yol), veri: b.veri, surum: b.surum } : null;
  };
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const tam = new URL(adres.replace(/^\/api/, ''), 'http://yerel');
    const yol = tam.pathname;
    const yontem = secenek?.method ?? 'GET';
    const govde = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) as Nesne : {};
    istekler.push(`${yontem} ${yol}${tam.search}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/mesaj/ben') {
      return json(200, { kisi: { id: kullanici.id, ad: kullanici.ad }, ...ben, kurulumGerekli: false });
    }
    if (yontem === 'GET' && yol === '/mesaj/kisiler') return json(200, { kisiler: s.kisiler ?? ORNEK_KISILER });
    if (yontem === 'GET' && yol === '/mesaj/damga') return json(200, { damga });
    if (yontem === 'GET' && yol === '/mesaj/oda') return json(200, { esler: [] });
    if (yontem === 'GET' && yol === '/mesaj/sorgu') {
      const koleksiyon = tam.searchParams.get('koleksiyon') ?? '';
      const sira = JSON.parse(tam.searchParams.get('sira') ?? 'null') as { alan: string; yon: 'asc' | 'desc' } | null;
      const sinir = Number(tam.searchParams.get('sinir') ?? 1000);
      let liste = [...belgeler.keys()].filter((y) => ust(y) === koleksiyon).map((y) => belgeCevabi(y)).filter((b) => b !== null);
      if (sira) {
        const deger = (b: { veri: Nesne }) => Number(b.veri[sira.alan] ?? 0);
        liste = liste.sort((a, b) => (deger(a) - deger(b)) * (sira.yon === 'desc' ? -1 : 1));
      }
      return json(200, { belgeler: liste.slice(0, sinir), damga });
    }
    if (yontem === 'GET' && yol === '/mesaj/belge') return json(200, { belge: belgeCevabi(tam.searchParams.get('yol') ?? ''), damga });
    if (yontem === 'POST' && yol.startsWith('/mesaj/')) {
      const hedef = String(govde['yol'] ?? '');
      yazmalar.push({ yontem, yol, govde });
      const ret = retler.get(hedef);
      if (ret) return json(ret.durum, { kod: 'RED', mesaj: ret.mesaj });
      if (yol === '/mesaj/belge/yaz') {
        const eski = belgeler.get(hedef);
        if (govde['kip'] === 'birlestir' && !eski) return json(404, { kod: 'BULUNAMADI', mesaj: 'Kayıt bulunamadı.' });
        const veri = govde['kip'] === 'birlestir' && eski ? birlestir(eski.veri, govde['veri'] as Nesne) : govde['veri'] as Nesne;
        belgeler.set(hedef, { veri, surum: (eski?.surum ?? 0) + 1 });
        damga += 1;
        return json(200, { belge: belgeCevabi(hedef), damga });
      }
      if (yol === '/mesaj/belge/sil') { const silindi = belgeler.delete(hedef); damga += 1; return json(200, { silindi, damga }); }
      if (yol === '/mesaj/belge/kilitle') return json(200, { alindi: true, surum: belgeler.get(hedef)?.surum ?? null, bitis: null });
      if (yol === '/mesaj/ekler/yukle') return json(200, { id: 'a'.repeat(32), ad: govde['ad'], tur: govde['tur'], boyut: 3 });
    }
    const diger = s.diger?.(yontem, yol, govde) ?? null;
    if (diger) return diger;
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return {
    belgeler,
    istekler,
    yazmalar,
    disaridanYaz: (yol, veri) => { belgeler.set(yol, { veri, surum: (belgeler.get(yol)?.surum ?? 0) + 1 }); damga += 1; },
    reddet: (yol, durum, mesaj) => { retler.set(yol, { durum, mesaj }); },
  };
}

export function mesajAc(adres = '/mesaj/yeni') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}
