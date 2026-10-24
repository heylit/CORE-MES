import { dofGecikti, parcaAnahtari, type KmTon, type ParcaOzeti } from '../kurallar.ts';
import { KAPALI } from '../sabitler.ts';
import type { Seri } from '../spc.ts';
import type { BelgeKaydi, Dof, Lot, Muayene } from '../tipler.ts';
import type { KmVerisi } from '../veri.ts';

export const dofTonu = (c: Dof): KmTon => (c.durum === KAPALI ? 'iyi' : dofGecikti(c) ? 'kotu' : 'uyari');

// Parça kartının kimliği parça numarasından türer (uygulamadaki gibi): aynı numara aynı kartı günceller.
export const parcaKimligi = (parcaNo: string): string => `p-${parcaAnahtari(parcaNo).replace(/[^A-Za-z0-9_\-.]/g, '_').slice(0, 120)}`;

export const parcaAra = (liste: readonly ParcaOzeti[], sorgu: string): ParcaOzeti[] => {
  const q = sorgu.toLocaleLowerCase('tr');
  return q ? liste.filter((p) => `${p.no} ${p.ad}`.toLocaleLowerCase('tr').includes(q)) : [...liste];
};

export interface MuayeneSatiri {
  kimlik: string;
  kol: 'insp' | 'lot';
  tarih?: string;
  no?: string;
  tur: string;
  sonuc?: string;
  muayeneci?: string;
  yarim: boolean;
  fai: boolean;
}

// Muayeneler sekmesi: muayene ve lot kabul kayıtları birlikte, yeniden eskiye.
export function muayeneSatirlari(insp: readonly Muayene[], lot: readonly Lot[]): MuayeneSatiri[] {
  return [
    ...insp.map((i): MuayeneSatiri => ({
      kimlik: i._id, kol: 'insp', tarih: i.tarih, no: i.no, tur: `${i.tur ?? ''}${i.adimli ? ' (adım adım)' : ''}`, sonuc: i.sonuc,
      muayeneci: i.muayeneci, yarim: !!i.adimli && i.sonuc === 'Devam ediyor', fai: i.tur === 'FAI',
    })),
    ...lot.map((l): MuayeneSatiri => ({
      kimlik: l._id, kol: 'lot', tarih: l.tarih, no: l.no, tur: `Lot kabul (N ${String(l.N ?? '')})`, sonuc: l.karar, muayeneci: l.muayeneci, yarim: false, fai: false,
    })),
  ].sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}

export const bagParcaNo = (b: BelgeKaydi): string => b.bagli?.parcaNo ?? '';

// Belgeler sekmesi: parçanın kendi belgeleri ve parça numarasıyla kayıtlara eklenmiş belgeler.
export function parcaBelgeleri(veri: KmVerisi, p: ParcaOzeti): { kendi: BelgeKaydi[]; kayitlarda: BelgeKaydi[] } {
  const kimlik = parcaKimligi(p.no);
  const kendiMi = (b: BelgeKaydi) => b.bagli?.col === 'parca' && b.bagli.id === kimlik;
  const ilgili = veri.belge.filter((b) => b.bagli && (parcaAnahtari(bagParcaNo(b)) === p.k || kendiMi(b)));
  return { kendi: ilgili.filter(kendiMi), kayitlarda: ilgili.filter((b) => !kendiMi(b)) };
}

// Ölçüm geçmişi: en az iki ölçümü olan karakteristikler (çok ölçümlü önce); tek ölçümlüler yalnız sayılır.
export function olcumGecmisi(seriler: readonly Seri[], p: ParcaOzeti): { liste: Seri[]; tekOlcum: number } {
  const hepsi = seriler.filter((s) => parcaAnahtari(s.pn) === p.k);
  const liste = hepsi.filter((s) => s.n >= 2).sort((a, b) => b.n - a.n);
  return { liste, tekOlcum: hepsi.length - liste.length };
}

export const balonSayisi = (p: ParcaOzeti): number => p.cizim.reduce((a, d) => a + (d.balonlar ?? []).length, 0);
