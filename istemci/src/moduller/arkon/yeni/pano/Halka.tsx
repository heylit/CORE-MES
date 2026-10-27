import type { ReactNode } from 'react';
import { HALKA_YARICAP, halkaYaylari, type Renk } from './kurallar.ts';

// Pano grafik kartının halkası ve göstergesi (CNC Kurulum ana sayfasının hDonut'u ile aynı biçim). Renk tasarım değişkeninden
// (data-renk) gelir; her dilimin adı ve sayısı yanındaki listede yazar, renk tek başına anlam taşımaz.
export interface HalkaDilimi { deger: number | null; renk: Renk }
export interface LejantSatiri { ad: string; metin: string; renk?: Renk }

export function Halka({ dilimler, olcek, lejant, orta, ortaAlt, etiket }: {
  dilimler: readonly HalkaDilimi[]; olcek?: number; lejant: readonly LejantSatiri[]; orta: string; ortaAlt: string; etiket: string;
}) {
  const yaylar = halkaYaylari(dilimler.map((d) => ({ deger: d.deger ?? 0, renk: d.renk })), olcek);
  return (
    <div className="tc-ay3-halka-kap">
      <div className="tc-ay3-halka">
        <svg viewBox="0 0 42 42" role="img" aria-label={etiket}>
          <circle className="tc-ay3-halka-zemin" cx="21" cy="21" r={HALKA_YARICAP} />
          {yaylar.map((y, i) => (
            <circle key={i} data-renk={y.renk} cx="21" cy="21" r={HALKA_YARICAP} strokeDasharray={y.dizi} strokeDashoffset={y.kayma} />
          ))}
        </svg>
        <span className="tc-ay3-halka-orta" aria-hidden="true"><b>{orta}</b><small>{ortaAlt}</small></span>
      </div>
      <ul className="tc-ay3-lejant">
        {lejant.map((l) => <li key={l.ad} data-renk={l.renk}><i aria-hidden="true" />{l.ad}<b>{l.metin}</b></li>)}
      </ul>
    </div>
  );
}

// Grafik kartı: başlık satırı (sağda kısa not), içerik ve kısa liste.
export function GrafikKart({ baslik, not, children }: { baslik: string; not?: string; children: ReactNode }) {
  return (
    <section className="tc-ay3-gkart" aria-label={baslik}>
      <div className="tc-ay3-gkart-bas"><h3>{baslik}</h3>{not ? <span>{not}</span> : null}</div>
      {children}
    </section>
  );
}

// Kısa liste satırı: solda küçük ad ve kod, ortada ad, sağda değer, altta açıklama.
export function KisaSatir({ sol, kod, ad, deger, alt, renk }: { sol: string; kod: string; ad: string; deger: string; alt: string; renk?: Renk }) {
  return (
    <div className="tc-ay3-ksatir" data-renk={renk}>
      <span className="tc-ay3-ksatir-sol">{sol}<em>{kod}</em></span>
      <b>{ad}</b>
      <span className="tc-ay3-ksatir-deger">{deger}</span>
      <small>{alt}</small>
    </div>
  );
}
