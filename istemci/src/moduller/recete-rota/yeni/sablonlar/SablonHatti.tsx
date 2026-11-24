import { useEffect, useRef, useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';

// Şablonun adım dizisi, Ürünler ve Rotalar'daki hat gibi soldan sağa akar: her adım bir kart (kısa kod ve sıra, ad, istasyon, katalog süresi).
// Şablonda dal yoktur; hat tek şeritlidir. Renk tek başına anlam taşımaz: kod ve ad her zaman yazılır.

export interface HatAdimi { anahtar: string; kod: string; renk: string; ad: string; operasyon: string; istasyon: string | null; sure: string }

interface Duzen { tasi: (i: number, yon: -1 | 1) => void; kaldir: (i: number) => void }

// Şablonda OP numarası yoktur (sunucu rotayı açarken ürünün son numarasına 10'ar ekler); kartta yalnız şablondaki sıra yazar.
export function SablonHatti({ adimlar, etiket, duzen }: { adimlar: readonly HatAdimi[]; etiket: string; duzen?: Duzen }) {
  const kok = useRef<HTMLDivElement>(null);
  const [duyuru, setDuyuru] = useState('');
  // Düzenlemede taşınan ya da eklenen kart görünür yere kayar, odak taşıyan düğmede kalır; sonuç duyurulur (dar ekranda hat yana kayar).
  const odak = useRef<{ anahtar: string; dugme: string } | null>(null);
  const onceki = useRef(adimlar.length);
  useEffect(() => {
    const yeniEklendi = adimlar.length > onceki.current;
    onceki.current = adimlar.length;
    const hedef = yeniEklendi ? adimlar.at(-1)?.anahtar : odak.current?.anahtar;
    if (duzen && hedef) {
      const kart = [...(kok.current?.querySelectorAll<HTMLElement>('[data-anahtar]') ?? [])].find((e) => e.dataset.anahtar === hedef);
      kart?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      if (yeniEklendi) setDuyuru(`${adimlar.at(-1)?.ad ?? 'Adım'} eklendi, ${String(adimlar.length)}. sırada.`);
      const d = odak.current?.dugme;
      if (d) kart?.querySelector<HTMLElement>(`[data-dugme="${d}"]`)?.focus();
    }
    odak.current = null;
  }, [adimlar, duzen]);
  if (adimlar.length === 0) return <p className="tc-rs-ipucu">Henüz adım yok.</p>;
  return (
    <div className="tc-rs-hat" role="group" aria-label={etiket} tabIndex={0} ref={kok}>
      <ol className="tc-rs-hat-ic" aria-label="Adımlar">
        {adimlar.map((x, i) => (
          <li key={x.anahtar} className="tc-rs-hat-oge">
            {i > 0 && <span className="tc-rs-hat-ok" aria-hidden="true" />}
            <div className={`tc-rr1-hk tc-rs-kart ${x.renk}`} data-anahtar={x.anahtar}>
              <span className="tc-rr1-hk-bar"><span className="tc-rr1-abbr">{x.kod}</span><span className="tc-rr1-oseq" title="Şablondaki sıra; OP numarasını sistem rota açılırken verir">{`${String(i + 1)}/${String(adimlar.length)}`}</span></span>
              <b className="tc-rr1-hk-ad" title={x.ad}>{x.ad}</b>
              {x.ad !== x.operasyon && <small className="tc-rr1-hk-ist" title={x.operasyon}>{x.operasyon}</small>}
              <small className="tc-rr1-hk-ist">{x.istasyon ?? 'istasyon yok'}</small>
              <small className="tc-rr1-hk-sure" title="Katalogdan, tahmini">{x.sure}</small>
              {duzen && (
                <span className="tc-rs-kart-dugme">
                  <Dugme tur="ikincil" simge="chev-left" aria-label={`${x.ad} sola`} data-dugme="sola" disabled={i === 0}
                    onClick={() => { odak.current = { anahtar: x.anahtar, dugme: 'sola' }; setDuyuru(`${x.ad} ${String(i)}. sıraya taşındı.`); duzen.tasi(i, -1); }} />
                  <Dugme tur="ikincil" simge="chev-right" aria-label={`${x.ad} sağa`} data-dugme="saga" disabled={i === adimlar.length - 1}
                    onClick={() => { odak.current = { anahtar: x.anahtar, dugme: 'saga' }; setDuyuru(`${x.ad} ${String(i + 2)}. sıraya taşındı.`); duzen.tasi(i, 1); }} />
                  <Dugme tur="ikincil" simge="x" aria-label={`${x.ad} kaldır`} onClick={() => { setDuyuru(`${x.ad} kaldırıldı.`); duzen.kaldir(i); }} />
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {duzen && <span className="tc-rs-gizli" role="status" aria-live="polite">{duyuru}</span>}
    </div>
  );
}
