import type { ComponentProps } from 'react';
import { Sekmeler } from '../../../../ortak/arayuz/index.ts';
import type { IslerimSatiri, IsimOrtami } from '../../../../../../arkon/web/src/data/islerim.ts';
import { BenimIslerim, seritGerekir } from './BenimIslerim.tsx';
import { IsKuyrugu } from './Parcalar.tsx';

// 3550 D: terminalde istasyonun işleri tek listedir. "Bu istasyon" ve "Benim işlerim" aynı listenin iki süzgecidir; sağ sütun, telefon
// ve pencere bu bileşeni çizer. Süzgeç yalnız kişinin ekrandakinden başka çalışan işi varken görünür (bugünkü Benim işlerim düğmesinin kuralı);
// tek işi olan operatör süzgeç görmez.
export type ListeSuzgeci = 'istasyon' | 'benim';

export function IsListesi({ suzgec, suzgecYaz, istasyonIsleri, benim }: {
  suzgec: ListeSuzgeci; suzgecYaz: (s: ListeSuzgeci) => void;
  istasyonIsleri: ComponentProps<typeof IsKuyrugu>;
  benim: { liste: readonly IslerimSatiri[]; ortam: IsimOrtami; gec: (s: IslerimSatiri) => void };
}) {
  const suzgecVar = seritGerekir(benim.liste, benim.ortam);
  const etkin: ListeSuzgeci = suzgecVar ? suzgec : 'istasyon';
  const acik = istasyonIsleri.isler.filter((x) => !x.empty && x.state !== 'done').length;
  return (
    <>
      {suzgecVar ? (
        <Sekmeler etiket="İş listesi süzgeci" secili={etkin} sec={suzgecYaz}
          sekmeler={[{ anahtar: 'istasyon', baslik: 'Bu istasyon', simge: 'list', sayi: acik }, { anahtar: 'benim', baslik: 'Benim işlerim', simge: 'layers', sayi: benim.liste.length }]} />
      ) : null}
      {etkin === 'benim' ? <BenimIslerim liste={benim.liste} ortam={benim.ortam} gec={benim.gec} /> : <IsKuyrugu {...istasyonIsleri} />}
    </>
  );
}
