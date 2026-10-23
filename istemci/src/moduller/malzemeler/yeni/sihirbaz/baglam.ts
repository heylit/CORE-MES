import { createContext, useContext } from 'react';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { SonKullanilan } from '../tercihler.ts';
import type { KatalogKarti } from '../tipler.ts';
import type { Degistirici, SihirbazTaslagi, Taslak } from './durum.ts';

// Ekranın yalnız gösterim için tuttuğu, taslağa yazılmayan seçimler (prototipte modül düzeyi değişkenler).
export interface EkranSecimi {
  kaliteArama: string;
  tumFormlar: boolean;
  tumSecenekler: boolean;
  sablonAcik: boolean;
  sonKayit: string | null;
  cokluKayit: { ok: number; skip: number } | null;
  // Sunucunun kategori reddi: kategori açmaya yönlendirir; tür ya da kategori değişince düşer.
  katUyari: { mesaj: string; tur: string; kat: string | undefined } | null;
}

export interface Sihirbaz extends EkranOzellikleri {
  taslak: SihirbazTaslagi;
  adim: number;
  b: KuralBaglami;
  kartlar: readonly KatalogKarti[];
  degistir: (fn: Degistirici) => void;
  yenisiniKur: (d: Taslak, adim?: number) => void;
  adimaGec: (i: number) => void;
  secim: EkranSecimi;
  secimYaz: (s: Partial<EkranSecimi>) => void;
  bildir: (mesaj: string, ton?: 'tamam' | 'bilgi' | 'hata') => void;
  kartiAc: (kimlik: string) => void;
  // Taslağı yeniden kurar ve verilen adıma geçer (aile, tür, kategori seçimi).
  kurVeGit: (d: Taslak, adim: number) => void;
  // Prototipte `selectGrade`: kalite seçilir, son kullanılanlara yazılır; adım verilirse oraya geçilir.
  kaliteSec: (fam: string, cls: string | null, kod: string, adim?: number) => void;
  sifirla: () => void;
  sonKullanilanlar: readonly SonKullanilan[];
  sonaKoy: (fam: string, cls: string | null, grade: string) => void;
}

export const SihirbazBaglami = createContext<Sihirbaz | null>(null);

export function useSihirbaz(): Sihirbaz {
  const s = useContext(SihirbazBaglami);
  if (!s) throw new Error('Sihirbaz bağlamı yok');
  return s;
}
