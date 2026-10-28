import type { Color } from 'three';
import { sahneRengi, sahneRengi3 } from '../sahne/renkler.ts';

// İşlem türü renkleri (prototipin OPCOL'u) tasarım değişkeni adıdır (--cnc3d-<ad>): sahne doğrusal okur, panel aynı adın
// renk örneği sınıfını kullanır (cam.css, tc-cc-renk-<ad>).
export const ISLEM_RENGI: Record<string, string> = {
  face: 'cam-alin', rough: 'vurgu', rest: 'uyari', finish: 'ok', ball: 'acik-mavi', helix: 'cam-helis', spot: 'cam-delme', drill: 'cam-delme',
  tap: 'cam-kilavuz', lathe: 'vurgu',
};
export const ISLEM_ADI: Record<string, string> = {
  face: 'Alın', rough: 'Kaba', rest: 'Kalan malzeme', finish: 'Finiş', ball: 'Serbest yüzey', helix: 'Helis', spot: 'Punta', drill: 'Delme', tap: 'Kılavuz',
};

export function islemRengiAdi(kind: string): string { return ISLEM_RENGI[kind] ?? 'beyaz'; }
export function islemRengi3(kind: string): Color { return sahneRengi3(islemRengiAdi(kind)); }
// Panelde renk örneği: sınıf adı tasarım değişkenini taşır.
export function renkSinifi(ad: string): string { return `tc-cc-renk-${ad}`; }
export function islemSinifi(kind: string): string { return renkSinifi(islemRengiAdi(kind)); }
// Torna-freze satırı: torna turuncu (kesme kırmızı), freze işlem türünün rengi.
export function satirRengiAdi(proc: string, sub: string | undefined, kind: string): string {
  return proc === 'turn' ? (sub === 'part' ? 'cam-kesme' : 'vurgu') : islemRengiAdi(kind);
}
export { sahneRengi, sahneRengi3 };
