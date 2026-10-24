import * as K from '../../kurallar/index.ts';
import { useSihirbaz } from '../baglam.ts';
import { Baslangic } from './Baslangic.tsx';
import { DurumAdimi } from './DurumAdimi.tsx';
import { FormAdimi } from './FormAdimi.tsx';
import { GenelAdim, GenelBaslangic } from './GenelAlanlar.tsx';
import { KaliteAdimi } from './KaliteAdimi.tsx';
import { Operasyonlar } from './Operasyonlar.tsx';
import { OzetAdimi } from './OzetAdimi.tsx';
import { TeknikAdimi } from './TeknikAdimi.tsx';
import { GenelTicari, TicariAdimi } from './TicariAdimi.tsx';

const HAMMADDE = [Baslangic, KaliteAdimi, FormAdimi, DurumAdimi, TeknikAdimi, TicariAdimi, OzetAdimi] as const;

// Prototipte `[s0 ... s6][step]` ve `gRender(step)`. Reçete adımı türlerin adım listesinde olmadığı için çizilmez.
export function AdimGovdesi() {
  const { taslak: d, b, adim } = useSihirbaz();
  if (!K.isGen(d, b)) {
    const Adim = HAMMADDE[adim] ?? OzetAdimi;
    return <Adim />;
  }
  if (adim === 0) return <GenelBaslangic />;
  const st = K.turAdimlari(d, b)[adim - 1];
  if (!st) return null;
  if (st.ozel === 'ops') return <Operasyonlar />;
  if (st.ozel === 'ticari') return <GenelTicari />;
  if (st.ozel === 'ozet') return <OzetAdimi />;
  return <GenelAdim adim={st} />;
}
