import type { ReactNode } from 'react';
import { Dugme } from './Dugme.tsx';
import { Pencere } from './Pencere.tsx';

interface Ozellikler {
  acik: boolean;
  baslik: string;
  children?: ReactNode;
  onayMetni?: string;
  tehlikeli?: boolean;
  yukleniyor?: boolean;
  onayla: () => void;
  vazgec: () => void;
}

// Odak ilk olarak Vazgeç'e düşer: Enter ile yanlışlıkla onay verilmez.
export function OnayPenceresi({
  acik, baslik, children, onayMetni = 'Onayla', tehlikeli = false, yukleniyor = false, onayla, vazgec,
}: Ozellikler) {
  return (
    <Pencere
      acik={acik}
      kapat={vazgec}
      baslik={baslik}
      alt={(
        <>
          <Dugme onClick={vazgec} disabled={yukleniyor} data-ilk-odak>Vazgeç</Dugme>
          <Dugme tur={tehlikeli ? 'tehlike' : 'birincil'} onClick={onayla} yukleniyor={yukleniyor}>{onayMetni}</Dugme>
        </>
      )}
    >
      {children}
    </Pencere>
  );
}
