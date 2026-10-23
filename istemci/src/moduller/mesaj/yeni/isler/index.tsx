import type { FormOzellikleri } from '../durum.tsx';
import { YerTutucu, YerTutucuPencere } from '../yer-tutucu.tsx';

// M2 yer tutucusu (PARCA-SOZLESMESI): M2 bu dosyayı yeniden yazar.
export function Isler() { return <YerTutucu baslik="İşler" />; }
export function GorevFormu({ kapat }: FormOzellikleri<'gorev'>) { return <YerTutucuPencere baslik="Görev ver" kapat={kapat} />; }
export function OnayFormu({ kapat }: FormOzellikleri<'onay'>) { return <YerTutucuPencere baslik="Onay iste" kapat={kapat} />; }
