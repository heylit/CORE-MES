import type { PlanSurumCevabi } from '#paylasilan/sozlesme/plan.ts';
import { bekleyenler, bekleyenListesi, ESKI_DEGISIKLIK } from '../kayit.ts';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../tipler.ts';
import type { KokpitModeli } from './kurallar.ts';

// Planı etkileyen değişiklikler (3317 a, 1. adım): üç kaynağın tek listesi. "Veri değişti": başka sayfada ya da bu sayfada yapılan, plana
// henüz girmemiş değişiklikler (bekleyenler); toplu ya da satır satır uygulanır. "Sahada oldu": son canlıya almadan sonraki saha ve satın alma olayları;
// plan kendiliğinden değişmez. "Plan geride": planlanan başlangıcı geçmiş, başlamamış işler. Saf.
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
  // "Veri değişti" satırında çalışmaya yazılmış bekleyenin kimliği (tek başına uygulanabilir); yazılmamış başka sayfa satırında ve öteki
  // başlıklarda null.
  bekleyenId: string | null;
}

const OLAY_NE: Record<Olay['neden'], string> = {
  'emir-bitti': 'Emir planlanandan erken bitti',
  'adim-bitti': 'Bir adım planlanandan erken bitti',
  'fason-donusu': 'Fasondan döndü',
  durus: 'Duruş',
  'rota-degisti': 'Emrin rotası değişti',
  'emir-iptal': 'Emir iptal edildi',
  'satin-alma-termini': 'Malzemenin geliş tarihi değişti',
  'fason-termini': 'Fason firma tarihi değişti',
};
const OLAY_SONUCU: Record<Olay['neden'], string> = {
  'emir-bitti': 'tezgâhta yer açıldı',
  'adim-bitti': 'sonraki adım öne alınabilir',
  'fason-donusu': 'sonraki adım öne alınabilir',
  durus: 'üstündeki işler bekliyor',
  'rota-degisti': 'plan eski adımlara göre',
  'emir-iptal': 'tezgâhta boşluk kaldı',
  'satin-alma-termini': 'emrin başlangıcı etkilenebilir',
  'fason-termini': 'fason dönüşü yeni firma tarihine göre kayabilir',
};
// Planlanan başlangıçtan sonra bu kadar (saat) beklenir; daha kısa gecikme satır olmaz (ekran her dakika titremesin).
export const GERIDE_PAYI = 0.25;

const sure = (saat: number): string => {
  const dk = Math.round(saat * 60), s = Math.floor(dk / 60), d = dk % 60;
  return s === 0 ? `${String(d)} dk` : d === 0 ? `${String(s)} sa` : `${String(s)} sa ${String(d)} dk`;
};

// "Veri değişti" satırlarının kaynağı: ortak çalışmanın kayıtlı bekleyenleri (plan veriden eskiyse) ve bu açılışta gelen, henüz yazılmamış
// başka sayfa satırı (salt okunur kişide hiç yazılmaz).
export function bekleyenDegisiklikleri(c: PlanlamaCalismasi | null, dis: BekleyenDegisiklik | null): BekleyenDegisiklik[] {
  const kayitli = c && c.plan !== null && c.plan.dataVer !== c.dataVer ? bekleyenListesi(c) : [];
  return dis === null || kayitli.some((b) => b.id === dis.id) ? kayitli : [...kayitli, dis];
}

// Taslak varken liste taslağın görünümünü izler: satır taslakta uygulandıysa (dizme onu görünümün bekleyenlerinden düşürdü) listede
// durmaz. Taslağın kendi dizilmemiş komutları satır olmaz (taslak çubuğundadır). Kaydı olmayan önceki değişiklik satırı görünüm bayatken
// durur; yazılmamış başka sayfa satırı hep durur. Taslak yokken görünüm ortak çalışmadır, liste değişmez.
export function gorunumdeBekleyenler(ortak: readonly BekleyenDegisiklik[], gorunum: PlanlamaCalismasi): BekleyenDegisiklik[] {
  const g = new Set(bekleyenler(gorunum).map((b) => b.id));
  const bayat = gorunum.plan !== null && gorunum.plan.dataVer !== gorunum.dataVer;
  return ortak.filter((b) => b.dis === true || (b.id === ESKI_DEGISIKLIK ? bayat : g.has(b.id)));
}

