import type { FormOzellikleri } from '../durum.tsx';
import { YerTutucu, YerTutucuPencere } from '../yer-tutucu.tsx';

// M3 yer tutucusu (PARCA-SOZLESMESI): M3 bu dosyayı yeniden yazar.
export function Ayarlar() { return <YerTutucu baslik="Ayarlar ve otomasyon" />; }
export function KuralFormu({ kapat }: FormOzellikleri<'kural'>) { return <YerTutucuPencere baslik="Otomatik uyarı" kapat={kapat} />; }
