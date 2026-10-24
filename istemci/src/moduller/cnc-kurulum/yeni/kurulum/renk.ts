import * as THREE from 'three';
import type { Cizim } from '../sahne/Sahne.tsx';

// Tuval ve 3B sahne renkleri ekranda yazılmaz (T1): çekirdeğin sahne rengi kaynağından okunur. Dokular sahne kurulurken
// çizildiği için kaynak her karede tutulur; ilk kareden önce çizilen doku ikinci karede yenilenir (dokuIzi değişir).
export type RenkAdi =
  | 'arka' | 'vurgu' | 'ok' | 'uyari' | 'hata' | 'mavi' | 'acik-mavi' | 'mor' | 'sari' | 'turuncu'
  | 'yazi' | 'yazi-parlak' | 'yazi-ikincil' | 'yazi-soluk' | 'yazi-koyu'
  | 'kart-ust' | 'kart-alt' | 'kart-kenar' | 'kart-cukur-ic' | 'kart-cukur-dis' | 'kart-govde' | 'kart-bos'
  | 'disli' | 'onizleme-arka' | 'zemin' | 'izgara-1' | 'izgara-2'
  | 'govde' | 'govde-acik' | 'tabla' | 'kanal' | 'ekran-govde'
  | 'ekran-arka' | 'ekran-heid' | 'ekran-iso' | 'ekran-yorum' | 'ekran-kutu'
  | 'talas' | 'kesik-ust' | 'kesik-alt' | 'ham-alt'
  | 'ham-P' | 'ham-M' | 'ham-K' | 'ham-N' | 'ham-S' | 'ham-H' | 'ham';

let kaynak: ((ad: string) => string) | null = null;
let iz = 0;

export function renkKaynagi(c: Cizim): void {
  if (kaynak !== c.sahneRengi) { kaynak = c.sahneRengi; iz += 1; }
}

export function renk(ad: RenkAdi): string {
  return kaynak?.(ad) ?? '';
}

// Doku önbelleklerinin anahtarına girer: tema ya da kaynak değişince dokular yeniden çizilir.
export function dokuIzi(): number {
  return iz;
}

// Kesilmiş alan görünümün rengiyle temizlenir (prototipin renderRect'i: setClearColor + clear); temizlemek sözleşmede görünümündür.
const temizRengi = new THREE.Color();
export function temizle(c: Cizim, ad: RenkAdi): void {
  const r = renk(ad);
  if (r) temizRengi.set(r);
  c.renderer.setClearColor(temizRengi, 1);
  c.renderer.clear();
}
