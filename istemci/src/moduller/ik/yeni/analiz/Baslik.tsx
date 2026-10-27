import type { ReactNode } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import './analiz.css';

export interface BaslikDugmesi { anahtar: string; etiket: string; simge: SimgeAdi; yap: () => void; birincil?: boolean; pasif?: boolean }

// Bugünkü ekranda sayfa başlığındaki düğmelerin hepsi görünür; ortak başlık ikincilleri menüye topladığı için bu bölüm kendi başlığını çizer.
export function Baslik({ baslik, simge, alt, dugmeler }: { baslik: string; simge: SimgeAdi; alt?: ReactNode; dugmeler: readonly BaslikDugmesi[] }) {
  return (
    <header className="tc-ikr-baslik">
      <div className="tc-ikr-baslik-bas">
        <h2 className="tc-ikr-baslik-ad"><Simge ad={simge} /><span>{baslik}</span></h2>
        {alt && <p className="tc-ikr-baslik-alt">{alt}</p>}
      </div>
      {dugmeler.length > 0 && (
        <div className="tc-ikr-baslik-eylem">
          {dugmeler.map((d) => (
            <Dugme key={d.anahtar} tur={d.birincil ? 'birincil' : 'ikincil'} simge={d.simge} disabled={d.pasif} onClick={d.yap}>{d.etiket}</Dugme>
          ))}
        </div>
      )}
    </header>
  );
}
