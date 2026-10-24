import { useEffect, useState } from 'react';
import type { LogMeas, Pkg, PlanItem, SampleRequest } from '../../../../../../arkon/shared/model.ts';
import { Dugme, DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { useArkon } from '../veri/baglam.ts';
import { dosyaIndir, type Soyle } from '../pano/index.tsx';
import { KAYNAK_ADI, YONTEM_ADI, cpkRengi, dortHane, olcumRaporu, spcCizimi, spcOzeti, yontem } from './kurallar.ts';

// Kalite › SPC (giris-ayarlar-spc.ts SpcView, SpcChart, printReport): ölçü başına değer grafiği, Cp ve Cpk, son ölçümler ve ölçüm raporu.

export function SpcGrafigi({ rows, b }: { rows: readonly LogMeas[]; b: PlanItem }) {
  const c = spcCizimi(rows, b);
  if (c.bos) return <p className="tc-ay3-not">Bu ölçü için sayısal kayıt yok</p>;
  const { W, H, pad, y } = c;
  const cizgi = (v: number | null, sinif: string, l: string) => (v == null ? null : (
    <g key={sinif + l}>
      <line x1={pad + 30} x2={W - pad} y1={y(v)} y2={y(v)} className={`tc-ay4-spl tc-ay4-${sinif}`} />
      <text x={W - pad + 4} y={y(v) + 4} className={`tc-ay4-spt tc-ay4-${sinif}`}>{l}</text>
    </g>
  ));
  return (
    <svg className="tc-ay4-spc" viewBox={`0 0 ${W + 40} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${b.nom} değer grafiği`}>
      <rect x={pad + 30} y={y(b.max)} width={W - 2 * pad - 30} height={Math.max(0, y(b.min) - y(b.max))} className="tc-ay4-bant" />
      {cizgi(b.max, 'sinir', 'ÜTS')}{cizgi(b.min, 'sinir', 'ATS')}{cizgi(c.ort, 'ort', 'x̄')}{cizgi(c.ucl, 'kontrol', '+3σ')}{cizgi(c.lcl, 'kontrol', '−3σ')}
      <text x={pad} y={y(b.max) + 4} className="tc-ay4-spy">{dortHane(b.max)}</text>
      <text x={pad} y={y(b.min) + 4} className="tc-ay4-spy">{dortHane(b.min)}</text>
      <polyline className="tc-ay4-spp" points={c.noktalar.map((n) => `${n.x},${n.y}`).join(' ')} />
      {c.noktalar.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r="4.5" className={`tc-ay4-spd${n.r.ok ? '' : ' tc-ay4-red'}`}>
          <title>{`${new Date(n.r.at).toLocaleString('tr-TR')} · ${n.r.value} · ${n.r.userName || ''} · ${KAYNAK_ADI[n.r.src ?? ''] || n.r.src || ''}`}</title>
        </circle>
      ))}
    </svg>
  );
}

// Yazdırma yeni pencerede açılır; açılamazsa (açılır pencere engeli) dosya indirilir.
function raporuYazdir(p: Pkg, rows: readonly LogMeas[], reqs: readonly SampleRequest[], hazirlayan: string, soyle: Soyle) {
  const h = olcumRaporu(p, rows, reqs, hazirlayan, Date.now());
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(h);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* pencere kapandı */ } }, 400);
    return;
  }
  dosyaIndir(`olcum-raporu-${String(p.no).replace(/[^\wİıŞşĞğÜüÖöÇç-]+/g, '_')}.html`, h, 'text/html');
  soyle('Rapor indirildi · açıp yazdır → PDF');
}

