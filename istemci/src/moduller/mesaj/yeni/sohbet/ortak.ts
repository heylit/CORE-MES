import { createContext, useContext } from 'react';
import type { Secenek } from '../../../../ortak/arayuz/index.ts';
import type { Ileti, Kanal, Kayit } from '../tipler.ts';

export const kanalSecenekleri = (kanallar: readonly Kayit<Kanal>[]): Secenek[] =>
  kanallar.map((c) => ({ deger: c.id, baslik: `${c.emoji || '#'} ${c.name}` }));

// Yazma alanından açılan zamanlama kaydedilince o kanalın taslağı temizlenir; yazma alanı bu olayı dinler.
export const TASLAK_TEMIZLE = 'tc-ms-taslak-temizle';
export const taslagiTemizle = (kanal: string) => { window.dispatchEvent(new CustomEvent(TASLAK_TEMIZLE, { detail: kanal })); };

// "@Ad" kodlaması için ad -> kişi: önce düzenlemede çözülen adlar, sonra kişi listesi (knownNames).
export function bilinenAdlar(kisiler: ReadonlyMap<string, string>, ek?: ReadonlyMap<string, string>): Map<string, string> {
  const sonuc = new Map<string, string>(ek ?? []);
  for (const [id, ad] of kisiler) if (ad && !sonuc.has(ad)) sonuc.set(ad, id);
  return sonuc;
}

// Açık kanalın oda bilgisi: okumayanlar listesine çevrimiçiler ve iletilerin yazarları da girer (knownPeople). Kanal dışında
// (Bugün'deki duyuru kartı) boştur; oda yalnız kanal görünümünde yoklanır.
export interface SohbetOdasi { cevrimici: readonly string[]; iletiler: readonly Ileti[] }
export const SohbetOdasiBaglami = createContext<SohbetOdasi>({ cevrimici: [], iletiler: [] });
export const useSohbetOdasi = (): SohbetOdasi => useContext(SohbetOdasiBaglami);

// Prototipteki "Ara" düğmesi: arama kabuğun Ctrl K kutusunda (M0); düğme aynı tuşu gönderir, kabuk kutuyu açar.
export function aramaAc(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
}
