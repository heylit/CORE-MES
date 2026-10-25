import type { ReactNode } from 'react';
import './plan.css';

// F2 bölümlerinin ortak küçük parçaları: prototipteki "ledger" özet şeridi ve tek seçimli düğme şeridi (.seg).

export type OzetTonu = 'arti' | 'eksi' | 'uyari' | null;
export interface OzetHucresi {
  etiket: ReactNode;
  deger: ReactNode;
  alt?: ReactNode;
  ton?: OzetTonu;
}

const TON_SINIFI: Record<NonNullable<OzetTonu>, string> = { arti: 'tc-fc-arti', eksi: 'tc-fc-eksi', uyari: 'tc-fc-uyari' };
export const tonSinifi = (ton: OzetTonu | undefined): string => (ton ? TON_SINIFI[ton] : '');

export function OzetSeridi({ etiket, hucreler }: { etiket: string; hucreler: readonly OzetHucresi[] }) {
  return (
    <dl className="tc-fc-ozet" aria-label={etiket}>
      {hucreler.map((h, i) => (
        <div key={i} className="tc-fc-ozet-hucre">
          <dt className="tc-fc-ozet-etiket">{h.etiket}</dt>
          <dd className={`tc-fc-ozet-deger ${tonSinifi(h.ton)}`}>{h.deger}</dd>
          {h.alt !== undefined && h.alt !== null && h.alt !== '' && <dd className="tc-fc-ozet-alt">{h.alt}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function SecimSeridi<D extends string>({ etiket, secenekler, secili, sec }: {
  etiket: string;
  secenekler: readonly (readonly [D, string])[];
  secili: D;
  sec: (d: D) => void;
}) {
  return (
    <div className="tc-fc-serit" role="group" aria-label={etiket}>
      {secenekler.map(([d, b]) => (
        <button key={d} type="button" className="tc-fc-serit-dugme" aria-pressed={d === secili} onClick={() => sec(d)}>{b}</button>
      ))}
    </div>
  );
}
