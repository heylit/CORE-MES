import { Simge } from '../../ortak/arayuz/index.ts';
import { hazirlikOzeti, kareTonu, type MatrisAdimi } from './adim-matrisi.ts';

// 3738: adımın hazırlık özeti. Kare çubuk yalnız görseldir (yeşil tamam, kırmızı eksik, turuncu muaf ya da elle onay, boş gerekmez); anlam yanındaki
// "tamam/toplam" yazısı ve eksik simgesindedir, renk tek başına bilgi taşımaz.
export function HazirlikCubugu({ adim, sinif = '' }: { adim: MatrisAdimi; sinif?: string }) {
  const o = hazirlikOzeti(adim);
  return (
    <span className={`tc-am-hz ${sinif}`.trim()}>
      <span className="tc-am-kareler" aria-hidden="true">
        {adim.maddeler.map((m) => <i key={m.madde} className={`tc-am-kare tc-am-kare-${kareTonu(m)}`} />)}
      </span>
      <span className="tc-am-hz-sayi">{o.tamam}/{o.toplam}</span>
      {o.eksik > 0 && <span className="tc-am-hz-eksik" title={`${String(o.eksik)} eksik`}><Simge ad="x" boyut="k" />{o.eksik}</span>}
      {o.elle > 0 && <span className="tc-am-hz-elle" title={`${String(o.elle)} madde elle`}><Simge ad="user" boyut="k" />{o.elle}</span>}
    </span>
  );
}
