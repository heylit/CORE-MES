import { useId } from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Simge } from './Simge.tsx';
import './gruplu-secim.css';

export interface SecimDugmesi<D extends string | number> {
  deger: D;
  baslik: string;
  alt?: string;
  simge?: SimgeAdi;
}

export interface SecimGrubu<D extends string | number> {
  anahtar: string | number;
  baslik: string;
  secenekler: readonly SecimDugmesi<D>[];
}

interface Ozellikler<D extends string | number> {
  etiket: string;
  gruplar: readonly SecimGrubu<D>[];
  secili?: D | null;
  sec: (deger: D) => void;
  bosMesaj?: string;
}

export function GrupluSecim<D extends string | number>({
  etiket, gruplar, secili = null, sec, bosMesaj = 'Seçenek yok',
}: Ozellikler<D>) {
  const kimlik = useId();
  const dolu = gruplar.filter((g) => g.secenekler.length > 0);
  if (dolu.length === 0) return <DurumKutusu durum="bos" mesaj={bosMesaj} />;

  return (
    <div className="tc-gsecim" role="group" aria-label={etiket}>
      {dolu.map((g) => (
        <div key={g.anahtar} className="tc-gsecim-grup" role="group" aria-labelledby={`${kimlik}-${g.anahtar}`}>
          <span id={`${kimlik}-${g.anahtar}`} className="tc-gsecim-baslik">{g.baslik}</span>
          <div className="tc-gsecim-izgara">
            {g.secenekler.map((s) => (
              <button
                key={s.deger}
                type="button"
                className={s.deger === secili ? 'tc-gsecim-dugme tc-gsecim-dugme-secili' : 'tc-gsecim-dugme'}
                aria-pressed={s.deger === secili}
                onClick={() => { sec(s.deger); }}
              >
                {s.simge && <Simge ad={s.simge} />}
                <span className="tc-gsecim-metin">
                  <b>{s.baslik}</b>
                  {s.alt && <small>{s.alt}</small>}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
