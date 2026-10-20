import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { HizliIsGrubu } from '../rota/hizli-isler.ts';
import { Pencere } from './Pencere.tsx';
import { Simge } from './Simge.tsx';
import './is-paneli.css';

// Üst çubuktaki "Ne oldu?" düğmesi: kişi olayı seçer, panel onu işin yapıldığı ekrana götürür (finanstaki "Kayıt gir" gibi).
// Olaysız kişide düğme çizilmez.
export function IsPaneli({ gruplar }: { gruplar: readonly HizliIsGrubu[] }) {
  const [acik, setAcik] = useState(false);
  const git = useNavigate();
  if (gruplar.length === 0) return null;
  return (
    <>
      <button
        type="button"
        className="tc-kabuk-tema tc-is-paneli-dugme"
        onClick={() => setAcik(true)}
        aria-haspopup="dialog"
        aria-label="Ne oldu? Kayıt gir"
        title="Ne oldu? Kayıt gir"
      >
        <Simge ad="plus" />
        <span className="tc-kabuk-dugme-ad" aria-hidden="true">Kayıt gir</span>
      </button>
      <Pencere acik={acik} kapat={() => setAcik(false)} baslik="Ne oldu?" tur="yan">
        <p className="tc-is-paneli-alt">Olayı seçin; sizi işin yapıldığı ekrana götürür.</p>
        {gruplar.map((g) => (
          <section key={g.grup} className="tc-is-paneli-grup" aria-label={g.grup}>
            <h3 className="tc-is-paneli-grup-ad">{g.grup}</h3>
            <ul className="tc-is-paneli-liste">
              {g.isler.map((is) => (
                <li key={is.anahtar}>
                  <button
                    type="button"
                    className="tc-is-paneli-olay"
                    onClick={() => { setAcik(false); void git(is.yol); }}
                  >
                    <Simge ad={is.simge} />
                    <span className="tc-is-paneli-metin">
                      <b>{is.baslik}</b>
                      <span>{is.aciklama}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Pencere>
    </>
  );
}
