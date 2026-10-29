import type { ReactNode } from 'react';
import './ortak.css';

// Prototipin titleblock'u: kayıt no, sınıf, durum gibi künye alanları üç sütunlu çerçevede.
export function Kunye({ etiket, alanlar }: { etiket: string; alanlar: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="dy-kunye" aria-label={etiket}>
      {alanlar.map(([ad, deger]) => (
        <div key={ad} className="dy-kunye-alan">
          <dt>{ad}</dt>
          <dd>{deger}</dd>
        </div>
      ))}
    </dl>
  );
}
