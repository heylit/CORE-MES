import { sayiYaz, type Dagilim } from './kurallar.ts';

// Yatay çubuk listesi (bugünkü "bars"): etiket, çubuk, değer. Genişlik SVG özniteliğidir; renk analiz.css'ten.
export function Cubuklar({ satirlar, tur = 'ana', enBuyuk }: { satirlar: Dagilim; tur?: 'ana' | 'ikinci' | 'beyaz' | 'mavi'; enBuyuk?: number }) {
  if (!satirlar.length) return <p className="tc-ikr-soluk">Gösterilecek veri yok.</p>;
  const max = Math.max(...satirlar.map((s) => s[1]), enBuyuk ?? 0) || 1;
  return (
    <div className="tc-ikr-cubuklar">
      {satirlar.map(([etiket, deger, gosterim]) => (
        <div key={etiket} className="tc-ikr-cubuk-satir">
          <span className="tc-ikr-cubuk-ad" title={etiket}>{etiket}</span>
          <svg className={`tc-ikr-cubuk tc-ikr-cubuk-${tur}`} viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label={`${etiket}: ${gosterim ?? sayiYaz(deger)}`}>
            <rect className="tc-ikr-cubuk-zemin" x="0" y="0" width="100" height="10" rx="2" />
            <rect className="tc-ikr-cubuk-dolu" x="0" y="0" width={Math.max(0, Math.min(100, (deger / max) * 100))} height="10" rx="2" />
          </svg>
          <span className="tc-ikr-cubuk-deger">{gosterim ?? sayiYaz(deger)}</span>
        </div>
      ))}
    </div>
  );
}

// Beyaz ve mavi yaka bölünmesi; küçükte yazısız. Geometri yüzdeyle verilir (viewBox yok): yazı ölçeklenmez, kutu genişliğine yayılır.
export function YakaBolunmesi({ beyaz, mavi, kucuk = false, etiket }: { beyaz: number; mavi: number; kucuk?: boolean; etiket?: string }) {
  const n = beyaz + mavi || 1;
  const b = (beyaz / n) * 100;
  const yuzde = (x: number) => Math.round((x / n) * 100);
  return (
    <svg className={`tc-ikr-yaka${kucuk ? ' tc-ikr-yaka-kucuk' : ''}`} role="img" aria-label={etiket ?? `${beyaz} beyaz yaka, ${mavi} mavi yaka`}>
      {beyaz > 0 && <rect className="tc-ikr-yaka-beyaz" x="0" y="0" width={`${b}%`} height="100%" />}
      {mavi > 0 && <rect className="tc-ikr-yaka-mavi" x={`${b}%`} y="0" width={`${100 - b}%`} height="100%" />}
      {!kucuk && beyaz > 0 && <text className="tc-ikr-yaka-yazi" x={`${b / 2}%`} y="50%" textAnchor="middle" dominantBaseline="central">{`Beyaz yaka %${yuzde(beyaz)}`}</text>}
      {!kucuk && mavi > 0 && <text className="tc-ikr-yaka-yazi tc-ikr-yaka-yazi-ters" x={`${b + (100 - b) / 2}%`} y="50%" textAnchor="middle" dominantBaseline="central">{`Mavi yaka %${yuzde(mavi)}`}</text>}
    </svg>
  );
}

export function YakaGostergesi({ beyaz, mavi, sayili = true }: { beyaz?: number; mavi?: number; sayili?: boolean }) {
  return (
    <div className="tc-ikr-gosterge">
      <span><i className="tc-ikr-gosterge-beyaz" />Beyaz yaka{sayili ? `: ${beyaz ?? 0} kişi` : ''}</span>
      <span><i className="tc-ikr-gosterge-mavi" />Mavi yaka{sayili ? `: ${mavi ?? 0} kişi` : ''}</span>
    </div>
  );
}
