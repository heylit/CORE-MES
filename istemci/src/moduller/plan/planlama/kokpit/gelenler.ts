import type { PlanSurumCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { KokpitEmri } from './kurallar.ts';

// Gelenler (3282): planlamacının ele alacağı yeni ve değişen işler tek listede. Kaynaklar: plansız emirler (Kokpit modeli) ve son canlıya
// almadan sonraki saha olayları (canlı sürüm okumasının bayatlık listesi, 2319). Liste yalnız gösterir; plan değişmez. Saf.
export type GelenTuru = 'yeni' | NonNullable<NonNullable<NonNullable<PlanSurumCevabi['bayat']>['olaylar']>[number]>['neden'];
type Olay = NonNullable<NonNullable<PlanSurumCevabi['bayat']>['olaylar']>[number];

export const GELEN_ADI: Record<GelenTuru, string> = {
  yeni: 'Yeni emir',
  'emir-bitti': 'Erken bitti',
  'adim-bitti': 'Adım erken bitti',
  'fason-donusu': 'Fason döndü',
  durus: 'Arıza / bakım',
  'rota-degisti': 'Rota değişti',
  'emir-iptal': 'İptal',
  'satin-alma-termini': 'Satın alma termini',
};
// Rozetin tonu: plansız ve duruş planlamacıyı bekler (uyarı), öteki olaylar bilgi.
export const gelenTonu = (t: GelenTuru): 'uyari' | 'hata' | 'bilgi' => (t === 'durus' ? 'hata' : t === 'yeni' || t === 'satin-alma-termini' ? 'uyari' : 'bilgi');

export interface Gelen {
  anahtar: string;
  tur: GelenTuru;
  baslik: string;
  metin: string;
  // Kokpit'teki emir (seçilince ayrıntı açılır); emir planda yoksa null.
  emirId: string | null;
  // Olayın zamanı (ms); plansız emirde null.
  zaman: number | null;
}

const OLAY_METNI: Record<Olay['neden'], string> = {
  'emir-bitti': 'Emir planlanandan erken bitti; tezgâhta yer açıldı.',
  'adim-bitti': 'Bir adım planlanandan erken bitti.',
  'fason-donusu': 'Fasondan döndü; sonraki adım öne alınabilir.',
  durus: 'Tezgâh arızada ya da bakımda; üstündeki işler bekliyor.',
  'rota-degisti': 'Emrin rotası değişti; plan eski adımlara göre.',
  'emir-iptal': 'Emir iptal edildi; tezgâhta boşluk kaldı.',
  'satin-alma-termini': 'Malzemenin geliş tarihi değişti.',
};

export function gelenler(emirler: readonly KokpitEmri[], olaylar: readonly Olay[], terminYaz: (t: number) => string): Gelen[] {
  const noIle = new Map(emirler.map((e) => [e.no, e]));
  const plansiz: Gelen[] = emirler.filter((e) => e.durum === 'plansiz').map((e) => ({
    anahtar: `yeni:${e.id}`, tur: 'yeni', baslik: e.no, emirId: e.id, zaman: null,
    metin: `Plansız. ${String(e.adet)} adet${e.termin === null ? '' : `, teslim ${terminYaz(e.termin)}`}.`,
  }));
  const olay: Gelen[] = olaylar.map((o, i) => {
    const e = o.emirNo === null ? undefined : noIle.get(o.emirNo);
    return {
      anahtar: `olay:${String(i)}:${o.neden}:${o.zaman}`, tur: o.neden, baslik: o.emirNo ?? o.makineKod ?? GELEN_ADI[o.neden],
      metin: o.neden === 'durus' && o.makineKod ? `${o.makineKod}: ${OLAY_METNI.durus}` : OLAY_METNI[o.neden], emirId: e?.id ?? null, zaman: Date.parse(o.zaman),
    };
  });
  // Plansız emirler önce (termini yakın önce), olaylar yeniden eskiye.
  const termin = (g: Gelen): number => noIle.get(g.baslik)?.termin ?? Number.MAX_SAFE_INTEGER;
  const terminSira = (a: Gelen, b: Gelen): number => termin(a) - termin(b);
  return [...plansiz.sort(terminSira), ...olay.sort((a, b) => (b.zaman ?? 0) - (a.zaman ?? 0))];
}
