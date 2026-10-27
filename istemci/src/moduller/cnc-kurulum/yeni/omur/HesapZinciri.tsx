import { fmtN } from './cekirdek.ts';
import { fmtDays, type ZincirAdimi, type ZincirMetni } from './analiz.ts';

// Ömür hesap zinciri (katalogdan parçaya, adım adım). Adım çubuğu en büyük adıma oranla çizilir.
export function Metin({ m }: { m: ZincirMetni }) {
  return (
    <>
      {m.map((p, i) => (typeof p === 'string' ? p : 'b' in p ? <b key={i}>{p.b}</b> : <u key={i}>{p.u}</u>))}
    </>
  );
}

function Katsayi({ x }: { x?: number }) {
  if (x == null || Math.abs(x - 1) <= 0.005) return null;
  return <em className={x > 1 ? 'tc-co-up' : 'tc-co-dn'}>×{fmtN(x, 2)}</em>;
}

export function HesapZinciri({ steps }: { steps: readonly ZincirAdimi[] }) {
  const mx = steps.reduce((m, s) => (s.v != null ? Math.max(m, s.v) : m), 0);
  return (
    <div className="tc-co-zincir">
      {steps.map((s, k) => (
        <div key={s.t} className={`tc-co-adim${s.key ? ' tc-co-adim-ana' : ''}`}>
          <i>{k + 1}</i>
          <div>
            <b>{s.t} <Katsayi x={s.x} /></b>
            <span>
              <Metin m={s.d} />
              {s.cips && s.cips.length > 0 && (
                <span className="tc-co-cipler">
                  {s.cips.map((c) => (
                    <span key={c.lbl} className="tc-co-cip">
                      <span>{c.lbl}<small>{c.why}</small></span>
                      <b className={c.x > 1.01 ? 'tc-co-up' : c.x < 0.99 ? 'tc-co-dn' : undefined}>×{fmtN(c.x, 2)}</b>
                    </span>
                  ))}
                </span>
              )}
              {s.on != null && (
                <span className="tc-co-onda" aria-hidden="true">
                  {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < s.on! ? 'tc-co-onda-var' : 'tc-co-onda-yok'} />)}
                </span>
              )}
            </span>
            {s.v != null && mx > 0 && (
              <svg className="tc-co-adim-cubuk" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
                <rect width={Math.max(1, s.v / mx * 100)} height="4" rx="2" />
              </svg>
            )}
          </div>
          <em>
            {s.v != null ? <>{fmtN(s.v, s.v < 10 ? 1 : 0)}<small>dk</small></>
              : s.n != null ? <>{fmtN(s.n)}<small>parça</small></>
              : s.n2 != null ? fmtDays(s.n2) : ''}
          </em>
        </div>
      ))}
    </div>
  );
}
