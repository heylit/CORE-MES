import { OnayPenceresi } from '../../ortak/arayuz/index.ts';
import type { MakineDoluRedi } from './baglanti.ts';
import './arkon.css';

// Makine (ya da makinesiz işin istasyon yeri) başka işte doluyken başlatma reddedilir; kullanıcı o işi durdurup kendi işini başlatmayı onaylayabilir.
export const devralMetni = (red: MakineDoluRedi): string => {
  const { doluOlan } = red;
  const yer = doluOlan.makine === null ? 'bu istasyonda' : `${doluOlan.makine.ad} makinesinde`;
  return `${doluOlan.kisi.ad}, ${yer} ${doluOlan.emir.emirNo} işini başlattı, önce durdurulmalı.`;
};

interface Ozellikler {
  red: MakineDoluRedi | null;
  yukleniyor: boolean;
  onayla: () => void;
  vazgec: () => void;
}

export function MakineDevralPenceresi({ red, yukleniyor, onayla, vazgec }: Ozellikler) {
  return (
    <OnayPenceresi
      acik={red !== null}
      baslik="Makine dolu"
      onayMetni="Durdur ve başlat"
      yukleniyor={yukleniyor}
      onayla={onayla}
      vazgec={vazgec}
    >
      {red !== null && (
        <div className="tc-arkon-devral">
          <p>{devralMetni(red)}</p>
          <p className="tc-arkon-devral-not">Onaylarsanız o iş durdurulur ve sizin işiniz başlatılır.</p>
        </div>
      )}
    </OnayPenceresi>
  );
}
