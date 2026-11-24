import { Dugme } from '../../../../ortak/arayuz/index.ts';

// Şablonun adım dizisi, Ürünler ve Rotalar'daki hat gibi soldan sağa akar: her adım bir kart (kısa kod ve OP, ad, istasyon, katalog süresi).
// Şablonda dal yoktur; hat tek şeritlidir. Renk tek başına anlam taşımaz: kod ve ad her zaman yazılır.

export interface HatAdimi { anahtar: string; kod: string; renk: string; ad: string; operasyon: string; istasyon: string | null; sure: string }

interface Duzen { tasi: (i: number, yon: -1 | 1) => void; kaldir: (i: number) => void }

export function SablonHatti({ adimlar, etiket, duzen }: { adimlar: readonly HatAdimi[]; etiket: string; duzen?: Duzen }) {
  if (adimlar.length === 0) return <p className="tc-rs-ipucu">Henüz adım yok.</p>;
  return (
    <div className="tc-rs-hat" role="group" aria-label={etiket} tabIndex={0}>
      <ol className="tc-rs-hat-ic" aria-label="Adımlar">
        {adimlar.map((x, i) => (
          <li key={x.anahtar} className="tc-rs-hat-oge">
            {i > 0 && <span className="tc-rs-hat-ok" aria-hidden="true" />}
            <div className={`tc-rr1-hk tc-rs-kart ${x.renk}`}>
              <span className="tc-rr1-hk-bar"><span className="tc-rr1-abbr">{x.kod}</span><span className="tc-rr1-oseq">{`OP ${String((i + 1) * 10)}`}</span></span>
              <b className="tc-rr1-hk-ad" title={x.ad}>{x.ad}</b>
              {x.ad !== x.operasyon && <small className="tc-rr1-hk-ist" title={x.operasyon}>{x.operasyon}</small>}
              <small className="tc-rr1-hk-ist">{x.istasyon ?? 'istasyon yok'}</small>
              <small className="tc-rr1-hk-sure">{x.sure}</small>
              {duzen && (
                <span className="tc-rs-kart-dugme">
                  <Dugme tur="ikincil" simge="chev-left" aria-label={`${x.ad} sola`} disabled={i === 0} onClick={() => { duzen.tasi(i, -1); }} />
                  <Dugme tur="ikincil" simge="chev-right" aria-label={`${x.ad} sağa`} disabled={i === adimlar.length - 1} onClick={() => { duzen.tasi(i, 1); }} />
                  <Dugme tur="ikincil" simge="x" aria-label={`${x.ad} kaldır`} onClick={() => { duzen.kaldir(i); }} />
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
