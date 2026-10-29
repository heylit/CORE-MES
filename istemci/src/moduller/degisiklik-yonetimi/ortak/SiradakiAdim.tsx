import type { ReactNode } from 'react';
import { Simge } from '../../../ortak/arayuz/index.ts';
import './ortak.css';

interface Ozellikler {
  baslik: string;
  aciklama?: string | null;
  // sirada: kullanıcının işi; bekliyor: başka adımı bekliyor; bitti: süreç kapandı.
  tur?: 'sirada' | 'bekliyor' | 'bitti';
  children?: ReactNode;
}

// Prototipin nextBar'ı: kaydın sıradaki adımı ve o adımın düğmeleri.
export function SiradakiAdim({ baslik, aciklama, tur = 'sirada', children }: Ozellikler) {
  const simge = tur === 'bitti' ? 'check' : tur === 'bekliyor' ? 'clock' : 'next';
  return (
    <section className={`dy-siradaki dy-siradaki-${tur}`} aria-label="Sıradaki adım">
      <Simge ad={simge} />
      <div className="dy-siradaki-metin">
        <p className="dy-siradaki-baslik">{baslik}</p>
        {aciklama && <p className="dy-siradaki-aciklama">{aciklama}</p>}
      </div>
      {children && <div className="dy-siradaki-eylem">{children}</div>}
    </section>
  );
}
