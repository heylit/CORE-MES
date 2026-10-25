import type { ReactNode } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';

// Raporların üst düğme satırı: bölüme özgü düğmeler ve her raporda "Yazdır / PDF" (prototipte Raporlar başlığındaki düğme).
export function RaporAraclari({ children, sol }: { children?: ReactNode; sol?: ReactNode }) {
  return (
    <div className="tc-fr-araclar">
      {sol && <div className="tc-fr-araclar-sol">{sol}</div>}
      <div className="tc-fr-dugmeler">
        {children}
        <Dugme tur="ikincil" simge="printer" onClick={() => window.print()}>Yazdır / PDF</Dugme>
      </div>
    </div>
  );
}
