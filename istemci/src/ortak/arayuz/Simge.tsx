import { DOLGULU, SIMGELER, type SimgeAdi } from '../tasarim/simgeler.ts';
import './simge.css';

interface Ozellikler {
  ad: SimgeAdi;
  boyut?: 'k' | 'o' | 'b';
}

export function Simge({ ad, boyut = 'o' }: Ozellikler) {
  const dolgu = DOLGULU.has(ad);
  return (
    <svg
      className={`tc-simge tc-simge-${boyut}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={dolgu ? 'currentColor' : 'none'}
      stroke={dolgu ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={SIMGELER[ad]} />
    </svg>
  );
}