export interface DegisiklikGirdisi {
  m: KokpitModeli;
  bekleyen: readonly BekleyenDegisiklik[];
  olaylar: readonly Olay[];
  // Plan saati ve olay anı (ms) yazıya.
  zaman: (t: number) => string;
  an: (ms: number) => string;
}

// Geride kalan iş: planlanan başlangıcı paydan fazla geçmiş, başlamamış, fason olmayan iş.
const gerideMi = (m: Pick<KokpitModeli, 'simdi'>, x: KokpitModeli['isler'][string]): boolean => !x.basladi && !x.fason && m.simdi - x.S > GERIDE_PAYI;
// "Geride kalanları yeniden planla" (3335-2b): geride işi olan emirler. Elle kilitli geride iş yeniden planlamada yerinde kalır (motor
// kilidi kişinin kararı sayar); yalnız kilitli geride işi olan emir listeye girmez, sayısı ayrıca döner.
export function gerideEmirleri(m: Pick<KokpitModeli, 'isler' | 'simdi'>): { emirler: string[]; kilitli: number } {
  const emirler = new Set<string>(); let kilitli = 0;
  for (const x of Object.values(m.isler)) if (gerideMi(m, x)) { if (x.kilitli) kilitli++; else emirler.add(x.job); }
  return { emirler: [...emirler], kilitli };
}
export function degisiklikler({ m, bekleyen, olaylar, zaman, an }: DegisiklikGirdisi): Degisiklik[] {
  const noIle = new Map(m.emirler.map((e) => [e.no, e]));
  const kod = new Map(m.tezgahlar.map((t) => [t.id, t.kod]));
  const veri: Degisiklik[] = bekleyen.map((b) => ({
    anahtar: `veri:${b.id}`, baslik: 'veri', ne: b.ne, emirId: null, isId: null, bekleyenId: b.dis === true ? null : b.id,
    alt: [b.dis === true ? 'Başka sayfa' : 'Bu sayfa', b.kim === '' ? null : b.kim, b.t > 0 ? an(b.t) : null, b.ayrinti === '' ? null : b.ayrinti].filter((x) => x !== null).join(' · '),
  }));
  const saha: Degisiklik[] = [...olaylar].map((o, i) => ({ o, i })).sort((a, b) => Date.parse(b.o.zaman) - Date.parse(a.o.zaman)).map(({ o, i }) => {
    const ne = o.emirNo ?? o.makineKod;
    return {
      anahtar: `saha:${String(i)}:${o.neden}:${o.zaman}`, baslik: 'saha' as const, emirId: (o.emirNo === null ? undefined : noIle.get(o.emirNo))?.id ?? null, isId: null, bekleyenId: null,
      ne: ne === null ? OLAY_NE[o.neden] : `${OLAY_NE[o.neden]}: ${ne}`,
      alt: [o.neden === 'satin-alma-termini' || o.neden === 'fason-termini' ? 'Satın alma' : 'Saha', an(Date.parse(o.zaman)), OLAY_SONUCU[o.neden]].join(' · '),
    };
  });
  const emirNo = new Map(m.emirler.map((e) => [e.id, e]));
  const geride: Degisiklik[] = Object.values(m.isler).filter((x) => gerideMi(m, x))
    .sort((a, b) => a.S - b.S).map((x) => {
      const e = emirNo.get(x.job);
      return {
        anahtar: `geride:${x.id}`, baslik: 'geride' as const, emirId: e?.id ?? null, isId: x.id, bekleyenId: null,
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
