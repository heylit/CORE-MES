import { useRef, type KeyboardEvent } from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import { useSeritKaydirma } from './serit-kaydirma.ts';
import './sekmeler.css';

export interface Sekme<A extends string> {
  anahtar: A;
  baslik: string;
  simge?: SimgeAdi;
  // Bekleyen iş sayısı: sıfırdan büyükse rozet çizilir; ekran okuyucu adı "(n)" olarak duyar.
  sayi?: number;
}

interface Ozellikler<A extends string> {
  etiket: string;
  sekmeler: readonly Sekme<A>[];
  secili: A;
  sec: (anahtar: A) => void;
}

export function Sekmeler<A extends string>({ etiket, sekmeler, secili, sec }: Ozellikler<A>) {
  const kutu = useRef<HTMLDivElement>(null);
  const { kenar, okOlaylari } = useSeritKaydirma(kutu);

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
    <div ref={kutu} className="tc-sekmeler" role="tablist" aria-label={etiket} onKeyDown={tus}
      data-sol={kenar.sol ? '' : undefined} data-sag={kenar.sag ? '' : undefined}>
      {/* Taşan şeritte kenar işareti (ikinci menüdeki gibi). Şeridin içinde yapışkan durur ki modüllerin `> .tc-sekmeler`
          seçicileri bozulmasın; ekran okuyucuya gizlidir, klavye sekmeler arasında okla gezer. */}
      <span className="tc-sekmeler-ok tc-sekmeler-ok-sol" aria-hidden="true" {...okOlaylari(-1)}><Simge ad="chev-left" boyut="k" /></span>
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
          {s.sayi !== undefined && s.sayi > 0 && (
            <>
              <span className="tc-sekme-sayi" aria-hidden="true">{s.sayi > 99 ? '99+' : s.sayi}</span>
              <span className="tc-gizli-etiket"> ({s.sayi})</span>
            </>
          )}
        </button>
      ))}
      <span className="tc-sekmeler-ok tc-sekmeler-ok-sag" aria-hidden="true" {...okOlaylari(1)}><Simge ad="chev-right" boyut="k" /></span>
    </div>
  );
}
