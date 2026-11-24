import type { ReactNode } from 'react';

// Dar ekranda (≤800 px) çok sütunlu izleme tablosunun yerine geçen kısa kart: başlık + en çok üç anahtar-değer + tek not satırı.
// Geniş ekranda gizlenir (CSS); tablo orada çizilir. Aynı veri iki kez çizilir, biri her zaman `display: none`.
export interface KompaktSatir { anahtar: string; baslik: ReactNode; ozet: readonly (readonly [string, ReactNode])[]; not?: ReactNode; eylem?: ReactNode; secili?: boolean; cubuk?: { deger: number; etiket: string } }

export function Kompakt({ etiket, satirlar }: { etiket: string; satirlar: readonly KompaktSatir[] }) {
  return (
    <ul className="tc-izleme-kompakt" aria-label={etiket}>
      {satirlar.map((s) => (
        <li key={s.anahtar} data-secili={s.secili === true ? '' : undefined}>
          <strong className="tc-izleme-kompakt-baslik">{s.baslik}</strong>
          {s.cubuk !== undefined && <meter className="tc-izleme-cubuk" min={0} max={1} value={s.cubuk.deger} aria-label={s.cubuk.etiket}>{s.cubuk.etiket}</meter>}
          <dl className="tc-izleme-kompakt-liste">
            {s.ozet.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {s.not !== undefined && <span className="tc-sistem-soluk">{s.not}</span>}
          {s.eylem}
        </li>
      ))}
    </ul>
  );
}
