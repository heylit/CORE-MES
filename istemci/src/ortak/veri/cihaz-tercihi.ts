import { useCallback, useSyncExternalStore } from 'react';

// Cihaz tercihi (ör. depo tabletinde depocu modu) kişiye değil tarayıcıya aittir: aynı tableti kullanan herkes görür.
// Modül yazar, kabuk okur; ikisi aynı pencerede olduğu için yazım dinleyenlere hemen duyurulur.
export const cihazTercihiAnahtari = (ad: string): string => `tmi:cihaz:${ad}`;

const bellek = new Map<string, boolean>();
const dinleyiciler = new Set<() => void>();

export function cihazTercihiOku(ad: string): boolean {
  const bellekte = bellek.get(ad);
  if (bellekte !== undefined) return bellekte;
  try { return localStorage.getItem(cihazTercihiAnahtari(ad)) === 'acik'; } catch { return false; }
}

export function cihazTercihiYaz(ad: string, acik: boolean): void {
  bellek.set(ad, acik);
  try { localStorage.setItem(cihazTercihiAnahtari(ad), acik ? 'acik' : 'kapali'); } catch { /* depolama kapalı olabilir; bellekte kalır */ }
  dinleyiciler.forEach((d) => d());
}

const abone = (d: () => void): (() => void) => { dinleyiciler.add(d); return () => { dinleyiciler.delete(d); }; };

// Ad yoksa tercih kapalıdır (kancanın koşulsuz çağrılabilmesi için).
export function useCihazTercihi(ad: string | null): [boolean, (acik: boolean) => void] {
  const acik = useSyncExternalStore(abone, () => (ad === null ? false : cihazTercihiOku(ad)));
  const yaz = useCallback((yeni: boolean) => { if (ad !== null) cihazTercihiYaz(ad, yeni); }, [ad]);
  return [acik, yaz];
}

// Testlerin birbirini etkilememesi için: bellekteki değerleri siler.
export function cihazTercihleriniSifirla(): void { bellek.clear(); }
