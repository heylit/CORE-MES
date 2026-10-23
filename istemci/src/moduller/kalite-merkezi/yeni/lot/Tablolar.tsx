import { Rozet } from '../../../../ortak/arayuz/index.ts';
import { AQL_DEGERLERI, aqlHucresi, HARFLER, KOD_TABLOSU, NUMUNELER, SEVIYELER, SIKI } from '../aql.ts';
import { YOK } from '../bicim.ts';
import { aqlMetni, type PlanHucresi, type Sinif } from './hesap.ts';

const aralik = (r: readonly [number, number, string]) => `${r[0].toLocaleString('tr-TR')}${r[1] === Infinity ? ' ve üzeri' : ` – ${r[1].toLocaleString('tr-TR')}`}`;

export function PlanTablosu({ satirlar, bulunan }: { satirlar: readonly PlanHucresi[]; bulunan?: Record<Sinif, number | null | undefined> }) {
  return (
    <div className="tc-km2-kaydir">
      <table className="tc-km2-tablo">
        <thead>
          <tr>
            <th>Sınıf</th><th>AQL</th><th>Kod</th><th className="tc-km2-sag">Numune (n)</th><th className="tc-km2-sag">Kabul (Ac)</th><th className="tc-km2-sag">Ret (Re)</th>
            {bulunan && <><th className="tc-km2-sag">Bulunan</th><th>Sonuç</th></>}
            <th>Not</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((r) => {
            const p = r.p;
            if (!p) return <tr key={r.c}><td>{r.c}</td><td colSpan={bulunan ? 8 : 6} className="tc-km2-soluk">Parti büyüklüğü girin</td></tr>;
            const f = bulunan?.[r.c];
            const ok = f == null ? null : Number(f) <= p.ac;
            return (
              <tr key={r.c}>
                <td><b>{r.c}</b></td><td>{aqlMetni(r.a)}</td><td>{p.kodK}</td>
                <td className="tc-km2-sag"><b className="tc-km2-buyuk">{p.n}</b></td>
                <td className="tc-km2-sag"><b className="tc-km2-buyuk tc-km2-iyi">{p.ac}</b></td>
                <td className="tc-km2-sag"><b className="tc-km2-buyuk tc-km2-kotu">{p.re}</b></td>
                {bulunan && (
                  <>
                    <td className="tc-km2-sag">{f ?? YOK}</td>
                    <td>{ok == null ? <span className="tc-km2-soluk">{YOK}</span> : <Rozet ton={ok ? 'tamam' : 'hata'}>{ok ? 'Kabul' : 'Ret'}</Rozet>}</td>
                  </>
                )}
                <td className="tc-km2-kucuk">{p.not}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Tablo 1 (kod harfleri): parti satırı ve seviye sütunu vurgulu; `sec` verilirse sütun seçilebilir.
export function KodTablosu({ N, seviye, sec }: { N: number; seviye: string; sec?: (lvl: string) => void }) {
  const ri = KOD_TABLOSU.findIndex((x) => N >= x[0] && N <= x[1]);
  const ci = SEVIYELER.indexOf(seviye as never);
  const hucre = (l: string, icerik: string) => (sec
    ? <button type="button" className="tc-km2-hucre-dugme" onClick={() => { sec(l); }} aria-label={`Seviye ${l}`}>{icerik}</button>
    : icerik);
  return (
    <div className="tc-km2-kaydir">
      <table className="tc-km2-mtab">
        <thead>
          <tr><th>Parti büyüklüğü</th>{SEVIYELER.map((l, c) => <th key={l} className={c === ci ? 'tc-km2-vurgu' : undefined}>{hucre(l, l)}</th>)}</tr>
        </thead>
        <tbody>
          {KOD_TABLOSU.map((r, i) => (
            <tr key={r[0]} className={i === ri ? 'tc-km2-satir-vurgu' : undefined}>
              <th className={i === ri ? 'tc-km2-vurgu' : undefined}>{aralik(r)}</th>
              {r[2].split('').map((c, k) => {
                const cls = i === ri && k === ci ? 'tc-km2-isabet' : i === ri || k === ci ? 'tc-km2-yol' : undefined;
                return <td key={SEVIYELER[k]} className={cls}>{hucre(SEVIYELER[k]!, c)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface TabloVurgusu { j: number; yol: readonly number[]; start: number; end: number }

// Tablo 2-A / 2-B: hücreler kabul / ret; oklar alttaki ya da üstteki ilk planı gösterir. Seçili AQL sütununda
// kod harfinden plana giden yol vurgulanır; `sec` verilirse sütun seçilebilir.
export function AnaTablo({ siddet, vurgu, sec }: { siddet: string; vurgu: TabloVurgusu | null; sec?: (aql: string) => void }) {
  const satir = siddet === SIKI ? 17 : 16;
  return (
    <div className="tc-km2-kaydir">
      <table className="tc-km2-mtab">
        <thead>
          <tr>
            <th>Kod</th><th>n</th>
            {AQL_DEGERLERI.map((a, j) => (
              <th key={a} className={vurgu?.j === j ? 'tc-km2-vurgu' : undefined}>
                {sec ? <button type="button" className="tc-km2-hucre-dugme" onClick={() => { sec(a); }} aria-label={`AQL ${aqlMetni(a)} seç`}>{aqlMetni(a)}</button> : aqlMetni(a)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: satir }, (_, i) => {
            const on = vurgu?.start === i;
            return (
              <tr key={HARFLER[i]} className={on ? 'tc-km2-satir-vurgu' : undefined}>
                <th className={on ? 'tc-km2-vurgu' : undefined}>{HARFLER[i]}</th>
                <th>{NUMUNELER[i]}</th>
                {AQL_DEGERLERI.map((a, j) => {
                  const v = aqlHucresi(i, j, siddet);
                  const cls = [
                    Array.isArray(v) ? '' : 'tc-km2-ok',
                    vurgu?.j === j && vurgu.yol.includes(i) ? 'tc-km2-yol' : '',
                    vurgu?.j === j && vurgu.end === i ? 'tc-km2-isabet' : '',
                  ].filter(Boolean).join(' ') || undefined;
                  const metin = Array.isArray(v) ? `${v[0]} / ${v[1]}` : (v ?? '');
                  return <td key={a} className={cls}>{sec ? <button type="button" className="tc-km2-hucre-dugme" tabIndex={-1} onClick={() => { sec(a); }}>{metin}</button> : metin}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
