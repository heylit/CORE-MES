import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { BosCalisma, BosPlan } from '../BosPlan.tsx';
import { usePlanKur } from '../coz.ts';
import { bitenler, derle, girdiKur, planOku, plandanBitenler, type OkunanPlan } from '../kurallar.ts';
import { useCanliFarki } from './canli-farki.ts';
import type { CanliFark } from './kurallar.ts';
import { OnaySekmesi } from './Onay.tsx';
import { Pano } from './Pano.tsx';
import { PlanGercek } from './PlanGercek.tsx';
import '../motor.css';
import './atolye.css';

// Planlama atölyesi (eski sayfanın tek stüdyosu, zz32-tek-studyo sTekStudyo): kimlik satırı, üç sekme ve ipucu; Plan sekmesi tezgâh panosudur
// (zz36). Üstte eski sayfanın tek sekmeli başlığı; akış adımları eski çerçevenindir (208 a); ipucu Plan sekmesinde eskisi gibi gizli.
// Onay ve canlı plan modülünün senaryolarındandır; geçişin cevabı listeyi yeniler. Plan ve gerçekleşen taban ve canlı planı sunucudan okur
// (505 a). Canlı sürüm sunucunun canlı planından okunur (221 c).
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
  const [sen, setSen] = useState<SenaryolarCevabi | null>(o.depo.senaryolar);
  useEffect(() => { setSen(o.depo.senaryolar); }, [o.depo.senaryolar]);
  const onayda = sen?.senaryolar.filter((s) => s.durum === 'onayda').length ?? 0;
  const p = useMemo(() => planOku(c), [c]);
  const cf = useCanliFarki(c, sen?.canliSurum ?? null);
  const ipucu = IPUCU[sek];
  return (
    <div className="tc-pym tc-pym-tp" data-sek={sek}>
      {/* Tek satır: sekmeler ve canlı sürüm. Sayfa adı menüde ve plan çubuğunda yazılı; burada tekrar edilmez (3042, tahtaya yer). */}
      <div className="tc-pym-tp-bas">
        <div className="tc-pym-tp-sek" role="tablist" aria-label="Stüdyo sekmeleri">
          {SEKMELER.map(([k, s, ad]) => (
            <button key={k} type="button" role="tab" aria-label={ad} aria-selected={sek === k} onClick={() => setSek(k)}>
              <Simge ad={s} boyut="k" /><span>{ad}</span>{k === 'onay' && onayda > 0 && <b className="tc-pym-tp-say">{onayda}</b>}
            </button>
          ))}
        </div>
        <div className="tc-pym-tp-kimlik">
          <span className="tc-pym-tp-surum" title="Uyguladığın değişiklik bu sürüme göre hesaplanır"><Simge ad="flag" boyut="k" />{`Canlı sürüm ${canli ?? '—'}`}</span>
        </div>
      </div>
      {ipucu && <p className="tc-pym-tp-ipucu"><Simge ad="help" boyut="k" /><span>{ipucu}</span></p>}
      {sek === 'onay' ? <OnaySekmesi o={o} c={c} p={p} cf={cf} sen={sen} senYaz={setSen} planSekmesi={() => setSek('plan')} />
        : <PlanSekmesi o={o} c={c} p={p} cf={cf} sek={sek} sekSec={setSek} onayda={onayda} sen={sen} senYaz={setSen} />}
    </div>
  );
}

function PlanSekmesi({ o, c, p, cf, sek, sekSec, onayda, sen, senYaz }: {
  o: PlanlamaEkranOzellikleri; c: PlanlamaCalismasi | null; p: OkunanPlan | null; cf: CanliFark | null; sek: AtolyeSekmesi; sekSec: (s: AtolyeSekmesi) => void; onayda: number;
  sen: SenaryolarCevabi | null; senYaz: (s: SenaryolarCevabi) => void;
}) {
  const { bildir } = useBildirim();
  const planKur = usePlanKur(o, useCallback((ileti: string) => bildir('hata', ileti), [bildir]));
  if (!c) return <BosCalisma />;
  if (!p) {
    const emirler = o.depo.durum?.emirler ?? null;
    return <BosPlan c={c} cx={derle(girdiKur(c, emirler ? bitenler(emirler, c.D) : plandanBitenler(c, null), Date.now()))} planKur={planKur} planYaz={o.yetki.planYaz} />;
  }
  if (sek === 'pg') return <PlanGercek o={o} c={c} p={p} canliSurum={sen?.canliSurum ?? null} />;
  return <Pano o={o} c={c} p={p} cf={cf} sekSec={sekSec} onayda={onayda} sen={sen} senYaz={senYaz} />;
}
