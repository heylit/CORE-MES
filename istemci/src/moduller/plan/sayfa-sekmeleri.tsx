import { useLocation, useNavigate } from 'react-router-dom';
import { maddeGorunurMu } from '#paylasilan/sayfa-tanimi.ts';
import { Sekmeler } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { MALIYET_ISLEMI, PLANLAMA_ISLEMI } from './planlama-menusu.ts';

// Birleşen sayfaların sekmeleri (2538 b). Her sekme kendi adresidir ve kendi işlemini ister (2482 ön bakış 2): işlemi olmayana sekme çıkmaz,
// adresle açılırsa sayfa kendi yetkisini denetler. İlk sekme ikinci menüdeki maddenin adresidir; kabuk etkin maddeyi en uzun önekten bulur.
export interface SayfaSekmesi { yol: string; baslik: string; simge: SimgeAdi; islem: string }
export interface SayfaAilesi { etiket: string; sekmeler: readonly SayfaSekmesi[] }

export const SAYFA_AILELERI = {
  siparis: { etiket: 'Siparişler', sekmeler: [
    { yol: '/plan/ysiparis', baslik: 'Siparişler', simge: 'list', islem: PLANLAMA_ISLEMI },
    { yol: '/plan/ysiparis/terminler', baslik: 'Terminler', simge: 'flag', islem: PLANLAMA_ISLEMI },
    { yol: '/plan/ysiparis/denge', baslik: 'Termin ve kâr', simge: 'gauge', islem: MALIYET_ISLEMI },
  ] },
  ufuk: { etiket: 'Ufuk', sekmeler: [
    { yol: '/plan/ufuk', baslik: 'Ufuk', simge: 'route', islem: PLANLAMA_ISLEMI },
    { yol: '/plan/ufuk/yillik', baslik: 'Yıllık plan', simge: 'chart', islem: PLANLAMA_ISLEMI },
  ] },
  malzeme: { etiket: 'Malzeme', sekmeler: [
    { yol: '/plan/malzplan', baslik: 'Satın alma planı', simge: 'box', islem: PLANLAMA_ISLEMI },
    { yol: '/plan/malzplan/ihtiyac', baslik: 'Malzeme ihtiyacı', simge: 'box', islem: PLANLAMA_ISLEMI },
  ] },
  analiz: { etiket: 'Analiz', sekmeler: [
    { yol: '/plan/analiz', baslik: 'Planlama analizi', simge: 'chart', islem: PLANLAMA_ISLEMI },
    { yol: '/plan/analiz/plan-sagligi', baslik: 'Plan sağlığı', simge: 'gauge', islem: PLANLAMA_ISLEMI },
    { yol: '/plan/analiz/veri-sagligi', baslik: 'Veri sağlığı', simge: 'alert', islem: PLANLAMA_ISLEMI },
  ] },
} as const satisfies Record<string, SayfaAilesi>;
export type SayfaAilesiAdi = keyof typeof SAYFA_AILELERI;

// Eski tek parçalı adresler (menüden kalkan maddeler) yeni sekmenin adresine gider (2482 ön bakış 1: boş sayfa yok).
export const ESKI_SAYFA_ADRESLERI: Readonly<Record<string, string>> = {
  '/plan/mrp': '/plan/malzplan/ihtiyac',
  '/plan/plan-sagligi': '/plan/analiz/plan-sagligi',
  '/plan/veri-sagligi': '/plan/analiz/veri-sagligi',
};

export function aileOf(yol: string): SayfaAilesiAdi | null {
  for (const [ad, a] of Object.entries(SAYFA_AILELERI) as [SayfaAilesiAdi, SayfaAilesi][]) if (a.sekmeler.some((s) => s.yol === yol)) return ad;
  return null;
}

// Görülebilen sekme birden azsa şerit çizilmez (tek sekme yalnız başlığı tekrar eder).
export function SayfaSekmeleri({ aile }: { aile: SayfaAilesiAdi }) {
  const { pathname, search } = useLocation();
  const git = useNavigate();
  const islemler = useOturum().data?.islemler ?? [];
  const a: SayfaAilesi = SAYFA_AILELERI[aile];
  const gorunen = a.sekmeler.filter((s) => maddeGorunurMu(s, islemler));
  const secili = gorunen.find((s) => s.yol === pathname);
  if (gorunen.length < 2 || secili === undefined) return null;
  return (
    <Sekmeler
      etiket={`${a.etiket} sekmeleri`}
      sekmeler={gorunen.map((s) => ({ anahtar: s.yol, baslik: s.baslik, simge: s.simge }))}
      secili={secili.yol}
      sec={(y) => { void git(y === pathname ? `${y}${search}` : y); }}
    />
  );
}
