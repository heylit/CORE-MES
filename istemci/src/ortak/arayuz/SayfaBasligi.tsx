import type { ReactNode } from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Dugme } from './Dugme.tsx';
import { Menu, type MenuOgesi } from './Menu.tsx';
import { Simge } from './Simge.tsx';
import './sayfa-basligi.css';

export interface BirincilEylem {
  etiket: string;
  simge?: SimgeAdi;
  yap: () => void;
  pasif?: boolean;
  yukleniyor?: boolean;
}

interface Ozellikler {
  baslik: string;
  simge?: SimgeAdi;
  alt?: ReactNode;
  birincil?: BirincilEylem;
  // İkincil işlemler tek "diğer işlemler" düğmesinin altında toplanır; boşsa düğme çizilmez.
  eylemler?: readonly MenuOgesi[];
}

// Kabuk sayfa adını h1 olarak yazar; bu başlık sayfanın içindeki görünümün adıdır (h2).
// Dar ekranda tek satırda kalır: başlık kısalır, eylemler yerinde durur; simgeli birincil düğmenin metni gizlenir (erişilebilir adda kalır).
export function SayfaBasligi({ baslik, simge, alt, birincil, eylemler = [] }: Ozellikler) {
  return (
    <header className="tc-sbaslik">
      <div className="tc-sbaslik-bas">
        <h2 className="tc-sbaslik-ad" title={baslik}>
          {simge && <Simge ad={simge} />}
          <span className="tc-sbaslik-metin">{baslik}</span>
        </h2>
        {alt && <div className="tc-sbaslik-alt">{alt}</div>}
      </div>
      {(birincil || eylemler.length > 0) && (
        <div className="tc-sbaslik-eylem">
          <Menu etiket={`${baslik}: diğer işlemler`} ogeler={eylemler} ipucu="Diğer işlemler" />
          {birincil && (
            <Dugme
              tur="birincil" simge={birincil.simge} onClick={birincil.yap} disabled={birincil.pasif} yukleniyor={birincil.yukleniyor}
              className={birincil.simge ? 'tc-sbaslik-birincil' : undefined}
            >
              <span className="tc-sbaslik-birincil-metin">{birincil.etiket}</span>
            </Dugme>
          )}
        </div>
      )}
    </header>
  );
}
