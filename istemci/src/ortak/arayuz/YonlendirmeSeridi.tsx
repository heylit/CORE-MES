import { Link } from 'react-router-dom';
import type { Aciliyet } from '#paylasilan/sozlesme/pano.ts';
import type { IsSatiri } from '../rota/ana-sayfa.ts';
import type { RozetTonu } from './Rozet.tsx';
import { Simge } from './Simge.tsx';
import './rol-panosu.css';

export const ACILIYET_ADI: Readonly<Record<Aciliyet, string>> = { gecikmis: 'Gecikmiş', bekliyor: 'Bekliyor', bugun: 'Bugün', hafta: 'Bu hafta' };
export const ACILIYET_TONU: Readonly<Record<Aciliyet, RozetTonu>> = { gecikmis: 'hata', bekliyor: 'uyari', bugun: 'bilgi', hafta: 'pasif' };
const SERIT_ETIKETI: Readonly<Record<Aciliyet, string>> = { gecikmis: 'Hemen bak', bekliyor: 'Seni bekliyor', bugun: 'Sıradaki işin', hafta: 'Sıradaki işin' };

// Yönlendirme (kart 1585): rolün o anki en acil tek işi, nedeni ve tek düğmesiyle. Seçimi kabuk yapar (sıralı listenin başı).
export function YonlendirmeSeridi({ satir }: { satir: IsSatiri }) {
  const { kalem, kaynak } = satir;
  const neden = kalem.neden ?? kalem.ayrinti;
  return (
    <section className="tc-yonlendirme" data-aciliyet={kalem.aciliyet} aria-label="Yönlendirme">
      <span className="tc-yonlendirme-simge" aria-hidden="true"><Simge ad={kaynak.simge} /></span>
      <div className="tc-yonlendirme-govde">
        <p className="tc-yonlendirme-etiket">{SERIT_ETIKETI[kalem.aciliyet]} · {kaynak.baslik}</p>
        <p className="tc-yonlendirme-baslik">{kalem.baslik}</p>
        {neden !== null && <p className="tc-yonlendirme-neden">{neden}</p>}
      </div>
      <Link className="tc-dugme tc-dugme-birincil tc-dugme-normal tc-yonlendirme-eylem" to={kalem.yol}>
        {kalem.eylem}<Simge ad="chev-right" boyut="k" />
      </Link>
    </section>
  );
}
