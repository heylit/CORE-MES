import { Pencere } from '../../../../ortak/arayuz/index.ts';
import type { TanimSekmesi } from '../gorunum.ts';
import { YerTutucu } from '../YerTutucu.tsx';

// P2 yazarı doldurur (devir-heylit/ts-cnc/PARCA-SOZLESMESI.md). Kabuk açık olduğunda çizer; "Hazırlık süreleri" sekmesinin
// içeriği P4'ün AyarSuresiProfili'dir (cam/disari.ts).
export function TanimlarPenceresi({ sekme, kapat }: { sekme: TanimSekmesi; kapat: () => void }) {
  return (
    <Pencere acik baslik="Tanımlar" tur="yan" kapat={kapat}>
      <YerTutucu ad={sekme === 'mach' ? 'Tezgâhlar' : sekme === 'mat' ? 'İş malzemeleri' : 'Hazırlık süreleri'} />
    </Pencere>
  );
}
