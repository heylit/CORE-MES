import { Simge } from '../../../../ortak/arayuz/index.ts';
import { PLAN_ETIKETI, SIRA_ONAYI, planEtiketi, siraOnayi, tmiPlani, type PlanEtiketi, type PlanliPaket, type SiraOnayi } from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import { Cip } from './denetimler.tsx';
import type { Ton } from './tipler.ts';

// Rotalı işin plan durumu (hazirlik.ts PlanChip; data/tmi-plan.ts): operatöre yalnız canlı planda eşleşen iş düşer, sıra canlı plandandır.
const PLAN_TONU: Readonly<Record<PlanEtiketi, Ton>> = { planlanmadi: 'idle', 'kaynak-farkli': 'stop', 'hazirlik-bekliyor': 'hold' };
const SIRA_TONU: Readonly<Record<SiraOnayi, Ton>> = { taslakta: 'idle', onayda: 'hold' };

export function PlanCipi({ paket, sira = false }: { paket: PlanliPaket; sira?: boolean }) {
  const e = planEtiketi(paket);
  const d = tmiPlani(paket);
  const o = siraOnayi(paket);
  return (
    <>
      {e ? <Cip ton={PLAN_TONU[e]}><Simge ad={e === 'hazirlik-bekliyor' ? 'clock' : 'alert'} boyut="k" />{PLAN_ETIKETI[e]}</Cip> : null}
      {o ? <span title="Sıra canlıya plan onaylanıp canlıya alınınca geçer"><Cip ton={SIRA_TONU[o]}><Simge ad="clock" boyut="k" />{SIRA_ONAYI[o]}</Cip></span> : null}
      {sira && d && d.canli && d.sira ? <span className="tc-ay2-mini">Plan sırası {d.sira}</span> : null}
    </>
  );
}
