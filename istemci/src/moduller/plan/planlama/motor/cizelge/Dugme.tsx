import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { MOTOR_NOTU } from '../ortak.tsx';

// Panellerin küçük düğmesi: işlevi yoksa görünür ve pasiftir (357 b), nedeni ipucunda.
export interface DugmeOzu { simge?: SimgeAdi; birincil?: boolean; tehlike?: boolean; hayalet?: boolean; yap?: (() => void) | null; not?: string; ipucu?: string }
export function Dg({ ad, simge, birincil, tehlike, hayalet, yap, not = MOTOR_NOTU, ipucu }: DugmeOzu & { ad: string }) {
  const sinif = `tc-dugme tc-pym-kucuk${birincil ? ' tc-dugme-birincil' : ''}${tehlike ? ' tc-dugme-tehlike' : ''}${hayalet ? ' tc-pym-hayalet' : ''}`;
  return (
    <button type="button" className={sinif} aria-disabled={yap ? undefined : 'true'} title={yap ? ipucu : `${ad}: ${not}`} onClick={yap ?? undefined}>
      {simge && <Simge ad={simge} boyut="k" />}{ad}
    </button>
  );
}
