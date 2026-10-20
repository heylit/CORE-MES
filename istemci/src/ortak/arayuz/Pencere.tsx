import { useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Simge } from './Simge.tsx';
import { useKatman } from './katman.ts';
import './pencere.css';

interface Ozellikler {
  acik: boolean;
  kapat: () => void;
  baslik: string;
  // orta: kısa form ve onay; yan: uzun form ve ayrıntı. Telefonda ikisi de tam genişliktir. tam: bütün görüntüyü kaplayan
  // çalışma alanı (düzenleyici); Esc kapat'ı çağırır, kaydedilmemiş iş varsa önce onay sormak kapat'ın işidir.
  tur?: 'orta' | 'yan' | 'tam';
  // Başlık satırının yerine çizilen araç çubuğu; verilince başlık görünmez, pencerenin adı olarak kalır ve kapatma düğmesi
  // çubuğun işidir.
  ust?: ReactNode;
  alt?: ReactNode;
  children: ReactNode;
}

export function Pencere({ acik, kapat, baslik, tur = 'orta', ust, alt, children }: Ozellikler) {
  const kutu = useKatman<HTMLDivElement>(acik, kapat);
  const baslikKimlik = useId();
  if (!acik) return null;

  return createPortal(
    <div className="tc-perde" onMouseDown={(o) => { if (o.target === o.currentTarget) kapat(); }}>
      <div
        ref={kutu}
        className={`tc-pencere tc-pencere-${tur}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ust === undefined ? baslikKimlik : undefined}
        aria-label={ust === undefined ? undefined : baslik}
        tabIndex={-1}
      >
        {ust === undefined
          ? (
            <header className="tc-pencere-ust">
              <h2 id={baslikKimlik} className="tc-pencere-baslik">{baslik}</h2>
              <button type="button" className="tc-pencere-kapat" onClick={kapat} aria-label="Kapat">
                <Simge ad="x" />
              </button>
            </header>
          )
          : ust}
        <div className="tc-pencere-govde">{children}</div>
        {alt && <footer className="tc-pencere-alt">{alt}</footer>}
      </div>
    </div>,
    document.body,
  );
}
