import { useRef, type KeyboardEvent } from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import './sekmeler.css';

export interface Sekme<A extends string> {
  anahtar: A;
  baslik: string;
  simge?: SimgeAdi;
}

interface Ozellikler<A extends string> {
  etiket: string;
  sekmeler: readonly Sekme<A>[];
  secili: A;
  sec: (anahtar: A) => void;
}

export function Sekmeler<A extends string>({ etiket, sekmeler, secili, sec }: Ozellikler<A>) {
  const kutu = useRef<HTMLDivElement>(null);

  const tus = (o: KeyboardEvent) => {
    const sira = sekmeler.findIndex((s) => s.anahtar === secili);
    const hedef = o.key === 'ArrowRight' ? sira + 1
      : o.key === 'ArrowLeft' ? sira - 1
      : o.key === 'Home' ? 0
      : o.key === 'End' ? sekmeler.length - 1
      : null;
    if (hedef === null) return;
    o.preventDefault();
    const yeni = sekmeler[(hedef + sekmeler.length) % sekmeler.length];
    if (!yeni) return;
    sec(yeni.anahtar);
    kutu.current?.querySelector<HTMLElement>(`[data-sekme="${yeni.anahtar}"]`)?.focus();
  };

  return (
    <div ref={kutu} className="tc-sekmeler" role="tablist" aria-label={etiket} onKeyDown={tus}>
      {sekmeler.map((s) => (
        <button
          key={s.anahtar}
          type="button"
          role="tab"
          data-sekme={s.anahtar}
          aria-selected={s.anahtar === secili}
          tabIndex={s.anahtar === secili ? 0 : -1}
          className="tc-sekme"
          onClick={() => sec(s.anahtar)}
        >
          {s.simge && <Simge ad={s.simge} boyut="k" />}
          {s.baslik}
        </button>
      ))}
    </div>
  );
}
