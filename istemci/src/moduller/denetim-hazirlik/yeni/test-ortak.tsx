import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { BelgeCevabi, BenCevabi, KisilerCevabi, OlcuAletleriCevabi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { rotalar } from '../rotalar.tsx';
import { DenetimSaglayici } from './baglam.tsx';
import { depoMetni, depoOku } from './normalize.ts';
import type { Depo, GorunumKodu } from './tipler.ts';
import { BELGE_YOLU, yukle } from './veri.ts';

// Parça testleri için ortak kurulum: sahte sunucu (aynı uçlar) ve bağlam. Kişi adları uydurmadır; veri sentetiktir.

export const YONETICI: Kullanici = { id: 5, ad: 'Deneme Yönetici', islemler: ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz', 'denetim-hazirlik.yonet'] };

export interface SahteSunucuSecenegi {
  kullanici?: Kullanici;
  yazabilir?: boolean;
  yonetici?: boolean;
  depo?: Depo;
  aletler?: OlcuAletleriCevabi['aletler'];
  // Yazma cevabı: verilirse bu durum kodu döner (403 yetki, 409 çakışma).
  yazmaDurumu?: number;
}

export interface SahteSunucu {
  istekler: string[];
  yazilanlar: { deger: string; beklenenSurum: number | null }[];
  // Başkasının yazdığını taklit eder.
  disaridanYaz: (d: Depo) => void;
}

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

export function sahteSunucu(s: SahteSunucuSecenegi = {}): SahteSunucu {
  const kullanici = s.kullanici ?? YONETICI;
  let deger: string | null = s.depo ? depoMetni(s.depo) : null;
  let surum = deger === null ? 0 : 1;
  const sonuc: SahteSunucu = {
    istekler: [], yazilanlar: [],
    disaridanYaz: (d) => { deger = depoMetni(d); surum++; },
  };
  const belge = (): BelgeCevabi => ({ belge: deger === null ? null : { yol: BELGE_YOLU, kimlik: 'b', veri: { deger }, surum }, damga: surum });
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    sonuc.istekler.push(`${yontem} ${yol}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/kurum') return json(200, { ad: null });
    if (yontem === 'GET' && yol === '/denetim-hazirlik/ben') {
      return json(200, { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: s.yazabilir ?? true, yonetici: s.yonetici ?? true, kurulumGerekli: false } satisfies BenCevabi);
    }
    if (yontem === 'GET' && yol.startsWith('/denetim-hazirlik/belge?')) return json(200, belge());
    if (yontem === 'POST' && yol === '/denetim-hazirlik/belge/yaz') {
      const g = JSON.parse(String(secenek?.body)) as { veri: { deger: string }; beklenenSurum: number | null };
      sonuc.yazilanlar.push({ deger: g.veri.deger, beklenenSurum: g.beklenenSurum });
      if (s.yazmaDurumu) return json(s.yazmaDurumu, { kod: s.yazmaDurumu === 409 ? 'CAKISMA' : 'YETKISIZ', mesaj: s.yazmaDurumu === 409 ? 'Çakışma.' : 'Yetkiniz yok.' });
      if (g.beklenenSurum !== (deger === null ? null : surum)) return json(409, { kod: 'CAKISMA', mesaj: 'Çakışma.' });
      deger = g.veri.deger;
      surum++;
      return json(200, belge());
    }
    if (yontem === 'GET' && yol === '/denetim-hazirlik/olcu-aletleri') return json(200, { aletler: s.aletler ?? [] } satisfies OlcuAletleriCevabi);
    if (yontem === 'GET' && yol === '/denetim-hazirlik/kisiler') return json(200, { kisiler: [{ id: 1, ad: 'Deneme Kişi' }] } satisfies KisilerCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return sonuc;
}

const sarmala = (cocuk: ReactNode, adres: string) => {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes>
        {cocuk === null ? rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />) : <Route path="*" element={cocuk} />}
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>
  );
};

// Bütün ekranı adresle açar (yetki, yükleme, kabuk).
export function ekraniAc(adres = '/denetim-hazirlik/yeni/bugun') {
  return render(sarmala(null, adres));
}

// Parçayı bağlamla açar: sahte sunucudan yükler, `gorunum` kabuksuz verilir. Önce sahteSunucu() kurulmalıdır.
export async function baglamlaAc(cocuk: ReactNode, gorunum: GorunumKodu = 'home') {
  const yukleme = await yukle();
  return render(sarmala(<DenetimSaglayici yukleme={yukleme} gorunum={gorunum}>{cocuk}</DenetimSaglayici>, '/denetim-hazirlik/yeni'));
}

export const ornekDepo = (): Depo => depoOku(null);
