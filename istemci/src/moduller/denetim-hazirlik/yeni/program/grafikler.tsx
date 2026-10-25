import type { ProgramTanimi } from '../icerik/programlar.ts';
import { grupYuzdesi, type PuanSonucu } from '../kurallar/puan.ts';
import { tarihMetni } from '../tarih.ts';
import { notTonu, puanTonu, type Ton } from './hesaplar.ts';

// Ortak bileşeni olmayan çizimler (T12): radar, dağılım halkası, madde çarkı, öz değerlendirme eğilimi. Renk yalnız ton sınıflarından
// (program.css, tasarım değişkenleri); ölçüler SVG kutusunun içindedir.

const ton = (t: Ton): string => `tc-dhp-cizim-${t}`;

// Madde bazında radar (prototip radar): hedef halkası %85.
export function Radar({ r, pg, def }: { r: PuanSonucu; pg: ProgramTanimi; def: boolean }) {
  const keys = pg.GORDER.filter((g) => g !== 'S' || def);
  const n = keys.length;
  const cx = 150, cy = 150, R = 100;
  const nokta = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + R * v * Math.cos(a), cy + R * v * Math.sin(a)];
  };
  const cokgen = (f: (i: number) => number) => keys.map((_, i) => nokta(i, f(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const degerler = keys.map((g) => grupYuzdesi(r.groups[g]));
  const var_ = degerler.some((v) => v != null);
  return (
    <svg className="tc-dhp-radar" viewBox="-60 -18 420 336" role="img" aria-label={`${pg.unit} bazında hazırlık radarı`}>
      {[0.25, 0.5, 0.75, 1].map((l) => <polygon key={l} className="tc-dhp-cizim-izgara" points={cokgen(() => l)} />)}
      {keys.map((g, i) => { const p = nokta(i, 1); return <line key={g} className="tc-dhp-cizim-izgara" x1={cx} y1={cy} x2={p[0]} y2={p[1]} />; })}
      <polygon className="tc-dhp-cizim-hedef" points={cokgen(() => 0.85)} />
      {var_ && <polygon className="tc-dhp-cizim-alan" points={cokgen((i) => (degerler[i] ?? 0) / 100)} />}
      {degerler.map((v, i) => {
        if (v == null) return null;
        const p = nokta(i, v / 100);
        const g = keys[i] ?? '';
        return <circle key={g} className={ton(puanTonu(v))} r="5" cx={p[0]} cy={p[1]}><title>{`${g} ${pg.CL[g]?.n ?? ''}: %${String(v)}`}</title></circle>;
      })}
      {keys.map((g, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const lx = cx + (R + 20) * Math.cos(a);
        const ly = cy + (R + 20) * Math.sin(a);
        const yon = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
        const v = degerler[i];
        return (
          <text key={g} className="tc-dhp-cizim-yazi" x={lx} y={ly + 4} textAnchor={yon}>
            {pg.CL[g]?.s ?? g}
            {v != null && <tspan className={ton(puanTonu(v))}>{` ${String(v)}`}</tspan>}
          </text>
        );
      })}
      {!var_ && <text className="tc-dhp-cizim-yazi" x={cx} y={cy} textAnchor="middle">Simülasyon cevapları burada görünecek</text>}
    </svg>
  );
}

// Soru dağılımı halkası (prototip donut).
export function Dagilim({ r, adlar }: { r: PuanSonucu; adlar: (l: string) => string }) {
  const parcalar: { k: string; v: number; t: Ton }[] = [
    { k: 'major', v: r.major, t: 'kotu' }, { k: 'minor', v: r.minor, t: 'uyari' }, { k: 'obs', v: r.obs, t: 'bilgi' }, { k: 'good', v: r.good, t: 'iyi' },
  ];
  const top = parcalar.reduce((s, p) => s + p.v, 0);
  const R = 58;
  const C = 2 * Math.PI * R;
  const dolu = parcalar.filter((p) => p.v > 0).length;
  let birikim = 0;
  return (
    <div className="tc-dhp-dagilim">
      <svg viewBox="0 0 150 150" role="img" aria-label="Soru dağılımı">
        <circle className="tc-dhp-cizim-yol" cx="75" cy="75" r={R} fill="none" strokeWidth="16" />
        {parcalar.map((p) => {
          if (!p.v) return null;
          const L = (C * p.v) / top;
          const bosluk = dolu > 1 ? 2 : 0;
          const ofset = -birikim;
          birikim += L;
          return (
            <circle key={p.k} className={`tc-dhp-cizim-dilim ${ton(p.t)}`} cx="75" cy="75" r={R} fill="none" strokeWidth="16"
              strokeDasharray={`${Math.max(L - bosluk, 0.1).toFixed(2)} ${(C - L + bosluk).toFixed(2)}`} strokeDashoffset={ofset.toFixed(2)} transform="rotate(-90 75 75)">
              <title>{`${adlar(p.k)}: ${String(p.v)} soru`}</title>
            </circle>
          );
        })}
        <text className="tc-dhp-cizim-buyuk" x="75" y="72" textAnchor="middle">{r.answered - r.na}</text>
        <text className="tc-dhp-cizim-yazi" x="75" y="92" textAnchor="middle">PUANLANAN</text>
      </svg>
      <dl>
        {parcalar.map((p) => <div key={p.k}><dt className={`tc-dhy-ton-${p.t}`}>{adlar(p.k)}</dt><dd>{p.v}</dd></div>)}
      </dl>
    </div>
  );
}

// Madde çarkı (prototip wheel): dilim seçilir; renk maddenin PDCA aşamasından.
export function Cark({ pg, secili, sec }: { pg: ProgramTanimi; secili: string; sec: (k: string) => void }) {
  const keys = pg.wheelKeys;
  const n = keys.length;
  const cx = 170, cy = 170, R1 = 160, R0 = 96;
  const P = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const c = pg.CL[secili] ?? pg.CL[pg.defClause];
  const asama = c ? pg.PHASES[c.ph] : undefined;
  return (
    <svg className="tc-dhp-cark" viewBox="0 0 340 340" role="group" aria-label={pg.wheelTitle}>
      {keys.map((k, i) => {
        const a0 = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const a1 = a0 + (2 * Math.PI) / n;
        const [p0, p1, p2, p3] = [P(R1, a0), P(R1, a1), P(R0, a1), P(R0, a0)];
        const sec_ = secili === k;
        const am = (a0 + a1) / 2;
        const lp = P((R1 + R0) / 2, am);
        const it = sec_ ? 8 : 0;
        const madde = pg.CL[k];
        const yol = `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${String(R1)} ${String(R1)} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} A${String(R0)} ${String(R0)} 0 0 0 ${p3[0].toFixed(1)} ${p3[1].toFixed(1)} Z`;
        return (
          <g
            key={k} className={`tc-dhp-cark-dilim tc-dhp-cizim-${pg.PHASES[madde?.ph ?? 0]?.ton ?? 'vurgu'}${sec_ ? ' tc-dhp-cark-secili' : ''}`}
            transform={`translate(${(it * Math.cos(am)).toFixed(1)} ${(it * Math.sin(am)).toFixed(1)})`}
            role="button" tabIndex={0} aria-pressed={sec_} aria-label={`${pg.unit} ${k} ${madde?.n ?? ''}`}
            onClick={() => { sec(k); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sec(k); } }}
          >
            <path d={yol} />
            <text className="tc-dhp-cark-no" x={lp[0]} y={lp[1] - 5} textAnchor="middle">{k}</text>
            <text className="tc-dhp-cark-ad" x={lp[0]} y={lp[1] + 12} textAnchor="middle">{madde?.s ?? ''}</text>
          </g>
        );
      })}
      <circle className="tc-dhp-cizim-zemin" cx={cx} cy={cy} r={R0 - 10} />
      <text className="tc-dhp-cizim-yazi" x={cx} y={cy - 16} textAnchor="middle">{(asama?.n ?? '').toLocaleUpperCase('tr')}</text>
      <text className={`tc-dhp-cizim-buyuk tc-dhp-cizim-${asama?.ton ?? 'vurgu'}`} x={cx} y={cy + 22} textAnchor="middle">{secili}</text>
    </svg>
  );
}

// Öz değerlendirme not eğilimi (prototip ozChart): not bantları ve tur noktaları.
export function OzEgri({ turlar }: { turlar: { date: string; pct: number | null; g: string; n: number; tur: string }[] }) {
  const W = 640, H = 210, pl = 30, pr = 14, pt = 14, pb = 30;
  const n = turlar.length;
  const X = (i: number) => pl + (n === 1 ? (W - pl - pr) / 2 : ((W - pl - pr) * i) / (n - 1));
  const Y = (v: number) => pt + (H - pt - pb) * (1 - v / 100);
  const bantlar: [number, number, Ton, string][] = [[85, 100, 'iyi', 'A'], [70, 85, 'bilgi', 'B'], [50, 70, 'uyari', 'C'], [0, 50, 'kotu', 'D']];
  const noktalar = turlar.map((r, i) => (r.pct == null ? null : [X(i), Y(r.pct)] as const));
  const cizgi = noktalar.filter((q): q is readonly [number, number] => !!q).map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  const adim = Math.max(1, Math.ceil(n / 8));
  return (
    <svg className="tc-dhp-egri" viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label="Öz değerlendirme puan eğilimi">
      {bantlar.map(([a, b, t, g]) => (
        <g key={g}>
          <rect className={`tc-dhp-cizim-bant ${ton(t)}`} x={pl} y={Y(b)} width={W - pl - pr} height={Y(a) - Y(b)} />
          <text className={`tc-dhp-cizim-yazi ${ton(t)}`} x={pl - 8} y={(Y(a) + Y(b)) / 2 + 3.5} textAnchor="end">{g}</text>
        </g>
      ))}
      {cizgi && <polyline className="tc-dhp-cizim-cizgi" points={cizgi} />}
      {turlar.map((r, i) => {
        const q = noktalar[i];
        const tarih = new Date(`${r.date}T00:00:00`);
        return (
          <g key={`${r.date}-${String(i)}`}>
            {q && <circle className={ton(notTonu(r.g))} cx={q[0]} cy={q[1]} r="6"><title>{`${tarihMetni(r.date)}: %${String(r.pct)} · ${r.g} · ${String(r.n)} soru · ${r.tur}`}</title></circle>}
            {(i % adim === 0 || i === n - 1) && (
              <text className="tc-dhp-cizim-yazi" x={X(i)} y={H - 10} textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}>
                {`${String(tarih.getDate())} ${tarih.toLocaleDateString('tr-TR', { month: 'short' })}`}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
