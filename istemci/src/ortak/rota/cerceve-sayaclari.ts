import { createContext, useContext, useEffect, useRef } from 'react';
import type { CerceveSayaclari } from './cerceve-iletisi.ts';

// Çerçevedeki modülün bildirdiği ikinci menü sayıları kabuğa bu bağlamla çıkar: köprü modülün ekranında, menü
// kabuktadır. `sayaclar` null: o menünün çerçeve sayıları unutulur (çerçeve kalktı). Kabuk yalnız `kok`u açık menünün
// kökü olan kaydı kullanır; başka sayfaya geçince eski kayıt kendiliğinden düşer.
export type CerceveSayacYazici = (kok: string, sayaclar: CerceveSayaclari | null) => void;

export const CerceveSayacBaglami = createContext<CerceveSayacYazici | null>(null);

// Köprünün `sayaclar` geri çağrısı: kabuk yoksa (test, gömülü ekran) sayılar düşer. Bileşen kalkınca o menünün sayıları silinir.
export function useCerceveSayacYazici(kok: string): (sayaclar: CerceveSayaclari) => void {
  const yaz = useContext(CerceveSayacBaglami);
  const guncel = useRef({ yaz, kok });
  guncel.current = { yaz, kok };
  const yazici = useRef((sayaclar: CerceveSayaclari) => { guncel.current.yaz?.(guncel.current.kok, sayaclar); });

  useEffect(() => () => { yaz?.(kok, null); }, [yaz, kok]);

  return yazici.current;
}
