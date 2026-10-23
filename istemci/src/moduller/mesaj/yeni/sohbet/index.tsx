import type { FormOzellikleri } from '../durum.tsx';
import { YerTutucu, YerTutucuPencere } from '../yer-tutucu.tsx';

// M1 yer tutucusu (PARCA-SOZLESMESI): M1 bu dosyayı yeniden yazar.
export function Sohbet() { return <YerTutucu baslik="Sohbet" />; }
export function DuyuruFormu({ kapat }: FormOzellikleri<'duyuru'>) { return <YerTutucuPencere baslik="Duyuru yap" kapat={kapat} />; }
export function ZamanlaFormu({ kapat }: FormOzellikleri<'zamanla'>) { return <YerTutucuPencere baslik="Mesajı zamanla" kapat={kapat} />; }
export function KanalFormu({ kapat }: FormOzellikleri<'kanal'>) { return <YerTutucuPencere baslik="Yeni kanal" kapat={kapat} />; }
