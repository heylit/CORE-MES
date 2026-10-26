import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { ArkonKisi, ArkonRolu } from '#paylasilan/sozlesme/arkon.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { CerceveSayacBaglami, type CerceveSayacYazici } from '../../../ortak/rota/cerceve-sayaclari.ts';
import { YENI_EKRAN_ISLEMI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalar } from '../rotalar.tsx';
import { SAYFA_DISI, sayfaAdresi, sekmeMaddeleri } from './sayfalar.ts';

// Yeni Arkon ekranının ekran testleri için ortak kurulum (A0 ve parçalar kullanır). TMI uçları sahte fetch'le cevaplanır;
// belgeler `belgeler` ile, kayıtlar `kayitlar` ile verilir. Kişi adları uydurmadır.

export interface Deneme { kullanici: Kullanici; rol: ArkonRolu; istasyon?: string | null }

const ARKON_HEPSI: Islem[] = ['sayfa.arkon', 'sayfa.uretim-terminali', 'sayfa.kuyruk', 'arkon.yonetici', 'arkon.yansima-oku'];
export const YONETICI: Deneme = { rol: 'admin', kullanici: { id: 1, ad: 'Deneme Yonetici', islemler: [...ARKON_HEPSI, YENI_EKRAN_ISLEMI] } };
export const KAPISIZ: Deneme = { rol: 'admin', kullanici: { id: 2, ad: 'Deneme Kapisiz', islemler: ARKON_HEPSI } };
export const OPERATOR: Deneme = {
  rol: 'operator', kullanici: { id: 3, ad: 'Deneme Operator', islemler: ['sayfa.arkon', 'sayfa.uretim-terminali', 'arkon.operator', YENI_EKRAN_ISLEMI] },
};

export interface SahteSunucu {
  belgeler?: Record<string, { kimlik: string; surum: number; govde: unknown }[]>;
  kayitlar?: Record<string, unknown[]>;
}

export interface Istek { yontem: string; yol: string; govde: unknown }

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json' } });

export function arkonKisisi(d: Deneme): ArkonKisi {
  return {
    kimlik: String(d.kullanici.id), ad: d.kullanici.ad, rol: d.rol, isMerkezleri: [],
    istasyon: d.istasyon ?? null, istasyonlar: d.istasyon ? [d.istasyon] : [], aktif: true,
  };
}

export function sunucuKur(d: Deneme, s: SahteSunucu = {}): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const url = new URL(adres, 'http://tmi.yerel');
    const yol = url.pathname.replace(/^\/api/, '');
    const yontem = ayar?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: typeof ayar?.body === 'string' ? JSON.parse(ayar.body) as unknown : null });
    if (yol === '/oturum') return json(200, { kullanici: d.kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/arkon/ben') return json(200, { kisi: arkonKisisi(d) });
    if (yontem === 'GET' && yol === '/arkon/kisiler') return json(200, { kisiler: [arkonKisisi(d)] });
    if (yontem === 'GET' && yol.startsWith('/arkon/iletiler')) return json(200, { son: 0, iletiler: [] });
    const belge = /^\/arkon\/belgeler\/([^/]+)(?:\/([^/]+))?$/.exec(yol);
    if (yontem === 'GET' && belge) {
      const liste = s.belgeler?.[belge[1] ?? ''] ?? [];
      if (belge[2] === undefined) return json(200, { belgeler: liste });
      const b = liste.find((x) => x.kimlik === decodeURIComponent(belge[2] ?? ''));
      return json(200, { belge: b ? { surum: b.surum, govde: b.govde } : null });
    }
    if (yontem === 'POST' && /^\/arkon\/belgeler\/[^/]+\/[^/]+\/yaz$/.test(yol)) return json(200, { sonuc: 'yazildi', surum: 1 });
    const kayit = /^\/arkon\/kayitlar\/([^/]+)$/.exec(yol);
    if (yontem === 'GET' && kayit) return json(200, { satirlar: s.kayitlar?.[kayit[1] ?? ''] ?? [] });
    if (yontem === 'POST' && /^\/arkon\/kayitlar\/[^/]+\/ekle$/.test(yol)) return json(200, { eklenen: 0 });
    if (yontem === 'POST' && yol === '/arkon/iletiler') return json(200, {});
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

// Testin okuduğu adres: ekranın gezdiği yer.
function Adres() { return <output data-testid="adres">{useLocation().pathname}</output>; }

// Sayfalar arası geçiş kabuğun ikinci menü şeridindedir (553 1 a); testte yerine yalın bağlantılar. sayacYaz: kabuğun şeritteki
// sayılar için verdiği yazıcı.
// `kalici`: sayfa kabuktaki gibi kalıcı rota sarmalayıcısında ve ölçülebilir bir alanın içinde açılır (sarmalayıcının
// display: contents kuralı app.css'te; testte kendisi ekler).
export function arkonAc(adres: string, { sayacYaz = null, kalici = false }: { sayacYaz?: CerceveSayacYazici | null; kalici?: boolean } = {}) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><CerceveSayacBaglami.Provider value={sayacYaz}><MemoryRouter initialEntries={[adres]}>
      <nav aria-label="Deneme şeridi">
        {sekmeMaddeleri().map((m) => <Link key={m.anahtar} to={SAYFA_DISI[m.anahtar] ?? sayfaAdresi(m.anahtar)}>{m.baslik}</Link>)}
      </nav>
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={kalici
          ? <div data-deneme-alan=""><div className="tc-kalici-ekran"><r.ekran /></div></div>
          : <r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
      <Adres />
    </MemoryRouter></CerceveSayacBaglami.Provider></BildirimSaglayici></QueryClientProvider>,
  );
}
