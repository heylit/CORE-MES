import { Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Kapı kontrolleri büyük EVET/HAYIR satırlarıdır: tek dokunuşla değişir, durum yazıyla da söylenir (renk tek başına anlam taşımaz).
export function EvetHayir({ simge, ad, deger, degistir, zorunlu = false }: {
  simge: SimgeAdi; ad: string; deger: boolean; degistir: (d: boolean) => void; zorunlu?: boolean;
}) {
  return (
    <button type="button" className={`tc-nz-evet-hayir${deger ? ' tc-nz-evet' : ''}`} aria-pressed={deger} onClick={() => degistir(!deger)}>
      <Simge ad={simge} />
      <span className="tc-nz-evet-hayir-ad">{ad}{zorunlu && ' *'}</span>
      <strong>{deger ? 'EVET' : 'HAYIR'}</strong>
    </button>
  );
}
