// Hazırlık listesi süzgeci: iş emri, istasyon, makine ve parçaya göre daraltır.
// Seçenek sayıları öteki seçili süzgeçlere göre hesaplanır: sıfır sonuç veren seçim listede görünmez.
import type { GrupAdi, GrupPaketi } from './paket-grup';

export type SuzgecAlani = 'emir' | 'istasyon' | 'makine' | 'parca';
export const SUZGEC_ALANLARI: readonly (readonly [SuzgecAlani, string])[] = [['emir', 'İş emri'], ['istasyon', 'İstasyon'], ['makine', 'Makine'], ['parca', 'Parça']];

// Alan yoksa süzülmez; boş metin "değeri girilmemiş paketler" demektir (ör. istasyonsuz).
export type PaketSuzgeci = Partial<Record<SuzgecAlani, string>>;

export interface SuzgecSecenegi { deger: string; etiket: string; sayi: number }

const BOS_ETIKET: Record<SuzgecAlani, string> = { emir: 'Numarasız emir', istasyon: 'İstasyonsuz', makine: 'Makine seçilmemiş', parca: 'Parça girilmemiş' };

export function alanDegeri(p: GrupPaketi, alan: SuzgecAlani): string {
  if (alan === 'emir') return (p.no || '').trim();
  if (alan === 'istasyon') return p.machine || '';
  if (alan === 'makine') return p.mc || '';
  return (p.partNo || p.part || '').trim();
}

const uyar = (p: GrupPaketi, s: PaketSuzgeci, haric?: SuzgecAlani) =>
  SUZGEC_ALANLARI.every(([a]) => a === haric || s[a] === undefined || alanDegeri(p, a) === s[a]);

const metin = (p: GrupPaketi) => [p.no, p.part, p.partNo, p.machine, p.mc].filter(Boolean).join(' ').toLocaleLowerCase('tr');

export function paketleriSuz<T extends GrupPaketi>(paketler: readonly T[], s: PaketSuzgeci, ara = ''): T[] {
  const q = ara.trim().toLocaleLowerCase('tr');
  return paketler.filter((p) => uyar(p, s) && (!q || metin(p).includes(q)));
}

export function suzgecSecenekleri(paketler: readonly GrupPaketi[], s: PaketSuzgeci, alan: SuzgecAlani, ad?: GrupAdi): SuzgecSecenegi[] {
  const sayac = new Map<string, number>();
  for (const p of paketler) if (uyar(p, s, alan)) sayac.set(alanDegeri(p, alan), (sayac.get(alanDegeri(p, alan)) ?? 0) + 1);
  // Seçili değer başka süzgeç yüzünden sıfıra düşse de listede kalır: kullanıcı neyin seçili olduğunu görür.
  const secili = s[alan];
  if (secili !== undefined && !sayac.has(secili)) sayac.set(secili, 0);
  const etiket = (d: string) => {
    if (!d) return BOS_ETIKET[alan];
    const adi = alan === 'istasyon' || alan === 'makine' ? ad?.(alan, d) : undefined;
    return adi ? `${d} · ${adi}` : d;
  };
  return [...sayac].map(([deger, sayi]) => ({ deger, etiket: etiket(deger), sayi }))
    .sort((a, b) => (a.deger ? 0 : 1) - (b.deger ? 0 : 1) || a.deger.localeCompare(b.deger, 'tr', { numeric: true }));
}

export const suzgecSayisi = (s: PaketSuzgeci) => SUZGEC_ALANLARI.filter(([a]) => s[a] !== undefined).length;

export function suzgecOku(deger: unknown): PaketSuzgeci {
  const s: PaketSuzgeci = {};
  if (!deger || typeof deger !== 'object') return s;
  for (const [a] of SUZGEC_ALANLARI) {
    const v = (deger as Record<string, unknown>)[a];
    if (typeof v === 'string') s[a] = v;
  }
  return s;
}
