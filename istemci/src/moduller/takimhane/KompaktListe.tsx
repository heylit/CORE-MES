import type { ReactNode } from 'react';
import './takimhane.css';

// Dar ekranda (<768) Tablo'nun her sütunu alt alta kart olur; uzun listede bu çok yer tutar. Modül aynı listeyi iki satırlık
// kompakt satır olarak da verir; hangisinin görüneceğini CSS seçer (diğeri gizli, ekran okuyucuya da görünmez).
export function KompaktListe<S>({ etiket, satirlar, satirAnahtari, baslik, sag, alt, ek }: {
  etiket: string;
  satirlar: readonly S[];
  satirAnahtari: (satir: S) => string | number;
  baslik: (satir: S) => ReactNode;
  sag?: (satir: S) => ReactNode;
  alt?: (satir: S) => ReactNode;
  ek?: (satir: S) => ReactNode;
}) {
  return (
    <ul className="tc-tkm-kompakt" aria-label={etiket}>
      {satirlar.map((s) => (
        <li key={satirAnahtari(s)} className="tc-tkm-kompakt-satir">
          <span className="tc-tkm-kompakt-baslik">{baslik(s)}</span>
          {sag && <span className="tc-tkm-kompakt-sag mono">{sag(s)}</span>}
          {alt && <span className="tc-tkm-kompakt-alt">{alt(s)}</span>}
          {ek && <span className="tc-tkm-kompakt-ek">{ek(s)}</span>}
        </li>
      ))}
    </ul>
  );
}

// Masaüstünde tablo, telefonda kompakt liste.
export function IkiGorunum({ masa, kompakt }: { masa: ReactNode; kompakt: ReactNode }) {
  return (
    <>
      <div className="tc-tkm-masa">{masa}</div>
      <div className="tc-tkm-dar">{kompakt}</div>
    </>
  );
}
