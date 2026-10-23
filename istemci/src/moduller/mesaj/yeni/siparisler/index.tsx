import type { SiparisOzeti } from '../tipler.ts';
import { YerTutucu } from '../yer-tutucu.tsx';

// M2 yer tutucusu (PARCA-SOZLESMESI): M2 bu dosyayı yeniden yazar. null: liste yok (yetki ya da yüklenmedi).
export function Siparisler() { return <YerTutucu baslik="Siparişler" />; }
export function useSiparisOzetleri(): SiparisOzeti[] | null { return null; }
