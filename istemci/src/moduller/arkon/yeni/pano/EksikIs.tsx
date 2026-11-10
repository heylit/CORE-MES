import {
  anomaliAdedi, EKSIK_IS_ETIKETI, eksikDegerMetni, eksikKonuMetni, OLCUM_NEDENI_ETIKETI, type EksikIs, type EksikIsler, type EksikIsTuru,
} from '../../../../../../arkon/web/src/data/anomali.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { Renk } from './kurallar.ts';
import { Cip } from './ortak.tsx';

// Eksik iş (kart 2421 c): plandan bağımsız; plan yeniden canlıya alınmasa da yapılmayan, girilmeyen ve geciken iş görünür.
const EKSIK_SIMGESI: Record<EksikIsTuru, SimgeAdi> = {
  'plan-gerisi': 'gantt', 'kayitsiz-gun': 'clipboard-check', 'yarim-is': 'pause', 'plansiz-is': 'calendar', 'geciken-emir': 'truck', 'bayat-plan': 'rotate', 'olcumsuz-is': 'ruler', 'geride-onceki': 'list',
};
const EKSIK_RENGI: Record<EksikIsTuru, Renk> = {
  'plan-gerisi': 'stop', 'kayitsiz-gun': 'stop', 'yarim-is': 'hold', 'plansiz-is': 'hazard', 'geciken-emir': 'stop', 'bayat-plan': 'hazard', 'olcumsuz-is': 'hazard', 'geride-onceki': 'hold',
};
export function EksikSatiri({ o }: { o: EksikIs }) {
  const yer = o.konu === 'istasyon' ? '' : [o.istasyon?.ad, o.kaynak?.ad].filter((x): x is string => !!x).join(' · ');
  return (
    <div className="tc-ay3-anom-satir">
      <div><b>{eksikKonuMetni(o)}</b>{yer ? <small className="tc-ay3-not"> {yer}</small> : null}</div>
      <div className="mono">{eksikDegerMetni(o)}</div>
      <div className="tc-ay3-anom-sag">
        <Cip renk={o.kapanis === null ? EKSIK_RENGI[o.tur] : 'done'} simge={o.kapanis === null ? EKSIK_SIMGESI[o.tur] : 'check'}>{EKSIK_IS_ETIKETI[o.tur]}{o.kapanis === null ? '' : ' · giderildi'}</Cip>
        {o.kalanAdet !== null && o.tur !== 'geride-onceki' && <small>{anomaliAdedi(o.kalanAdet)} adet kaldı</small>}
        {o.nedenler.length > 0 && <small>{o.nedenler.map((n) => OLCUM_NEDENI_ETIKETI[n]).join(', ')}</small>}
      </div>
    </div>
  );
}
export function EksikOzeti({ e }: { e: EksikIsler }) {
  return (
    <div className="tc-ay3-anom-ozet" aria-label="Eksik iş özeti">
      {(Object.keys(EKSIK_IS_ETIKETI) as EksikIsTuru[]).map((t) => (
        <div key={t} className="tc-ay3-anom-ozet-kutu"><Simge ad={EKSIK_SIMGESI[t]} /><b className="mono">{e.ozet[t]}</b><small>{EKSIK_IS_ETIKETI[t].toLocaleLowerCase('tr')}</small></div>
      ))}
    </div>
  );
}

