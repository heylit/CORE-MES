import { useSyncExternalStore } from 'react';

// Vardiya özeti ve devir (3298): terminalin üst çubuğunda düğmesi yoktur, kabuğun Hesap menüsünden açılır. Madde yalnız Üretim
// Terminali görünürken durur; seçilince görünür terminal kendi penceresini açar (pencere ve devir terminalin durumundadır).
const acicilar = new Set<() => void>();
const dinleyiciler = new Set<() => void>();
const bildir = () => { for (const d of dinleyiciler) d(); };
const abone = (d: () => void) => { dinleyiciler.add(d); return () => { dinleyiciler.delete(d); }; };

export function vardiyaOzetiAcicisiKaydet(ac: () => void): () => void {
  acicilar.add(ac);
  bildir();
  return () => { acicilar.delete(ac); bildir(); };
}

export function useVardiyaOzetiAcilabilir(): boolean {
  return useSyncExternalStore(abone, vardiyaOzetiAcilabilirMi);
}

export function vardiyaOzetiniAc(): void {
  for (const ac of acicilar) ac();
}

export const vardiyaOzetiAcilabilirMi = (): boolean => acicilar.size > 0;
