import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { YENI_EKRAN_ISLEMI } from '../../../ortak/rota/yeni-ekran.tsx';
import { MALIYET_ISLEMI, PLANLAMA_ISLEMI } from '../planlama-menusu.ts';
import { PLANLAMA_ANAHTARI } from './veri.ts';
import { PLANLAMA_ROTALARI } from './yollar.ts';

// Testlerin ortak kurulumu: sahte sunucu ve yeni ekranın açılışı. Kişi adları ve veri uydurmadır. Rotalar modülün rotalar.tsx'i yerine
// doğrudan bu klasörden kurulur (yol kaydı ayrı commit'tedir).
export const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yonetici', islemler: [YENI_EKRAN_ISLEMI, 'sayfa.recete-rota', PLANLAMA_ISLEMI, MALIYET_ISLEMI, 'plan.yaz', 'plan.studyo', 'plan.canliya-al'] };
export const MALIYETSIZ: Kullanici = { id: 2, ad: 'Deneme Maliyetsiz', islemler: [YENI_EKRAN_ISLEMI, 'sayfa.recete-rota', PLANLAMA_ISLEMI] };
export const PLANLAMASIZ: Kullanici = { id: 3, ad: 'Deneme Planlamasiz', islemler: [YENI_EKRAN_ISLEMI, 'sayfa.recete-rota'] };
export const KAPISIZ: Kullanici = { id: 4, ad: 'Deneme Kapisiz', islemler: ['sayfa.recete-rota', PLANLAMA_ISLEMI, MALIYET_ISLEMI] };

// Kayıtlı planlama çalışması (uydurma); verilmezse ekran 657 a ile boş çalışmayı kurdurur.
export const CALISMA_KAYDI: KayitlarCevabi['kayitlar'][number] = {
  anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: { surum: 2, D: { siparisler: [], tezgahlar: [], urunler: [] }, dataVer: 1 }, surum: 4,
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

// `ret` verilen yol 403 döner (izinsiz okuma). Dönen dizi yapılan istekler ("YÖNTEM /yol").
// Yazma gövdeleri `secenek.govdeler`e eklenir; çalışma kaydına yazma kaydın sürümünü bir artırır. Birleşmiş çalışma ucu kayıtlardaki
// çalışmayı olduğu gibi verir (birleştirme sunucu testindedir).
export function sunucuKur(
  kullanici: Kullanici, kayitlar: KayitlarCevabi['kayitlar'] = [], secenek: { ret?: (yol: string) => boolean; yazabilir?: boolean; govdeler?: unknown[] } = {},
): string[] {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    const yontem = istek?.method ?? 'GET';
    istekler.push(`${yontem} ${yol}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (secenek.ret?.(yol)) return json(403, { kod: 'YETKI', mesaj: 'Bu işlem için yetkiniz yok.' });
    if (yontem === 'POST' && yol === '/plan/planlama-kayitlari/yaz') {
      const g = JSON.parse(String(istek?.body)) as { anahtar: string; bicim: 'json'; deger: unknown; beklenenSurum: number | null };
      secenek.govdeler?.push(g);
      return json(200, { kayit: { anahtar: g.anahtar, bicim: g.bicim, deger: g.deger, surum: (g.beklenenSurum ?? 0) + 1 } });
    }
    // 657 a: sunucu boş çalışmayı Reçete ve Rota kaydından kurar; sahte sunucu kaydı değiştirmez, ekran yine boş okur.
    if (yontem === 'POST' && yol === '/plan/planlama-calismasi/olustur') return json(200, { calisma: null, surum: null } satisfies PlanlamaCalismasiCevabi);
    if (yontem !== 'GET') return json(405, { kod: 'YONTEM', mesaj: 'Beklenmeyen yazma.' });
    if (yol === '/recete-rota/ben') return json(200, { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: secenek.yazabilir ?? true } satisfies BenCevabi);
    if (yol === '/recete-rota/kayitlar') return json(200, { kayitlar } satisfies KayitlarCevabi);
    if (yol === '/plan/planlama-calismasi') {
      const k = kayitlar.find((x) => x.anahtar === PLANLAMA_ANAHTARI && x.bicim === 'json');
      return json(200, { calisma: (k?.deger ?? null) as PlanlamaCalismasiCevabi['calisma'], surum: k?.surum ?? null } satisfies PlanlamaCalismasiCevabi);
    }
    if (yol === '/plan/motor-uyarilari') return json(200, { uyarilar: [] });
    if (yol === '/plan/surum') return json(200, { planSurumu: 3, sonCanliyaAlma: null });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function Adres() { return <output data-testid="adres">{useLocation().pathname}</output>; }

export function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes>
        {PLANLAMA_ROTALARI.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
      <Adres />
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}
