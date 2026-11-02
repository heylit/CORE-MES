import { OnayPenceresi } from '../../ortak/arayuz/index.ts';
import type { MakineDoluRedi } from './baglanti.ts';
import './arkon.css';

// Makine (ya da makinesiz işin istasyon yeri) başka işte doluyken başlatma reddedilir; kullanıcı o işi durdurup kendi işini başlatmayı onaylayabilir.
// ARK-5 b: aynı iş makinede başkasının çalışmasıyla sürüyorsa kullanıcı işi durdurmadan çalışmayı devralabilir.
export const devralMetni = (red: MakineDoluRedi): string => {
  if (red.tur === 'calisma') return `Bu iş makinede ${red.adlar.join(', ')} adına çalışıyor.`;
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
  const calisma = red?.tur === 'calisma';
  return (
    <OnayPenceresi
      acik={red !== null}
      baslik={calisma ? 'İş başkasında' : 'Makine dolu'}
      onayMetni={calisma ? 'Devral' : 'Durdur ve başlat'}
      yukleniyor={yukleniyor}
      onayla={onayla}
      vazgec={vazgec}
    >
      {red !== null && (
        <div className="tc-arkon-devral">
          <p>{devralMetni(red)}</p>
          <p className="tc-arkon-devral-not">
            {calisma ? 'Onaylarsanız iş durmaz; onların çalışması duraklatılır ve iş sizin adınıza sürer.' : 'Onaylarsanız o iş durdurulur ve sizin işiniz başlatılır.'}
          </p>
        </div>
      )}
    </OnayPenceresi>
  );
}
