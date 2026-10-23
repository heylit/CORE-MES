import type { Duyuru, Kayit } from '../tipler.ts';
import { YerTutucu } from '../yer-tutucu.tsx';

// M1 yer tutucusu (PARCA-SOZLESMESI): M1 bu dosyayı yeniden yazar.
export function DuyuruKarti({ duyuru }: { duyuru: Kayit<Duyuru> }) { return <YerTutucu baslik={`Duyuru ${duyuru.id}`} />; }
