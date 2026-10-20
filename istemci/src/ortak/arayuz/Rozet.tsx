import type { ReactNode } from 'react';
import './rozet.css';

export type RozetTonu = 'bilgi' | 'tamam' | 'uyari' | 'hata' | 'pasif';

// Renk tek başına anlam taşımaz: metin her zaman yazılır.
export function Rozet({ ton = 'bilgi', children }: { ton?: RozetTonu; children: ReactNode }) {
  return (
    <span className={`tc-rozet tc-rozet-${ton}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}
