import type { FormOzellikleri } from '../durum.tsx';
import { YerTutucu, YerTutucuPencere } from '../yer-tutucu.tsx';

// M2 yer tutucusu (PARCA-SOZLESMESI): M2 bu dosyayı yeniden yazar.
export function Takvim() { return <YerTutucu baslik="Takvim" />; }
export function ToplantiFormu({ kapat }: FormOzellikleri<'toplanti'>) { return <YerTutucuPencere baslik="Toplantı planla" kapat={kapat} />; }
