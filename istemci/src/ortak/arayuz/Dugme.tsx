import { useState, type ButtonHTMLAttributes, type PointerEvent } from 'react';
import { etkiAcik } from '../veri/etki.ts';
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
  children, disabled, className, type = 'button', onPointerDown, ...geri
}: Ozellikler) {
  const sinif = ['tc-dugme', `tc-dugme-${tur}`, `tc-dugme-${boyut}`, className].filter(Boolean).join(' ');
  const [dalga, dalgaYaz] = useState<{ no: number; x: number; y: number } | null>(null);
  // Dalga (karar 2081-9): dokunulan yerden yayılır; klavyeyle basışta yoktur (konum yok). Kurum kapattıysa ya da hareket
  // kapalıysa çizilmez; CSS azaltılmış harekette de oynatmaz.
  const bas = (e: PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    if (e.button > 0 || !etkiAcik('dalga') || document.documentElement.getAttribute('data-hareket') === 'kapali') return;
    const r = e.currentTarget.getBoundingClientRect();
    dalgaYaz((d) => ({ no: (d?.no ?? 0) + 1, x: e.clientX - r.left, y: e.clientY - r.top }));
  };
  return (
    <button {...geri} type={type} className={sinif} disabled={disabled || yukleniyor} aria-busy={yukleniyor || undefined} onPointerDown={bas}>
      {yukleniyor ? <span className="tc-dugme-doner" aria-hidden="true" /> : simge ? <Simge ad={simge} /> : null}
      {children}
      {dalga && (
        <span className="tc-dugme-dalga-kap" aria-hidden="true">
          <span key={dalga.no} className="tc-dugme-dalga" onAnimationEnd={() => { dalgaYaz(null); }}
            ref={(el) => { el?.style.setProperty('--dalga-x', `${dalga.x}px`); el?.style.setProperty('--dalga-y', `${dalga.y}px`); }} />
        </span>
      )}
    </button>
  );
}
