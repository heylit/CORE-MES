import { useMemo, useState } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { BosCalisma, BosPlan } from '../BosPlan.tsx';
import { bitenler, derle, girdiKur, planOku, plandanBitenler } from '../kurallar.ts';
import { HAZIRLANIYOR } from '../ortak.tsx';
import { Pano } from './Pano.tsx';
import '../motor.css';
import './atolye.css';

// Planlama atölyesi (eski sayfanın tek stüdyosu, zz32-tek-studyo sTekStudyo): kimlik satırı, üç sekme ve ipucu; Plan sekmesi tezgâh panosudur
// (zz36). Eski stüdyonun alt başlığı ve akış adımları eski çerçevenindir (208 a); ipucu Plan sekmesinde eskisi gibi gizli.
// Onay ve canlı ile Plan ve gerçekleşen sonraki teslimdedir (P1f). Canlı sürüm sunucunun canlı planından okunur (221 c).
export type AtolyeSekmesi = 'plan' | 'onay' | 'pg';
const SEKMELER: [AtolyeSekmesi, SimgeAdi, string][] = [['plan', 'layers', 'Plan'], ['onay', 'check', 'Onay ve canlı'], ['pg', 'chart', 'Plan ve gerçekleşen']];
const IPUCU: Record<AtolyeSekmesi, string | null> = {
  plan: null,
  onay: 'Çalışma planını canlıyla karşılaştırın, onaya gönderin ya da canlıya alın. Canlıya alınmış planlar silinmez; Geçmiş planlar listesindedir.',
  pg: 'Taban plan, son canlı plan ve gerçekleşeni karşılaştırın. Nedenler sayım, arıza, malzeme ve fason kayıtlarından kendiliğinden çıkar; buradan plan değişmez.',
};

export function PlanlamaAtolyesi(o: PlanlamaEkranOzellikleri) {
  const [sek, setSek] = useState<AtolyeSekmesi>('plan');
  const c = o.calisma;
  const canli = o.depo.planSurumu?.planSurumu ?? null;
  const onayda = o.depo.senaryolar?.senaryolar.filter((s) => s.durum === 'onayda').length ?? 0;
  const ipucu = IPUCU[sek];
  return (
    <div className="tc-pym tc-pym-tp" data-sek={sek}>
      <div className="tc-pym-tp-bas">
        <div className="tc-pym-tp-kimlik">
          <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label="Planlama motoruna dön" title="Planlama motoruna dön" onClick={() => o.git('plan')}>
            <Simge ad="chev-left" boyut="k" />
          </button>
          <span className="tc-pym-tp-surum" title="Uyguladığın değişiklik bu sürüme göre hesaplanır"><Simge ad="flag" boyut="k" />{`Canlı sürüm ${canli ?? '—'}`}</span>
          <span className="tc-pym-tp-kip"><Simge ad="edit" boyut="k" />Düzenleme</span>
        </div>
        <div className="tc-pym-tp-sek" role="tablist" aria-label="Stüdyo sekmeleri">
          {SEKMELER.map(([k, s, ad]) => (
            <button key={k} type="button" role="tab" aria-label={ad} aria-selected={sek === k} onClick={() => setSek(k)}>
              <Simge ad={s} boyut="k" /><span>{ad}</span>{k === 'onay' && onayda > 0 && <b className="tc-pym-tp-say">{onayda}</b>}
            </button>
          ))}
        </div>
      </div>
      {ipucu && <p className="tc-pym-tp-ipucu"><Simge ad="help" boyut="k" /><span>{ipucu}</span></p>}
      {sek === 'plan' ? <PlanSekmesi o={o} c={c} sekSec={setSek} onayda={onayda} canli={canli} /> : <p className="tc-pym-tp-hazir"><Simge ad="clock" boyut="k" />{HAZIRLANIYOR}</p>}
    </div>
  );
}

function PlanSekmesi({ o, c, sekSec, onayda, canli }: { o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi | null; sekSec: (s: AtolyeSekmesi) => void; onayda: number; canli: number | null }) {
  const p = useMemo(() => planOku(c), [c]);
  if (!c) return <BosCalisma />;
  if (!p) {
    const emirler = o.depo.durum?.emirler ?? null;
    return <BosPlan c={c} cx={derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, null)))} />;
  }
  return <Pano o={o} c={c} p={p} sekSec={sekSec} onayda={onayda} canli={canli} />;
}
