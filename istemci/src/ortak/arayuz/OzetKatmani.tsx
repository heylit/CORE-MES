import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import type { MakineDurumu } from './durum.ts';
import { Dugme } from './Dugme.tsx';
import { Simge } from './Simge.tsx';
import { useKatman } from './katman.ts';
import './ozet-katmani.css';

export interface OzetSatiri {
  etiket: string;
  deger: string;
  ton?: MakineDurumu;
}

interface Ozellikler {
  acik: boolean;
  ustYazi?: string;
  baslik: string;
  satirlar: readonly OzetSatiri[];
  birincil?: { metin: string; simge?: SimgeAdi; tikla: () => void };
  // Satırlarla eylemler arasında sayfanın kendi içeriği (1337 a: terminalde iş bitince çıkan sepet); verilmezse yer açılmaz.
  ek?: ReactNode;
  kapatMetni?: string;
  kapat: () => void;
}

// Odak birincil eyleme düşer: iş bitince beklenen adım sıradaki işe geçmektir.
export function OzetKatmani({ acik, ustYazi, baslik, satirlar, birincil, ek, kapatMetni = 'Kapat', kapat }: Ozellikler) {
  const kutu = useKatman<HTMLDivElement>(acik, kapat);
  const baslikKimlik = useId();
  if (!acik) return null;

  return createPortal(
    <div className="tc-ozet-perde" onMouseDown={(o) => { if (o.target === o.currentTarget) kapat(); }}>
      <div ref={kutu} className="tc-ozet" role="dialog" aria-modal="true" aria-labelledby={baslikKimlik} tabIndex={-1}>
        <div className="tc-ozet-damga" aria-hidden="true"><Simge ad="check" boyut="b" /></div>
        {ustYazi && <span className="tc-ozet-ust">{ustYazi}</span>}
        <h2 id={baslikKimlik} className="tc-ozet-baslik">{baslik}</h2>
        <dl className="tc-ozet-satirlar">
          {satirlar.map((s) => (
            <div key={s.etiket} data-durum={s.ton}>
              <dt>{s.etiket}</dt>
              <dd className={s.ton ? 'tc-ozet-tonlu' : undefined}>{s.deger}</dd>
            </div>
          ))}
        </dl>
        {ek != null && <div className="tc-ozet-ek">{ek}</div>}
        <div className="tc-ozet-eylemler">
          <Dugme boyut="ana" onClick={kapat}>{kapatMetni}</Dugme>
          {birincil && (
            <Dugme tur="birincil" boyut="ana" simge={birincil.simge} onClick={birincil.tikla} data-ilk-odak>
              {birincil.metin}
            </Dugme>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
