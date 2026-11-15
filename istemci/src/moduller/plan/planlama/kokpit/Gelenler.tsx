import { useState } from 'react';
import { Dugme, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { GELEN_ADI, gelenTonu, type Gelen } from './gelenler.ts';

// Gelenler kutusu (3282): yeni ve değişen işler. Plansız emirde "Yerleştir" emri seçer; ayrıntı plana alma seçeneklerini gösterir (3233 a:
// yalnız o emir, boş yere). Olayda emir Kokpit'teyse "Göster" onu seçer. Telefonda ve tablette kapanabilir şerittir.
export interface GelenlerOzellikleri {
  l: readonly Gelen[];
  sec: (emirId: string) => void;
  // Yazamayan kişide Yerleştir yerine Göster çıkar. Satır düğmesi ikincildir: sayfanın tek birincili üst çubuktadır (2155-9 a).
  yazabilir: boolean;
  secEmir: string | null;
}

const ILK_GORUNEN = 6;

export function Gelenler({ l, sec, yazabilir, secEmir }: GelenlerOzellikleri) {
  const [acik, setAcik] = useState(true);
  const [hepsi, setHepsi] = useState(false);
  const gorunen = hepsi ? l : l.slice(0, ILK_GORUNEN);
  return (
    <section className="tc-pyq-gelenler" aria-label="Gelenler" data-acik={acik}>
      <h2>
        <button type="button" aria-expanded={acik} onClick={() => { setAcik(!acik); }}>
          <Simge ad="list" boyut="k" /><span>Gelenler</span><b className="tc-pyq-rozet">{l.length}</b><Simge ad={acik ? 'up' : 'down'} boyut="k" />
        </button>
      </h2>
      {acik && (l.length === 0 ? <p className="tc-pyq-not">Yeni ya da değişen iş yok. Plan son canlıya almadan beri güncel.</p> : (
        <>
          <ul>
            {gorunen.map((g) => (
              <li key={g.anahtar} aria-current={g.emirId !== null && g.emirId === secEmir}>
                <div className="tc-pyq-gelen-bas"><b className="tc-pyq-mono">{g.baslik}</b><Rozet ton={gelenTonu(g.tur)} gorunum="cizgi">{GELEN_ADI[g.tur]}</Rozet></div>
                <p>{g.metin}</p>
                {g.emirId !== null && (
                  <Dugme className="tc-pyq-gelen-dugme" tur="ikincil" simge={g.tur === 'yeni' && yazabilir ? 'check' : 'eye'}
                    onClick={() => { if (g.emirId !== null) sec(g.emirId); }}>
                    {g.tur === 'yeni' && yazabilir ? 'Yerleştir' : 'Göster'}
                  </Dugme>
                )}
              </li>
            ))}
          </ul>
          {l.length > ILK_GORUNEN && (
            <button type="button" className="tc-pyq-kucuk" onClick={() => { setHepsi(!hepsi); }}>{hepsi ? 'Daha az göster' : `Tümü (${String(l.length)})`}</button>
          )}
        </>
      ))}
    </section>
  );
}
