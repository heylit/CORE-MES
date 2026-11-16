import type { PlanSurumCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { BekleyenDegisiklik } from '../tipler.ts';
import type { KokpitModeli } from './kurallar.ts';

// Planı etkileyen değişiklikler (3317 a, 1. adım): üç kaynağın tek listesi. "Veri değişti": başka sayfada ya da bu sayfada yapılan, plana
// henüz girmemiş değişiklikler (bekleyenler); toplu uygulanır. "Sahada oldu": son canlıya almadan sonraki saha ve satın alma olayları;
// plan kendiliğinden değişmez. "Plan geride": planlanan başlangıcı geçmiş, başlamamış işler. Liste yalnız gösterir. Saf.
type Olay = NonNullable<NonNullable<NonNullable<PlanSurumCevabi['bayat']>['olaylar']>[number]>;
export type DegisiklikBasligi = 'veri' | 'saha' | 'geride';
export const BASLIK_ADI: Record<DegisiklikBasligi, string> = { veri: 'Veri değişti', saha: 'Sahada oldu', geride: 'Plan geride' };
export const BASLIK_NOTU: Record<DegisiklikBasligi, string> = {
  veri: 'başka sayfada yapılan, plana henüz girmeyen', saha: 'plan kendiliğinden değişmez', geride: 'başlaması gereken saat geçti, iş başlamadı',
};
export const BASLIKLAR: readonly DegisiklikBasligi[] = ['veri', 'saha', 'geride'];

export interface Degisiklik {
  anahtar: string;
  baslik: DegisiklikBasligi;
  ne: string;
  // İkinci satır: kaynak, kişi, zaman, gecikme.
  alt: string;
  // Kokpit'teki emir ("Göster" kartını seçer); emre bağlanamıyorsa null.
  emirId: string | null;
  // Plan geride satırında işin kendisi (tahtada gösterilir).
  isId: string | null;
}

const OLAY_NE: Record<Olay['neden'], string> = {
  'emir-bitti': 'Emir planlanandan erken bitti',
  'adim-bitti': 'Bir adım planlanandan erken bitti',
  'fason-donusu': 'Fasondan döndü',
  durus: 'Duruş',
  'rota-degisti': 'Emrin rotası değişti',
  'emir-iptal': 'Emir iptal edildi',
  'satin-alma-termini': 'Malzemenin geliş tarihi değişti',
};
const OLAY_SONUCU: Record<Olay['neden'], string> = {
  'emir-bitti': 'tezgâhta yer açıldı',
  'adim-bitti': 'sonraki adım öne alınabilir',
  'fason-donusu': 'sonraki adım öne alınabilir',
  durus: 'üstündeki işler bekliyor',
  'rota-degisti': 'plan eski adımlara göre',
  'emir-iptal': 'tezgâhta boşluk kaldı',
  'satin-alma-termini': 'emrin başlangıcı etkilenebilir',
};
// Planlanan başlangıçtan sonra bu kadar (saat) beklenir; daha kısa gecikme satır olmaz (ekran her dakika titremesin).
export const GERIDE_PAYI = 0.25;

const sure = (saat: number): string => {
  const dk = Math.round(saat * 60), s = Math.floor(dk / 60), d = dk % 60;
  return s === 0 ? `${String(d)} dk` : d === 0 ? `${String(s)} sa` : `${String(s)} sa ${String(d)} dk`;
};

export interface DegisiklikGirdisi {
  m: KokpitModeli;
  bekleyen: readonly BekleyenDegisiklik[];
  olaylar: readonly Olay[];
  // Plan saati ve olay anı (ms) yazıya.
  zaman: (t: number) => string;
  an: (ms: number) => string;
}

export function degisiklikler({ m, bekleyen, olaylar, zaman, an }: DegisiklikGirdisi): Degisiklik[] {
  const noIle = new Map(m.emirler.map((e) => [e.no, e]));
  const kod = new Map(m.tezgahlar.map((t) => [t.id, t.kod]));
  const veri: Degisiklik[] = bekleyen.map((b) => ({
    anahtar: `veri:${b.id}`, baslik: 'veri', ne: b.ne, emirId: null, isId: null,
    alt: [b.dis === true ? 'Başka sayfa' : 'Bu sayfa', b.kim === '' ? null : b.kim, b.t > 0 ? an(b.t) : null, b.ayrinti === '' ? null : b.ayrinti].filter((x) => x !== null).join(' · '),
  }));
  const saha: Degisiklik[] = [...olaylar].map((o, i) => ({ o, i })).sort((a, b) => Date.parse(b.o.zaman) - Date.parse(a.o.zaman)).map(({ o, i }) => {
    const ne = o.emirNo ?? o.makineKod;
    return {
      anahtar: `saha:${String(i)}:${o.neden}:${o.zaman}`, baslik: 'saha' as const, emirId: (o.emirNo === null ? undefined : noIle.get(o.emirNo))?.id ?? null, isId: null,
      ne: ne === null ? OLAY_NE[o.neden] : `${OLAY_NE[o.neden]}: ${ne}`,
      alt: [o.neden === 'satin-alma-termini' ? 'Satın alma' : 'Saha', an(Date.parse(o.zaman)), OLAY_SONUCU[o.neden]].join(' · '),
    };
  });
  const emirNo = new Map(m.emirler.map((e) => [e.id, e]));
  const geride: Degisiklik[] = Object.values(m.isler).filter((x) => !x.basladi && !x.fason && m.simdi - x.S > GERIDE_PAYI)
    .sort((a, b) => a.S - b.S).map((x) => {
      const e = emirNo.get(x.job);
      return {
        anahtar: `geride:${x.id}`, baslik: 'geride' as const, emirId: e?.id ?? null, isId: x.id,
        ne: `${e?.no ?? x.job} · ${x.ad} · ${kod.get(x.m) ?? x.m} · ${zaman(x.S)} başlayacaktı`,
        alt: [`${sure(m.simdi - x.S)} geride`, e && e.termin !== null ? `termin ${zaman(e.termin)}` : null].filter((y) => y !== null).join(' · '),
      };
    });
  return [...veri, ...saha, ...geride];
}

const PARCA: Record<DegisiklikBasligi, string> = { veri: 'veri', saha: 'saha', geride: 'geride' };
// Şeridin kapalı satırındaki döküm: "2 veri · 1 saha · 2 geride" (başlıkların kısa adlarıyla); sıfır olan tür yazılmaz.
export function degisiklikDokumu(l: readonly Degisiklik[]): string {
  return BASLIKLAR.map((b) => [b, l.filter((x) => x.baslik === b).length] as const).filter(([, n]) => n > 0).map(([b, n]) => `${String(n)} ${PARCA[b]}`).join(' · ');
}
