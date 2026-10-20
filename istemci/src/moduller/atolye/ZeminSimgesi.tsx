import type { AlanTuru, RafTuru } from '#paylasilan/sozlesme/atolye.ts';
import { ALAN_TURU_ADI, RAF_TURU_ADI, makineCinsi } from './kurallar.ts';
import { OgeSimgesi, rafSimgesi, type PlanSimgesiAdi } from './plan-simgeleri.tsx';

// Öğe türü ve alt türü (raf türü, istasyon tipi, alan türü) planın simge adına çevrilir; tanınmayan alt tür bölge simgesiyle çizilir.
export function zeminSimgeAdi(tur: 'raf' | 'istasyon' | 'makine' | 'alan', altTur: string, ad: string): PlanSimgesiAdi {
  if (tur === 'raf') return altTur in RAF_TURU_ADI ? rafSimgesi(altTur as RafTuru) : 'bolge';
  if (tur === 'alan') return altTur in ALAN_TURU_ADI ? altTur as AlanTuru : 'bolge';
  return makineCinsi(altTur, ad);
}

export function ZeminSimgesi({ tur, altTur, ad }: { tur: 'raf' | 'istasyon' | 'makine' | 'alan'; altTur: string; ad: string }) {
  return <OgeSimgesi ad={zeminSimgeAdi(tur, altTur, ad)} />;
}
