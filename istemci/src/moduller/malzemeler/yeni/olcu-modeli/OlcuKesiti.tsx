import { GENISLIK, YUKSEKLIK, type KesitCizimi } from './kesit.ts';

// 3215 c: ölçülü teknik kesit ve kırık boy görünüşü. Renkler sınıftan (olcu-modeli.css), çizim kesit.ts'ten.
export function OlcuKesiti({ cizim, kod }: { cizim: KesitCizimi; kod: string }) {
  return (
    <figure className="tc-om-cizim">
      <figcaption className="tc-om-cizim-bas"><span>{kod}</span><span>Kesit A-A · ölçek yok, ölçüler mm</span></figcaption>
      <svg viewBox={`0 0 ${String(GENISLIK)} ${String(YUKSEKLIK)}`} role="img" aria-label={`Ölçülü kesit çizimi: ${cizim.ozet}`}>
        <defs>
          <pattern id="tc-om-tarama" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" className="tc-om-tarama" />
          </pattern>
          <marker id="tc-om-ok" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,2 L10,5 L0,8 z" className="tc-om-ok-ucu" />
          </marker>
        </defs>
        {cizim.eksenler.map((c, i) => <line key={`e${String(i)}`} className="tc-om-eksen" x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} />)}
        {cizim.yollar.map((y, i) => (
          <path key={`y${String(i)}`} d={y.d} className={`tc-om-${y.tur}`} fillRule={y.delikli ? 'evenodd' : undefined} fill={y.tur === 'govde' ? 'url(#tc-om-tarama)' : undefined} />
        ))}
        {cizim.oklar.map((o, i) => (
          <line key={`o${String(i)}`} className="tc-om-olcu" x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} markerStart="url(#tc-om-ok)" markerEnd="url(#tc-om-ok)" />
        ))}
        {cizim.yazilar.map((y, i) => (
          <text key={`t${String(i)}`} x={y.x} y={y.y} textAnchor={y.hiza} className={y.soluk ? 'tc-om-yazi tc-om-yazi-soluk' : 'tc-om-yazi'}>{y.metin}</text>
        ))}
      </svg>
    </figure>
  );
}
