import type { ButtonHTMLAttributes } from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import './dugme.css';

interface Ozellikler extends ButtonHTMLAttributes<HTMLButtonElement> {
  tur?: 'birincil' | 'ikincil' | 'tehlike';
  boyut?: 'normal' | 'ana';
  simge?: SimgeAdi;
  yukleniyor?: boolean;
}

export function Dugme({
  tur = 'ikincil', boyut = 'normal', simge, yukleniyor = false,
  children, disabled, className, type = 'button', ...geri
}: Ozellikler) {
  const sinif = ['tc-dugme', `tc-dugme-${tur}`, `tc-dugme-${boyut}`, className].filter(Boolean).join(' ');
  return (
    <button {...geri} type={type} className={sinif} disabled={disabled || yukleniyor} aria-busy={yukleniyor || undefined}>
      {yukleniyor ? <span className="tc-dugme-doner" aria-hidden="true" /> : simge ? <Simge ad={simge} /> : null}
      {children}
    </button>
  );
}
