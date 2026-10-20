import { useLocation } from 'react-router-dom';
import { Simge } from '../../ortak/arayuz/index.ts';
import { TUM_BOLUMLER, type Bolum } from './bolumler.ts';
import './merkez.css';

// Son bakılan ürün: başka bölümden Ürün ve rotalar'a dönünce aynı ürün açılır (oturum boyunca, bellekte).
let sonBakilan: number | null = null;
export const sonUrun = (): number | null => sonBakilan;
export const sonUrunYaz = (id: number): void => { sonBakilan = id; };

// Ürün ve rotalar: /rota ve /rota/<ürün>; öteki bölümler kendi alt yolunda.
export function aktifBolum(yol: string): Bolum['anahtar'] {
  return TUM_BOLUMLER.find((b) => b.yol !== '/rota' && (yol === b.yol || yol.startsWith(`${b.yol}/`)))?.anahtar ?? 'rotalar';
}

// Henüz hazır olmayan bölüm: prototipteki başlık ve açıklama, gelecek içerik ve sırası.
export function MerkezBolumu() {
  const { pathname } = useLocation();
  const b = TUM_BOLUMLER.find((x) => x.anahtar === aktifBolum(pathname));
  return (
    <div className="tc-merkez">
      <section className="tc-sch2" aria-label={b?.baslik ?? 'Bölüm'}>
        <div className="tc-sec-head">
          <h2>{b?.baslik}</h2>
          {b?.aciklama && <p className="tc-rota-ipucu">{b.aciklama}</p>}
        </div>
        {b?.sirada && (
          <div className="tc-emptycv">
            <h3>{b.sirada.sira > 0 ? `Bu bölüm sırada (${b.sirada.sira}. iş)` : 'Bu bölüm bu turda yok'}</h3>
            <ul className="tc-rota-farklar">{b.sirada.icerik.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="tc-rota-ipucu"><Simge ad="alert" boyut="k" /> Tasarım ve işleyiş prototiptekiyle aynı olacak; hazır olunca bu sayfada açılır.</p>
          </div>
        )}
      </section>
    </div>
  );
}
