import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IsSatiri } from '../rota/ana-sayfa.ts';
import { Rozet } from './Rozet.tsx';
import { Simge } from './Simge.tsx';
import { ACILIYET_ADI, ACILIYET_TONU } from './YonlendirmeSeridi.tsx';
import './rol-panosu.css';

const TUMU = '';
const ILK_GORUNEN = 8;

interface Ozellikler {
  // Sıralı (islerSirala); yönlendirmeye çıkan satır bu listede yoktur.
  satirlar: readonly IsSatiri[];
  // Boş dönen kaynakların "yolunda" metni; sıfır iş gizlenir ama alan unutulmaz.
  yolunda: readonly string[];
  // Okunamayan kaynakların başlığı: alınamayan veri "iş yok" sayılmaz.
  alinamayan: readonly string[];
  yukleniyor: boolean;
}

// İşlerim (kart 1585): modüller arası tek liste, aciliyete göre; her satır kaydı açar.
export function IsListesi({ satirlar, yolunda, alinamayan, yukleniyor }: Ozellikler) {
  const baslikKimlik = useId();
  const [tur, turYaz] = useState(TUMU);
  const [tumu, tumuYaz] = useState(false);
  const turler = [...new Set(satirlar.map((s) => s.kaynak.baslik))];
  const etkinTur = turler.includes(tur) ? tur : TUMU;
  const suzulmus = etkinTur === TUMU ? satirlar : satirlar.filter((s) => s.kaynak.baslik === etkinTur);
  const cizilen = tumu ? suzulmus : suzulmus.slice(0, ILK_GORUNEN);
  return (
    <section className="tc-kart tc-islerim" aria-labelledby={baslikKimlik}>
      <h2 id={baslikKimlik} className="tc-pano-baslik"><Simge ad="list" boyut="k" />İşlerim{satirlar.length > 0 && <span className="mono"> · {satirlar.length}</span>}</h2>
      {turler.length > 1 && (
        <div className="tc-islerim-suzgec" role="group" aria-label="İş türü">
          {[TUMU, ...turler].map((t) => {
            const sayi = t === TUMU ? satirlar.length : satirlar.filter((s) => s.kaynak.baslik === t).length;
            return (
              <button key={t} type="button" aria-pressed={etkinTur === t} onClick={() => { turYaz(t); tumuYaz(false); }}>
                {t === TUMU ? 'Tümü' : t} <span className="mono">{sayi}</span>
              </button>
            );
          })}
        </div>
      )}
      {cizilen.length > 0 && (
        <ul className="tc-islerim-liste">
          {cizilen.map(({ kalem, kaynak }) => (
            <li key={`${kaynak.anahtar}/${kalem.anahtar}`} className="tc-is-satiri" data-aciliyet={kalem.aciliyet}>
              <span className="tc-is-simge" aria-hidden="true"><Simge ad={kaynak.simge} /></span>
              <span className="tc-is-govde">
                <span className="tc-is-baslik">{kalem.baslik}</span>
                {kalem.ayrinti !== null && <span className="tc-is-ayrinti">{kalem.ayrinti}</span>}
              </span>
              <span className="tc-is-etiketler">
                <Rozet gorunum="cizgi" ton="pasif">{kaynak.baslik}</Rozet>
                <Rozet ton={ACILIYET_TONU[kalem.aciliyet]}>{ACILIYET_ADI[kalem.aciliyet]}</Rozet>
                <Link className="tc-dugme tc-dugme-ikincil tc-dugme-normal" to={kalem.yol}>{kalem.eylem}<Simge ad="chev-right" boyut="k" /></Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      {suzulmus.length > ILK_GORUNEN && (
        <button type="button" className="tc-dugme tc-dugme-ikincil tc-dugme-normal tc-pano-tumu" aria-expanded={tumu} onClick={() => tumuYaz((a) => !a)}>
          {tumu ? 'Daha az göster' : `Tümünü göster (${suzulmus.length})`}
        </button>
      )}
      {satirlar.length === 0 && (
        <p className="tc-pano-bos" role="status">
          {yukleniyor ? '…' : <><Simge ad="check" boyut="k" />Bekleyen işiniz yok.</>}
        </p>
      )}
      {alinamayan.length > 0 && (
        <p className="tc-islerim-hata" role="alert"><Simge ad="alert" boyut="k" />Alınamadı: {alinamayan.join(', ')}</p>
      )}
      {yolunda.length > 0 && (
        <ul className="tc-islerim-yolunda" aria-label="Sorunsuz alanlar">
          {yolunda.map((y) => <li key={y}><Rozet ton="tamam" gorunum="cizgi">{y}</Rozet></li>)}
        </ul>
      )}
    </section>
  );
}