export function SpcGorunumu({ paketler, numuneler, soyle }: { paketler: Record<string, Pkg>; numuneler: readonly SampleRequest[]; soyle: Soyle }) {
  const { depo, kisi } = useArkon();
  const liste = Object.values(paketler).filter((p) => (p.plan || []).length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const [pid, pidYaz] = useState<string | null>(liste[0]?.id ?? null);
  const [iid, iidYaz] = useState<number | null>(null);
  const [rows, rowsYaz] = useState<LogMeas[] | null>(null);
  const [emir, emirYaz] = useState('');
  const p = pid ? paketler[pid] : undefined;
  useEffect(() => {
    if (!pid) return undefined;
    rowsYaz(null);
    void depo.Log.query('meas', { pkg: pid, limit: 20000 }).then((r) => rowsYaz(r as unknown as LogMeas[]), () => rowsYaz([]));
    return depo.Log.on((k) => { if (k === 'meas') void depo.Log.query('meas', { pkg: pid, limit: 20000 }).then((r) => rowsYaz(r as unknown as LogMeas[]), () => {}); });
  }, [depo, pid]);
  const emirler = [...new Set((rows ?? []).map((r) => r.orderNo).filter((x): x is string => !!x))];
  const R = (rows ?? []).filter((r) => !emir || r.orderNo === emir);
  const olcumleri = (id: number) => R.filter((r) => r.itemId === id);
  const b = p ? (p.plan.find((x) => x.id === iid) ?? p.plan[0]) : undefined;
  const S = b ? spcOzeti(olcumleri(b.id).filter((r) => r.value != null).map((r) => r.value!), b.min, b.max) : { n: 0 };
  const cpk = cpkRengi(S.cpk);
  return (
    <div className="tc-ay4-spc-duzen">
      <div className="tc-ay3-sayfa">
        <div className="tc-ay3-kutu">
          <label className="tc-ay3-ust" htmlFor="tc-ay4-spc-paket">İş paketi</label>
          <select id="tc-ay4-spc-paket" className="tc-ay3-secim" value={pid || ''} onChange={(o) => { pidYaz(o.target.value); iidYaz(null); emirYaz(''); }}>
            {liste.map((x) => <option key={x.id} value={x.id}>{x.no} · {x.part}</option>)}
          </select>
          {emirler.length > 1 && (
            <select className="tc-ay3-secim" aria-label="İş emri" value={emir} onChange={(o) => emirYaz(o.target.value)}>
              <option value="">Bütün iş emirleri</option>
              {emirler.map((o) => <option key={o}>{o}</option>)}
            </select>
          )}
          <Dugme simge="download" disabled={!p} onClick={() => { if (p) raporuYazdir(p, R, numuneler.filter((r) => r.pkgId === pid && (!emir || r.no === emir)), kisi?.name ?? '', soyle); }}>Ölçüm raporu (PDF)</Dugme>
        </div>
        <div className="tc-ay3-kutu" role="list" aria-label="Ölçüler">
          {p ? p.plan.map((x) => {
            const s = spcOzeti(olcumleri(x.id).filter((r) => r.value != null).map((r) => r.value!), x.min, x.max);
            const nr = olcumleri(x.id).length;
            const nok = olcumleri(x.id).filter((r) => !r.ok).length;
            return (
              <button key={x.id} type="button" role="listitem" className="tc-ay4-olcu" aria-pressed={b?.id === x.id} onClick={() => iidYaz(x.id)}>
                <span className="tc-ay4-balon" data-renk={yontem(x) === 'cmm' ? 'cmm' : undefined}>{x.id}</span>
                <span><b className="mono">{x.nom}</b><small className="tc-ay3-not"> {x.tol} · {nr} ölçüm{nok ? ` · ${nok} red` : ''}</small></span>
                <em data-renk={cpkRengi(s.cpk) ?? undefined}>{s.cpk == null ? (x.gauge ? 'mastar' : '—') : `Cpk ${s.cpk.toFixed(2)}`}</em>
              </button>
            );
          }) : <p className="tc-ay3-not">Kontrol planı olan paket yok</p>}
        </div>
      </div>
      <div className="tc-ay3-sayfa">
        {!b || !p ? <DurumKutusu durum="bos" mesaj="Paket seç" /> : (
          <>
            <div className="tc-ay3-kutu">
              <span className="tc-ay3-ust">{p.no} · {p.part}{emir ? ` · ${emir}` : ''}</span>
              <h3 className="mono">{b.id} · {b.nom}</h3>
              <small className="tc-ay3-not">{b.tol} · {b.min} – {b.max} · {b.tool} · {YONTEM_ADI[yontem(b)]}</small>
              <dl className="tc-ay4-istatistik">
                {([['n', String(S.n || 0)], ['Ortalama', dortHane(S.mean)], ['σ', dortHane(S.sd)], ['Min / Max', `${dortHane(S.min)} / ${dortHane(S.max)}`],
                  ['Cp', S.cp == null ? '—' : S.cp.toFixed(2)], ['Cpk', S.cpk == null ? '—' : S.cpk.toFixed(2)], ['Tolerans dışı', String(S.out || 0)]] as const).map(([l, v]) => (
                  <div key={l} data-renk={l === 'Cpk' ? cpk ?? undefined : l === 'Tolerans dışı' && S.out ? 'stop' : undefined}><dt>{l}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </div>
            <div className="tc-ay3-kutu">
              {rows === null ? <p className="tc-ay3-not">Kayıtlar yükleniyor…</p> : <SpcGrafigi rows={olcumleri(b.id)} b={b} />}
              <small className="tc-ay3-not">Cpk ≥ 1,33 yeterli · 1,00–1,33 sınırda · &lt; 1,00 süreç toleransa sığmıyor. En az 25 ölçümle anlamlıdır{S.n && S.n < 25 ? ` (şu an ${S.n})` : ''}.</small>
            </div>
            <div className="tc-ay3-kutu">
              <span className="tc-ay3-ust">Son ölçümler</span>
              <div className="tc-ay4-tablo-kutu">
                <table className="tc-ay4-tablo">
                  <tbody>
                    {olcumleri(b.id).slice(-60).reverse().map((r, i) => (
                      <tr key={i} data-renk={r.ok ? undefined : 'stop'}>
                        <td className="mono">{new Date(r.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td><b className="mono">{r.value != null ? r.value : r.attr}</b></td><td>{KAYNAK_ADI[r.src ?? ''] || r.src || ''}</td><td>{r.userName || ''}</td>
                        <td className="mono">{r.orderNo || ''}{r.partCnt != null ? ` #${r.partCnt}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
