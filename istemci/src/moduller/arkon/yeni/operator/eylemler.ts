import type { Perm } from '../cekirdek/tipler.ts';
import { IS_TURLERI } from '../hazirlik/kurallar.ts';
import type { OpType } from '../hazirlik/tipler.ts';

// 3550 D: terminalin eylem kataloğu. Hangi eylem hangi istasyon türünde ve hangi izinle görünür burada tek yerde yazılır; Operator.tsx
// buradan okur. Yetki modeli değişmez: izin anahtarları bugünkü kapıların aynısıdır, katalog yalnız "nerede görünür"ü adlandırır.
// Bölge: A ana alan, I ikincil sıra, D durum şeridi (Geri al yanı).
export type EylemBolgesi = 'A' | 'I' | 'D';
export type EylemKimligi = 'sayim-arti' | 'hatali' | 'sayim-eksi' | 'toplu' | 'sayim-duzelt' | 'durum';
export interface EylemTanimi { id: EylemKimligi; bolge: EylemBolgesi; izin: Perm; turler: readonly OpType[] | 'hepsi' }

export const EYLEMLER: readonly EylemTanimi[] = [
  { id: 'durum', bolge: 'A', izin: 'prod.run', turler: 'hepsi' },
  { id: 'sayim-arti', bolge: 'A', izin: 'prod.run', turler: 'hepsi' },
  { id: 'toplu', bolge: 'A', izin: 'prod.run', turler: 'hepsi' },
  { id: 'hatali', bolge: 'I', izin: 'prod.run', turler: 'hepsi' },
  { id: 'sayim-eksi', bolge: 'D', izin: 'prod.fix', turler: 'hepsi' },
  { id: 'sayim-duzelt', bolge: 'D', izin: 'prod.fix', turler: 'hepsi' },
];

// Rolun hiç yapamadığı eylem görünmez (izin yoksa ya da ekran önizlemedeyse); yapabildiği ama şu an uymayan eylem kendi parçasında pasif kalır.
export function eylemGorunur(id: EylemKimligi, tur: OpType, izinVar: (k: Perm) => boolean, onizleme = false): boolean {
  const e = EYLEMLER.find((x) => x.id === id);
  if (!e || onizleme) return false;
  return (e.turler === 'hepsi' || e.turler.includes(tur)) && izinVar(e.izin);
}

export const gorunenEylemler = (tur: OpType, izinVar: (k: Perm) => boolean, onizleme = false): EylemKimligi[] =>
  EYLEMLER.filter((e) => eylemGorunur(e.id, tur, izinVar, onizleme)).map((e) => e.id);

// Sayım tuşunun adı istasyon türünden gelir: talaşlı ve tesviyede bugünkü "İyi +1", öteki türde sayım adı ("Toplanan +1").
export const sayimAdi = (tur: OpType): string => IS_TURLERI[tur].cnt;
export const sayimArtiEtiketi = (tur: OpType): string => (sayimAdi(tur) === 'İyi parça' ? 'İyi +1' : `${sayimAdi(tur)} +1`);
// Geri alma iletisi: "İyi parça +1 · 35" (bugünkü metin), depoda "Toplanan +1 · 35".
export const sayimArtiIletisi = (tur: OpType, toplam: string): string => `${sayimAdi(tur)} +1 · ${toplam}`;
// Eksi tuşu aynı adı taşır (talaşlı ve tesviyede bugünkü "İyi −1"); hurda tuşu türden bağımsızdır.
export const sayimEksiEtiketi = (tur: OpType): string => (sayimAdi(tur) === 'İyi parça' ? 'İyi −1' : `${sayimAdi(tur)} −1`);
export const sayimEksiAria = (tur: OpType): string => `${sayimAdi(tur) === 'İyi parça' ? 'İyi parça' : sayimAdi(tur)} eksi bir`;
export const sayimEksiIletisi = (tur: OpType, toplam: string): string => `${sayimAdi(tur)} −1 · ${toplam}`;
