import { Quaternion } from 'three';
import type { Geometri, Govde, HamSonuc } from './hesap/ham.ts';

// Yüklenen parça (prototipin `S`inin veri kısmı). Ham Malzeme, G-Kod ve Hazırlık aynı parçayı görür. Sahne, ağ ve
// malzeme nesneleri görünümündür; burada yalnız geometri ve hesap sonuçları durur. Kayda girmez (prototipte de bellekte).

export type { Ag, Govde, HamSonuc, Geometri } from './hesap/ham.ts';

export interface ParcaDurumu {
  P: Float32Array | null;
  I: Uint32Array | null;
  vol: number;
  area: number;
  tris: number;
  name: string;
  solids: number;
  q: Quaternion;
  bodies: Govde[] | null;
  bodySel: number;
  bodyFile: string;
  axKey: string | null;
  autoAi?: number;
  autoCirc?: number;
  circs?: number[];
  geo: Geometri | null;
  res: HamSonuc | null;
  alt: { bar: HamSonuc; block: HamSonuc } | null;
  // Görünüm kamerayı parçaya oturtsun (prototipte sahne bir sonraki karede yapar).
  fitPending: boolean;
  busy: string | null;
  msg: string;
}

export const S: ParcaDurumu = {
  P: null, I: null, vol: 0, area: 0, tris: 0, name: '', solids: 1, q: new Quaternion(), bodies: null, bodySel: 0, bodyFile: '', axKey: null,
  geo: null, res: null, alt: null, fitPending: false, busy: null, msg: '',
};

let surum = 0;
const dinleyiciler = new Set<() => void>();
export function parcaDegisti(): void { surum += 1; for (const d of dinleyiciler) d(); }
export function parcaAbone(d: () => void): () => void { dinleyiciler.add(d); return () => { dinleyiciler.delete(d); }; }
export function parcaSurumu(): number { return surum; }
