import type { Emir, Lot, Muayene, Ncr } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';


export interface EmirBaglari { lot: Lot[]; insp: Muayene[]; ncr: Ncr[] }

// Lot, muayene ve NCR kayıtları iş emrine numarayla bağlanır (kayıttaki "İş emri / sipariş" alanı).
export function emirBaglari(veri: KmVerisi, no: unknown): EmirBaglari {
  const k = String(no ?? '').trim();
  if (!k) return { lot: [], insp: [], ncr: [] };
  return {
    lot: veri.lot.filter((l) => l.tip !== 'reset' && (l.emir === k || l.siparis === k)),
    insp: veri.insp.filter((i) => i.emir === k),
    ncr: veri.ncr.filter((n) => n.emir === k),
  };
}

export function retSayisi(b: EmirBaglari): number {
  return b.lot.filter((l) => l.karar === 'Ret').length + b.insp.filter((i) => i.sonuc === 'Ret').length;
}

export interface IzSatiri { tarih?: string; kol: 'lot' | 'insp' | 'ncr'; kimlik: string; no?: string; tur: string; durum?: string; ayrinti: string }

export function izlenebilirlik(b: EmirBaglari): IzSatiri[] {
  return [
    ...b.lot.map((l): IzSatiri => ({ tarih: l.tarih, kol: 'lot', kimlik: l._id, no: l.no, tur: 'Lot kabul', durum: l.karar, ayrinti: `N ${l.N ?? ''}` })),
    ...b.insp.map((i): IzSatiri => ({ tarih: i.tarih, kol: 'insp', kimlik: i._id, no: i.no, tur: `${i.tur ?? ''} muayene`, durum: i.sonuc, ayrinti: i.lot ? `lot ${i.lot}` : '' })),
    ...b.ncr.map((n): IzSatiri => ({ tarih: n.tarih, kol: 'ncr', kimlik: n._id, no: n.no, tur: 'NCR', durum: n.durum, ayrinti: n.hataTipi ?? '' })),
  ].sort((a, b) => (a.tarih ?? '').localeCompare(b.tarih ?? ''));
}

export const emirSirasi = (liste: readonly Emir[]): Emir[] => [...liste].sort((a, b) => (b.termin ?? '').localeCompare(a.termin ?? ''));
export const emirAranan = (x: Emir): string => [x.no, x.parcaNo, x.parcaAdi, x.musteri, x.proje].join(' ');
