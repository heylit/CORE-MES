import { renkSinifi } from './ortak.tsx';
import type { Operasyon } from './kurallar.ts';
import type { RotaSablonu } from './sablonSecimi.ts';

// Düğme içinde de durur (pencere satırı): öğeler span'dir.
// Şablon ve rota kartlarında operasyon sırası: kısa kod, istasyonun rengi. Renk tek başına anlam taşımaz; kod her zaman yazılır.
export interface SeritOgesi { anahtar: string; kod: string; renk: string }

export const sablonSeridi = (s: RotaSablonu, opBul: (id: string) => Operasyon | undefined): SeritOgesi[] =>
  [...s.adimlar].sort((a, b) => a.sira - b.sira).map((x) => {
    const op = opBul(String(x.operasyonTipi.id));
    return { anahtar: String(x.sira), kod: op?.abbr ?? x.operasyonTipi.kod, renk: renkSinifi(op?.stationId ?? null) };
  });

export function OpCipi({ kod, renk }: { kod: string; renk: string }) {
  return <span className={`tc-rr1-opcip ${renk}`}>{kod}</span>;
}

export function OpSeridi({ ogeler, etiket }: { ogeler: readonly SeritOgesi[]; etiket: string }) {
  return (
    <span className="tc-rr1-cipler" role="list" aria-label={etiket}>
      {ogeler.map((o) => <span key={o.anahtar} role="listitem"><OpCipi kod={o.kod} renk={o.renk} /></span>)}
    </span>
  );
}
