import type { ReactNode } from 'react';
import './rozet.css';

export type RozetTonu = 'bilgi' | 'tamam' | 'uyari' | 'hata' | 'pasif';

// Renk tek başına anlam taşımaz: metin her zaman yazılır.
export function Rozet({ ton = 'bilgi', gorunum = 'dolu', children }: { ton?: RozetTonu; gorunum?: 'dolu' | 'cizgi'; children: ReactNode }) {
  return (
    <span className={`tc-rozet tc-rozet-${ton}${gorunum === 'cizgi' ? ' tc-rozet-cizgi' : ''}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}
