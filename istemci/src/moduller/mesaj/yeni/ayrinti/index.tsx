import type { AyrintiOzellikleri } from '../durum.tsx';
import { YerTutucuPencere } from '../yer-tutucu.tsx';

// M2 yer tutucusu (PARCA-SOZLESMESI): M2 bu dosyayı yeniden yazar.
export function AyrintiSayfasi({ kapat }: AyrintiOzellikleri) { return <YerTutucuPencere baslik="Ayrıntı" kapat={kapat} />; }
