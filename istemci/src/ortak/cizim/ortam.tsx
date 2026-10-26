import { createContext, useContext, type ReactNode } from 'react';
import type { OlcumAleti } from './cekirdek/olcum-aleti.ts';

// Çizim parçasının kullananından aldıkları (616 b): ağır hesabın cihaz önbelleği, ölçü aletleri, cihaz ayarı ve ses. Arkon bunları kendi
// deposundan ve 'arkon:' önekli cihaz kaydından verir; anahtarlar eski ekranınkiyle aynı kalır ki iki ekran birbirinin kaydını okusun.
export interface CizimOnbellegi { get(anahtar: string): Promise<unknown>; put(anahtar: string, deger: unknown): Promise<unknown> }
export interface CizimAyarlari { oku<T = unknown>(anahtar: string): T | null; yaz(anahtar: string, deger: unknown): void }
export type CizimSesi = 'ok' | 'nok';

export interface CizimOrtamiDegeri {
  onbellek: CizimOnbellegi;
  aletler: readonly OlcumAleti[];
  ayarlar: CizimAyarlari;
  ses(tur: CizimSesi): void;
}

// Sağlayıcısız kullanımda önbellek yalnız bu açılışta, ayar kaydı ve ses yoktur, alet listesi boştur.
function bellekOnbellegi(): CizimOnbellegi {
  const kayit = new Map<string, unknown>();
  return {
    get: (k) => Promise.resolve(kayit.get(k)),
    put: (k, v) => { kayit.set(k, v); return Promise.resolve(); },
  };
}
const VARSAYILAN: CizimOrtamiDegeri = {
  onbellek: bellekOnbellegi(),
  aletler: [],
  ayarlar: { oku: () => null, yaz: () => undefined },
  ses: () => undefined,
};

const Baglam = createContext<CizimOrtamiDegeri>(VARSAYILAN);

export function CizimOrtami({ deger, children }: { deger: CizimOrtamiDegeri; children: ReactNode }) {
  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}

export const useCizimOrtami = (): CizimOrtamiDegeri => useContext(Baglam);
