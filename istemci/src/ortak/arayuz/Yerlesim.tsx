import type { ReactNode } from 'react';
import type { MakineDurumu } from './durum.ts';
import './yerlesim.css';

interface CamOzellikleri {
  // sahne: içeriği ortalayan büyük bölme (kadran ve düğmeler için).
  duzen?: 'duz' | 'sahne';
  etiket?: string;
  // Dar iç boşluk: içeriğin ilk ekrana sığması gereken yoğun bölmeler için.
  siki?: boolean;
  children: ReactNode;
}

export function CamYuzey({ duzen = 'duz', etiket, siki = false, children }: CamOzellikleri) {
  const sinif = `tc-cam ${duzen === 'sahne' ? 'tc-cam-sahne' : 'tc-cam-duz'}${siki ? ' tc-cam-siki' : ''}`;
  return etiket
    ? <section className={sinif} aria-label={etiket}>{children}</section>
    : <div className={sinif}>{children}</div>;
}

interface YerlesimOzellikleri {
  // Altındaki kadran, rozet ve düğmelerin durum rengini belirler.
  durum?: MakineDurumu;
  sol: ReactNode;
  orta: ReactNode;
  sag?: ReactNode;
  // orta-genis: üç sütunda orta bölme genişler (sağda liste varken sayım düğmeleri sığsın). İki sütunda orta
  // zaten kalan yeri alır; seçenek orada bir şey değiştirmez.
  oran?: 'dengeli' | 'orta-genis';
}

// 1280 ve üstünde yan yana sütunlar; altında tek sütun ve aktif iş (orta) en üstte.
export function TerminalYerlesimi({ durum, sol, orta, sag, oran = 'dengeli' }: YerlesimOzellikleri) {
  const sinif = `tc-terminal${sag ? ' tc-terminal-uclu' : ''}${oran === 'orta-genis' ? ' tc-terminal-orta-genis' : ''}`;
  return (
    <div className={sinif} data-durum={durum}>
      <div className="tc-terminal-sutun tc-terminal-sol">{sol}</div>
      <div className="tc-terminal-sutun tc-terminal-orta">{orta}</div>
      {sag && <div className="tc-terminal-sutun tc-terminal-sag">{sag}</div>}
    </div>
  );
}
