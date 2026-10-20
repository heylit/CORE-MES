import type { ReactNode } from 'react';
import './kart.css';

interface Ozellikler {
  baslik?: string;
  // Başlığın yanında duran içerik (rozet, kod). Başlık öğesinin dışındadır: başlığın erişilebilir adı yalnız `baslik` kalır.
  baslikEki?: ReactNode;
  sag?: ReactNode;
  children: ReactNode;
}

export function Kart({ baslik, baslikEki, sag, children }: Ozellikler) {
  return (
    <section className="tc-kart">
      {(baslik || baslikEki || sag) && (
        <header className={`tc-kart-ust${baslikEki ? ' tc-kart-ust-zengin' : ''}`}>
          {(baslik || baslikEki) && (
            <div className="tc-kart-bas">
              {baslik && <h2 className="tc-kart-baslik">{baslik}</h2>}
              {baslikEki && <div className="tc-kart-ek">{baslikEki}</div>}
            </div>
          )}
          {sag && <div className="tc-kart-sag">{sag}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
